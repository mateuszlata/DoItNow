import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParticipationRecord, ParticipationStatus } from "@/types";

/** „Ostatnia chwila”: mniej niż 12 h do spotkania — po tej granicy organizator nie edytuje spotkania,
 *  a rezygnacja (nadal możliwa) wymaga potwierdzenia. */
export const LAST_MINUTE_MS = 12 * 60 * 60 * 1000;

/** Kody błędów zgłaszane przez funkcje bazy (supabase/migrations/*_create_participations.sql). */
export const PARTICIPATION_ERRORS = {
  NOT_AUTHENTICATED: "Zaloguj się, aby to zrobić.",
  EVENT_NOT_FOUND: "Nie znaleziono ogłoszenia.",
  OWN_EVENT: "Nie możesz zgłosić się na własne ogłoszenie.",
  EVENT_CANCELLED: "To spotkanie zostało odwołane.",
  EVENT_STARTED: "To spotkanie już się rozpoczęło.",
  ALREADY_REQUESTED: "Masz już zgłoszenie na to spotkanie.",
  ALREADY_REJECTED: "Organizator odrzucił Twoje zgłoszenie na to spotkanie.",
  ALREADY_REMOVED: "Organizator usunął Cię z tego spotkania.",
  PARTICIPATION_NOT_FOUND: "Nie znaleziono zgłoszenia.",
  NOT_ORGANIZER: "Tylko organizator może zarządzać uczestnikami.",
  NOT_PENDING: "To zgłoszenie zostało już rozpatrzone.",
  EVENT_FULL: "Brak wolnych miejsc w składzie i na liście rezerwowej.",
  NOT_PARTICIPATING: "Nie masz aktywnego zgłoszenia na to spotkanie.",
  NO_HANDOVER: "Organizator nie odwołał tego spotkania.",
  NOT_ASKED: "Twoja odpowiedź nie jest potrzebna albo została już przekazana.",
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

/**
 * Zgłoszenie chęci udziału. Z identyfikatorem urządzenia: jeśli z tego urządzenia ktoś był już w składzie jako gość
 * bez konta, jego miejsce gościa przechodzi na konto (zamiast zajmować drugie).
 */
export async function requestToJoin(
  supabase: SupabaseClient,
  eventId: string,
  device?: string | null,
): Promise<ParticipationResult> {
  const response = device
    ? await supabase.rpc("join_event_claiming_guest", { p_event_id: eventId, p_device: device })
    : await supabase.rpc("request_to_join", { p_event_id: eventId });
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

/** Organizator usuwa uczestnika ze składu, rezerwy lub oczekujących; miejsce zajmuje rezerwa. */
export async function removeParticipant(
  supabase: SupabaseClient,
  participationId: string,
): Promise<ParticipationResult> {
  const response = await supabase.rpc("remove_participant", { p_participation_id: participationId });
  return toResult(response.data as unknown, response.error);
}

export async function withdrawParticipation(supabase: SupabaseClient, eventId: string): Promise<ParticipationResult> {
  const response = await supabase.rpc("withdraw_participation", { p_event_id: eventId });
  return toResult(response.data as unknown, response.error);
}

/**
 * Odpowiedź zaakceptowanego uczestnika po odwołaniu przez organizatora: zostaje (pierwsza taka
 * osoba przejmuje organizację) albo rezygnuje (miejsce dostaje pierwsza osoba z rezerwy).
 */
export async function respondToCancellation(
  supabase: SupabaseClient,
  eventId: string,
  stay: boolean,
): Promise<{ ok: true } | { ok: false; code: ParticipationErrorCode | "UNKNOWN" }> {
  const response = await supabase.rpc("respond_to_cancellation", { p_event_id: eventId, p_stay: stay });
  if (response.error) {
    const code =
      response.error.message in PARTICIPATION_ERRORS ? (response.error.message as ParticipationErrorCode) : "UNKNOWN";
    return { ok: false, code };
  }
  return { ok: true };
}

/** Czy do spotkania zostało mniej niż 12 h (rezygnacja na ostatnią chwilę, koniec edycji). */
export function isLastMinute(startsAt: string | Date, now: Date = new Date()): boolean {
  return now.getTime() > new Date(startsAt).getTime() - LAST_MINUTE_MS;
}

export const STATUS_LABELS: Record<ParticipationStatus, string> = {
  pending: "oczekuje na akceptację",
  accepted: "jesteś w składzie",
  reserve: "na liście rezerwowej",
  rejected: "odrzucone",
  withdrawn: "wycofane",
  removed: "usunięte przez organizatora",
};
