// FR-004 sprawdzane na lokalnym Supabase: edycja najpóźniej 12 h przed wydarzeniem,
// limit nie mniejszy niż liczba zaakceptowanych, odwołanie w dowolnej chwili przed startem.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cancelEvent, listUpcomingEvents, updateEvent, type EventFormValues } from "@/lib/services/events";
import { decideParticipation, requestToJoin } from "@/lib/services/participations";
import { localDateTimeToDate, toLocalDateTime } from "@/lib/time";
import { HOUR, cleanupTestUsers, anonClient, insertEvent, newUser, type TestUser } from "./helpers";

let organizer: TestUser;
let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  organizer = await newUser("Organizator FR4");
  alice = await newUser("Alicja FR4");
  bob = await newUser("Bartek FR4");
});

afterAll(cleanupTestUsers);

function editForm(overrides: Partial<EventFormValues> = {}): EventFormValues {
  return {
    sport: "siatkowka",
    area: "Wola",
    place: "Hala po zmianie",
    startsAt: toLocalDateTime(new Date(Date.now() + 96 * HOUR)),
    durationMinutes: "90",
    venueId: "",
    // 5 osób w składzie, w tym grający organizator -> 4 miejsca do obsadzenia
    total: "5",
    organizerPlays: "on",
    requiresApproval: "on",
    reserveSpots: "",
    minPeople: "",
    lat: "",
    lng: "",
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

  it("the team cannot shrink below the number of accepted participants", async () => {
    const eventId = await insertEvent(organizer, new Date(Date.now() + 72 * HOUR), 2);
    await acceptParticipant(eventId, alice);
    await acceptParticipant(eventId, bob);

    const tooFew = await updateEvent(organizer.client, eventId, editForm({ total: "2" }));
    expect(tooFew).toEqual({
      ok: false,
      errors: { total: "Skład nie może być mniejszy niż liczba zaakceptowanych uczestników." },
    });

    const exact = await updateEvent(organizer.client, eventId, editForm({ total: "3" }));
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
      p_organizer_plays: true,
      p_lat: null,
      p_lng: null,
      p_reserve_spots: 0,
      p_min_people: null,
      p_requires_approval: false,
      p_duration_minutes: 90,
      p_venue_id: null,
    });
    expect(error?.message).toBe("STARTS_IN_PAST");
  });

  it("events cannot be changed directly, bypassing the rules", async () => {
    const eventId = await insertEvent(organizer, new Date(Date.now() + 2 * HOUR), 2);
    const { data } = await organizer.client.from("events").update({ spots: 9 }).eq("id", eventId).select("id");
    expect(data).toEqual([]);
  });
});

describe("skład i pinezka", () => {
  it("saves who plays and the pin; an organizer who stops playing frees one place for others", async () => {
    const eventId = await insertEvent(organizer, new Date(Date.now() + 72 * HOUR), 2);
    const result = await updateEvent(
      organizer.client,
      eventId,
      editForm({ total: "3", organizerPlays: "", lat: "52.2297", lng: "21.0122" }),
    );
    expect(result.ok && result.event).toMatchObject({ spots: 3, organizer_plays: false, lat: 52.2297, lng: 21.0122 });
  });

  it("the database rejects an invalid pin even if the app check is skipped", async () => {
    const eventId = await insertEvent(organizer, new Date(Date.now() + 72 * HOUR), 2);
    const { error } = await organizer.client.rpc("update_event", {
      p_event_id: eventId,
      p_sport: "tenis",
      p_area: "Wola",
      p_place: "Kort",
      p_starts_at: new Date(Date.now() + 96 * HOUR).toISOString(),
      p_spots: 2,
      p_description: "",
      p_organizer_plays: true,
      p_lat: 120,
      p_lng: 21,
      p_reserve_spots: 0,
      p_min_people: null,
      p_requires_approval: false,
      p_duration_minutes: 90,
      p_venue_id: null,
    });
    expect(error?.message).toBe("INVALID_DATA");
  });

  it("guests see whether the organizer plays but never the pin", async () => {
    const eventId = await insertEvent(organizer, new Date(Date.now() + 72 * HOUR), 2);
    await updateEvent(organizer.client, eventId, editForm({ lat: "52.2297", lng: "21.0122" }));
    const { data } = await anonClient()
      .from("events_public")
      .select("*")
      .eq("id", eventId)
      .single<Record<string, unknown>>();
    expect(data).toMatchObject({ organizer_plays: true });
    expect(data).not.toHaveProperty("lat");
    expect(data).not.toHaveProperty("lng");
  });
});

describe("odwołanie ogłoszenia (FR-004)", () => {
  it("the organizer can cancel even within 12 h; the event then closes for new requests and waits for participants", async () => {
    const eventId = await insertEvent(organizer, new Date(Date.now() + 2 * HOUR), 2);
    await acceptParticipant(eventId, alice);

    expect(await cancelEvent(organizer.client, eventId)).toEqual({ ok: true });
    expect(await requestToJoin(bob.client, eventId)).toEqual({ ok: false, code: "EVENT_CANCELLED" });

    // Uczestnik nadal widzi spotkanie: z zaakceptowanymi uczestnikami czeka na ich decyzję, czy zostają.
    const { data } = await alice.client.from("events").select("status").eq("id", eventId).single<{ status: string }>();
    expect(data?.status).toBe("organizer_left");

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

describe("lista nadchodzących ogłoszeń (FR-005)", () => {
  // Unikalny dzień w przyszłości, żeby filtr widział tylko ogłoszenia z tego testu.
  const day = `2031-${String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")}-${String(1 + Math.floor(Math.random() * 28)).padStart(2, "0")}`;
  const at = (hour: string) => localDateTimeToDate(`${day}T${hour}`) ?? new Date(NaN);

  it("shows at most the page size and says whether there are more, nearest first", async () => {
    const ids = [
      await insertEvent(organizer, at("12:00"), 2, "badminton"),
      await insertEvent(organizer, at("10:00"), 2, "badminton"),
      await insertEvent(organizer, at("11:00"), 2, "badminton"),
    ];

    const firstPage = await listUpcomingEvents(
      organizer.client,
      { sport: "badminton", day },
      { authenticated: true, limit: 2 },
    );
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.events.map((e) => e.id)).toEqual([ids[1], ids[2]]);

    const all = await listUpcomingEvents(
      organizer.client,
      { sport: "badminton", day },
      { authenticated: true, limit: 3 },
    );
    expect(all.hasMore).toBe(false);
    expect(all.events.map((e) => e.id)).toEqual([ids[1], ids[2], ids[0]]);

    // Gość dostaje te same ogłoszenia w ograniczonym widoku, bez dokładnego miejsca.
    const guest = await listUpcomingEvents(
      anonClient(),
      { sport: "badminton", day },
      { authenticated: false, limit: 2 },
    );
    expect(guest.hasMore).toBe(true);
    expect(guest.events.every((e) => !("place" in e))).toBe(true);
  });
});
