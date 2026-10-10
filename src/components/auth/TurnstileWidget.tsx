import { useEffect, useRef } from "react";

// Widget Cloudflare Turnstile. Po przejściu sprawdzenia dodaje do formularza ukryte pole
// „cf-turnstile-response”, które serwer weryfikuje w src/lib/turnstile.ts.
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface Turnstile {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let scriptPromise: Promise<Turnstile> | null = null;

function loadTurnstile(): Promise<Turnstile> {
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile unavailable"));
    };
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Turnstile failed to load"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function TurnstileWidget({ siteKey }: { siteKey: string }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let widgetId: string | null = null;
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !container.current) return;
        widgetId = turnstile.render(container.current, {
          sitekey: siteKey,
          language: "pl",
          theme: "light",
          size: "flexible",
        });
      })
      .catch(() => {
        // Bez widgetu serwer odrzuci rejestrację z czytelnym komunikatem.
      });
    return () => {
      cancelled = true;
      if (widgetId) window.turnstile?.remove(widgetId);
    };
  }, [siteKey]);

  return <div ref={container} className="min-h-[65px]" data-testid="turnstile" />;
}
