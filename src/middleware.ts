import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import { authHref, safeNext } from "@/lib/next-path";

const PROTECTED_ROUTES = ["/events/new", "/my", "/venues", "/admin"];

export const onRequest = defineMiddleware(async (context, next) => {
  // Jeden adres serwisu: www.metando.pl → metando.pl (z zachowaniem ścieżki).
  if (context.url.hostname === "www.metando.pl") {
    const target = new URL(context.url.pathname + context.url.search, "https://metando.pl");
    return context.redirect(target.href, 301);
  }

  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      // Po zalogowaniu wracamy na stronę, na którą ktoś próbował wejść.
      return context.redirect(authHref("signin", safeNext(context.url.pathname + context.url.search)));
    }
  }

  const response = await next();
  return withSecurityHeaders(response);
});

// Nagłówki bezpieczeństwa dla każdej odpowiedzi: zakaz osadzania w ramkach (clickjacking), bez zgadywania
// typów plików, tylko HTTPS i ograniczony Referer przy przejściu na inne strony.
const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)",
};

function withSecurityHeaders(response: Response): Response {
  try {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      if (!response.headers.has(name)) response.headers.set(name, value);
    }
    return response;
  } catch {
    // Niezmienne nagłówki (np. odpowiedź przekazana z fetch) — kopiujemy odpowiedź.
    const copy = new Response(response.body, response);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) copy.headers.set(name, value);
    return copy;
  }
}
