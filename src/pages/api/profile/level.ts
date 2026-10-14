import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { SPORT_IDS } from "@/lib/sports";
import { saveLevel } from "@/lib/services/profiles";
import type { Level } from "@/lib/levels";

export const prerender = false;

const formSchema = z.object({
  sport: z.enum(SPORT_IDS),
  level: z.enum(["", "1", "2", "3", "4"]),
});

// Mój poziom w danym sporcie („Moje”); pusty wybór usuwa deklarację.
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) return context.redirect("/auth/signin");
  const form = await context.request.formData();
  const parsed = formSchema.safeParse({ sport: form.get("sport"), level: form.get("level") ?? "" });
  const supabase = createClient(context.request.headers, context.cookies);
  const saved =
    parsed.success && supabase
      ? await saveLevel(
          supabase,
          context.locals.user.id,
          parsed.data.sport,
          parsed.data.level === "" ? null : (Number(parsed.data.level) as Level),
        )
      : false;
  const sport = parsed.success ? `&sport=${parsed.data.sport}` : "";
  return context.redirect(`/my?ok=${saved ? "level-saved" : "level-failed"}${sport}#moj-poziom`);
};
