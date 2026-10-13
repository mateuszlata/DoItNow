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
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    // eslint-disable-next-line no-console -- diagnostyka: formularz wysłany bez tokenu widgetu
    console.warn("turnstile: missing token");
    return false;
  }

  const body = new FormData();
  body.set("secret", secret);
  body.set("response", token);
  if (ip) body.set("remoteip", ip);

  try {
    const response = await fetchImpl(VERIFY_URL, { method: "POST", body });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: unknown; "error-codes"?: unknown; hostname?: unknown };
    if (result.success === true) return true;
    // eslint-disable-next-line no-console -- diagnostyka: powód odrzucenia według Cloudflare
    console.warn("turnstile: rejected", JSON.stringify({ codes: result["error-codes"], hostname: result.hostname }));
    return false;
  } catch (error) {
    // eslint-disable-next-line no-console -- diagnostyka: brak połączenia z Cloudflare
    console.warn("turnstile: verify failed", String(error));
    return false;
  }
}
