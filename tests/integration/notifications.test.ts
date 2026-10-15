// Powiadomienia: kto dostaje które zdarzenie i jak działają ustawienia (lokalny Supabase: `npx supabase start`).
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, inject, it } from "vitest";
import { cancelEvent, createEvent } from "@/lib/services/events";
import { decideParticipation, requestToJoin, withdrawParticipation } from "@/lib/services/participations";
import { postMessage } from "@/lib/services/chat";
import { DEFAULT_NOTIFICATION_SETTINGS, saveNotificationSettings } from "@/lib/services/notifications";
import { sendNotificationEmails, unsubscribeEmails } from "@/lib/email/send-notifications";
import { toLocalDateTime } from "@/lib/time";
import { createHash } from "node:crypto";
import { HOUR, anonClient, cleanupTestUsers, newUser, type TestUser } from "./helpers";

afterAll(cleanupTestUsers);

async function event(
  organizer: TestUser,
  total: number,
  options: { approval?: boolean; reserve?: number; hours?: number } = {},
) {
  const result = await createEvent(organizer.client, organizer.id, {
    sport: "siatkowka",
    area: "Test PW",
    place: "Hala PW",
    startsAt: toLocalDateTime(new Date(Date.now() + (options.hours ?? 72) * HOUR)),
    durationMinutes: "60",
    venueId: "",
    total: String(total),
    organizerPlays: "on",
    membersCanInvite: "on",
    requiresApproval: options.approval ? "on" : "",
    reserveSpots: String(options.reserve ?? 0),
    minPeople: "",
    lat: "",
    lng: "",
    description: "",
  });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.event.id;
}

async function inbox(user: TestUser, eventId: string) {
  const { data } = await user.client
    .from("notifications")
    .select("type, category, data, email_status, push_status")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  return (data ?? []) as {
    type: string;
    category: string;
    data: Record<string, unknown>;
    email_status: string | null;
    push_status: string | null;
  }[];
}

describe("notifications", () => {
  it("tells the organizer who joined and who left, and the reserve player that they are in", async () => {
    const [organizer, ala, ola] = await Promise.all([newUser("Org PW"), newUser("Ala PW"), newUser("Ola PW")]);
    const eventId = await event(organizer, 2, { reserve: 1 });
    expect((await requestToJoin(ala.client, eventId)).ok).toBe(true);
    expect((await requestToJoin(ola.client, eventId)).ok).toBe(true); // rezerwa
    expect((await withdrawParticipation(ala.client, eventId)).ok).toBe(true); // Ola awansuje

    expect((await inbox(organizer, eventId)).map((n) => [n.type, n.data.name])).toEqual([
      ["joined", "Ala PW"],
      ["reserve", "Ola PW"],
      ["withdrew", "Ala PW"],
    ]);
    expect((await inbox(ola, eventId)).map((n) => n.type)).toEqual(["promoted"]);
    // Nikt nie dostaje powiadomienia o własnym działaniu.
    expect(await inbox(ala, eventId)).toEqual([]);
  });

  it("tells the participant about the organizer's decision and everyone about a cancellation", async () => {
    const [organizer, ewa] = await Promise.all([newUser("Org2 PW"), newUser("Ewa PW")]);
    const eventId = await event(organizer, 4, { approval: true });
    const join = await requestToJoin(ewa.client, eventId);
    if (!join.ok) throw new Error(join.code);
    expect((await inbox(organizer, eventId)).map((n) => n.type)).toEqual(["request"]);

    expect((await decideParticipation(organizer.client, join.participation.id, true)).ok).toBe(true);
    expect((await cancelEvent(organizer.client, eventId)).ok).toBe(true);
    const ewaInbox = await inbox(ewa, eventId);
    expect(ewaInbox.map((n) => [n.category, n.type])).toEqual([
      ["status", "accepted"],
      ["changes", "cancelled"],
    ]);
    expect(ewaInbox[0]).toMatchObject({ email_status: "pending", push_status: "pending" });
  });

  it("respects the settings and groups chat messages into one pending notification", async () => {
    const [organizer, tom] = await Promise.all([newUser("Org3 PW"), newUser("Tom PW")]);
    const eventId = await event(organizer, 4);
    // Tom chce czat tylko na telefon; organizator wyłączył powiadomienia o swoich spotkaniach.
    await saveNotificationSettings(tom.client, tom.id, {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      chat_email: false,
      chat_push: true,
    });
    await saveNotificationSettings(organizer.client, organizer.id, {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      activity_email: false,
      activity_push: false,
    });
    expect((await requestToJoin(tom.client, eventId)).ok).toBe(true);
    expect(await inbox(organizer, eventId)).toEqual([]);

    await postMessage(organizer.client, eventId, "Cześć!");
    await postMessage(organizer.client, eventId, "Bierzcie piłkę");
    expect(await inbox(tom, eventId)).toEqual([
      { type: "chat", category: "chat", data: {}, email_status: null, push_status: "pending" },
    ]);

    // Główny wyłącznik: nic nie przychodzi.
    await saveNotificationSettings(tom.client, tom.id, { ...DEFAULT_NOTIFICATION_SETTINGS, enabled: false });
    expect((await cancelEvent(organizer.client, eventId)).ok).toBe(true);
    expect((await inbox(tom, eventId)).map((n) => n.type)).toEqual(["chat"]);
  });

  it("queues one reminder per player about a day before the match", async () => {
    const [organizer, kuba] = await Promise.all([newUser("Org4 PW"), newUser("Kuba PW")]);
    const eventId = await event(organizer, 4, { hours: 24 });
    expect((await requestToJoin(kuba.client, eventId)).ok).toBe(true);
    const service = createClient("http://127.0.0.1:54321", inject("serviceRoleKey"), {
      auth: { persistSession: false },
    });
    await service.rpc("queue_reminders");
    await service.rpc("queue_reminders");
    expect((await inbox(kuba, eventId)).map((n) => n.type)).toEqual(["reminder"]);
    expect((await inbox(organizer, eventId)).filter((n) => n.type === "reminder")).toHaveLength(1);
  });
});

