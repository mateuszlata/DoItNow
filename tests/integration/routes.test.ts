// Trasa spotkań w ruchu (rower, bieganie): zapis z formularza, edycja tylko przez organizatora, widoczność dla gości.
import { afterAll, describe, expect, it } from "vitest";
import { createEvent, getPublicEvent, updateEvent, type EventFormValues } from "@/lib/services/events";
import { toLocalDateTime } from "@/lib/time";
import { HOUR, anonClient, cleanupTestUsers, newUser } from "./helpers";

afterAll(cleanupTestUsers);

function form(overrides: Partial<EventFormValues> = {}): EventFormValues {
  return {
    sport: "rower",
    area: "Raków",
    place: "Parking przy Kauflandzie",
    startsAt: toLocalDateTime(new Date(Date.now() + 72 * HOUR)),
    durationMinutes: "180",
    venueId: "",
    total: "8",
    organizerPlays: "on",
    membersCanInvite: "on",
    requiresApproval: "",
    reserveSpots: "",
    minPeople: "",
    lat: "",
    lng: "",
    description: "",
    routeDestination: "Olsztyn, ruiny zamku",
    routeLoop: "",
    routeDistance: "35,5",
    routePace: "25–28 km/h",
    routeUrl: "https://www.strava.com/routes/123",
    ...overrides,
  };
}

describe("event routes", () => {
  it("stores the route for rides and runs, shows it to visitors without the link", async () => {
    const organizer = await newUser("Org TR");
    const created = await createEvent(organizer.client, organizer.id, form());
    if (!created.ok) throw new Error(JSON.stringify(created.errors));
    expect(created.event).toMatchObject({
      route_destination: "Olsztyn, ruiny zamku",
      route_loop: false,
      route_distance_km: 35.5,
      route_pace: "25–28 km/h",
      route_url: "https://www.strava.com/routes/123",
    });

    const visible = await getPublicEvent(anonClient(), created.event.id);
    expect(visible).toMatchObject({ route_destination: "Olsztyn, ruiny zamku", route_distance_km: 35.5 });
    expect(visible).not.toHaveProperty("route_url");
  });

  it("lets the organizer turn it into a loop and nobody else change it", async () => {
    const [organizer, other] = await Promise.all([newUser("Org2 TR"), newUser("Inny TR")]);
    const created = await createEvent(organizer.client, organizer.id, form());
    if (!created.ok) throw new Error(JSON.stringify(created.errors));

    const updated = await updateEvent(organizer.client, created.event.id, form({ routeLoop: "on", routeUrl: "" }));
    expect(updated.ok && [updated.event.route_loop, updated.event.route_destination, updated.event.route_url]).toEqual([
      true,
      null,
      null,
    ]);

    const { error } = await other.client.rpc("set_event_route", {
      p_event_id: created.event.id,
      p_destination: "Gdzie indziej",
      p_loop: false,
      p_distance_km: 5,
      p_pace: null,
      p_url: null,
    });
    expect(error?.message).toBe("NOT_ORGANIZER");
  });

  it("ignores route fields for other sports and rejects links that are not https", async () => {
    const organizer = await newUser("Org3 TR");
    const football = await createEvent(organizer.client, organizer.id, form({ sport: "pilka-nozna" }));
    if (!football.ok) throw new Error(JSON.stringify(football.errors));
    expect(football.event).toMatchObject({ route_destination: null, route_distance_km: null, route_url: null });

    const bad = await createEvent(organizer.client, organizer.id, form({ routeUrl: "javascript:alert(1)" }));
    expect(bad.ok ? null : bad.errors.routeUrl).toBe("Wklej link zaczynający się od https://.");
  });
});
