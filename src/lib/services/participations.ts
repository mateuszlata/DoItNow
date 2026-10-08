import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParticipationRecord, ParticipationStatus } from "@/types";

/** Granica rezygnacji zaakceptowanego uczestnika: 12 h przed wydarzeniem (FR-008). */
export const WITHDRAW_CUTOFF_MS = 12 * 60 * 60 * 1000;

/** Kody błędów zgłaszane przez funkcje bazy (supabase/migrations/*_create_participations.sql). */
export const PARTICIPATION_ERRORS = {
  NOT_AUTHENTICATED: "Zaloguj się, aby to zrobić.",
  EVENT_NOT_FOUND: "Nie znaleziono ogłoszenia.",
  OWN_EVENT: "Nie możesz zgłosić się na własne ogłoszenie.",
  EVENT_CANCELLED: "To spotkanie zostało odwołane.",
  EVENT_STARTED: "To spotkanie już się rozpoczęło.",
  ALREADY_REQUESTED: "Masz już zgłoszenie na to spotkanie.",
  ALREADY_REJECTED: "Organizator odrzucił Twoje zgłoszenie na to spotkanie.",
  PARTICIPATION_NOT_FOUND: "Nie znaleziono zgłoszenia.",
  NOT_ORGANIZER: "Tylko organizator może rozpatrywać zgłoszenia.",
  NOT_PENDING: "To zgłoszenie zostało już rozpatrzone.",
  EVENT_FULL: "Brak wolnych miejsc — nie można zaakceptować kolejnej osoby.",
  NOT_PARTICIPATING: "Nie masz aktywnego zgłoszenia na to spotkanie.",
  WITHDRAW_DEADLINE_PASSED: "Rezygnacja jest możliwa najpóźniej 12 h przed spotkaniem.",
} as const;

export type ParticipationErrorCode = keyof typeof PARTICIPATION_ERRORS;

export type ParticipationResult =
  { ok: true; participation: ParticipationRecord } | { ok: false; code: ParticipationErrorCode | "UNKNOWN" };

export function participationErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return code in PARTICIPATION_ERRORS
    ? PARTICIPATION_ERRORS[code as ParticipationErrorCode]
    : "Coś poszło nie tak. Spróbuj ponownie.";
}

function toResult(data: unknown, error: { message: string } | null): ParticipationResult {
  if (error) {
    const code = error.message in PARTICIPATION_ERRORS ? (error.message as ParticipationErrorCode) : "UNKNOWN";
    return { ok: false, code };
  }
  return { ok: true, participation: data as ParticipationRecord };
}

export async function requestToJoin(supabase: SupabaseClient, eventId: string): Promise<ParticipationResult> {
  const response = await supabase.rpc("request_to_join", { p_event_id: eventId });
  return toResult(response.data as unknown, response.error);
}

export async function decideParticipation(
  supabase: SupabaseClient,
  participationId: string,
  accept: boolean,
): Promise<ParticipationResult> {
  const response = await supabase.rpc("decide_participation", {
    p_participation_id: participationId,
    p_accept: accept,
  });
  return toResult(response.data as unknown, response.error);
}

export async function withdrawParticipation(supabase: SupabaseClient, eventId: string): Promise<ParticipationResult> {
  const response = await supabase.rpc("withdraw_participation", { p_event_id: eventId });
  return toResult(response.data as unknown, response.error);
}

/** Czy zaakceptowany uczestnik może jeszcze zrezygnować (ta sama reguła co w bazie). */
export function canWithdrawAccepted(startsAt: string | Date, now: Date = new Date()): boolean {
  return now.getTime() <= new Date(startsAt).getTime() - WITHDRAW_CUTOFF_MS;
}

export const STATUS_LABELS: Record<ParticipationStatus, string> = {
  pending: "oczekuje na akceptację",
  accepted: "zaakceptowane",
  rejected: "odrzucone",
  withdrawn: "wycofane",
};
