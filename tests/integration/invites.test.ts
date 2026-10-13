// Zaproszenia od każdego gracza — pule miejsc i odpowiedzi w bazie (lokalny Supabase: `npx supabase start`).
import { afterAll, describe, expect, it } from "vitest";
import { createEvent } from "@/lib/services/events";
import { requestToJoin, withdrawParticipation } from "@/lib/services/participations";
import {
  getInvite,
  getMyInvite,
  listInviteResponses,
  releaseStaleInvites,
  removeInviteResponse,
  respondToInvite,
  setMyInvites,
} from "@/lib/services/invites";
import { toLocalDateTime } from "@/lib/time";
import { HOUR, anonClient, cleanupTestUsers, newUser, type TestUser } from "./helpers";

afterAll(cleanupTestUsers);

const device = (n: number) => `device-${String(n)}-${"x".repeat(20)}`;

async function event(
  organizer: TestUser,
  total: number,
  options: { hoursAhead?: number; membersCanInvite?: boolean; minPeople?: number } = {},
) {
  const result = await createEvent(organizer.client, organizer.id, {
    sport: "pilka-nozna",
    area: "Test ZP",
    place: "Orlik ZP",
    startsAt: toLocalDateTime(new Date(Date.now() + (options.hoursAhead ?? 72) * HOUR)),
    durationMinutes: "60",
    venueId: "",
    total: String(total),
    organizerPlays: "on",
    membersCanInvite: options.membersCanInvite === false ? "" : "on",
    requiresApproval: "",
    reserveSpots: "1",
    minPeople: options.minPeople ? String(options.minPeople) : "",
    lat: "",
    lng: "",
    description: "",
  });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.event.id;
}

async function seats(user: TestUser, eventId: string) {
  const { data } = await user.client
    .from("events")
    .select("spots, guest_count, guest_confirmed")
    .eq("id", eventId)
    .single<{ spots: number; guest_count: number; guest_confirmed: number }>();
  return data;
}

async function invite(user: TestUser, eventId: string, count: number): Promise<string> {
  const result = await setMyInvites(user.client, eventId, count);
  if (!result.ok) throw new Error(result.code);
  return result.token;
}

