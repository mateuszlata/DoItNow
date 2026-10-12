import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseKit } from "@/lib/kit";
import { saveKit } from "@/lib/services/profiles";

export const prerender = false;

// Zapis stroju gracza („moje barwy”); wzory i kolory sprawdza parseKit oraz ograniczenia w bazie.
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) return context.redirect("/auth/signin");
  const form = await context.request.formData();
  const kit = parseKit({
    pattern: form.get("pattern"),
    primary: form.get("primary"),
    secondary: form.get("secondary"),
    label: form.get("label"),
  });

  const supabase = createClient(context.request.headers, context.cookies);
  const saved = kit && supabase ? await saveKit(supabase, context.locals.user.id, kit) : false;
  return context.redirect(`/my?ok=${saved ? "kit-saved" : "kit-failed"}#moj-stroj`);
};
