// Usuwanie własnego konta (RODO) — lokalny Supabase: `npx supabase start`.
import { afterAll, describe, expect, it } from "vitest";
import { createEvent } from "@/lib/services/events";
import { EMPTY_VENUE_FORM, createVenue } from "@/lib/services/venues";
import { requestToJoin } from "@/lib/services/participations";
import { toLocalDateTime } from "@/lib/time";
import { HOUR, anonClient, cleanupTestUsers, newUser } from "./helpers";

afterAll(cleanupTestUsers);

const DAY = toLocalDateTime(new Date(Date.now() + 72 * HOUR)).slice(0, 10);

describe("delete_own_account", () => {
  it("removes the user with their profile and participations", async () => {
    const [organizer, player] = await Promise.all([newUser("Usuwany DA"), newUser("Organizator DA")]);
    const event = await createEvent(player.client, player.id, {
      sport: "tenis",
      area: "Test DA",
      place: "Kort DA",
      startsAt: `${DAY}T10:00`,
      durationMinutes: "60",
      venueId: "",
      total: "4",
      organizerPlays: "on",
      requiresApproval: "",
      reserveSpots: "",
      minPeople: "",
      lat: "",
      lng: "",
      description: "",
    });
    if (!event.ok) throw new Error("event failed");
    await requestToJoin(organizer.client, event.event.id);

    const { error } = await organizer.client.rpc("delete_own_account");
    expect(error).toBeNull();

    const { data: profile } = await player.client.from("profiles").select("id").eq("id", organizer.id);
    expect(profile).toEqual([]);
    const { data: participations } = await player.client
      .from("participations")
      .select("id")
      .eq("event_id", event.event.id);
    expect(participations).toEqual([]);
  });

  it("keeps other people's events at a deleted manager's venue, without the venue", async () => {
    const [manager, organizer] = await Promise.all([newUser("Zarządca DA"), newUser("Gracz DA")]);
    const venue = await createVenue(manager.client, manager.id, {
      ...EMPTY_VENUE_FORM,
      name: "Hala DA",
      area: "Ursus",
      address: "Długa 2, Warszawa",
      lat: "52.19",
      lng: "20.88",
      sports: ["siatkowka"],
      price: "80",
      hours: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((d) => [d, { open: true, opens: "08:00", closes: "22:00" }])),
    });
    if (!venue.ok) throw new Error("venue failed");
    const event = await createEvent(organizer.client, organizer.id, {
      sport: "siatkowka",
      area: "",
      place: "",
      startsAt: `${DAY}T15:00`,
      durationMinutes: "60",
      venueId: venue.venue.id,
      total: "12",
      organizerPlays: "on",
      requiresApproval: "",
      reserveSpots: "",
      minPeople: "",
      lat: "",
      lng: "",
      description: "",
    });
    if (!event.ok) throw new Error(`event failed: ${JSON.stringify(event.errors)}`);

    expect((await manager.client.rpc("delete_own_account")).error).toBeNull();

    const { data } = await organizer.client
      .from("events")
      .select("venue_id, venue_status, status")
      .eq("id", event.event.id)
      .single<{ venue_id: string | null; venue_status: string | null; status: string }>();
    expect(data).toEqual({ venue_id: null, venue_status: null, status: "active" });
  });

  it("is not available to guests", async () => {
    const { error } = await anonClient().rpc("delete_own_account");
    expect(error).not.toBeNull();
  });
});
