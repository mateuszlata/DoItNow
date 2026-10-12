import type { SupabaseClient } from "@supabase/supabase-js";

// Statystyki panelu administratora — liczy je funkcja admin_stats() w bazie (tylko konta z public.admins).

export interface AdminStats {
  generated_at: string;
  users: { total: number; new_today: number; new_7d: number; new_30d: number; active_7d: number; active_30d: number };
  events: {
    total: number;
    upcoming: number;
    cancelled: number;
    played: number;
    filled_pct: number | null;
    avg_fill_hours: number | null;
    joins: number;
    messages: number;
    venue_events: number;
    venue_approved: number;
    venue_revenue_cents: number;
  };
  daily: { day: string; signups: number; events: number; joins: number; messages: number }[];
  sports: { sport: string; events: number; players: number }[];
  weekdays: { dow: number; events: number }[];
  hours: { hour: number; events: number }[];
  areas: { area: string; events: number }[];
  pins: { lat: number; lng: number; sport: string }[];
  venues: { name: string; area: string; events: number; approved: number; revenue_cents: number }[];
  funnel: { registered: number; played_1: number; played_2: number; regular: number; returning_weeks: number };
  adoption: { kits: number; favorites: number; top_pattern: string | null; top_color: string | null };
  moderation: { open_reports: number };
}

/** `null`, gdy oglądający nie jest administratorem albo baza zwróciła błąd. */
export async function getAdminStats(supabase: SupabaseClient): Promise<AdminStats | null> {
  const response = await supabase.rpc("admin_stats");
  if (response.error) {
    // eslint-disable-next-line no-console -- server log: statystyki niedostępne
    console.error("admin_stats", response.error.message);
    return null;
  }
  const data: unknown = response.data;
  return data as AdminStats;
}
