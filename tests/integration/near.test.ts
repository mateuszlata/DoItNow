// „W pobliżu” na liście spotkań: promień od okolicy oglądającego, dla zalogowanych i gości (lokalny Supabase).
import { afterAll, describe, expect, it } from "vitest";
import { listUpcomingEvents, nearestEvents } from "@/lib/services/events";
import { HOUR, anonClient, cleanupTestUsers, newUser, type TestUser } from "./helpers";

afterAll(cleanupTestUsers);

// Bieszczady — z dala od spotkań z innych testów.
const CENTER = { lat: 49.3, lng: 22.5 };

async function eventAt(organizer: TestUser, startsAt: Date, lat: number): Promise<string> {
  const { data, error } = await organizer.client
    .from("events")
    .insert({
      organizer_id: organizer.id,
      sport: "koszykowka",
      area: "Test",
      place: "Hala",
      starts_at: startsAt.toISOString(),
      spots: 4,
      lat,
      lng: CENTER.lng,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) throw new Error(error.message);
  return data.id;
}

describe("events near the viewer", () => {
  it("keeps only events inside the radius, sorts by distance and suggests the nearest outside it", async () => {
    const organizer = await newUser("Org Near");
    const at = new Date(Date.now() + 48 * HOUR);
    // ok. 3 km, ok. 1 km i ok. 25 km od środka
    const close = await eventAt(organizer, at, 49.327);
    const closer = await eventAt(organizer, new Date(at.getTime() + HOUR), 49.309);
    const far = await eventAt(organizer, at, 49.525);
    const near = { ...CENTER, radiusKm: 5, label: "Test" };
    const ours = (ids: string[]) => ids.filter((id) => [close, closer, far].includes(id));

    for (const [client, authenticated] of [
      [organizer.client, true],
      [anonClient(), false],
    ] as const) {
      const byTime = await listUpcomingEvents(client, { near }, { authenticated });
      expect(ours(byTime.events.map((e) => e.id))).toEqual([close, closer]);
      const byDistance = await listUpcomingEvents(client, { near, sort: "distance" }, { authenticated });
      expect(ours(byDistance.events.map((e) => e.id))).toEqual([closer, close]);
      const distance = byDistance.events.find((e) => e.id === closer)?.distance_km ?? 0;
      expect(distance).toBeGreaterThan(0.2);
      expect(distance).toBeLessThan(2);
    }

    const tiny = { ...CENTER, radiusKm: 2, label: "Test" };
    const suggestions = await nearestEvents(anonClient(), { near: { ...tiny, lat: 49.45 } }, { authenticated: false });
    expect(suggestions.map((e) => e.id)).toContain(far);
  });
});
