import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { isPosition } from "@/lib/lineup";
import { savePosition } from "@/lib/services/profiles";

export const prerender = false;

// Ulubiona pozycja w danym sporcie („Składy na mecz”).
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) return context.redirect("/auth/signin");
  const form = await context.request.formData();
  const sport = form.get("sport");
  const position = form.get("position");
  const supabase = createClient(context.request.headers, context.cookies);
  const saved =
    typeof sport === "string" && isPosition(sport, position) && supabase
      ? await savePosition(supabase, context.locals.user.id, sport, position)
      : false;
  return context.redirect(
    `/my?ok=${saved ? "position-saved" : "position-failed"}${saved && typeof sport === "string" ? `&sport=${sport}` : ""}#moja-pozycja`,
  );
};
