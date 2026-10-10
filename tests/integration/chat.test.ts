// Czat w wydarzeniu — reguły w bazie (lokalny Supabase: `npx supabase start`).
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, inject } from "vitest";
import { cancelEvent, createEvent } from "@/lib/services/events";
import { requestToJoin } from "@/lib/services/participations";
import {
  dismissReports,
  hideMessage,
  isAdmin,
  listMessages,
  listReports,
  postMessage,
  reportMessage,
} from "@/lib/services/chat";
import { toLocalDateTime } from "@/lib/time";
import { HOUR, cleanupTestUsers, newUser, type TestUser } from "./helpers";

afterAll(cleanupTestUsers);

const DAY = toLocalDateTime(new Date(Date.now() + 72 * HOUR)).slice(0, 10);

async function newEvent(organizer: TestUser, overrides: Partial<Record<string, string>> = {}): Promise<string> {
  const result = await createEvent(organizer.client, organizer.id, {
    sport: "pilka-nozna",
    area: "Test CH",
    place: "Boisko CH",
    startsAt: `${DAY}T18:00`,
    durationMinutes: "60",
    venueId: "",
    total: "2",
    organizerPlays: "on",
    requiresApproval: "",
    reserveSpots: "1",
    minPeople: "",
    lat: "",
    lng: "",
    description: "",
    ...overrides,
  });
  if (!result.ok) throw new Error(`event failed: ${JSON.stringify(result.errors)}`);
  return result.event.id;
}

