import type { AstroCookies } from "astro";
import { DEVICE_COOKIE } from "@/lib/services/invites";

// Identyfikator urządzenia dla zaproszonych bez konta: pozwala tej samej osobie zmienić odpowiedź.
// Losowy, bez danych osobowych; w bazie trzymamy tylko jego skrót.

export function readDevice(cookies: AstroCookies): string | null {
  const value = cookies.get(DEVICE_COOKIE)?.value;
  return value && /^[a-f0-9-]{16,100}$/.test(value) ? value : null;
}

export function ensureDevice(cookies: AstroCookies): string {
  const existing = readDevice(cookies);
  if (existing) return existing;
  const device = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  cookies.set(DEVICE_COOKIE, device, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return device;
}
