// Reguła biznesowa z PRD sprawdzana na lokalnym Supabase (wymaga `npx supabase start`):
// zgłoszenie oczekuje -> zaakceptowane | odrzucone, akceptacja tylko przy wolnym miejscu,
// rezygnacja zaakceptowanego najpóźniej 12 h przed wydarzeniem.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEvent } from "@/lib/services/events";
import { decideParticipation, requestToJoin, withdrawParticipation } from "@/lib/services/participations";
import { HOUR, cleanupTestUsers, acceptedCount, anonClient, insertEvent, newUser } from "./helpers";

let organizer: { client: SupabaseClient; id: string };
let alice: { client: SupabaseClient; id: string };
let bob: { client: SupabaseClient; id: string };

beforeAll(async () => {
  organizer = await newUser("Organizator IT");
  alice = await newUser("Alicja IT");
  bob = await newUser("Bartek IT");
});

afterAll(cleanupTestUsers);

describe("zgłoszenia (FR-007)", () => {
  it("creates an event through the app service and lets another user request to join", async () => {
    const result = await createEvent(organizer.client, organizer.id, {
      sport: "tenis",
      area: "Ursynów",
      place: "Kort 3",
      startsAt: "2030-06-01T10:00",
      durationMinutes: "90",
      venueId: "",
      total: "2",
      organizerPlays: "on",
      requiresApproval: "on",
      reserveSpots: "",
      minPeople: "",
      lat: "",
      lng: "",
      description: "",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const join = await requestToJoin(alice.client, result.event.id);
    expect(join.ok && join.participation.status).toBe("pending");
    // Oczekujące zgłoszenie nie zajmuje miejsca.
    expect(await acceptedCount(organizer.client, result.event.id)).toBe(0);
  });

  it("rejects joining your own event", async () => {
    const eventId = await insertEvent(organizer, new Date(Date.now() + 72 * HOUR), 2);
    expect(await requestToJoin(organizer.client, eventId)).toEqual({ ok: false, code: "OWN_EVENT" });
  });

  it("rejects a duplicate request", async () => {
    const eventId = await insertEvent(organizer, new Date(Date.now() + 72 * HOUR), 2);
    await requestToJoin(alice.client, eventId);
    expect(await requestToJoin(alice.client, eventId)).toEqual({ ok: false, code: "ALREADY_REQUESTED" });
  });

  it("rejects joining an event that has already started", async () => {
    const eventId = await insertEvent(organizer, new Date(Date.now() + 2000), 2);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(await requestToJoin(alice.client, eventId)).toEqual({ ok: false, code: "EVENT_STARTED" });
  });

  it("does not allow writing participations directly, bypassing the rules", async () => {
    const eventId = await insertEvent(organizer, new Date(Date.now() + 72 * HOUR), 2);
    const { error } = await alice.client
      .from("participations")
      .insert({ event_id: eventId, user_id: alice.id, status: "accepted" });
    expect(error?.message).toMatch(/row-level security/);
  });
});

describe("decyzja organizatora (FR-010)", () => {
  it("only the organizer can decide", async () => {
    const eventId = await insertEvent(organizer, new Date(Date.now() + 72 * HOUR), 2);
    const join = await requestToJoin(alice.client, eventId);
    if (!join.ok) throw new Error("join failed");
    expect(await decideParticipation(bob.client, join.participation.id, true)).toEqual({
      ok: false,
      code: "NOT_ORGANIZER",
    });
  });

  it("never accepts more people than spots, even with simultaneous accepts", async () => {
    const eventId = await insertEvent(organizer, new Date(Date.now() + 72 * HOUR), 2);
    const applicants = await Promise.all([1, 2, 3, 4, 5].map((n) => newUser(`Chętny ${String(n)}`)));
    const requests = await Promise.all(applicants.map((a) => requestToJoin(a.client, eventId)));
    const ids = requests.map((r) => {
      if (!r.ok) throw new Error(`join failed: ${r.code}`);
      return r.participation.id;
    });

    const decisions = await Promise.all(ids.map((id) => decideParticipation(organizer.client, id, true)));

    expect(decisions.filter((d) => d.ok)).toHaveLength(2);
    expect(decisions.filter((d) => !d.ok).map((d) => d.code)).toEqual(["EVENT_FULL", "EVENT_FULL", "EVENT_FULL"]);
    expect(await acceptedCount(organizer.client, eventId)).toBe(2);
  });

  it("a rejected user cannot request again", async () => {
    const eventId = await insertEvent(organizer, new Date(Date.now() + 72 * HOUR), 2);
    const join = await requestToJoin(bob.client, eventId);
    if (!join.ok) throw new Error("join failed");
    const reject = await decideParticipation(organizer.client, join.participation.id, false);
    expect(reject.ok && reject.participation.status).toBe("rejected");
    expect(await requestToJoin(bob.client, eventId)).toEqual({ ok: false, code: "ALREADY_REJECTED" });
  });
});

describe("rezygnacja (FR-008)", () => {
  it("an accepted participant can withdraw more than 12 h before, freeing the spot, and request again", async () => {
    const eventId = await insertEvent(organizer, new Date(Date.now() + 72 * HOUR), 1);
    const join = await requestToJoin(alice.client, eventId);
    if (!join.ok) throw new Error("join failed");
    await decideParticipation(organizer.client, join.participation.id, true);
    expect(await acceptedCount(organizer.client, eventId)).toBe(1);

    const withdraw = await withdrawParticipation(alice.client, eventId);
    expect(withdraw.ok && withdraw.participation.status).toBe("withdrawn");
    expect(await acceptedCount(organizer.client, eventId)).toBe(0);

    const again = await requestToJoin(alice.client, eventId);
    expect(again.ok && again.participation.status).toBe("pending");
  });

  it("an accepted participant cannot withdraw later than 12 h before", async () => {
    const eventId = await insertEvent(organizer, new Date(Date.now() + 2 * HOUR), 2);
    const join = await requestToJoin(alice.client, eventId);
    if (!join.ok) throw new Error("join failed");
    await decideParticipation(organizer.client, join.participation.id, true);

    expect(await withdrawParticipation(alice.client, eventId)).toEqual({ ok: false, code: "WITHDRAW_DEADLINE_PASSED" });
    expect(await acceptedCount(organizer.client, eventId)).toBe(1);
  });

  it("a pending request can still be withdrawn within 12 h, because it holds no spot", async () => {
    const eventId = await insertEvent(organizer, new Date(Date.now() + 2 * HOUR), 2);
    await requestToJoin(bob.client, eventId);
    const withdraw = await withdrawParticipation(bob.client, eventId);
    expect(withdraw.ok && withdraw.participation.status).toBe("withdrawn");
  });
});

describe("widoczność (FR-001, FR-006)", () => {
  it("a guest cannot read events or participations, only the limited public view", async () => {
    const guest = anonClient();
    const eventId = await insertEvent(organizer, new Date(Date.now() + 72 * HOUR), 2);

    const { data: events } = await guest.from("events").select("*").eq("id", eventId);
    expect(events).toEqual([]);
    const { data: participations } = await guest.from("participations").select("*");
    expect(participations).toEqual([]);

    const { data: publicEvent } = await guest
      .from("events_public")
      .select("*")
      .eq("id", eventId)
      .single<Record<string, unknown>>();
    expect(Object.keys(publicEvent ?? {}).sort()).toEqual([
      "accepted_count",
      "area",
      "cost_cents",
      "duration_minutes",
      "id",
      "min_people",
      "organizer_plays",
      "requires_approval",
      "reserve_count",
      "reserve_spots",
      "sport",
      "spots",
      "starts_at",
    ]);
  });

  it("other users see accepted participants but not someone else's pending request", async () => {
    const eventId = await insertEvent(organizer, new Date(Date.now() + 72 * HOUR), 2);
    const aliceJoin = await requestToJoin(alice.client, eventId);
    if (!aliceJoin.ok) throw new Error("join failed");
    await decideParticipation(organizer.client, aliceJoin.participation.id, true);
    await requestToJoin(bob.client, eventId);

    const outsider = await newUser("Obserwator IT");
    const { data } = await outsider.client.from("participations").select("user_id, status").eq("event_id", eventId);
    expect(data).toEqual([{ user_id: alice.id, status: "accepted" }]);

    const { data: forOrganizer } = await organizer.client
      .from("participations")
      .select("status")
      .eq("event_id", eventId);
    expect(forOrganizer?.map((r) => String(r.status)).sort()).toEqual(["accepted", "pending"]);
  });
});
