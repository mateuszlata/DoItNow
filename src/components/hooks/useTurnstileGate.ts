import { useEffect, useRef, useState } from "react";
import type { TurnstileState } from "@/components/auth/TurnstileWidget";

/**
 * Stan sprawdzenia Turnstile dla formularza: przycisk czeka na wynik (inaczej serwer odrzuci próbę).
 * Bez klucza witryny (lokalnie, w CI) formularz nie jest blokowany.
 */
export function useTurnstileGate(siteKey: string | undefined) {
  const [check, setCheck] = useState<TurnstileState | "waiting">("waiting");
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const element = form.current;
    if (!element || !siteKey) return;
    const onState = (event: Event) => {
      setCheck((event as CustomEvent<TurnstileState>).detail);
    };
    element.addEventListener("turnstile-state", onState);
    return () => {
      element.removeEventListener("turnstile-state", onState);
    };
  }, [siteKey]);
  return { form, check, blocked: Boolean(siteKey) && check !== "ok" };
}