// Wysyłka e-mail: kolejka wydawana tylko z sekretem workera, wynik wraca do bazy, „wypisz się” wyłącza maile.
// Ostatni test w pliku, bo wydanie kolejki zmienia stan e-mail także innych powiadomień.
describe("notification emails", () => {
  const LOCAL_SECRET = "local-notify-secret-for-tests";
  const config = {
    supabaseUrl: process.env.SUPABASE_URL ?? "",
    supabaseKey: process.env.SUPABASE_KEY ?? "",
    notifySecret: LOCAL_SECRET,
    resendApiKey: "re_test",
  };

  it("sends queued notifications through Resend only with the worker secret and honours unsubscribing", async () => {
    const service = createClient("http://127.0.0.1:54321", inject("serviceRoleKey"), {
      auth: { persistSession: false },
    });
    const digest = createHash("sha256").update(LOCAL_SECRET, "utf8").digest("hex");
    await service.from("internal_secrets").upsert({ name: "notify", digest });

    const [organizer, ala] = await Promise.all([newUser("Org5 PW"), newUser("Ala5 PW")]);
    const eventId = await event(organizer, 4);
    expect((await requestToJoin(ala.client, eventId)).ok).toBe(true);
    const { data: owner } = await service.auth.admin.getUserById(organizer.id);

    expect(await sendNotificationEmails({ ...config, notifySecret: "wrong" })).toMatchObject({
      sent: 0,
      error: "NOT_ALLOWED",
    });

    const sentBatches: { to: string[]; subject: string; headers: Record<string, string> }[][] = [];
    const fakeFetch = ((_url: string, init: { body: string }) => {
      sentBatches.push(JSON.parse(init.body) as (typeof sentBatches)[number]);
      return Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    }) as unknown as typeof fetch;
    // Paczka to 50 najstarszych maili; inne pliki testów mogą zostawić ich więcej, więc wysyłamy do skutku.
    const findMine = () => sentBatches.flat().find((m) => m.to[0] === owner.user?.email);
    for (let round = 0; round < 20 && !findMine(); round++) {
      const result = await sendNotificationEmails({ ...config, fetchImpl: fakeFetch });
      expect(result.error).toBeUndefined();
      if (result.sent === 0) break;
    }
    const mine = findMine();
    expect(mine?.subject).toMatch(/^Ala5 PW jest w składzie · Siatkówka, /);
    expect((await inbox(organizer, eventId))[0].email_status).toBe("sent");

    const token = /t=([0-9a-f-]{36})/.exec(mine?.headers["List-Unsubscribe"] ?? "")?.[1] ?? "";
    expect(await unsubscribeEmails(anonClient(), token)).toBe(true);
    const { data: settings } = await organizer.client
      .from("notification_settings")
      .select("activity_email, status_email, chat_push")
      .single();
    expect(settings).toEqual({ activity_email: false, status_email: false, chat_push: true });
  });
});
