// Zaproszenia bez logowania — przeliczanie miejsc w bazie (lokalny Supabase: `npx supabase start`).
import { afterAll, describe, expect, it } from "vitest";
import { createEvent, updateEvent } from "@/lib/services/events";
import { requestToJoin } from "@/lib/services/participations";
import {
  createInvite,
  getInvite,
  getInviteToken,
  listInviteResponses,
  releaseStaleInvites,
  removeInviteResponse,
  respondToInvite,
} from "@/lib/services/invites";
import { toLocalDateTime } from "@/lib/time";
import { HOUR, anonClient, cleanupTestUsers, newUser, type TestUser } from "./helpers";

afterAll(cleanupTestUsers);

const device = (n: number) => `device-${String(n)}-${"x".repeat(20)}`;

async function eventWithGuests(organizer: TestUser, total: number, guests: number, hoursAhead = 72) {
  const startsAt = toLocalDateTime(new Date(Date.now() + hoursAhead * HOUR));
  const result = await createEvent(organizer.client, organizer.id, {
    sport: "pilka-nozna",
    area: "Test ZP",
    place: "Orlik ZP",
    startsAt,
    durationMinutes: "60",
    venueId: "",
    total: String(total),
    organizerPlays: "on",
    guests: String(guests),
    requiresApproval: "",
    reserveSpots: "1",
    minPeople: "",
    lat: "",
    lng: "",
    description: "",
  });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.event.id;
}

async function seats(organizer: TestUser, eventId: string) {
  const { data } = await organizer.client
    .from("events")
    .select("spots, guest_count")
    .eq("id", eventId)
    .single<{ spots: number; guest_count: number }>();
  return data;
}

