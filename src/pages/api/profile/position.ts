import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { isFootballPosition } from "@/lib/lineup";
import { saveFootballPosition } from "@/lib/services/profiles";

export const prerender = false;

// Ulubiona pozycja w piłce nożnej („Składy na mecz”).
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) return context.redirect("/auth/signin");
  const position = (await context.request.formData()).get("position");
  const supabase = createClient(context.request.headers, context.cookies);
  const saved =
    isFootballPosition(position) && supabase
      ? await saveFootballPosition(supabase, context.locals.user.id, position)
      : false;
  return context.redirect(`/my?ok=${saved ? "position-saved" : "position-failed"}#moja-pozycja`);
};
