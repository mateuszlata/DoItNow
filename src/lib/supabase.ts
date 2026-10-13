import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { AstroCookies } from "astro";
import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";

export function createClient(requestHeaders: Headers, cookies: AstroCookies) {
  // Sekrety wklejane w terminalu potrafią mieć doklejony znak końca linii, który psuje nagłówek apikey.
  const url = SUPABASE_URL?.trim();
  const key = SUPABASE_KEY?.trim();
  if (!url || !key) {
    return null;
  }
  return createServerClient(url, key, {
    // Sesję czyta tylko serwer (w przeglądarce nie ma klienta Supabase), więc ciasteczka są niedostępne
    // dla skryptów i wysyłane wyłącznie przez HTTPS (localhost przeglądarki traktują jak bezpieczny).
    cookieOptions: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
    cookies: {
      getAll() {
        return parseCookieHeader(requestHeaders.get("Cookie") ?? "");
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, options);
        });
      },
    },
  });
}
