import type { SupabaseClient } from "@supabase/supabase-js";
import type { Assignment } from "@/lib/lineup";

// Zapisane składy na mecz (tabela event_lineups); zmiany wyłącznie przez funkcje bazy (tylko organizator).

export interface SavedLineup {
  teamA: string;
  teamB: string;
  /** Surowe wpisy z bazy — przed użyciem przefiltruj przez parseAssignments. */
  assignments: unknown;
}

export const LINEUP_ERRORS = {
  NOT_AUTHENTICATED: "Zaloguj się, aby ustawić składy.",
  EVENT_NOT_FOUND: "Nie znaleziono ogłoszenia.",
  NOT_ORGANIZER: "Składy ustawia organizator.",
  EVENT_CANCELLED: "To spotkanie zostało odwołane.",
  LINEUP_NOT_SUPPORTED: "Składy na boisku nie są dostępne dla tego sportu.",
  INVALID_LINEUP: "Nieprawidłowy podział składu. Spróbuj ponownie.",
  NOT_IN_SQUAD: "Ktoś z podziału nie jest już w składzie. Odśwież stronę.",
} as const;

export type LineupErrorCode = keyof typeof LINEUP_ERRORS | "UNKNOWN";

function toCode(error: { message: string }): LineupErrorCode {
  return Object.hasOwn(LINEUP_ERRORS, error.message) ? (error.message as LineupErrorCode) : "UNKNOWN";
}

export function lineupErrorMessage(code: LineupErrorCode): string {
  return code === "UNKNOWN" ? "Nie udało się zapisać składów. Spróbuj ponownie." : LINEUP_ERRORS[code];
}

export async function getLineup(supabase: SupabaseClient, eventId: string): Promise<SavedLineup | null> {
  const { data } = await supabase
    .from("event_lineups")
    .select("team_a_color, team_b_color, assignments")
    .eq("event_id", eventId)
    .maybeSingle<{ team_a_color: string; team_b_color: string; assignments: unknown }>();
  return data ? { teamA: data.team_a_color, teamB: data.team_b_color, assignments: data.assignments } : null;
}

export async function saveLineup(
  supabase: SupabaseClient,
  eventId: string,
  lineup: { teamA: string; teamB: string; assignments: Assignment[] },
): Promise<{ ok: true } | { ok: false; code: LineupErrorCode }> {
  const { error } = await supabase.rpc("set_event_lineup", {
    p_event_id: eventId,
    p_team_a_color: lineup.teamA,
    p_team_b_color: lineup.teamB,
    p_assignments: lineup.assignments,
  });
  return error ? { ok: false, code: toCode(error) } : { ok: true };
}

export async function clearLineup(
  supabase: SupabaseClient,
  eventId: string,
): Promise<{ ok: true } | { ok: false; code: LineupErrorCode }> {
  const { error } = await supabase.rpc("clear_event_lineup", { p_event_id: eventId });
  return error ? { ok: false, code: toCode(error) } : { ok: true };
}
