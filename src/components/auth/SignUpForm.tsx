import React, { useState } from "react";
import { TurnstileWidget } from "@/components/auth/TurnstileWidget";
import { Mail, Lock, User, UserPlus } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";

const MIN_PASSWORD_LENGTH = 6;
const MIN_DISPLAY_NAME_LENGTH = 2;
const MAX_DISPLAY_NAME_LENGTH = 30;

interface Props {
  serverError?: string | null;
  /** Klucz witryny Cloudflare Turnstile; bez niego formularz działa bez widgetu. */
  turnstileSiteKey?: string;
}

export default function SignUpForm({ serverError, turnstileSiteKey }: Props) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<{
    displayName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  function validate() {
    const next: typeof errors = {};

    const trimmedName = displayName.trim();
    if (trimmedName.length < MIN_DISPLAY_NAME_LENGTH) {
      next.displayName = `Nick musi mieć co najmniej ${MIN_DISPLAY_NAME_LENGTH} znaki`;
    } else if (trimmedName.length > MAX_DISPLAY_NAME_LENGTH) {
      next.displayName = `Nick może mieć maks. ${MAX_DISPLAY_NAME_LENGTH} znaków`;
    }

    if (!email.trim()) {
      next.email = "Podaj adres e-mail";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = "Podaj prawidłowy adres e-mail";
    }

    if (!password) {
      next.password = "Podaj hasło";
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      next.password = `Hasło musi mieć co najmniej ${String(MIN_PASSWORD_LENGTH)} znaków`;
    }

    if (!confirmPassword) {
      next.confirmPassword = "Powtórz hasło";
    } else if (password !== confirmPassword) {
      next.confirmPassword = "Hasła nie są takie same";
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

  const passwordHint =
    !errors.password && password.length > 0 && password.length < MIN_PASSWORD_LENGTH ? (
      <p className="text-ink-3 mt-1 text-xs">
        Brakuje jeszcze {MIN_PASSWORD_LENGTH - password.length}{" "}
        {MIN_PASSWORD_LENGTH - password.length === 1 ? "znaku" : "znaków"}
      </p>
    ) : undefined;

  return (
    <form method="POST" action="/api/auth/signup" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="displayName"
        label="Nick (widoczny dla innych)"
        value={displayName}
        onChange={(v) => {
          setDisplayName(v);
          clearError("displayName");
        }}
        placeholder="np. Kasia_biega"
        error={errors.displayName}
        icon={<User className="size-4" />}
      />

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
        placeholder="Min. 6 znaków"
        error={errors.password}
        hint={passwordHint}
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

      <FormField
        id="confirmPassword"
        name="confirmPassword"
        label="Powtórz hasło"
        type={showConfirmPassword ? "text" : "password"}
        value={confirmPassword}
        onChange={(v) => {
          setConfirmPassword(v);
          clearError("confirmPassword");
        }}
        placeholder="Wpisz hasło ponownie"
        error={errors.confirmPassword}
        icon={<Lock className="size-4" />}
        endContent={
          <PasswordToggle
            visible={showConfirmPassword}
            onToggle={() => {
              setShowConfirmPassword(!showConfirmPassword);
            }}
          />
        }
      />

      {turnstileSiteKey && <TurnstileWidget siteKey={turnstileSiteKey} />}

      <ServerError message={serverError} />

      <SubmitButton pendingText="Zakładanie konta…" icon={<UserPlus className="size-4" />}>
        Załóż konto
      </SubmitButton>
    </form>
  );
}
