// Statystyki panelu administratora (lokalny Supabase: `npx supabase start`).
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, inject, it } from "vitest";
import { createEvent } from "@/lib/services/events";
import { requestToJoin } from "@/lib/services/participations";
import { getAdminStats } from "@/lib/services/admin";
import { toLocalDateTime } from "@/lib/time";
import { HOUR, cleanupTestUsers, newUser } from "./helpers";

afterAll(cleanupTestUsers);

describe("admin_stats", () => {
  it("is only available to admins", async () => {
    const user = await newUser("Zwykły AD");
    expect(await getAdminStats(user.client)).toBeNull();
  });

  it("returns service-wide numbers for an admin", async () => {
    const [admin, player] = await Promise.all([newUser("Admin AD"), newUser("Gracz AD")]);
    const service = createClient("http://127.0.0.1:54321", inject("serviceRoleKey"), {
      auth: { persistSession: false },
    });
    await service.from("admins").insert({ user_id: admin.id });

    const day = toLocalDateTime(new Date(Date.now() + 48 * HOUR)).slice(0, 10);
    const event = await createEvent(admin.client, admin.id, {
      sport: "koszykowka",
      area: "Statystyki AD",
      place: "Hala AD",
      startsAt: `${day}T20:00`,
      durationMinutes: "60",
      venueId: "",
      total: "2",
      organizerPlays: "on",
      requiresApproval: "",
      reserveSpots: "",
      minPeople: "",
      lat: "50.81",
      lng: "19.12",
      description: "",
    });
    if (!event.ok) throw new Error("event failed");
    expect((await requestToJoin(player.client, event.event.id)).ok).toBe(true);

    const stats = await getAdminStats(admin.client);
    if (!stats) throw new Error("no stats for admin");
    expect(stats.users.total).toBeGreaterThanOrEqual(2);
    expect(stats.users.new_today).toBeGreaterThanOrEqual(2);
    expect(stats.events.upcoming).toBeGreaterThanOrEqual(1);
    expect(stats.events.joins).toBeGreaterThanOrEqual(1);
    expect(stats.daily).toHaveLength(30);
    expect(stats.daily.at(-1)?.events).toBeGreaterThanOrEqual(1);
    expect(stats.sports.find((s) => s.sport === "koszykowka")?.players).toBeGreaterThanOrEqual(2);
    expect(stats.areas.some((a) => a.area === "Statystyki AD")).toBe(true);
    expect(stats.pins.some((p) => p.lat === 50.81 && p.lng === 19.12)).toBe(true);
    // Pełny skład (1 miejsce + grający organizator) — liczony czas zapełnienia.
    expect(stats.events.avg_fill_hours).not.toBeNull();
    expect(stats.funnel.registered).toBeGreaterThanOrEqual(2);
  });
});
