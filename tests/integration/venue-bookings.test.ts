// Potwierdzanie terminów na obiekcie przez zarządcę (lokalny Supabase: `npx supabase start`).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEvent, updateEvent, type EventFormValues } from "@/lib/services/events";
import {
  EMPTY_VENUE_FORM,
  countPendingBookings,
  createVenue,
  decideVenueBooking,
  listVenueBookings,
} from "@/lib/services/venues";
import { toLocalDateTime } from "@/lib/time";
import { HOUR, cleanupTestUsers, newUser, type TestUser } from "./helpers";

let manager: TestUser;
let organizer: TestUser;

beforeAll(async () => {
  [manager, organizer] = await Promise.all([newUser("Zarządca VB"), newUser("Organizator VB")]);
});

afterAll(cleanupTestUsers);

const DAY = toLocalDateTime(new Date(Date.now() + 72 * HOUR)).slice(0, 10);

async function newVenue(): Promise<string> {
  const result = await createVenue(manager.client, manager.id, {
    ...EMPTY_VENUE_FORM,
    name: "Hala VB",
    area: "Wola",
    address: "Prosta 1, Warszawa",
    lat: "52.23",
    lng: "20.98",
    sports: ["koszykowka"],
    price: "100",
    hours: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((d) => [d, { open: true, opens: "08:00", closes: "22:00" }])),
  });
  if (!result.ok) throw new Error(`venue failed: ${JSON.stringify(result.errors)}`);
  return result.venue.id;
}

function form(venueId: string, time: string): EventFormValues {
  return {
    sport: "koszykowka",
    area: "",
    place: "",
    startsAt: `${DAY}T${time}`,
    durationMinutes: "60",
    venueId,
    total: "10",
    organizerPlays: "on",
    requiresApproval: "",
    reserveSpots: "",
    minPeople: "",
    lat: "",
    lng: "",
    description: "",
  };
}

async function newEvent(venueId: string, time: string): Promise<string> {
  const result = await createEvent(organizer.client, organizer.id, form(venueId, time));
  if (!result.ok) throw new Error(`event failed: ${JSON.stringify(result.errors)}`);
  return result.event.id;
}

describe("potwierdzanie terminów przez zarządcę", () => {
  it("a new booking waits for the manager, who sees it and can approve it", async () => {
    const venueId = await newVenue();
    const eventId = await newEvent(venueId, "10:00");

    const bookings = await listVenueBookings(manager.client, venueId);
    expect(bookings.map((b) => [b.id, b.venue_status])).toEqual([[eventId, "pending"]]);
    expect(await countPendingBookings(manager.client, manager.id)).toBeGreaterThanOrEqual(1);

    expect(await decideVenueBooking(manager.client, eventId, true)).toEqual({ ok: true });
    const after = await listVenueBookings(manager.client, venueId);
    expect(after[0].venue_status).toBe("approved");
  });

  it("only the venue manager can decide — not the organizer", async () => {
    const venueId = await newVenue();
    const eventId = await newEvent(venueId, "11:00");
    expect(await decideVenueBooking(organizer.client, eventId, true)).toEqual({ ok: false, code: "NOT_VENUE_MANAGER" });
  });

  it("a rejected booking keeps the reason and frees the time for someone else", async () => {
    const venueId = await newVenue();
    const eventId = await newEvent(venueId, "12:00");
    expect(await decideVenueBooking(manager.client, eventId, false, "Turniej szkolny")).toEqual({ ok: true });

    const [rejected] = await listVenueBookings(manager.client, venueId);
    expect(rejected).toMatchObject({ venue_status: "rejected", venue_note: "Turniej szkolny" });
    // Ten sam termin jest znów wolny.
    await expect(newEvent(venueId, "12:00")).resolves.toBeTypeOf("string");
    // Odrzuconego terminu nie da się już zmienić decyzją.
    expect(await decideVenueBooking(manager.client, eventId, true)).toEqual({
      ok: false,
      code: "BOOKING_ALREADY_DECIDED",
    });
  });

  it("changing the time of an approved booking sends it back for approval", async () => {
    const venueId = await newVenue();
    const eventId = await newEvent(venueId, "14:00");
    await decideVenueBooking(manager.client, eventId, true);

    const moved = await updateEvent(organizer.client, eventId, form(venueId, "16:00"));
    expect(moved.ok && moved.event.venue_status).toBe("pending");
  });
});
