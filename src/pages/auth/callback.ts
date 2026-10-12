import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { authHref, takeNext } from "@/lib/next-path";

export const prerender = false;

// Powrót z linku potwierdzającego e-mail (przepływ PKCE): wymieniamy jednorazowy kod na sesję.
export const GET: APIRoute = async (context) => {
  const params = context.url.searchParams;
  const next = takeNext(context.cookies);
  const signinWith = (message: string, kind: "error" | "info" = "error") =>
    context.redirect(authHref("signin", next, { [kind]: message }));

  // Supabase odsyła tu błąd, np. gdy link wygasł albo został już użyty.
  if (params.get("error")) {
    return params.get("error_code") === "otp_expired"
      ? signinWith("Link potwierdzający wygasł albo został już użyty. Spróbuj się zalogować.")
      : signinWith("Nie udało się potwierdzić adresu e-mail. Spróbuj się zalogować.");
  }

  const code = params.get("code");
  const supabase = createClient(context.request.headers, context.cookies);
  if (!code || !supabase) return context.redirect(authHref("signin", next));

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // Link otwarty w innej przeglądarce niż rejestracja: e-mail jest potwierdzony, ale sesji nie da się przenieść.
    return signinWith("Adres e-mail potwierdzony. Zaloguj się, aby kontynuować.", "info");
  }
  return context.redirect(next ?? "/events");
};
