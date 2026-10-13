// Budżet zapytań do Google Places: przydział dnia z puli miesięcznej i limit na użytkownika
// (lokalny Supabase: `npx supabase start`). Liczniki są wspólne, więc limity liczymy od bieżącego stanu.
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, inject, it } from "vitest";
import { cleanupTestUsers, newUser } from "./helpers";

afterAll(cleanupTestUsers);

interface Stats {
  api: string;
  used_month: number;
  used_today: number;
  allowed_today: number;
  days_left: number;
}

describe("consume_places_quota", () => {
  it("shows usage stats only to admins", async () => {
    const user = await newUser("Kwota PQ0");
    const response = await user.client.rpc("places_quota_stats", { p_monthly_limit: 0 });
    expect(response.data).toEqual([]);
  });

  it("allows today's share of the remaining monthly pool and then stops for the day", async () => {
    const user = await newUser("Kwota PQ");
    // Statystyki widzi tylko administrator.
    const service = createClient("http://127.0.0.1:54321", inject("serviceRoleKey"), {
      auth: { persistSession: false },
    });
    await service.from("admins").insert({ user_id: user.id });
    const response = await user.client.rpc("places_quota_stats", { p_monthly_limit: 0 });
    const rows: unknown = response.data;
    const stats = (rows as Stats[]).find((s) => s.api === "details");
    if (!stats) throw new Error("no stats");
    const usedBefore = stats.used_month - stats.used_today;
    // Pula ustawiona tak, żeby dzisiejszy przydział wynosił dokładnie „zużyte dziś + 1”.
    const limit = usedBefore + (stats.used_today + 1) * stats.days_left;

    const consume = () =>
      user.client.rpc("consume_places_quota", { p_api: "details", p_monthly_limit: limit, p_user_hourly_limit: 1000 });
    expect((await consume()).data).toBe("ok");
    expect((await consume()).data).toBe("daily");
  });

  it("limits a single user per hour", async () => {
    const user = await newUser("Kwota PQ2");
    const consume = () =>
      user.client.rpc("consume_places_quota", {
        p_api: "autocomplete",
        p_monthly_limit: 1_000_000_000,
        p_user_hourly_limit: 2,
      });
    expect((await consume()).data).toBe("ok");
    expect((await consume()).data).toBe("ok");
    expect((await consume()).data).toBe("user");
  });

  it("is not available to guests", async () => {
    const { anonClient } = await import("./helpers");
    const { error } = await anonClient().rpc("consume_places_quota", {
      p_api: "autocomplete",
      p_monthly_limit: 10,
      p_user_hourly_limit: 10,
    });
    expect(error).not.toBeNull();
  });
});
