// Obiekty zarządców: godziny otwarcia, kolizje terminów, sport z oferty, koszt i uprawnienia
// (lokalny Supabase: `npx supabase start`).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cancelEvent, createEvent, type EventFormValues } from "@/lib/services/events";
import { EMPTY_VENUE_FORM, createVenue, updateVenue, type VenueFormValues } from "@/lib/services/venues";
import { toLocalDateTime } from "@/lib/time";
import { HOUR, cleanupTestUsers, newUser, type TestUser } from "./helpers";

let manager: TestUser;
let organizer: TestUser;

beforeAll(async () => {
  [manager, organizer] = await Promise.all([newUser("Zarządca VN"), newUser("Organizator VN")]);
});

afterAll(cleanupTestUsers);

/** Obiekt otwarty codziennie 8:00–22:00, 120 zł za godzinę, piłka nożna i siatkówka. */
function venueForm(overrides: Partial<VenueFormValues> = {}): VenueFormValues {
  return {
    ...EMPTY_VENUE_FORM,
    name: "Orlik testowy VN",
    area: "Mokotów",
    address: "Dolna 5, Warszawa",
    lat: "52.2",
    lng: "21.0",
    sports: ["pilka-nozna", "siatkowka"],
    price: "120",
    hours: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((d) => [d, { open: true, opens: "08:00", closes: "22:00" }])),
    ...overrides,
  };
}

async function newVenue(overrides: Partial<VenueFormValues> = {}): Promise<string> {
  const result = await createVenue(manager.client, manager.id, venueForm(overrides));
  if (!result.ok) throw new Error(`venue failed: ${JSON.stringify(result.errors)}`);
  return result.venue.id;
}

/** Dzień za 3 doby (czas lokalny) i godzina startu „HH:MM”. */
const DAY = toLocalDateTime(new Date(Date.now() + 72 * HOUR)).slice(0, 10);

function eventForm(venueId: string, time: string, overrides: Partial<EventFormValues> = {}): EventFormValues {
  return {
    sport: "pilka-nozna",
    area: "",
    place: "",
    startsAt: `${DAY}T${time}`,
    durationMinutes: "120",
    venueId,
    total: "12",
    organizerPlays: "on",
    requiresApproval: "",
    reserveSpots: "",
    minPeople: "",
    lat: "",
    lng: "",
    description: "",
    ...overrides,
  };
}

describe("spotkanie na obiekcie", () => {
  it("takes the place and pin from the venue and computes the cost from its price list", async () => {
    const venueId = await newVenue();
    const result = await createEvent(organizer.client, organizer.id, eventForm(venueId, "18:00"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event).toMatchObject({
      venue_id: venueId,
      area: "Mokotów",
      place: "Orlik testowy VN, Dolna 5, Warszawa",
      lat: 52.2,
      lng: 21,
      duration_minutes: 120,
      cost_cents: 24000,
    });
  });

  it("rejects a time that overlaps another event at the same venue, until that event is cancelled", async () => {
    const venueId = await newVenue();
    const first = await createEvent(organizer.client, organizer.id, eventForm(venueId, "18:00"));
    if (!first.ok) throw new Error("first event failed");

    const overlapping = await createEvent(organizer.client, organizer.id, eventForm(venueId, "19:00"));
    expect(overlapping).toEqual({
      ok: false,
      errors: { startsAt: "Obiekt jest w tym czasie zajęty przez inne spotkanie." },
    });

    const afterwards = await createEvent(organizer.client, organizer.id, eventForm(venueId, "20:00"));
    expect(afterwards.ok).toBe(true);

    await cancelEvent(organizer.client, first.event.id);
    const again = await createEvent(organizer.client, organizer.id, eventForm(venueId, "18:00"));
    expect(again.ok).toBe(true);
  });

  it("rejects a time outside the opening hours, including one that ends after closing", async () => {
    const venueId = await newVenue();
    const late = await createEvent(organizer.client, organizer.id, eventForm(venueId, "21:00"));
    expect(late).toEqual({
      ok: false,
      errors: { startsAt: "Obiekt jest wtedy zamknięty — wybierz termin w godzinach otwarcia." },
    });
    const early = await createEvent(organizer.client, organizer.id, eventForm(venueId, "07:00"));
    expect(early.ok).toBe(false);
  });

  it("rejects a day when the venue is closed", async () => {
    const weekday = new Date(`${DAY}T12:00:00Z`).getUTCDay() || 7;
    const otherDay = (weekday % 7) + 1;
    const venueId = await newVenue({
      hours: Object.fromEntries(
        [1, 2, 3, 4, 5, 6, 7].map((d) => [d, { open: d === otherDay, opens: "08:00", closes: "22:00" }]),
      ),
    });
    const result = await createEvent(organizer.client, organizer.id, eventForm(venueId, "18:00"));
    expect(result.ok).toBe(false);
  });

  it("rejects a sport the venue does not offer", async () => {
    const venueId = await newVenue();
    const result = await createEvent(
      organizer.client,
      organizer.id,
      eventForm(venueId, "12:00", { sport: "koszykowka" }),
    );
    expect(result).toEqual({ ok: false, errors: { venueId: "Ten obiekt nie oferuje wybranego sportu." } });
  });
});

describe("obiekt zarządcy", () => {
  it("requires a pin, a sport, a price and at least one open day", async () => {
    const result = await createVenue(
      manager.client,
      manager.id,
      venueForm({
        lat: "",
        sports: [],
        price: "dużo",
        hours: Object.fromEntries(
          [1, 2, 3, 4, 5, 6, 7].map((d) => [d, { open: false, opens: "08:00", closes: "22:00" }]),
        ),
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["hours", "lat", "price", "sports"]);
  });

  it("only the manager can change the venue", async () => {
    const venueId = await newVenue();
    const byOrganizer = await updateVenue(organizer.client, venueId, venueForm({ price: "1" }));
    expect(byOrganizer.ok).toBe(false);
    const byManager = await updateVenue(manager.client, venueId, venueForm({ price: "99,50" }));
    expect(byManager.ok && byManager.venue.price_per_hour_cents).toBe(9950);
  });
});
