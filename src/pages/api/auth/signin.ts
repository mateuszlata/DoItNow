import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { TURNSTILE_SECRET_KEY } from "astro:env/server";
import { createClient } from "@/lib/supabase";
import { AUTH_NOT_CONFIGURED, authErrorMessage } from "@/lib/auth-errors";
import { authHref, safeNext } from "@/lib/next-path";
import { TURNSTILE_FAILED, TURNSTILE_FIELD, verifyTurnstile } from "@/lib/turnstile";

export const prerender = false;

const formSchema = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(200),
});

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const next = safeNext(form.get("next"));
  const fail = (message: string) => context.redirect(authHref("signin", next, { error: message }));

  const parsed = formSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return fail("Podaj e-mail i hasło.");

  // Ochrona przed zgadywaniem haseł: każda próba logowania przechodzi sprawdzenie Turnstile.
  const human = await verifyTurnstile(
    TURNSTILE_SECRET_KEY,
    form.get(TURNSTILE_FIELD),
    context.request.headers.get("CF-Connecting-IP"),
  );
  if (!human) return fail(TURNSTILE_FAILED);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return fail(AUTH_NOT_CONFIGURED);
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return fail(authErrorMessage(error));

  return context.redirect(next ?? "/");
};
