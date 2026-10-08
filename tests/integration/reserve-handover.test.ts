// Lista rezerwowa, minimum i przekazanie spotkania po odwołaniu przez organizatora
// (lokalny Supabase: `npx supabase start`).
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cancelEvent, updateEvent, type EventFormValues } from "@/lib/services/events";
import {
  decideParticipation,
  requestToJoin,
  respondToCancellation,
  withdrawParticipation,
} from "@/lib/services/participations";
import { toLocalDateTime } from "@/lib/time";
import { HOUR, cleanupTestUsers, newUser, type TestUser } from "./helpers";

let organizer: TestUser;

beforeAll(async () => {
  organizer = await newUser("Organizator RH");
});

afterAll(cleanupTestUsers);

/** Ogłoszenie z rezerwą; `spots` to miejsca do obsadzenia, organizator gra. */
async function createEventWith(spots: number, reserveSpots: number, startsAt = new Date(Date.now() + 72 * HOUR)) {
  const { data, error } = await organizer.client
    .from("events")
    .insert({
      organizer_id: organizer.id,
      sport: "pilka-nozna",
      area: "Test RH",
      place: "Orlik testowy",
      starts_at: startsAt.toISOString(),
      spots,
      reserve_spots: reserveSpots,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) throw new Error(`insert event failed: ${error.message}`);
  return data.id;
}

async function join(eventId: string, user: TestUser): Promise<string> {
  const result = await requestToJoin(user.client, eventId);
  if (!result.ok) throw new Error(`join failed: ${result.code}`);
  return result.participation.id;
}

async function accept(participationId: string) {
  const result = await decideParticipation(organizer.client, participationId, true);
  if (!result.ok) throw new Error(`accept failed: ${result.code}`);
  return result.participation.status;
}

async function statusOf(client: SupabaseClient, eventId: string, userId: string) {
  const { data } = await client
    .from("participations")
    .select("status")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .single<{ status: string }>();
  return data?.status;
}

async function eventRow(client: SupabaseClient, eventId: string) {
  const { data } = await client
    .from("events")
    .select("status, organizer_id, organizer_plays, spots, handover_at")
    .eq("id", eventId)
    .single<{
      status: string;
      organizer_id: string;
      organizer_plays: boolean;
      spots: number;
      handover_at: string | null;
    }>();
  return data;
}

describe("lista rezerwowa", () => {
  it("accepting fills the team first, then the reserve up to its limit, then reports full", async () => {
    const eventId = await createEventWith(1, 1);
    const [a, b, c] = await Promise.all([newUser("R1"), newUser("R2"), newUser("R3")]);

    expect(await accept(await join(eventId, a))).toBe("accepted");
    expect(await accept(await join(eventId, b))).toBe("reserve");
    const third = await decideParticipation(organizer.client, await join(eventId, c), true);
    expect(third).toEqual({ ok: false, code: "EVENT_FULL" });
  });

  it("when someone in the team withdraws, the first person in reserve takes the place", async () => {
    const eventId = await createEventWith(1, 2);
    const [a, b, c] = await Promise.all([newUser("P1"), newUser("P2"), newUser("P3")]);
    await accept(await join(eventId, a));
    await accept(await join(eventId, b));
    await accept(await join(eventId, c));
    expect(await statusOf(organizer.client, eventId, b.id)).toBe("reserve");

    const withdraw = await withdrawParticipation(a.client, eventId);
    expect(withdraw.ok).toBe(true);
    expect(await statusOf(organizer.client, eventId, b.id)).toBe("accepted");
    expect(await statusOf(organizer.client, eventId, c.id)).toBe("reserve");
  });

  it("a person in reserve can leave the reserve even within 12 h, because they hold no place", async () => {
    const eventId = await createEventWith(1, 1, new Date(Date.now() + 2 * HOUR));
    const [a, b] = await Promise.all([newUser("Q1"), newUser("Q2")]);
    await accept(await join(eventId, a));
    await accept(await join(eventId, b));
    const withdraw = await withdrawParticipation(b.client, eventId);
    expect(withdraw.ok && withdraw.participation.status).toBe("withdrawn");
  });

  it("other signed-in users see who is in reserve", async () => {
    const eventId = await createEventWith(1, 1);
    const [a, b, outsider] = await Promise.all([newUser("V1"), newUser("V2"), newUser("V3")]);
    await accept(await join(eventId, a));
    await accept(await join(eventId, b));
    const { data } = await outsider.client.from("participations").select("user_id, status").eq("event_id", eventId);
    expect((data ?? []).map((r) => String(r.status)).sort()).toEqual(["accepted", "reserve"]);
  });

  it("editing cannot shrink the reserve below the people already in it; growing the team promotes reserve", async () => {
    const eventId = await createEventWith(1, 2);
    const [a, b] = await Promise.all([newUser("E1"), newUser("E2")]);
    await accept(await join(eventId, a));
    await accept(await join(eventId, b));

    const form: EventFormValues = {
      sport: "pilka-nozna",
      area: "Test RH",
      place: "Orlik testowy",
      startsAt: toLocalDateTime(new Date(Date.now() + 96 * HOUR)),
      total: "2",
      organizerPlays: "on",
      reserveSpots: "0",
      minPeople: "",
      lat: "",
      lng: "",
      description: "",
    };
    const tooShort = await updateEvent(organizer.client, eventId, form);
    expect(!tooShort.ok && tooShort.errors.reserveSpots).toBe(
      "Lista rezerwowa nie może być krótsza niż liczba osób, które już na niej są.",
    );

    const bigger = await updateEvent(organizer.client, eventId, { ...form, total: "3", reserveSpots: "2" });
    expect(bigger.ok).toBe(true);
    expect(await statusOf(organizer.client, eventId, b.id)).toBe("accepted");
  });
});

describe("minimum osób", () => {
  it("is saved with the event and cannot exceed the team size", async () => {
    const eventId = await createEventWith(5, 0);
    const form: EventFormValues = {
      sport: "pilka-nozna",
      area: "Test RH",
      place: "Orlik testowy",
      startsAt: toLocalDateTime(new Date(Date.now() + 96 * HOUR)),
      total: "6",
      organizerPlays: "on",
      reserveSpots: "",
      minPeople: "4",
      lat: "",
      lng: "",
      description: "",
    };
    const ok = await updateEvent(organizer.client, eventId, form);
    expect(ok.ok && ok.event.min_people).toBe(4);

    const tooHigh = await updateEvent(organizer.client, eventId, { ...form, minPeople: "7" });
    expect(!tooHigh.ok && tooHigh.errors.minPeople).toBe("Minimum nie może być większe niż skład.");
  });
});

describe("odwołanie przez organizatora i przekazanie spotkania", () => {
  it("without accepted participants the event is simply cancelled", async () => {
    const eventId = await createEventWith(3, 0);
    expect(await cancelEvent(organizer.client, eventId)).toEqual({ ok: true });
    expect((await eventRow(organizer.client, eventId))?.status).toBe("cancelled");
  });

  it("with participants it waits for them; the organizer's place is freed for the reserve", async () => {
    const eventId = await createEventWith(1, 1);
    const [a, b] = await Promise.all([newUser("H1"), newUser("H2")]);
    await accept(await join(eventId, a));
    await accept(await join(eventId, b));

    expect(await cancelEvent(organizer.client, eventId)).toEqual({ ok: true });
    const row = await eventRow(a.client, eventId);
    expect(row).toMatchObject({ status: "organizer_left", organizer_plays: false, spots: 2 });
    expect(row?.handover_at).not.toBeNull();
    // Zwolnione miejsce organizatora zajmuje pierwsza osoba z rezerwy.
    expect(await statusOf(a.client, eventId, b.id)).toBe("accepted");
    // Organizator, który odwołał, nie może już rozpatrywać zgłoszeń.
    const outsider = await newUser("H3");
    expect(await requestToJoin(outsider.client, eventId)).toEqual({ ok: false, code: "EVENT_CANCELLED" });
  });

  it("the first participant who stays takes over the organization; the next one just confirms", async () => {
    const eventId = await createEventWith(2, 0);
    const [a, b] = await Promise.all([newUser("T1"), newUser("T2")]);
    await accept(await join(eventId, a));
    await accept(await join(eventId, b));
    await cancelEvent(organizer.client, eventId);

    expect(await respondToCancellation(a.client, eventId, true)).toEqual({ ok: true });
    const row = await eventRow(a.client, eventId);
    // Skład bez zmian (3 osoby): nowy organizator gra, więc do obsadzenia zostają 2 miejsca.
    expect(row).toMatchObject({ status: "active", organizer_id: a.id, organizer_plays: true, spots: 2 });

    expect(await respondToCancellation(b.client, eventId, true)).toEqual({ ok: true });
    const { data } = await b.client
      .from("participations")
      .select("stay_confirmed")
      .eq("event_id", eventId)
      .eq("user_id", b.id)
      .single<{ stay_confirmed: boolean }>();
    expect(data?.stay_confirmed).toBe(true);

    // Po odpowiedzi pytanie znika.
    expect(await respondToCancellation(b.client, eventId, false)).toEqual({ ok: false, code: "NOT_ASKED" });
  });

  it("if everyone declines, the event ends up cancelled", async () => {
    const eventId = await createEventWith(2, 0);
    const [a, b] = await Promise.all([newUser("D1"), newUser("D2")]);
    await accept(await join(eventId, a));
    await accept(await join(eventId, b));
    await cancelEvent(organizer.client, eventId);

    await respondToCancellation(a.client, eventId, false);
    expect((await eventRow(b.client, eventId))?.status).toBe("organizer_left");
    await respondToCancellation(b.client, eventId, false);
    expect((await eventRow(organizer.client, eventId))?.status).toBe("cancelled");
  });

  it("only accepted participants are asked", async () => {
    const eventId = await createEventWith(1, 0);
    const [a, outsider] = await Promise.all([newUser("N1"), newUser("N2")]);
    await accept(await join(eventId, a));
    await cancelEvent(organizer.client, eventId);
    expect(await respondToCancellation(outsider.client, eventId, true)).toEqual({ ok: false, code: "NOT_ASKED" });
  });
});
