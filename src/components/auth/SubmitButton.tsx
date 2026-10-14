import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

interface SubmitButtonProps {
  pendingText: string;
  icon: ReactNode;
  children: ReactNode;
  /** Np. do czasu weryfikacji Turnstile. */
  disabled?: boolean;
}

export function SubmitButton({ pendingText, icon, children, disabled = false }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={pending || disabled}
      className="bg-brand text-on-brand hover:bg-brand-hover w-full rounded-full px-4 py-2 font-medium transition-colors"
    >
      {pending ? (
        <span className="flex items-center gap-2">
          <span className="border-line-strong size-4 animate-spin rounded-full border-2 border-t-white" />
          {pendingText}
        </span>
      ) : (
        <span className="flex items-center gap-2">
          {icon}
          {children}
        </span>
      )}
    </Button>
  );
}
