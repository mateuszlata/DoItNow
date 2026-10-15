import type { AuthError } from "@supabase/supabase-js";

// Komunikaty dla kodów błędów Supabase Auth (https://supabase.com/docs/guides/auth/debugging/error-codes).
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Nieprawidłowy e-mail lub hasło.",
  email_not_confirmed: "Potwierdź adres e-mail, klikając link w wiadomości od nas.",
  user_already_exists: "Konto z tym adresem e-mail już istnieje.",
  email_exists: "Konto z tym adresem e-mail już istnieje.",
  weak_password: "Hasło jest za słabe. Użyj co najmniej 6 znaków.",
  email_address_invalid: "Podaj prawidłowy adres e-mail.",
  validation_failed: "Sprawdź poprawność e-maila i hasła.",
  over_request_rate_limit: "Zbyt wiele prób. Spróbuj ponownie za chwilę.",
  over_email_send_rate_limit: "Zbyt wiele prób. Spróbuj ponownie za chwilę.",
  signup_disabled: "Rejestracja jest obecnie wyłączona.",
  same_password: "Nowe hasło musi być inne niż dotychczasowe.",
};

export const AUTH_NOT_CONFIGURED = "Brak konfiguracji logowania. Spróbuj ponownie później.";

export function authErrorMessage(error: AuthError): string {
  return (error.code && AUTH_ERROR_MESSAGES[error.code]) ?? "Nie udało się. Spróbuj ponownie.";
}
