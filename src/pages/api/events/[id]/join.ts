import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { requestToJoin } from "@/lib/services/participations";

export const prerender = false;

// FR-007: zgłoszenie chęci udziału.
export const POST: APIRoute = async (context) => {
  const eventId = context.params.id ?? "";
  if (!context.locals.user) return context.redirect("/auth/signin");

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return context.redirect(`/events/${eventId}?error=UNKNOWN`);

  const result = await requestToJoin(supabase, eventId);
  return context.redirect(result.ok ? `/events/${eventId}?ok=joined` : `/events/${eventId}?error=${result.code}`);
};
