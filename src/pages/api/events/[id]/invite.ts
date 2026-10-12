import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { createInvite } from "@/lib/services/invites";

export const prerender = false;

// Organizator tworzy (albo odczytuje) link zaproszenia dla znajomych spoza Metando.
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) return context.redirect("/auth/signin");
  const id = z.uuid().safeParse(context.params.id);
  if (!id.success) return context.redirect("/events");
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return context.redirect(`/events/${id.data}`);
  const result = await createInvite(supabase, id.data);
  return context.redirect(`/events/${id.data}${result.ok ? "" : `?error=${result.code}`}#zaproszenia`);
};
