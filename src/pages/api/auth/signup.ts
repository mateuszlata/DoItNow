import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { NICK_BLOCKED, displayNameSchema, isTextClean } from "@/lib/services/profiles";
import { TURNSTILE_SECRET_KEY } from "astro:env/server";
import { AUTH_NOT_CONFIGURED, authErrorMessage } from "@/lib/auth-errors";
import { LEGAL_VERSION } from "@/lib/legal";
import { authHref, rememberNext, safeNext } from "@/lib/next-path";
import { TURNSTILE_FAILED, TURNSTILE_FIELD, verifyTurnstile } from "@/lib/turnstile";

const TERMS_REQUIRED = "Zaakceptuj regulamin, aby założyć konto.";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;
  const next = safeNext(form.get("next"));
  const fail = (message: string) => context.redirect(authHref("signup", next, { error: message }));

  const displayName = displayNameSchema.safeParse(form.get("displayName") ?? "");
  if (!displayName.success) {
    const message = displayName.error.issues[0]?.message ?? "Nieprawidłowy nick.";
    return fail(message);
  }

  if (form.get("acceptTerms") !== "on") {
    return fail(TERMS_REQUIRED);
  }

  // Ochrona przed botami: token z widgetu Turnstile sprawdzany u Cloudflare.
  const human = await verifyTurnstile(
    TURNSTILE_SECRET_KEY,
    form.get(TURNSTILE_FIELD),
    context.request.headers.get("CF-Connecting-IP"),
  );
  if (!human) {
    return fail(TURNSTILE_FAILED);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return fail(AUTH_NOT_CONFIGURED);
  }
  if (!(await isTextClean(supabase, displayName.data))) {
    return fail(NICK_BLOCKED);
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
    return fail(authErrorMessage(error));
  }

  // Bez wymaganego potwierdzania e-maila Supabase od razu zwraca sesję — użytkownik jest zalogowany.
  if (data.session) {
    return context.redirect(next ?? "/events");
  }
  // Link z maila potwierdzającego wraca do /auth/callback — tam odczytamy, dokąd wrócić.
  rememberNext(context.cookies, next);
  return context.redirect("/auth/confirm-email");
};
