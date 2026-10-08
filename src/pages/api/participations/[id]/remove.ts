import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { removeParticipant } from "@/lib/services/participations";

export const prerender = false;

const removeSchema = z.object({ eventId: z.uuid() });

// Organizator usuwa uczestnika ze spotkania (skład, rezerwa lub oczekujące zgłoszenie).
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) return context.redirect("/auth/signin");

  const form = await context.request.formData();
  const parsed = removeSchema.safeParse({ eventId: form.get("eventId") });
  if (!parsed.success) return context.redirect("/events");
  const { eventId } = parsed.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return context.redirect(`/events/${eventId}?error=UNKNOWN`);

  const result = await removeParticipant(supabase, context.params.id ?? "");
  return context.redirect(result.ok ? `/events/${eventId}?ok=removed` : `/events/${eventId}?error=${result.code}`);
};
