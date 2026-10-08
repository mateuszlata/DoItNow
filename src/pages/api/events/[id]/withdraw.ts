import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { withdrawParticipation } from "@/lib/services/participations";

export const prerender = false;

// FR-008: rezygnacja z udziału lub wycofanie zgłoszenia.
export const POST: APIRoute = async (context) => {
  const eventId = context.params.id ?? "";
  if (!context.locals.user) return context.redirect("/auth/signin");

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return context.redirect(`/events/${eventId}?error=UNKNOWN`);

  const result = await withdrawParticipation(supabase, eventId);
  return context.redirect(result.ok ? `/events/${eventId}?ok=withdrawn` : `/events/${eventId}?error=${result.code}`);
};
