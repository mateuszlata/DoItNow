// Poziom sportowy: deklaracje graczy, zakres spotkania i rozkład poziomów w składzie (lokalny Supabase).
import { afterAll, describe, expect, it } from "vitest";
import { createEvent, getLevelMix, listUpcomingEvents, updateEvent, type EventFormValues } from "@/lib/services/events";
import { requestToJoin } from "@/lib/services/participations";
import { getLevels, saveLevel } from "@/lib/services/profiles";
import { toLocalDateTime } from "@/lib/time";
import { HOUR, anonClient, cleanupTestUsers, newUser } from "./helpers";

afterAll(cleanupTestUsers);

function form(overrides: Partial<EventFormValues> = {}): EventFormValues {
  return {
    sport: "pilka-nozna",
    area: "Test PZ",
    place: "Orlik PZ",
    startsAt: toLocalDateTime(new Date(Date.now() + 72 * HOUR)),
    durationMinutes: "90",
    venueId: "",
    total: "10",
    organizerPlays: "on",
    membersCanInvite: "on",
    requiresApproval: "",
    reserveSpots: "",
    minPeople: "",
    lat: "",
    lng: "",
    description: "",
    levelRange: "2-3",
    ...overrides,
  };
}

describe("skill levels", () => {
  it("stores each player's level per sport and lets them remove it", async () => {
    const user = await newUser("Gracz PZ");
    expect(await saveLevel(user.client, user.id, "pilka-nozna", 2)).toBe(true);
    expect(await saveLevel(user.client, user.id, "tenis", 4)).toBe(true);
    expect(await getLevels(user.client, user.id)).toEqual({ "pilka-nozna": 2, tenis: 4 });
    expect(await saveLevel(user.client, user.id, "tenis", null)).toBe(true);
    expect(await getLevels(user.client, user.id)).toEqual({ "pilka-nozna": 2 });
  });

  it("keeps the event range from the form and lets only the organizer change it", async () => {
    const [organizer, other] = await Promise.all([newUser("Org PZ"), newUser("Inny PZ")]);
    const created = await createEvent(organizer.client, organizer.id, form());
    if (!created.ok) throw new Error(JSON.stringify(created.errors));
    expect(created.event).toMatchObject({ level_min: 2, level_max: 3 });

    const updated = await updateEvent(organizer.client, created.event.id, form({ levelRange: "" }));
    expect(updated.ok && [updated.event.level_min, updated.event.level_max]).toEqual([null, null]);

    const { error } = await other.client.rpc("set_event_level", { p_event_id: created.event.id, p_min: 1, p_max: 1 });
    expect(error?.message).toBe("NOT_ORGANIZER");
  });

  it("shows the squad's level mix, also to visitors without an account", async () => {
    const [organizer, ala, ola] = await Promise.all([newUser("Org2 PZ"), newUser("Ala PZ"), newUser("Ola PZ")]);
    await saveLevel(organizer.client, organizer.id, "pilka-nozna", 3);
    await saveLevel(ala.client, ala.id, "pilka-nozna", 2);
    await saveLevel(ola.client, ola.id, "pilka-nozna", 2);
    await saveLevel(ola.client, ola.id, "tenis", 4); // inny sport — nie liczy się
    const created = await createEvent(organizer.client, organizer.id, form());
    if (!created.ok) throw new Error(JSON.stringify(created.errors));
    for (const user of [ala, ola]) expect((await requestToJoin(user.client, created.event.id)).ok).toBe(true);

    expect(await getLevelMix(anonClient(), created.event.id)).toEqual([
      { level: 2, players: 2 },
      { level: 3, players: 1 },
    ]);
  });

  it("lists only events that fit my level, treating open events and undeclared sports as a fit", async () => {
    const [organizer, player] = await Promise.all([newUser("Org3 PZ"), newUser("Gracz3 PZ")]);
    await saveLevel(player.client, player.id, "pilka-nozna", 2);
    const ids: Record<string, string> = {};
    for (const [name, values] of [
      ["easy", { levelRange: "1-2" }],
      ["hard", { levelRange: "3-4" }],
      ["open", { levelRange: "" }],
      ["tennis", { sport: "tenis", levelRange: "4-4" }],
    ] as const) {
      const created = await createEvent(organizer.client, organizer.id, form(values));
      if (!created.ok) throw new Error(JSON.stringify(created.errors));
      ids[name] = created.event.id;
    }

    const { events } = await listUpcomingEvents(
      player.client,
      { levels: await getLevels(player.client, player.id) },
      { authenticated: true, limit: 50 },
    );
    const shown = Object.entries(ids)
      .filter(([, id]) => events.some((e) => e.id === id))
      .map(([name]) => name);
    expect(shown.sort()).toEqual(["easy", "open", "tennis"]);
  });
});
