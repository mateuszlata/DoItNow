import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { respondToCancellation } from "@/lib/services/participations";

export const prerender = false;

const responseSchema = z.object({ stay: z.enum(["yes", "no"]) });

// Odpowiedź uczestnika po odwołaniu przez organizatora: zostaję / rezygnuję.
export const POST: APIRoute = async (context) => {
  const eventId = context.params.id ?? "";
  if (!context.locals.user) return context.redirect("/auth/signin");

  const form = await context.request.formData();
  const parsed = responseSchema.safeParse({ stay: form.get("stay") });
  if (!parsed.success) return context.redirect(`/events/${eventId}`);
  const stay = parsed.data.stay === "yes";

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return context.redirect(`/events/${eventId}?error=UNKNOWN`);

  const result = await respondToCancellation(supabase, eventId, stay);
  if (!result.ok) return context.redirect(`/events/${eventId}?error=${result.code}`);
  return context.redirect(`/events/${eventId}?ok=${stay ? "stayed" : "left"}`);
};
