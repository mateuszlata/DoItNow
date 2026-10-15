import React, { useState } from "react";
import { Lock, KeyRound } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";

const MIN_PASSWORD_LENGTH = 6;

/** Nowe hasło po kliknięciu linku z maila „Nie pamiętam hasła” (sesja z linku jest już aktywna). */
export default function NewPasswordForm({ serverError }: { serverError?: string | null }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    const next: typeof errors = {};
    if (password.length < MIN_PASSWORD_LENGTH) {
      next.password = `Hasło musi mieć co najmniej ${String(MIN_PASSWORD_LENGTH)} znaków`;
    }
    if (password !== confirm) next.confirm = "Hasła nie są takie same";
    setErrors(next);
    if (Object.keys(next).length > 0) e.preventDefault();
  }

  const toggle = (
    <PasswordToggle
      visible={show}
      onToggle={() => {
        setShow(!show);
      }}
    />
  );

  return (
    <form method="POST" action="/api/auth/new-password" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="password"
        label="Nowe hasło"
        type={show ? "text" : "password"}
        value={password}
        onChange={(v) => {
          setPassword(v);
          setErrors((prev) => ({ ...prev, password: undefined }));
        }}
        placeholder="Min. 6 znaków"
        error={errors.password}
        icon={<Lock className="size-4" />}
        endContent={toggle}
      />
      <FormField
        id="confirmPassword"
        name="confirmPassword"
        label="Powtórz nowe hasło"
        type={show ? "text" : "password"}
        value={confirm}
        onChange={(v) => {
          setConfirm(v);
          setErrors((prev) => ({ ...prev, confirm: undefined }));
        }}
        placeholder="Wpisz hasło ponownie"
        error={errors.confirm}
        icon={<Lock className="size-4" />}
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText="Zapisywanie…" icon={<KeyRound className="size-4" />}>
        Ustaw nowe hasło
      </SubmitButton>
    </form>
  );
}
