import type { SupabaseClient } from "@supabase/supabase-js";

// Pytania do organizatora. Reguły (kto pyta i odpowiada, limity, filtr wulgaryzmów, kto co widzi) pilnują
// funkcje bazy z supabase/migrations/*_event_questions.sql; tu tylko je wywołujemy i tłumaczymy kody błędów.

export const QUESTION_MAX_LENGTH = 500;
export const ANSWER_MAX_LENGTH = 1000;

export interface EventQuestion {
  id: string;
  body: string;
  answer: string | null;
  created_at: string;
  answered_at: string | null;
  /** Pytanie zalogowanego oglądającego (widzi je także bez odpowiedzi). */
  mine: boolean;
}

export const QUESTION_ERRORS = {
  NOT_AUTHENTICATED: "Zaloguj się, aby zadać pytanie.",
  EVENT_NOT_FOUND: "Nie znaleziono spotkania.",
  OWN_EVENT: "To Twoje spotkanie — informacje dopisz w opisie.",
  EVENT_CLOSED: "To spotkanie już się odbyło albo zostało odwołane.",
  QUESTION_TOO_SHORT: "Pytanie jest za krótkie.",
  QUESTION_TOO_LONG: `Pytanie może mieć maks. ${String(QUESTION_MAX_LENGTH)} znaków.`,
  MESSAGE_BLOCKED: "Bez wulgaryzmów — popraw treść i wyślij ponownie.",
  RATE_LIMITED: "Za dużo pytań naraz. Poczekaj na odpowiedź organizatora.",
  QUESTION_NOT_FOUND: "Nie znaleziono pytania.",
  NOT_ORGANIZER: "Odpowiadać może tylko organizator.",
  ANSWER_EMPTY: "Odpowiedź jest pusta.",
  ANSWER_TOO_LONG: `Odpowiedź może mieć maks. ${String(ANSWER_MAX_LENGTH)} znaków.`,
  NOT_ALLOWED: "Nie możesz tego zrobić z tym pytaniem.",
} as const;

export type QuestionErrorCode = keyof typeof QUESTION_ERRORS | "UNKNOWN";

export function questionErrorMessage(code: string): string {
  return Object.hasOwn(QUESTION_ERRORS, code)
    ? QUESTION_ERRORS[code as keyof typeof QUESTION_ERRORS]
    : "Coś poszło nie tak. Spróbuj ponownie.";
}

type Result = { ok: true } | { ok: false; code: string };

const result = (error: { message: string } | null): Result =>
  error ? { ok: false, code: error.message } : { ok: true };

export async function listQuestions(supabase: SupabaseClient, eventId: string): Promise<EventQuestion[]> {
  const response = await supabase.rpc("list_event_questions", { p_event_id: eventId });
  return response.error ? [] : (response.data as EventQuestion[]);
}

export async function askQuestion(supabase: SupabaseClient, eventId: string, body: string): Promise<Result> {
  const { error } = await supabase.rpc("ask_event_question", { p_event_id: eventId, p_body: body });
  return result(error);
}

export async function answerQuestion(supabase: SupabaseClient, questionId: string, answer: string): Promise<Result> {
  const { error } = await supabase.rpc("answer_event_question", { p_question_id: questionId, p_answer: answer });
  return result(error);
}

export async function hideQuestion(supabase: SupabaseClient, questionId: string): Promise<Result> {
  const { error } = await supabase.rpc("hide_event_question", { p_question_id: questionId });
  return result(error);
}