describe("event chat", () => {
  let organizer: TestUser, player: TestUser, reserve: TestUser, outsider: TestUser;
  let eventId: string;

  beforeAll(async () => {
    [organizer, player, reserve, outsider] = await Promise.all([
      newUser("Org CH"),
      newUser("Gracz CH"),
      newUser("Rezerwa CH"),
      newUser("Obcy CH"),
    ]);
    eventId = await newEvent(organizer);
    // Skład 2 z grającym organizatorem: pierwsza osoba wchodzi do składu, druga na rezerwę.
    expect((await requestToJoin(player.client, eventId)).ok).toBe(true);
    expect((await requestToJoin(reserve.client, eventId)).ok).toBe(true);
  });

  it("lets the organizer, the squad and the reserve write and read", async () => {
    for (const [user, text] of [
      [organizer, "Cześć, gramy!"],
      [player, "Będę 10 min wcześniej"],
      [reserve, "Czekam na miejsce"],
    ] as const) {
      expect(await postMessage(user.client, eventId, `  ${text}  `)).toMatchObject({ ok: true });
    }
    const result = await listMessages(reserve.client, eventId);
    if (!result.ok) throw new Error(result.code);
    expect(result.data.map((m) => [m.author_name, m.body])).toEqual([
      ["Org CH", "Cześć, gramy!"],
      ["Gracz CH", "Będę 10 min wcześniej"],
      ["Rezerwa CH", "Czekam na miejsce"],
    ]);
  });

  it("keeps the chat closed to people outside the event and to pending requests", async () => {
    expect(await listMessages(outsider.client, eventId)).toEqual({ ok: false, code: "NOT_MEMBER" });
    expect(await postMessage(outsider.client, eventId, "Hej")).toEqual({ ok: false, code: "NOT_MEMBER" });

    const approvalEvent = await newEvent(organizer, { requiresApproval: "on" });
    expect((await requestToJoin(outsider.client, approvalEvent)).ok).toBe(true);
    expect(await listMessages(outsider.client, approvalEvent)).toEqual({ ok: false, code: "NOT_MEMBER" });
  });

  it("rejects empty and too long messages", async () => {
    expect(await postMessage(player.client, eventId, "   ")).toEqual({ ok: false, code: "MESSAGE_EMPTY" });
    expect(await postMessage(player.client, eventId, "x".repeat(1001))).toEqual({
      ok: false,
      code: "MESSAGE_TOO_LONG",
    });
  });

  it("lets the author delete and the organizer hide a message, but nobody else", async () => {
    const own = await postMessage(player.client, eventId, "Pomyłka");
    const rude = await postMessage(reserve.client, eventId, "Niemiła wiadomość");
    if (!own.ok || !rude.ok) throw new Error("post failed");

    expect(await hideMessage(reserve.client, own.data)).toEqual({ ok: false, code: "NOT_ALLOWED" });
    expect(await hideMessage(player.client, own.data)).toEqual({ ok: true, data: null });
    expect(await hideMessage(organizer.client, rude.data)).toEqual({ ok: true, data: null });

    const result = await listMessages(player.client, eventId);
    if (!result.ok) throw new Error(result.code);
    const hidden = result.data.filter((m) => m.id === own.data || m.id === rude.data);
    expect(hidden.map((m) => [m.hidden, m.body])).toEqual([
      [true, null],
      [true, null],
    ]);
  });

  it("returns only new and newly hidden messages when polling", async () => {
    const before = new Date().toISOString();
    const fresh = await postMessage(player.client, eventId, "Nowa");
    if (!fresh.ok) throw new Error("post failed");
    const result = await listMessages(organizer.client, eventId, before);
    if (!result.ok) throw new Error(result.code);
    expect(result.data.map((m) => m.body)).toEqual(["Nowa"]);
  });

  it("lets members report others' messages and admins moderate them", async () => {
    const message = await postMessage(player.client, eventId, "Sprzedam buty, tanio");
    if (!message.ok) throw new Error("post failed");

    expect(await reportMessage(player.client, message.data)).toEqual({ ok: false, code: "OWN_MESSAGE" });
    expect(await reportMessage(outsider.client, message.data)).toEqual({ ok: false, code: "NOT_MEMBER" });
    expect(await reportMessage(reserve.client, message.data, "spam")).toEqual({ ok: true, data: null });
    // Drugie zgłoszenie tej samej osoby nie dubluje wpisu.
    expect(await reportMessage(reserve.client, message.data, "spam")).toEqual({ ok: true, data: null });

    expect(await isAdmin(outsider.client)).toBe(false);
    expect(await listReports(outsider.client)).toEqual({ ok: false, code: "NOT_ALLOWED" });

    const service = createClient("http://127.0.0.1:54321", inject("serviceRoleKey"), {
      auth: { persistSession: false },
    });
    await service.from("admins").insert({ user_id: outsider.id });
    expect(await isAdmin(outsider.client)).toBe(true);

    const reports = await listReports(outsider.client);
    if (!reports.ok) throw new Error(reports.code);
    const report = reports.data.find((r) => r.message_id === message.data);
    expect(report).toMatchObject({ body: "Sprzedam buty, tanio", report_count: 1, reasons: ["spam"] });

    expect(await dismissReports(outsider.client, message.data)).toEqual({ ok: true, data: null });
    const after = await listReports(outsider.client);
    expect(after.ok && after.data.some((r) => r.message_id === message.data)).toBe(false);
  });

  it("limits flooding to 10 messages a minute", async () => {
    const flooder = await newUser("Spamer CH");
    expect((await requestToJoin(flooder.client, await newEvent(organizer, { total: "6" }))).ok).toBe(true);
    const events = await flooder.client
      .from("participations")
      .select("event_id")
      .eq("user_id", flooder.id)
      .single<{ event_id: string }>();
    const target = events.data?.event_id ?? "";
    for (let i = 0; i < 10; i++) {
      expect((await postMessage(flooder.client, target, `wiadomość ${String(i)}`)).ok).toBe(true);
    }
    expect(await postMessage(flooder.client, target, "jedenasta")).toEqual({ ok: false, code: "RATE_LIMITED" });
  });

  it("closes the chat for writing once the event is cancelled", async () => {
    const solo = await newEvent(organizer);
    expect((await cancelEvent(organizer.client, solo)).ok).toBe(true);
    expect(await postMessage(organizer.client, solo, "Halo?")).toEqual({ ok: false, code: "CHAT_CLOSED" });
    expect((await listMessages(organizer.client, solo)).ok).toBe(true);
  });
});
