import type { SupabaseClient } from "@supabase/supabase-js";

// Zaproszenia bez logowania (supabase/migrations/*_event_invites.sql): organizer tworzy link,
// zaproszeni odpowiadają „Będę” / „Nie będę”, a miejsca przelicza baza.

export const DEVICE_COOKIE = "metando_device";

export const INVITE_ERRORS = {
  NOT_AUTHENTICATED: "Zaloguj się, aby to zrobić.",
  EVENT_NOT_FOUND: "Nie znaleziono spotkania.",
  NOT_ORGANIZER: "Tylko organizator może zarządzać zaproszeniami.",
  EVENT_CLOSED: "To spotkanie już się odbyło albo zostało odwołane.",
  INVITE_NOT_FOUND: "Ten link zaproszenia jest nieaktualny.",
  INVITE_FULL: "Skład jest już pełny. Załóż konto w Metando i zapisz się na rezerwę.",
  INVITE_LIMIT: "To zaproszenie zebrało już maksymalną liczbę odpowiedzi.",
  NAME_REQUIRED: "Podaj swoje imię, żeby organizator wiedział, kto przyjdzie.",
  INVALID_ANSWER: "Wybierz „Będę” albo „Nie będę”.",
  INVALID_DEVICE: "Nie udało się rozpoznać urządzenia. Odśwież stronę i spróbuj ponownie.",
  RESPONSE_NOT_FOUND: "Nie znaleziono odpowiedzi.",
  BOT_CHECK: "Potwierdź, że nie jesteś botem, i spróbuj ponownie.",
} as const;

export type InviteErrorCode = keyof typeof INVITE_ERRORS | "UNKNOWN";

export function inviteErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return Object.hasOwn(INVITE_ERRORS, code)
    ? INVITE_ERRORS[code as keyof typeof INVITE_ERRORS]
    : "Coś poszło nie tak. Spróbuj ponownie.";
}

function toCode(error: { message: string }): InviteErrorCode {
  return Object.hasOwn(INVITE_ERRORS, error.message) ? (error.message as InviteErrorCode) : "UNKNOWN";
}

export interface InviteCard {
  event_id: string;
  sport: string;
  area: string;
  starts_at: string;
  duration_minutes: number;
  organizer_name: string;
  team_size: number;
  taken: number;
  invited_pending: number;
  free_app_spots: number;
  open: boolean;
  mine: { name: string; answer: "yes" | "no" } | null;
}

export interface InviteResponse {
  id: string;
  name: string;
  answer: "yes" | "no";
}

/** Link zaproszenia (tworzony przy pierwszym użyciu); tylko organizator. */
export async function createInvite(
  supabase: SupabaseClient,
  eventId: string,
): Promise<{ ok: true; token: string } | { ok: false; code: InviteErrorCode }> {
  const response = await supabase.rpc("create_event_invite", { p_event_id: eventId });
  if (response.error) return { ok: false, code: toCode(response.error) };
  const token: unknown = response.data;
  return typeof token === "string" ? { ok: true, token } : { ok: false, code: "UNKNOWN" };
}

/** Istniejący link zaproszenia (widoczny tylko dla organizatora przez RLS). */
export async function getInviteToken(supabase: SupabaseClient, eventId: string): Promise<string | null> {
  const { data } = await supabase
    .from("event_invites")
    .select("token")
    .eq("event_id", eventId)
    .maybeSingle<{ token: string }>();
  return data?.token ?? null;
}

export async function getInvite(
  supabase: SupabaseClient,
  token: string,
  device: string | null,
): Promise<{ ok: true; card: InviteCard } | { ok: false; code: InviteErrorCode }> {
  const response = await supabase.rpc("get_invite", { p_token: token, p_device: device });
  if (response.error) return { ok: false, code: toCode(response.error) };
  const card: unknown = response.data;
  return { ok: true, card: card as InviteCard };
}

export async function respondToInvite(
  supabase: SupabaseClient,
  input: { token: string; device: string; name: string; answer: "yes" | "no" },
): Promise<{ ok: true } | { ok: false; code: InviteErrorCode }> {
  const { error } = await supabase.rpc("respond_to_invite", {
    p_token: input.token,
    p_device: input.device,
    p_name: input.name,
    p_answer: input.answer,
  });
  return error ? { ok: false, code: toCode(error) } : { ok: true };
}

export async function listInviteResponses(supabase: SupabaseClient, eventId: string): Promise<InviteResponse[]> {
  const { data } = await supabase
    .from("invite_responses")
    .select("id, name, answer")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function removeInviteResponse(
  supabase: SupabaseClient,
  responseId: string,
): Promise<{ ok: true } | { ok: false; code: InviteErrorCode }> {
  const { error } = await supabase.rpc("remove_invite_response", { p_response_id: responseId });
  return error ? { ok: false, code: toCode(error) } : { ok: true };
}

/** Zwalnia nieodpowiedziane „?” 12 h przed startem; wołane przy wejściu na listę i szczegóły spotkania. */
export async function releaseStaleInvites(supabase: SupabaseClient): Promise<void> {
  await supabase.rpc("release_stale_invites");
}