describe("invites from every player", () => {
  it("lets the organizer and squad members reserve seats, each with their own link", async () => {
    const [organizer, player, outsider] = await Promise.all([
      newUser("Org ZP"),
      newUser("Gracz ZP"),
      newUser("Obcy ZP"),
    ]);
    const eventId = await event(organizer, 10);
    expect((await requestToJoin(player.client, eventId)).ok).toBe(true);

    const orgToken = await invite(organizer, eventId, 2);
    const playerToken = await invite(player, eventId, 1);
    expect(orgToken).not.toBe(playerToken);
    expect(await invite(organizer, eventId, 2)).toBe(orgToken);
    // 10 osób: organizator + gracz + 3 gości + 5 wolnych miejsc w Metando
    expect(await seats(organizer, eventId)).toEqual({ spots: 6, guest_count: 3, guest_confirmed: 0 });
    expect(await getMyInvite(player.client, eventId, player.id)).toMatchObject({ reserved: 1, token: playerToken });
    expect(await setMyInvites(outsider.client, eventId, 1)).toEqual({ ok: false, code: "NOT_IN_SQUAD" });

    const card = await getInvite(anonClient(), playerToken, null);
    expect(card.ok && card.card).toMatchObject({ organizer_name: "Gracz ZP", invited_pending: 1, team_size: 10 });
  });

  it("respects the organizer's switch and never takes the last Metando seat", async () => {
    const [organizer, player] = await Promise.all([newUser("Org2 ZP"), newUser("Gracz2 ZP")]);
    const closed = await event(organizer, 4, { membersCanInvite: false });
    expect((await requestToJoin(player.client, closed)).ok).toBe(true);
    expect(await setMyInvites(player.client, closed, 1)).toEqual({ ok: false, code: "INVITES_DISABLED" });
    // 4 osoby: organizator + gracz + 2 wolne miejsca — obydwa można zarezerwować, trzeciego już nie ma
    expect((await setMyInvites(organizer.client, closed, 2)).ok).toBe(true);
    expect(await setMyInvites(organizer.client, closed, 3)).toEqual({ ok: false, code: "NO_FREE_SPOTS" });
  });

  it("attributes answers to the inviter and frees a seat on a no", async () => {
    const [organizer, player] = await Promise.all([newUser("Org3 ZP"), newUser("Gracz3 ZP")]);
    const eventId = await event(organizer, 10);
    expect((await requestToJoin(player.client, eventId)).ok).toBe(true);
    const token = await invite(player, eventId, 2);
    const guest = anonClient();

    await respondToInvite(guest, { token, device: device(1), name: "Kuba", answer: "yes" });
    await respondToInvite(guest, { token, device: device(2), name: "Ola", answer: "no" });
    // 9 miejsc w Metando - 2 zarezerwowane + 1 zwolnione przez odmowę Oli
    expect(await seats(organizer, eventId)).toEqual({ spots: 8, guest_count: 1, guest_confirmed: 1 });

    const responses = await listInviteResponses(organizer.client, eventId);
    expect(responses.map((r) => [r.name, r.answer, r.inviter_id])).toEqual([
      ["Kuba", "yes", player.id],
      ["Ola", "no", player.id],
    ]);
    expect(await setMyInvites(player.client, eventId, 0)).toEqual({ ok: false, code: "BELOW_CONFIRMED" });
  });

  it("returns unanswered seats when the inviter leaves, but keeps confirmed guests", async () => {
    const [organizer, player] = await Promise.all([newUser("Org4 ZP"), newUser("Gracz4 ZP")]);
    const eventId = await event(organizer, 10);
    expect((await requestToJoin(player.client, eventId)).ok).toBe(true);
    const token = await invite(player, eventId, 3);
    await respondToInvite(anonClient(), { token, device: device(10), name: "Zosia", answer: "yes" });

    expect((await withdrawParticipation(player.client, eventId)).ok).toBe(true);
    expect(await seats(organizer, eventId)).toEqual({ spots: 8, guest_count: 1, guest_confirmed: 1 });
    const groups = await organizer.client.rpc("event_guest_groups", { p_event_id: eventId });
    const data: unknown = groups.data;
    expect(data).toEqual([
      { inviter_id: player.id, inviter_name: "Gracz4 ZP", reserved: 1, confirmed: ["Zosia"], in_squad: false },
    ]);
  });

  it("lets inviters remove their own guests and the organizer remove anyone", async () => {
    const [organizer, a, b] = await Promise.all([newUser("Org5 ZP"), newUser("A ZP"), newUser("B ZP")]);
    const eventId = await event(organizer, 10);
    for (const user of [a, b]) expect((await requestToJoin(user.client, eventId)).ok).toBe(true);
    const tokenA = await invite(a, eventId, 1);
    await respondToInvite(anonClient(), { token: tokenA, device: device(20), name: "X", answer: "yes" });
    await respondToInvite(anonClient(), { token: tokenA, device: device(21), name: "Y", answer: "yes" });
    const [x, y] = await listInviteResponses(organizer.client, eventId);

    expect(await removeInviteResponse(b.client, x.id)).toEqual({ ok: false, code: "NOT_ALLOWED" });
    expect(await removeInviteResponse(a.client, x.id)).toEqual({ ok: true });
    expect(await removeInviteResponse(organizer.client, y.id)).toEqual({ ok: true });
    // Po usunięciu obu gości wszystkie 9 miejsc wraca do Metando.
    expect(await seats(organizer, eventId)).toEqual({ spots: 9, guest_count: 0, guest_confirmed: 0 });
  });

  it("counts guests in the team for the minimum, so reserving seats works with a minimum set", async () => {
    const organizer = await newUser("Org7 ZP");
    const eventId = await event(organizer, 10, { minPeople: 8 });
    expect((await setMyInvites(organizer.client, eventId, 3)).ok).toBe(true);
    expect(await seats(organizer, eventId)).toEqual({ spots: 6, guest_count: 3, guest_confirmed: 0 });
  });

  it("requires a name and releases unanswered seats 12 h before the start", async () => {
    const organizer = await newUser("Org6 ZP");
    const soon = await event(organizer, 6, { hoursAhead: 11 });
    const token = await invite(organizer, soon, 3);
    const guest = anonClient();
    expect(await respondToInvite(guest, { token, device: device(30), name: "  ", answer: "yes" })).toEqual({
      ok: false,
      code: "NAME_REQUIRED",
    });
    await respondToInvite(guest, { token, device: device(31), name: "Ewa", answer: "yes" });
    await releaseStaleInvites(anonClient());
    expect(await seats(organizer, soon)).toEqual({ spots: 4, guest_count: 1, guest_confirmed: 1 });
    expect(await getInvite(guest, "nie-ma-takiego-linku", null)).toEqual({ ok: false, code: "INVITE_NOT_FOUND" });
  });
});
