// US-01: Given zalogowany użytkownik i nadchodzące ogłoszenie z wolnym miejscem,
// When użytkownik zgłasza chęć udziału, a organizator akceptuje zgłoszenie,
// Then oboje widzą go na liście uczestników, a liczba wolnych miejsc spada o 1.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { LOCAL_SUPABASE_URL, deleteUsersByEmailPrefix, getLocalServiceRoleKey } from "../support/local-supabase";

const runId = Date.now().toString(36);
const password = "E2eTest-2026!";
const emailPrefix = `e2e-${runId}-`;

// Konta z tego przebiegu (i ich ogłoszenia) usuwamy z lokalnej bazy po teście.
test.afterAll(async () => {
  await deleteUsersByEmailPrefix(process.env.SUPABASE_URL ?? LOCAL_SUPABASE_URL, getLocalServiceRoleKey(), emailPrefix);
});

// Formularze logowania i rejestracji to wyspy Reacta: wpisanie danych przed hydratacją
// zostałoby wyczyszczone, więc czekamy, aż Astro zdejmie atrybut `ssr` z wyspy.
async function waitForHydration(page: Page): Promise<void> {
  await page.locator("astro-island:not([ssr])").first().waitFor({ state: "attached" });
}

async function signUpAndSignIn(browser: Browser, nick: string): Promise<Page> {
  const page = await browser.newPage();
  const email = `${emailPrefix}${nick.toLowerCase()}@example.com`;

  await page.goto("/auth/signup");
  await waitForHydration(page);
  await page.getByLabel("Nick (widoczny dla innych)").fill(nick);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill(password);
  await page.getByLabel("Powtórz hasło").fill(password);
  await page.getByRole("button", { name: "Załóż konto" }).click();
  // Lokalnie potwierdzanie e-maila jest wyłączone: rejestracja od razu loguje i prowadzi do listy.
  await page.waitForURL(/\/events$/);

  await page.goto("/auth/signin");
  await waitForHydration(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await page.waitForURL(/\/events$/);
  await expect(page.getByText(nick)).toBeVisible();
  return page;
}

function inThreeDaysAt18(): string {
  const date = new Date(Date.now() + 3 * 24 * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T18:00`;
}

test("US-01: participant requests to join, organizer accepts, both see the participant", async ({ browser }) => {
  const organizerNick = `Org${runId}`;
  const participantNick = `Ucz${runId}`;
  const area = `Dzielnica ${runId}`;

  // Organizator dodaje ogłoszenie z 2 wolnymi miejscami.
  const organizer = await signUpAndSignIn(browser, organizerNick);
  await organizer.goto("/events/new");
  await organizer.getByLabel("Sport").selectOption({ label: "Koszykówka" });
  await organizer.getByLabel("Data i godzina").fill(inThreeDaysAt18());
  await organizer.getByLabel("Okolica / dzielnica").fill(area);
  await organizer.getByLabel("Dokładne miejsce").fill("Hala sportowa E2E");
  // Skład 3 osób z grającym organizatorem (domyślnie zaznaczone) -> 2 miejsca do obsadzenia.
  await organizer.getByLabel("Ile osób łącznie w składzie?").fill("3");
  await expect(organizer.getByLabel("Biorę udział w spotkaniu")).toBeChecked();
  // US-01 dotyczy ogłoszeń z akceptacją organizatora (domyślnie dołączenie jest natychmiastowe).
  await organizer.getByText("Więcej opcji").click();
  await organizer.getByLabel("Wymagaj mojej akceptacji").check();
  // Pinezka: kliknięcie w mapę zapisuje współrzędne w ukrytych polach formularza.
  const picker = organizer.getByTestId("map-picker");
  await picker.scrollIntoViewIfNeeded();
  await expect(picker.locator(".leaflet-container, .leaflet-pane").first()).toBeAttached();
  await picker.click();
  await expect(organizer.getByText("Pinezka ustawiona")).toBeVisible();
  await organizer.getByRole("button", { name: "Opublikuj ogłoszenie" }).click();
  // Po publikacji organizator trafia na swoje ogłoszenie z zachętą do udostępnienia.
  await organizer.waitForURL(/\/events\/[0-9a-f-]{36}\?ok=created$/);
  await expect(organizer.getByTestId("created-share")).toBeVisible();
  await organizer.goto("/events");

  const card = organizer.getByRole("listitem").filter({ hasText: area });
  await card.getByRole("link", { name: "Koszykówka" }).click();
  await organizer.waitForURL(/\/events\/[0-9a-f-]{36}$/);
  const eventUrl = organizer.url();
  await expect(organizer.getByTestId("free-spots")).toContainText(/2\s*wolne z 3/);
  // Organizator, który gra, jest na liście uczestników; mapa z pinezką jest w szczegółach.
  // Skład jako koszulki: organizator (kapitan) w pierwszej, 2 wolne z „+”.
  await expect(organizer.locator("[data-slot=taken]")).toHaveCount(1);
  await expect(organizer.locator("[data-slot=taken]").first()).toContainText(organizerNick);
  await expect(organizer.locator("[data-slot=taken]").first()).toContainText("organizator");
  await expect(organizer.locator("[data-slot=free]")).toHaveCount(2);
  await expect(organizer.getByTestId("event-map")).toBeVisible();

  // Uczestnik zgłasza się — zgłoszenie oczekuje i nie zajmuje miejsca.
  const participant = await signUpAndSignIn(browser, participantNick);
  await participant.goto(eventUrl);
  await participant.getByRole("button", { name: "Zgłoś się" }).click();
  await expect(participant.getByTestId("my-status")).toContainText("oczekuje na akceptację");
  await expect(participant.getByTestId("free-spots")).toContainText(/2\s*wolne z 3/);

  // Organizator akceptuje zgłoszenie.
  await organizer.reload();
  // Organizator widzi znaczek z liczbą zgłoszeń przy „Moje spotkania”.
  await expect(organizer.getByTestId("pending-badge")).toHaveText("1");
  const request = organizer.getByTestId("pending-request").filter({ hasText: participantNick });
  await request.getByRole("button", { name: "Akceptuj" }).click();
  await expect(organizer.getByText("Zgłoszenie zaakceptowane.")).toBeVisible();

  // Then: oboje widzą uczestnika, a wolnych miejsc jest o 1 mniej.
  await expect(organizer.getByTestId("participants")).toContainText(participantNick);
  await expect(organizer.getByTestId("free-spots")).toContainText(/1\s*wolne z 3/);

  await participant.reload();
  await expect(participant.getByTestId("my-status")).toContainText("jesteś w składzie");
  await expect(participant.getByTestId("participants")).toContainText(participantNick);
  await expect(participant.getByTestId("free-spots")).toContainText(/1\s*wolne z 3/);
});

test("joining without approval is instant and the organizer can remove a participant", async ({ browser }) => {
  const organizerNick = `Ora${runId}`;
  const participantNick = `Ucb${runId}`;
  const area = `Osiedle ${runId}`;

  const organizer = await signUpAndSignIn(browser, organizerNick);
  await organizer.goto("/events/new");
  await organizer.getByLabel("Sport").selectOption({ label: "Siatkówka" });
  await organizer.getByLabel("Data i godzina").fill(inThreeDaysAt18());
  await organizer.getByLabel("Okolica / dzielnica").fill(area);
  await organizer.getByLabel("Dokładne miejsce").fill("Plaża E2E");
  await organizer.getByLabel("Ile osób łącznie w składzie?").fill("4");
  await expect(organizer.getByLabel("Wymagaj mojej akceptacji")).not.toBeChecked();
  await organizer.getByRole("button", { name: "Opublikuj ogłoszenie" }).click();
  // Po publikacji organizator trafia na swoje ogłoszenie z zachętą do udostępnienia.
  await organizer.waitForURL(/\/events\/[0-9a-f-]{36}\?ok=created$/);
  await expect(organizer.getByTestId("created-share")).toBeVisible();
  await organizer.goto("/events");
  await organizer.getByRole("listitem").filter({ hasText: area }).getByRole("link", { name: "Siatkówka" }).click();
  await organizer.waitForURL(/\/events\/[0-9a-f-]{36}$/);
  const eventUrl = organizer.url();

  // Uczestnik dołącza jednym kliknięciem i od razu jest w składzie.
  const participant = await signUpAndSignIn(browser, participantNick);
  await participant.goto(eventUrl);
  await expect(participant.getByTestId("join-mode")).toContainText("od razu");
  await participant.getByRole("button", { name: "Dołącz" }).click();
  await expect(participant.getByText("Jesteś w składzie!")).toBeVisible();
  await expect(participant.getByTestId("participants")).toContainText(participantNick);
  await expect(participant.getByTestId("free-spots")).toContainText(/2\s*wolne z 4/);

  // Organizator usuwa uczestnika; ten nie może dołączyć ponownie.
  await organizer.reload();
  organizer.once("dialog", (dialog) => void dialog.accept());
  await organizer.getByRole("button", { name: `Usuń ${participantNick}` }).click();
  await expect(organizer.getByText("Usunięto osobę ze spotkania.")).toBeVisible();
  await expect(organizer.getByTestId("participants")).not.toContainText(participantNick);

  await participant.reload();
  await expect(participant.getByTestId("my-status")).toContainText("usunięte przez organizatora");
  await expect(participant.getByRole("button", { name: "Dołącz" })).toHaveCount(0);
});
