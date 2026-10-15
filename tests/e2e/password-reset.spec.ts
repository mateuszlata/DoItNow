// „Nie pamiętam hasła”: prośba o link, mail (lokalny Mailpit), nowe hasło i logowanie nim.
import { expect, test, type Page } from "@playwright/test";
import { LOCAL_SUPABASE_URL, deleteUsersByEmailPrefix, getLocalServiceRoleKey } from "../support/local-supabase";

const MAILPIT_URL = "http://127.0.0.1:54324";
const runId = Date.now().toString(36);
const emailPrefix = `e2e-reset-${runId}-`;
const email = `${emailPrefix}ola@example.com`;
const oldPassword = "Stare-Haslo-2026!";
const newPassword = "Nowe-Haslo-2026!";

test.afterAll(async () => {
  await deleteUsersByEmailPrefix(process.env.SUPABASE_URL ?? LOCAL_SUPABASE_URL, getLocalServiceRoleKey(), emailPrefix);
});

async function waitForHydration(page: Page): Promise<void> {
  await page.locator("astro-island:not([ssr])").first().waitFor({ state: "attached" });
}

/** Link „Ustaw nowe hasło” z najnowszego maila do `to` w lokalnym Mailpicie. */
async function resetLinkFromMail(to: string): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const search = (await (
      await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)
    ).json()) as { messages?: { ID: string }[] };
    const id = search.messages?.[0]?.ID;
    if (id) {
      const message = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${id}`)).json()) as { HTML: string };
      const link = /href="([^"]*verify[^"]*)"/.exec(message.HTML)?.[1];
      if (link) return link.replaceAll("&amp;", "&");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No reset e-mail for ${to}`);
}

test("a forgotten password can be replaced through the e-mailed link", async ({ page }) => {
  await page.goto("/auth/signup");
  await waitForHydration(page);
  await page.getByLabel("Nick (widoczny dla innych)").fill(`Ola ${runId}`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill(oldPassword);
  await page.getByLabel("Powtórz hasło").fill(oldPassword);
  await page.getByRole("checkbox", { name: /akceptuję/ }).check();
  await page.getByRole("button", { name: "Załóż konto" }).click();
  await page.waitForURL(/\/events$/);
  await page.context().clearCookies();

  await page.goto("/auth/signin");
  await page.getByTestId("forgot-link").click();
  await page.waitForURL(/\/auth\/forgot$/);
  await waitForHydration(page);
  await page.getByLabel("E-mail konta").fill(email);
  await page.getByRole("button", { name: "Wyślij link" }).click();
  await expect(page.getByTestId("forgot-sent")).toBeVisible();

  await page.goto(await resetLinkFromMail(email));
  await page.waitForURL(/\/auth\/new-password$/);
  await waitForHydration(page);
  await page.getByLabel("Nowe hasło", { exact: true }).fill(newPassword);
  await page.getByLabel("Powtórz nowe hasło").fill(newPassword);
  await page.getByRole("button", { name: "Ustaw nowe hasło" }).click();
  await page.waitForURL(/\/events\?ok=password-changed$/);
  await expect(page.getByText("Hasło zmienione.")).toBeVisible();

  await page.context().clearCookies();
  await page.goto("/auth/signin");
  await waitForHydration(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await page.waitForURL(/\/events$/);
});
