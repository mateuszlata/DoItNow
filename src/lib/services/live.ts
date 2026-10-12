import type { SupabaseClient } from "@supabase/supabase-js";

// Odświeżanie na żywo strony spotkania: krótki „odcisk” stanu widocznego dla oglądającego.
// Gdy odcisk się zmieni (ktoś dołączył, zrezygnował, organizator coś zmienił), strona się przeładowuje.

/** Skrót tekstu (FNV-1a) — wystarczy do porównania, nie służy bezpieczeństwu. */
export function fingerprint(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Odcisk stanu spotkania z perspektywy oglądającego: zalogowany widzi wiersz spotkania, zgłoszenia
 * (RLS decyduje, które) i zapisane składy; gość — tylko ograniczony widok publiczny.
 */
export async function eventVersion(
  supabase: SupabaseClient,
  eventId: string,
  authenticated: boolean,
): Promise<string | null> {
  if (!authenticated) {
    const response = await supabase.from("events_public").select("*").eq("id", eventId).maybeSingle();
    const row: unknown = response.data;
    return row ? fingerprint(JSON.stringify(row)) : null;
  }

  const [event, participations, lineup] = await Promise.all([
    supabase.from("events").select("*").eq("id", eventId).maybeSingle(),
    supabase
      .from("participations")
      .select("id, status, updated_at, stay_confirmed")
      .eq("event_id", eventId)
      .order("id", { ascending: true }),
    supabase.from("event_lineups").select("updated_at").eq("event_id", eventId).maybeSingle(),
  ]);
  if (!event.data) return null;
  return fingerprint(JSON.stringify([event.data, participations.data, lineup.data]));
}
