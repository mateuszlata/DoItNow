import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { displayNameSchema } from "@/lib/services/profiles";
import { AUTH_NOT_CONFIGURED, authErrorMessage } from "@/lib/auth-errors";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;

  const displayName = displayNameSchema.safeParse(form.get("displayName") ?? "");
  if (!displayName.success) {
    const message = displayName.error.issues[0]?.message ?? "Nieprawidłowy nick.";
    return context.redirect(`/auth/signup?error=${encodeURIComponent(message)}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(AUTH_NOT_CONFIGURED)}`);
  }
  // Nick trafia do metadanych konta; trigger w bazie tworzy z niego profil.
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName.data } },
  });

  if (error) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(authErrorMessage(error))}`);
  }

  return context.redirect("/auth/confirm-email");
};
