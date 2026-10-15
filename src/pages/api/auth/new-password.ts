import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { AUTH_NOT_CONFIGURED, authErrorMessage } from "@/lib/auth-errors";

export const prerender = false;

const formSchema = z
  .object({
    password: z.string().min(6, "Hasło musi mieć co najmniej 6 znaków.").max(200),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, "Hasła nie są takie same.");

// Nowe hasło zalogowanego użytkownika (po linku „Nie pamiętam hasła” sesja jest już aktywna).
export const POST: APIRoute = async (context) => {
  const fail = (message: string) => context.redirect(`/auth/new-password?error=${encodeURIComponent(message)}`);
  if (!context.locals.user) {
    return context.redirect(
      `/auth/signin?error=${encodeURIComponent("Link wygasł. Poproś o nowy w „Nie pamiętasz hasła?”.")}`,
    );
  }
  const form = await context.request.formData();
  const parsed = formSchema.safeParse({ password: form.get("password"), confirmPassword: form.get("confirmPassword") });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Sprawdź hasło.");

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return fail(AUTH_NOT_CONFIGURED);
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return fail(authErrorMessage(error));
  }
  return context.redirect("/events?ok=password-changed");
};
