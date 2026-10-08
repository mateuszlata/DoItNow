// FR-004 sprawdzane na lokalnym Supabase: edycja najpóźniej 12 h przed wydarzeniem,
// limit nie mniejszy niż liczba zaakceptowanych, odwołanie w dowolnej chwili przed startem.
import { beforeAll, describe, expect, it } from "vitest";
import { cancelEvent, updateEvent, type EventFormValues } from "@/lib/services/events";
import { decideParticipation, requestToJoin } from "@/lib/services/participations";
import { toLocalDateTime } from "@/lib/time";
import { HOUR, anonClient, insertEvent, newUser, type TestUser } from "./helpers";

let organizer: TestUser;
let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  organizer = await newUser("Organizator FR4");
  alice = await newUser("Alicja FR4");
  bob = await newUser("Bartek FR4");
});

function editForm(overrides: Partial<EventFormValues> = {}): EventFormValues {
  return {
    sport: "siatkowka",
    area: "Wola",
    place: "Hala po zmianie",
    startsAt: toLocalDateTime(new Date(Date.now() + 96 * HOUR)),
    spots: "4",
    description: "Nowy opis",
    ...overrides,
  };
}

async function acceptParticipant(eventId: string, participant: TestUser): Promise<void> {
  const join = await requestToJoin(participant.client, eventId);
  if (!join.ok) throw new Error(`join failed: ${join.code}`);
  const decision = await decideParticipation(organizer.client, join.participation.id, true);
  if (!decision.ok) throw new Error(`accept failed: ${decision.code}`);
}

describe("edycja ogłoszenia (FR-004)", () => {
  it("the organizer can edit an event more than 12 h before it starts", async () => {
    const eventId = await insertEvent(organizer, new Date(Date.now() + 72 * HOUR), 2);
    const result = await updateEvent(organizer.client, eventId, editForm());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event).toMatchObject({ sport: "siatkowka", area: "Wola", place: "Hala po zmianie", spots: 4 });
    expect(result.event.description).toBe("Nowy opis");
  });

  it("someone other than the organizer cannot edit", async () => {
    const eventId = await insertEvent(organizer, new Date(Date.now() + 72 * HOUR), 2);
    const result = await updateEvent(alice.client, eventId, editForm());
    expect(result).toEqual({ ok: false, errors: { form: "Tylko organizator może edytować ogłoszenie." } });
  });

  it("editing is blocked later than 12 h before the current start, even when moving the date later", async () => {
    const eventId = await insertEvent(organizer, new Date(Date.now() + 2 * HOUR), 2);
    const result = await updateEvent(organizer.client, eventId, editForm());
    expect(result).toEqual({ ok: false, errors: { form: "Edycja jest możliwa najpóźniej 12 h przed spotkaniem." } });
  });

  it("the spot limit cannot drop below the number of accepted participants", async () => {
    const eventId = await insertEvent(organizer, new Date(Date.now() + 72 * HOUR), 2);
    await acceptParticipant(eventId, alice);
    await acceptParticipant(eventId, bob);

    const tooFew = await updateEvent(organizer.client, eventId, editForm({ spots: "1" }));
    expect(tooFew).toEqual({
      ok: false,
      errors: { spots: "Limit nie może być mniejszy niż liczba zaakceptowanych uczestników." },
    });

    const exact = await updateEvent(organizer.client, eventId, editForm({ spots: "2" }));
    expect(exact.ok).toBe(true);
  });

  it("the database rejects a start time in the past even if the app check is skipped", async () => {
    const eventId = await insertEvent(organizer, new Date(Date.now() + 72 * HOUR), 2);
    const { error } = await organizer.client.rpc("update_event", {
      p_event_id: eventId,
      p_sport: "tenis",
      p_area: "Wola",
      p_place: "Kort",
      p_starts_at: new Date(Date.now() - HOUR).toISOString(),
      p_spots: 2,
      p_description: "",
    });
    expect(error?.message).toBe("STARTS_IN_PAST");
  });

  it("events cannot be changed directly, bypassing the rules", async () => {
    const eventId = await insertEvent(organizer, new Date(Date.now() + 2 * HOUR), 2);
    const { data } = await organizer.client.from("events").update({ spots: 9 }).eq("id", eventId).select("id");
    expect(data).toEqual([]);
  });
});

describe("odwołanie ogłoszenia (FR-004)", () => {
  it("the organizer can cancel even within 12 h; the event then closes for new requests", async () => {
    const eventId = await insertEvent(organizer, new Date(Date.now() + 2 * HOUR), 2);
    await acceptParticipant(eventId, alice);

    expect(await cancelEvent(organizer.client, eventId)).toEqual({ ok: true });
    expect(await requestToJoin(bob.client, eventId)).toEqual({ ok: false, code: "EVENT_CANCELLED" });

    // Uczestnik nadal widzi spotkanie, ze statusem „odwołane”.
    const { data } = await alice.client.from("events").select("status").eq("id", eventId).single<{ status: string }>();
    expect(data?.status).toBe("cancelled");

    // Odwołane ogłoszenie znika z publicznego widoku.
    const { data: publicRows } = await anonClient().from("events_public").select("id").eq("id", eventId);
    expect(publicRows).toEqual([]);
  });

  it("someone other than the organizer cannot cancel", async () => {
    const eventId = await insertEvent(organizer, new Date(Date.now() + 72 * HOUR), 2);
    expect(await cancelEvent(alice.client, eventId)).toEqual({ ok: false, code: "NOT_ORGANIZER" });
  });

  it("a cancelled event cannot be edited", async () => {
    const eventId = await insertEvent(organizer, new Date(Date.now() + 72 * HOUR), 2);
    await cancelEvent(organizer.client, eventId);
    const result = await updateEvent(organizer.client, eventId, editForm());
    expect(result).toEqual({ ok: false, errors: { form: "Odwołanego ogłoszenia nie można edytować." } });
  });
});
