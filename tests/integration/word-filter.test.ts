// Filtr wulgaryzmów w czacie i nickach, automatyczne ukrywanie po zgłoszeniach (lokalny Supabase).
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it, inject } from "vitest";
import { createEvent } from "@/lib/services/events";
import { requestToJoin } from "@/lib/services/participations";
import { dismissReports, listMessages, listReports, postMessage, reportMessage } from "@/lib/services/chat";
import { getDisplayName, isTextClean } from "@/lib/services/profiles";
import { toLocalDateTime } from "@/lib/time";
import { HOUR, anonClient, cleanupTestUsers, newUser } from "./helpers";

afterAll(cleanupTestUsers);

// Zwykłe wiadomości z czatów sportowych — każda MUSI przejść. Dopisuj tu każde fałszywe trafienie z produkcji.
const CLEAN = [
  "Hej, będę 18:30, biorę piłkę",
  "Wynik 5:0, gramy 4 na 4, rewanż 3-1",
  "Mój numer 513 004 731, dzwońcie",
  "Ale się urwał z tym strzałem, jak urwiesz się z pracy to wpadaj",
  "Rozgrzewka ruchami ramion, w ruchach mniej chaosu",
  "Po meczu pizza i piwo? Ciotka i ciocia też kibicują",
  "Pedały w rowerze trzeszczą, kupię nowe",
  "Kurtka, kurczak, kurs, kurier, pierwszy, pierogi, pierwszeństwo",
  "Chusta, huśtawka, suknia, sukces, sukienka, cebula, debiut",
  "Szymon, Jerzy, Hubert, Kuba, Zuzia, Ciechanów, Kórnik, Suwałki",
  "Sędzia gwizdnął, spalony, rzut wolny, rożny, aut, karny",
  "Zjem jabłko, jeden jeż, jedziemy jeepem na Jelenią Górę",
  "Dzięki za grę, było super! 👍 Do zobaczenia w czwartek",
  "Szmata z trzech punktów, ale rzut",
  "Shot na bramkę, Scunthorpe United, Dick Advocaat, cocktail",
  "Hipopotam, chudy, chustka, ruch, ruchomy, poruszać",
  "Spóźnię się 5 minut, korek na Puławskiej",
  "Kortowo, kort numer 3, Korwety, korowód",
  "Piszę z telefonu, sorry za literówki: i w z o u a",
  "Gówniarz? Nie, to nasz bramkarz Gówczyński",
];

// Wulgaryzmy i typowe próby obejścia — każda MUSI zostać zablokowana.
const BLOCKED = [
  "kurwa",
  "KURWA MAĆ",
  "k.u.r.w.a",
  "k u r w a",
  "kuuuurwa",
  "kurw4",
  "kórwa",
  "chuj ci w dupę",
  "hujowo gramy",
  "zajebiście",
  "j3bać",
  "spierdalaj",
  "wypierdalaj stąd",
  "pierdolę to",
  "ty pizdo",
  "kutasie",
  "dziwko",
  "cwelu",
  "ty suko",
  "gówno",
  "Fuck",
  "motherfucker",
  "shit happens",
  "wyruchać",
  "ruchać",
];

describe("word filter", () => {
  it("lets ordinary sports chat through", async () => {
    const anon = anonClient();
    for (const text of CLEAN) expect([text, await isTextClean(anon, text)]).toEqual([text, true]);
  });

  it("blocks vulgarisms and common ways around the filter", async () => {
    const anon = anonClient();
    for (const text of BLOCKED) expect([text, await isTextClean(anon, text)]).toEqual([text, false]);
  });

  it("rejects vulgar chat messages without saving them", async () => {
    const organizer = await newUser("Org WF");
    const created = await createEvent(organizer.client, organizer.id, {
      sport: "pilka-nozna",
      area: "Test WF",
      place: "Boisko WF",
      startsAt: toLocalDateTime(new Date(Date.now() + 72 * HOUR)),
      durationMinutes: "60",
      venueId: "",
      total: "6",
      organizerPlays: "on",
      requiresApproval: "",
      reserveSpots: "",
      minPeople: "",
      lat: "",
      lng: "",
      description: "",
    });
    if (!created.ok) throw new Error(JSON.stringify(created.errors));
    const eventId = created.event.id;

    expect(await postMessage(organizer.client, eventId, "Ja pierdolę, ale upał")).toEqual({
      ok: false,
      code: "MESSAGE_BLOCKED",
    });
    expect((await postMessage(organizer.client, eventId, "Ale upał, weźcie wodę")).ok).toBe(true);
    const messages = await listMessages(organizer.client, eventId);
    expect(messages.ok && messages.data.map((m) => m.body)).toEqual(["Ale upał, weźcie wodę"]);
  });

  it("keeps vulgar nicks out on sign-up and on change", async () => {
    const user = await newUser("Kurwiszon");
    expect(await getDisplayName(user.client, user.id)).toBe("Użytkownik");

    const { error } = await user.client.from("profiles").update({ display_name: "J3bany" }).eq("id", user.id);
    expect(error?.message).toBe("NICK_BLOCKED");
    const renamed = await user.client.from("profiles").update({ display_name: "Kuba" }).eq("id", user.id);
    expect(renamed.error).toBeNull();
  });

  it("hides a message reported by three people until an admin keeps it", async () => {
    const [organizer, a, b, c, admin] = await Promise.all([
      newUser("Org AH"),
      newUser("Ala AH"),
      newUser("Bob AH"),
      newUser("Cyp AH"),
      newUser("Admin AH"),
    ]);
    const service = createClient("http://127.0.0.1:54321", inject("serviceRoleKey"), {
      auth: { persistSession: false },
    });
    await service.from("admins").insert({ user_id: admin.id });

    const created = await createEvent(organizer.client, organizer.id, {
      sport: "pilka-nozna",
      area: "Test AH",
      place: "Boisko AH",
      startsAt: toLocalDateTime(new Date(Date.now() + 72 * HOUR)),
      durationMinutes: "60",
      venueId: "",
      total: "6",
      organizerPlays: "on",
      requiresApproval: "",
      reserveSpots: "",
      minPeople: "",
      lat: "",
      lng: "",
      description: "",
    });
    if (!created.ok) throw new Error(JSON.stringify(created.errors));
    const eventId = created.event.id;
    for (const user of [a, b, c]) expect((await requestToJoin(user.client, eventId)).ok).toBe(true);
    const posted = await postMessage(organizer.client, eventId, "Ale z was łamagi");
    if (!posted.ok) throw new Error(posted.code);

    const visible = async () => {
      const result = await listMessages(a.client, eventId);
      return result.ok && !result.data[0].hidden;
    };
    await reportMessage(a.client, posted.data);
    await reportMessage(b.client, posted.data);
    expect(await visible()).toBe(true);
    await reportMessage(c.client, posted.data);
    expect(await visible()).toBe(false);

    const reports = await listReports(admin.client);
    expect(reports.ok && reports.data.find((r) => r.message_id === posted.data)?.auto_hidden).toBe(true);
    expect((await dismissReports(admin.client, posted.data)).ok).toBe(true);
    expect(await visible()).toBe(true);
  });
});
