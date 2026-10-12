import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { safeNext } from "@/lib/next-path";
import { saveFavoriteSports } from "@/lib/services/preferences";

export const prerender = false;

const formSchema = z.object({ sports: z.array(z.string().max(40)).max(20) });

// Zapis ulubionych sportów („W co grasz?”); pusta lista = interesuje mnie wszystko.
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) return context.redirect("/auth/signin");
  const form = await context.request.formData();
  const next = safeNext(form.get("next")) ?? "/events";
  // „Pomiń” zapisuje pustą listę niezależnie od zaznaczonych kafelków.
  const skip = context.url.searchParams.has("skip");
  const parsed = formSchema.safeParse({ sports: skip ? [] : form.getAll("sports") });

  const supabase = createClient(context.request.headers, context.cookies);
  const saved =
    parsed.success && supabase ? await saveFavoriteSports(supabase, context.locals.user.id, parsed.data.sports) : false;

  const target = new URL(next, context.url.origin);
  target.searchParams.set(saved ? "ok" : "error", saved ? "sports-saved" : "sports-failed");
  return context.redirect(target.pathname + target.search + target.hash);
};
