import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { TURNSTILE_SECRET_KEY } from "astro:env/server";
import { createClient } from "@/lib/supabase";
import { AUTH_NOT_CONFIGURED } from "@/lib/auth-errors";
import { RECOVERY_COOKIE } from "@/lib/next-path";
import { TURNSTILE_FAILED, TURNSTILE_FIELD, verifyTurnstile } from "@/lib/turnstile";

export const prerender = false;

const emailSchema = z.email().max(254);

// „Nie pamiętam hasła”: Supabase wysyła link (przez nasz SMTP), który wraca do /auth/callback.
// Odpowiedź jest zawsze taka sama, żeby formularz nie zdradzał, które adresy mają konto.
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const fail = (message: string) => context.redirect(`/auth/forgot?error=${encodeURIComponent(message)}`);

  const raw = form.get("email");
  const email = emailSchema.safeParse(typeof raw === "string" ? raw.trim() : "");
  if (!email.success) return fail("Podaj prawidłowy adres e-mail.");

  const human = await verifyTurnstile(
    TURNSTILE_SECRET_KEY,
    form.get(TURNSTILE_FIELD),
    context.request.headers.get("CF-Connecting-IP"),
  );
  if (!human) return fail(TURNSTILE_FAILED);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return fail(AUTH_NOT_CONFIGURED);
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${context.url.origin}/auth/callback`,
  });
  if (error?.code === "over_email_send_rate_limit" || error?.code === "over_request_rate_limit") {
    return fail("Wysłaliśmy już link niedawno. Sprawdź skrzynkę albo spróbuj ponownie za kilka minut.");
  }

  // Link z maila wraca do /auth/callback; to ciasteczko mówi, że po zalogowaniu trzeba ustawić nowe hasło.
  context.cookies.set(RECOVERY_COOKIE, "1", {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60,
  });
  return context.redirect("/auth/forgot?sent=1");
};
