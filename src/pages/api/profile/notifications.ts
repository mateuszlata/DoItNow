import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { saveNotificationSettings, settingsFromForm } from "@/lib/services/notifications";

export const prerender = false;

// Zapis ustawień powiadomień z „Moje” (pola-przełączniki; niezaznaczone = wyłączone).
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) return context.redirect("/auth/signin");
  const supabase = createClient(context.request.headers, context.cookies);
  const saved = supabase
    ? await saveNotificationSettings(
        supabase,
        context.locals.user.id,
        settingsFromForm(await context.request.formData()),
      )
    : false;
  return context.redirect(`/my?${saved ? "ok=notifications-saved" : "error=notifications-failed"}#powiadomienia`);
};
