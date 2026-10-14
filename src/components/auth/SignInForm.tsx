import React, { useEffect, useRef, useState } from "react";
import { Mail, Lock, LogIn } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { TurnstileWidget, type TurnstileState } from "@/components/auth/TurnstileWidget";

interface Props {
  serverError?: string | null;
  /** Ścieżka, na którą wracamy po zalogowaniu (sprawdzona przez safeNext). */
  next?: string | null;
  /** Klucz witryny Cloudflare Turnstile (ochrona przed zgadywaniem haseł); bez niego formularz działa bez widgetu. */
  turnstileSiteKey?: string;
}

export default function SignInForm({ serverError, next, turnstileSiteKey }: Props) {
  // Logowanie czeka na wynik sprawdzenia, czy nie jesteś botem (inaczej serwer odrzuci próbę).
  const [check, setCheck] = useState<TurnstileState | "waiting">("waiting");
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const element = form.current;
    if (!element || !turnstileSiteKey) return;
    const onState = (event: Event) => {
      setCheck((event as CustomEvent<TurnstileState>).detail);
    };
    element.addEventListener("turnstile-state", onState);
    return () => {
      element.removeEventListener("turnstile-state", onState);
    };
  }, [turnstileSiteKey]);
  const blocked = Boolean(turnstileSiteKey) && check !== "ok";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  function validate() {
    const next: typeof errors = {};
    if (!email.trim()) {
      next.email = "Podaj adres e-mail";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = "Podaj prawidłowy adres e-mail";
    }
    if (!password) {
      next.password = "Podaj hasło";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function clearError(field: keyof typeof errors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  return (
    <form ref={form} method="POST" action="/api/auth/signin" className="space-y-4" onSubmit={handleSubmit} noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <FormField
        id="email"
        type="email"
        label="E-mail"
        value={email}
        onChange={(v) => {
          setEmail(v);
          clearError("email");
        }}
        placeholder="ty@example.com"
        error={errors.email}
        icon={<Mail className="size-4" />}
      />

      <FormField
        id="password"
        label="Hasło"
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(v) => {
          setPassword(v);
          clearError("password");
        }}
        placeholder="Twoje hasło"
        error={errors.password}
        icon={<Lock className="size-4" />}
        endContent={
          <PasswordToggle
            visible={showPassword}
            onToggle={() => {
              setShowPassword(!showPassword);
            }}
          />
        }
      />

      <ServerError message={serverError} />

      {turnstileSiteKey && <TurnstileWidget siteKey={turnstileSiteKey} />}
      {blocked && (
        <p className="text-ink-3 text-center text-xs" role="status">
          {check === "error"
            ? "Nie udało się sprawdzić, że nie jesteś botem. Wyłącz blokowanie skryptów na tej stronie albo użyj innej przeglądarki."
            : check === "expired"
              ? "Weryfikacja wygasła — zaznacz ją ponownie."
              : "Sprawdzamy, czy nie jesteś botem. Jeśli powyżej pojawi się pole do zaznaczenia — zaznacz je."}
        </p>
      )}

      <SubmitButton pendingText="Logowanie…" icon={<LogIn className="size-4" />} disabled={blocked}>
        Zaloguj się
      </SubmitButton>
    </form>
  );
}
