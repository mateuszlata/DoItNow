import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { AUTH_NOT_CONFIGURED, authErrorMessage } from "@/lib/auth-errors";
import { authHref, safeNext } from "@/lib/next-path";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;
  const next = safeNext(form.get("next"));

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(authHref("signin", next, { error: AUTH_NOT_CONFIGURED }));
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return context.redirect(authHref("signin", next, { error: authErrorMessage(error) }));
  }

  return context.redirect(next ?? "/");
};
