// Cloudflare Turnstile — ochrona formularzy przed botami. Token z widgetu sprawdzamy po stronie serwera.
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const TURNSTILE_FIELD = "cf-turnstile-response";
export const TURNSTILE_FAILED = "Potwierdź, że nie jesteś botem, i spróbuj ponownie.";

/**
 * Bez skonfigurowanego sekretu (lokalnie, w CI) weryfikacja jest pomijana.
 * Gdy sekret jest ustawiony, brak tokenu albo błąd połączenia z Cloudflare blokuje akcję.
 */
export async function verifyTurnstile(
  secret: string | undefined,
  token: FormDataEntryValue | null,
  ip?: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!secret) return true;
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) return false;

  const body = new FormData();
  body.set("secret", secret);
  body.set("response", token);
  if (ip) body.set("remoteip", ip);

  try {
    const response = await fetchImpl(VERIFY_URL, { method: "POST", body });
    if (!response.ok) return false;
    const result = (await response.json()) as unknown;
    return typeof result === "object" && result !== null && "success" in result && result.success === true;
  } catch {
    return false;
  }
}
