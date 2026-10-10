import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatMessage, EventRecord, MessageReport } from "@/types";

// Czat w wydarzeniu. Reguły (kto czyta i pisze, limity, moderacja) pilnują funkcje bazy
// z supabase/migrations/*_event_chat.sql; tu tylko je wywołujemy i tłumaczymy kody błędów.

export const MESSAGE_MAX_LENGTH = 1000;
/** Pisanie jest możliwe do 3 dni po końcu spotkania (event_chat_open w bazie). */
export const CHAT_OPEN_AFTER_END_MS = 3 * 24 * 60 * 60 * 1000;

export const CHAT_ERRORS = {
  NOT_AUTHENTICATED: "Zaloguj się, aby korzystać z czatu.",
  EVENT_NOT_FOUND: "Nie znaleziono ogłoszenia.",
  NOT_MEMBER: "Czat jest dostępny dla organizatora i osób w składzie lub na rezerwie.",
  CHAT_CLOSED: "Czat jest już zamknięty — można tylko czytać wiadomości.",
  MESSAGE_EMPTY: "Wiadomość jest pusta.",
  MESSAGE_TOO_LONG: `Wiadomość może mieć maks. ${String(MESSAGE_MAX_LENGTH)} znaków.`,
  RATE_LIMITED: "Za dużo wiadomości naraz. Odczekaj chwilę.",
  MESSAGE_NOT_FOUND: "Nie znaleziono wiadomości.",
  NOT_ALLOWED: "Nie możesz tego zrobić z tą wiadomością.",
  OWN_MESSAGE: "Nie możesz zgłosić własnej wiadomości.",
} as const;

export type ChatErrorCode = keyof typeof CHAT_ERRORS | "UNKNOWN";
export type ChatResult<T> = { ok: true; data: T } | { ok: false; code: ChatErrorCode };

export function chatErrorMessage(code: ChatErrorCode): string {
  return code === "UNKNOWN" ? "Coś poszło nie tak. Spróbuj ponownie." : CHAT_ERRORS[code];
}

function toCode(error: { message: string }): ChatErrorCode {
  return Object.hasOwn(CHAT_ERRORS, error.message) ? (error.message as ChatErrorCode) : "UNKNOWN";
}

/** Czy w czacie można jeszcze pisać (ta sama reguła co event_chat_open w bazie). */
export function isChatOpen(event: Pick<EventRecord, "status" | "ends_at">, now = Date.now()): boolean {
  return event.status !== "cancelled" && new Date(event.ends_at).getTime() + CHAT_OPEN_AFTER_END_MS > now;
}

export async function listMessages(
  supabase: SupabaseClient,
  eventId: string,
  after?: string | null,
): Promise<ChatResult<ChatMessage[]>> {
  const response = await supabase.rpc("list_event_messages", { p_event_id: eventId, p_after: after ?? null });
  if (response.error) return { ok: false, code: toCode(response.error) };
  return { ok: true, data: response.data as unknown as ChatMessage[] };
}

export async function postMessage(
  supabase: SupabaseClient,
  eventId: string,
  body: string,
): Promise<ChatResult<string>> {
  const response = await supabase.rpc("post_event_message", { p_event_id: eventId, p_body: body });
  if (response.error) return { ok: false, code: toCode(response.error) };
  return { ok: true, data: response.data as unknown as string };
}

export async function hideMessage(supabase: SupabaseClient, messageId: string): Promise<ChatResult<null>> {
  const { error } = await supabase.rpc("hide_event_message", { p_message_id: messageId });
  return error ? { ok: false, code: toCode(error) } : { ok: true, data: null };
}

export async function reportMessage(
  supabase: SupabaseClient,
  messageId: string,
  reason?: string,
): Promise<ChatResult<null>> {
  const { error } = await supabase.rpc("report_event_message", { p_message_id: messageId, p_reason: reason ?? null });
  return error ? { ok: false, code: toCode(error) } : { ok: true, data: null };
}

export async function listReports(supabase: SupabaseClient): Promise<ChatResult<MessageReport[]>> {
  const response = await supabase.rpc("list_message_reports");
  if (response.error) return { ok: false, code: toCode(response.error) };
  return { ok: true, data: response.data as unknown as MessageReport[] };
}

export async function dismissReports(supabase: SupabaseClient, messageId: string): Promise<ChatResult<null>> {
  const { error } = await supabase.rpc("dismiss_message_reports", { p_message_id: messageId });
  return error ? { ok: false, code: toCode(error) } : { ok: true, data: null };
}

export async function isAdmin(supabase: SupabaseClient): Promise<boolean> {
  const response = await supabase.rpc("is_admin");
  return (response.data as unknown) === true;
}