describe("event invites", () => {
  it("creates one stable link that only the organizer can see", async () => {
    const [organizer, other] = await Promise.all([newUser("Org ZP"), newUser("Inny ZP")]);
    const eventId = await eventWithGuests(organizer, 8, 3);
    const first = await createInvite(organizer.client, eventId);
    const second = await createInvite(organizer.client, eventId);
    if (!first.ok || !second.ok) throw new Error("invite failed");
    expect(first.token).toBe(second.token);
    expect(first.token.length).toBeGreaterThanOrEqual(32);
    expect(await createInvite(other.client, eventId)).toEqual({ ok: false, code: "NOT_ORGANIZER" });
    expect(await getInviteToken(other.client, eventId)).toBeNull();
    expect(await getInviteToken(organizer.client, eventId)).toBe(first.token);
  });

  it("turns a question mark into a named guest and frees the seat on a no", async () => {
    const organizer = await newUser("Org2 ZP");
    // 8 osób: organizator + 3 zaproszonych + 4 miejsca w Metando
    const eventId = await eventWithGuests(organizer, 8, 3);
    const invite = await createInvite(organizer.client, eventId);
    if (!invite.ok) throw new Error("invite failed");
    const guest = anonClient();

    expect(
      await respondToInvite(guest, { token: invite.token, device: device(1), name: "Kuba", answer: "yes" }),
    ).toEqual({
      ok: true,
    });
    expect(await seats(organizer, eventId)).toEqual({ spots: 4, guest_count: 3 });

    // Odmowa zaproszonego zwalnia jedno „?” dla Metando.
    await respondToInvite(guest, { token: invite.token, device: device(2), name: "Ola", answer: "no" });
    expect(await seats(organizer, eventId)).toEqual({ spots: 5, guest_count: 2 });

    // Kuba zmienia zdanie — jego miejsce też wraca do Metando.
    await respondToInvite(guest, { token: invite.token, device: device(1), name: "Kuba", answer: "no" });
    expect(await seats(organizer, eventId)).toEqual({ spots: 6, guest_count: 1 });

    const card = await getInvite(guest, invite.token, device(1));
    expect(card.ok && card.card).toMatchObject({
      team_size: 8,
      invited_pending: 1,
      mine: { name: "Kuba", answer: "no" },
    });
  });

  it("takes a free Metando spot when all question marks are used, and refuses when the team is full", async () => {
    const [organizer, player] = await Promise.all([newUser("Org3 ZP"), newUser("Gracz ZP")]);
    // 4 osoby: organizator + 1 zaproszony + 2 miejsca w Metando
    const eventId = await eventWithGuests(organizer, 4, 1);
    const invite = await createInvite(organizer.client, eventId);
    if (!invite.ok) throw new Error("invite failed");
    const guest = anonClient();

    await respondToInvite(guest, { token: invite.token, device: device(10), name: "A", answer: "yes" });
    await respondToInvite(guest, { token: invite.token, device: device(11), name: "B", answer: "yes" });
    expect(await seats(organizer, eventId)).toEqual({ spots: 1, guest_count: 2 });

    expect((await requestToJoin(player.client, eventId)).ok).toBe(true);
    expect(await respondToInvite(guest, { token: invite.token, device: device(12), name: "C", answer: "yes" })).toEqual(
      {
        ok: false,
        code: "INVITE_FULL",
      },
    );
  });

  it("requires a name and keeps names visible to members only", async () => {
    const [organizer, outsider] = await Promise.all([newUser("Org4 ZP"), newUser("Obcy ZP")]);
    const eventId = await eventWithGuests(organizer, 6, 2);
    const invite = await createInvite(organizer.client, eventId);
    if (!invite.ok) throw new Error("invite failed");
    const guest = anonClient();
    expect(
      await respondToInvite(guest, { token: invite.token, device: device(20), name: "  ", answer: "yes" }),
    ).toEqual({
      ok: false,
      code: "NAME_REQUIRED",
    });
    await respondToInvite(guest, { token: invite.token, device: device(21), name: "Zosia", answer: "yes" });
    expect((await listInviteResponses(organizer.client, eventId)).map((r) => r.name)).toEqual(["Zosia"]);
    expect(await listInviteResponses(outsider.client, eventId)).toEqual([]);
    expect(await getInvite(guest, "nie-ma-takiego-linku", null)).toEqual({ ok: false, code: "INVITE_NOT_FOUND" });
  });

  it("lets the organizer remove a response and not reserve fewer seats than confirmed guests", async () => {
    const organizer = await newUser("Org5 ZP");
    const eventId = await eventWithGuests(organizer, 6, 2);
    const invite = await createInvite(organizer.client, eventId);
    if (!invite.ok) throw new Error("invite failed");
    const guest = anonClient();
    await respondToInvite(guest, { token: invite.token, device: device(30), name: "X", answer: "yes" });
    await respondToInvite(guest, { token: invite.token, device: device(31), name: "Y", answer: "yes" });

    const tooFew = await updateEvent(organizer.client, eventId, {
      sport: "pilka-nozna",
      area: "Test ZP",
      place: "Orlik ZP",
      startsAt: toLocalDateTime(new Date(Date.now() + 72 * HOUR)),
      durationMinutes: "60",
      venueId: "",
      total: "6",
      organizerPlays: "on",
      guests: "1",
      requiresApproval: "",
      reserveSpots: "1",
      minPeople: "",
      lat: "",
      lng: "",
      description: "",
    });
    expect(tooFew.ok).toBe(false);

    const [first] = await listInviteResponses(organizer.client, eventId);
    expect(await removeInviteResponse(organizer.client, first.id)).toEqual({ ok: true });
    expect(await seats(organizer, eventId)).toEqual({ spots: 4, guest_count: 1 });
  });

  it("releases unanswered question marks 12 h before the start", async () => {
    const organizer = await newUser("Org6 ZP");
    const soon = await eventWithGuests(organizer, 6, 3, 13);
    const invite = await createInvite(organizer.client, soon);
    if (!invite.ok) throw new Error("invite failed");
    await respondToInvite(anonClient(), { token: invite.token, device: device(40), name: "Jan", answer: "yes" });
    // Przesuwamy start na 10 h od teraz bezpośrednio w bazie nie możemy (brak polityki update) —
    // wydarzenie startujące za 13 h nie powinno jeszcze nic zwolnić.
    await releaseStaleInvites(anonClient());
    expect(await seats(organizer, soon)).toEqual({ spots: 2, guest_count: 3 });

    // Spotkanie za 11 h: 2 nieodpowiedziane „?” wracają do Metando, potwierdzony gość zostaje.
    const late = await eventWithGuests(organizer, 6, 3, 11);
    const lateInvite = await createInvite(organizer.client, late);
    if (!lateInvite.ok) throw new Error("invite failed");
    await respondToInvite(anonClient(), { token: lateInvite.token, device: device(41), name: "Ewa", answer: "yes" });
    await releaseStaleInvites(anonClient());
    expect(await seats(organizer, late)).toEqual({ spots: 4, guest_count: 1 });
  });
});
