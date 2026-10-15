import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { answerQuestion, askQuestion, hideQuestion } from "@/lib/services/questions";

export const prerender = false;

// Pytania do organizatora z formularzy strony spotkania: zadanie pytania, odpowiedź, ukrycie.
// Uprawnienia, limity i filtr wulgaryzmów sprawdza baza; tu tylko kierujemy z powrotem do sekcji pytań.
const formSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ask"), eventId: z.uuid(), body: z.string().max(2000) }),
  z.object({ action: z.literal("answer"), eventId: z.uuid(), questionId: z.uuid(), answer: z.string().max(4000) }),
  z.object({ action: z.literal("hide"), eventId: z.uuid(), questionId: z.uuid() }),
]);

export const POST: APIRoute = async (context) => {
  const parsed = formSchema.safeParse(Object.fromEntries(await context.request.formData()));
  if (!parsed.success) return context.redirect("/events");
  const data = parsed.data;
  const back = (query: string) => context.redirect(`/events/${data.eventId}?${query}#pytania`);
  if (!context.locals.user) return back("question-error=NOT_AUTHENTICATED");

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return back("question-error=UNKNOWN");

  const outcome =
    data.action === "ask"
      ? await askQuestion(supabase, data.eventId, data.body)
      : data.action === "answer"
        ? await answerQuestion(supabase, data.questionId, data.answer)
        : await hideQuestion(supabase, data.questionId);
  if (outcome.ok) return back(`question-ok=${data.action}`);
  // Odrzucone pytanie wraca do pola, żeby nie trzeba było pisać go od nowa.
  const draft = data.action === "ask" ? `&question-draft=${encodeURIComponent(data.body.slice(0, 500))}` : "";
  return back(`question-error=${encodeURIComponent(outcome.code)}${draft}`);
};
