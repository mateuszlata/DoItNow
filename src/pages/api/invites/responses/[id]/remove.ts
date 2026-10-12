import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { removeInviteResponse } from "@/lib/services/invites";

export const prerender = false;

// Organizator usuwa odpowiedź zaproszonego (potwierdzone miejsce wraca do Metando).
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) return context.redirect("/auth/signin");
  const id = z.uuid().safeParse(context.params.id);
  const eventId = z.uuid().safeParse((await context.request.formData()).get("eventId"));
  if (!id.success || !eventId.success) return context.redirect("/events");
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return context.redirect(`/events/${eventId.data}`);
  const result = await removeInviteResponse(supabase, id.data);
  return context.redirect(`/events/${eventId.data}${result.ok ? "" : `?error=${result.code}`}#zaproszenia`);
};
