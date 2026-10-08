import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { cancelEvent } from "@/lib/services/events";

export const prerender = false;

// FR-004: organizator odwołuje spotkanie w dowolnej chwili przed jego startem.
export const POST: APIRoute = async (context) => {
  const eventId = context.params.id ?? "";
  if (!context.locals.user) return context.redirect("/auth/signin");

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return context.redirect(`/events/${eventId}?error=UNKNOWN`);

  const result = await cancelEvent(supabase, eventId);
  return context.redirect(result.ok ? `/events/${eventId}?ok=cancelled` : `/events/${eventId}?error=${result.code}`);
};
