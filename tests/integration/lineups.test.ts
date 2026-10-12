// Składy na mecz — reguły w bazie (lokalny Supabase: `npx supabase start`).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEvent } from "@/lib/services/events";
import { requestToJoin } from "@/lib/services/participations";
import { clearLineup, getLineup, saveLineup } from "@/lib/services/lineups";
import { getPositions, savePosition } from "@/lib/services/profiles";
import { toLocalDateTime } from "@/lib/time";
import { HOUR, cleanupTestUsers, newUser, type TestUser } from "./helpers";

afterAll(cleanupTestUsers);

const DAY = toLocalDateTime(new Date(Date.now() + 72 * HOUR)).slice(0, 10);

async function footballEvent(organizer: TestUser, sport = "pilka-nozna"): Promise<string> {
  const result = await createEvent(organizer.client, organizer.id, {
    sport,
    area: "Test SK",
    place: "Orlik SK",
    startsAt: `${DAY}T17:00`,
    durationMinutes: "60",
    venueId: "",
    total: "4",
    organizerPlays: "on",
    requiresApproval: "",
    reserveSpots: "1",
    minPeople: "",
    lat: "",
    lng: "",
    description: "",
  });
  if (!result.ok) throw new Error(`event failed: ${JSON.stringify(result.errors)}`);
  return result.event.id;
}

describe("match lineups", () => {
  let organizer: TestUser, p1: TestUser, p2: TestUser, p3: TestUser, reserve: TestUser, outsider: TestUser;
  let eventId: string;

  beforeAll(async () => {
    [organizer, p1, p2, p3, reserve, outsider] = await Promise.all([
      newUser("Org SK"),
      newUser("Gracz1 SK"),
      newUser("Gracz2 SK"),
      newUser("Gracz3 SK"),
      newUser("Rezerwa SK"),
      newUser("Obcy SK"),
    ]);
    eventId = await footballEvent(organizer);
    for (const user of [p1, p2, p3, reserve]) expect((await requestToJoin(user.client, eventId)).ok).toBe(true);
  });

  const split = () => [
    { user_id: organizer.id, team: 0 as const, slot: 0 },
    { user_id: p1.id, team: 0 as const, slot: 1 },
    { user_id: p2.id, team: 1 as const, slot: 0 },
    { user_id: p3.id, team: 1 as const, slot: 1 },
  ];

  it("lets the organizer save a lineup that members (including the reserve) can see", async () => {
    expect(
      await saveLineup(organizer.client, eventId, { teamA: "#ff7a1a", teamB: "#2a9d55", assignments: split() }),
    ).toEqual({
      ok: true,
    });
    for (const user of [p1, reserve]) {
      expect(await getLineup(user.client, eventId)).toMatchObject({ teamA: "#ff7a1a", teamB: "#2a9d55" });
    }
    expect(await getLineup(outsider.client, eventId)).toBeNull();
  });

  it("rejects other people, the reserve on the pitch, duplicates and same colours", async () => {
    expect(await saveLineup(p1.client, eventId, { teamA: "#ff7a1a", teamB: "#2a9d55", assignments: split() })).toEqual({
      ok: false,
      code: "NOT_ORGANIZER",
    });
    expect(
      await saveLineup(organizer.client, eventId, {
        teamA: "#ff7a1a",
        teamB: "#2a9d55",
        assignments: [...split(), { user_id: reserve.id, team: 1, slot: 2 }],
      }),
    ).toEqual({ ok: false, code: "NOT_IN_SQUAD" });
    expect(
      await saveLineup(organizer.client, eventId, {
        teamA: "#ff7a1a",
        teamB: "#2a9d55",
        assignments: [...split(), { user_id: p1.id, team: 1, slot: 3 }],
      }),
    ).toEqual({ ok: false, code: "INVALID_LINEUP" });
    expect(
      (await saveLineup(organizer.client, eventId, { teamA: "#ff7a1a", teamB: "#ff7a1a", assignments: split() })).ok,
    ).toBe(false);
  });

  it("works for volleyball but not for running", async () => {
    const volleyball = await footballEvent(organizer, "siatkowka");
    expect(
      await saveLineup(organizer.client, volleyball, {
        teamA: "#ff7a1a",
        teamB: "#ffffff",
        assignments: [{ user_id: organizer.id, team: 0, slot: 0 }],
      }),
    ).toEqual({ ok: true });
    const running = await footballEvent(organizer, "bieganie");
    expect(
      await saveLineup(organizer.client, running, {
        teamA: "#ff7a1a",
        teamB: "#2a9d55",
        assignments: [{ user_id: organizer.id, team: 0, slot: 0 }],
      }),
    ).toEqual({ ok: false, code: "LINEUP_NOT_SUPPORTED" });
  });

  it("lets the organizer send everyone back to the bench", async () => {
    expect(await clearLineup(p1.client, eventId)).toEqual({ ok: false, code: "NOT_ORGANIZER" });
    expect(await clearLineup(organizer.client, eventId)).toEqual({ ok: true });
    expect(await getLineup(p1.client, eventId)).toBeNull();
  });

  it("stores favourite positions per sport and rejects positions from another sport", async () => {
    expect(await getPositions(p1.client, p1.id)).toEqual({});
    expect(await savePosition(p1.client, p1.id, "pilka-nozna", "bramka")).toBe(true);
    expect(await savePosition(p1.client, p1.id, "siatkowka", "libero")).toBe(true);
    expect(await savePosition(p1.client, p1.id, "koszykowka", "bramka")).toBe(false);
    expect(await getPositions(p1.client, p1.id)).toEqual({ "pilka-nozna": "bramka", siatkowka: "libero" });
    // Pozycje są widoczne dla innych zalogowanych (składy), ale zmienia je tylko właściciel.
    const { error } = await p2.client
      .from("player_positions")
      .upsert({ user_id: p1.id, sport: "tenis", position: "x" });
    expect(error).not.toBeNull();
  });
});
