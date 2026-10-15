import React, { useState } from "react";
import { Mail, Send } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { TurnstileWidget } from "@/components/auth/TurnstileWidget";
import { useTurnstileGate } from "@/components/hooks/useTurnstileGate";

interface Props {
  serverError?: string | null;
  turnstileSiteKey?: string;
}

/** „Nie pamiętam hasła”: adres e-mail, na który wyślemy link do ustawienia nowego hasła. */
export default function ForgotPasswordForm({ serverError, turnstileSiteKey }: Props) {
  const { form, check, blocked } = useTurnstileGate(turnstileSiteKey);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    const message = !email.trim()
      ? "Podaj adres e-mail"
      : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
        ? undefined
        : "Podaj prawidłowy adres e-mail";
    setError(message);
    if (message) e.preventDefault();
  }

  return (
    <form ref={form} method="POST" action="/api/auth/forgot" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="email"
        type="email"
        label="E-mail konta"
        value={email}
        onChange={(v) => {
          setEmail(v);
          setError(undefined);
        }}
        placeholder="ty@example.com"
        error={error}
        icon={<Mail className="size-4" />}
      />

      <ServerError message={serverError} />

      {turnstileSiteKey && <TurnstileWidget siteKey={turnstileSiteKey} />}
      {blocked && (
        <p className="text-ink-3 text-center text-xs" role="status">
          {check === "error"
            ? "Nie udało się sprawdzić, że nie jesteś botem. Wyłącz blokowanie skryptów albo użyj innej przeglądarki."
            : "Sprawdzamy, czy nie jesteś botem. Jeśli powyżej pojawi się pole do zaznaczenia — zaznacz je."}
        </p>
      )}

      <SubmitButton pendingText="Wysyłanie…" icon={<Send className="size-4" />} disabled={blocked}>
        Wyślij link
      </SubmitButton>
    </form>
  );
}
