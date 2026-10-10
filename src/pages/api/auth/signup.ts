import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { displayNameSchema } from "@/lib/services/profiles";
import { TURNSTILE_SECRET_KEY } from "astro:env/server";
import { AUTH_NOT_CONFIGURED, authErrorMessage } from "@/lib/auth-errors";
import { LEGAL_VERSION } from "@/lib/legal";
import { TURNSTILE_FAILED, TURNSTILE_FIELD, verifyTurnstile } from "@/lib/turnstile";

const TERMS_REQUIRED = "Zaakceptuj regulamin, aby założyć konto.";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;

  const displayName = displayNameSchema.safeParse(form.get("displayName") ?? "");
  if (!displayName.success) {
    const message = displayName.error.issues[0]?.message ?? "Nieprawidłowy nick.";
    return context.redirect(`/auth/signup?error=${encodeURIComponent(message)}`);
  }

  if (form.get("acceptTerms") !== "on") {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(TERMS_REQUIRED)}`);
  }

  // Ochrona przed botami: token z widgetu Turnstile sprawdzany u Cloudflare.
  const human = await verifyTurnstile(
    TURNSTILE_SECRET_KEY,
    form.get(TURNSTILE_FIELD),
    context.request.headers.get("CF-Connecting-IP"),
  );
  if (!human) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(TURNSTILE_FAILED)}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(AUTH_NOT_CONFIGURED)}`);
  }
  // Nick trafia do metadanych konta; trigger w bazie tworzy z niego profil.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // Link z e-maila potwierdzającego wraca do /auth/callback, który loguje użytkownika.
    options: {
      // Wersja zaakceptowanego regulaminu i polityki prywatności oraz chwila akceptacji — dowód zgody.
      data: {
        display_name: displayName.data,
        terms_version: LEGAL_VERSION,
        terms_accepted_at: new Date().toISOString(),
      },
      emailRedirectTo: `${context.url.origin}/auth/callback`,
    },
  });

  if (error) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(authErrorMessage(error))}`);
  }

  // Bez wymaganego potwierdzania e-maila Supabase od razu zwraca sesję — użytkownik jest zalogowany.
  if (data.session) {
    return context.redirect("/events");
  }
  return context.redirect("/auth/confirm-email");
};
