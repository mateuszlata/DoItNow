import type { AstroCookies } from "astro";

// Powrót po logowaniu lub rejestracji tam, skąd ktoś przyszedł (np. z linku do spotkania).
// Przyjmujemy wyłącznie ścieżki wewnątrz Metando — inaczej link `?next=` mógłby przekierować na obcą stronę.

export const NEXT_PARAM = "next";
/** Ciasteczko z celem powrotu na czas potwierdzania e-maila (link z maila otwiera /auth/callback). */
export const NEXT_COOKIE = "metando_next";
const NEXT_COOKIE_MAX_AGE = 60 * 60 * 24;
/** Ciasteczko „prośba o nowe hasło” — link z maila wraca do /auth/callback, a stamtąd na /auth/new-password. */
export const RECOVERY_COOKIE = "metando_recovery";

export function safeNext(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 300) return null;
  // Tylko ścieżka względna od korzenia; „//host” i „/\host” przeglądarka potraktowałaby jak inny adres.
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  for (let i = 0; i < value.length; i++) {
    // Znaki sterujące (np. nowa linia) i odwrotny ukośnik nie występują w naszych adresach.
    if (value.charCodeAt(i) < 32 || value[i] === "\\") return null;
  }
  const path = value.split(/[?#]/)[0];
  if (path.startsWith("/api/") || path.startsWith("/auth/")) return null;
  return value;
}

/** Adres strony logowania lub rejestracji z zachowanym celem powrotu. */
export function authHref(page: "signin" | "signup", next: string | null, extra?: Record<string, string>): string {
  const params = new URLSearchParams(extra);
  if (next) params.set(NEXT_PARAM, next);
  const query = params.toString();
  return `/auth/${page}${query ? `?${query}` : ""}`;
}

export function rememberNext(cookies: AstroCookies, next: string | null): void {
  if (!next) return;
  cookies.set(NEXT_COOKIE, next, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: NEXT_COOKIE_MAX_AGE,
  });
}

/** Odczytuje i usuwa zapamiętany cel powrotu. */
export function takeNext(cookies: AstroCookies): string | null {
  const next = safeNext(cookies.get(NEXT_COOKIE)?.value);
  cookies.delete(NEXT_COOKIE, { path: "/" });
  return next;
}
