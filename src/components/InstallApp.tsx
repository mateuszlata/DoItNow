import { useEffect, useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";

// „Metando na telefonie” (PWA): na Androidzie przycisk instalacji z przeglądarki, na iPhonie instrukcja
// (Safari nie pozwala stronie wywołać instalacji). Po instalacji i na komputerze nic się nie pokazuje.

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __metandoInstall?: InstallPromptEvent;
  }
}

interface Props {
  /** `banner` — zamykana karta na liście spotkań; `section` — stała sekcja w „Moje”. */
  variant?: "banner" | "section";
}

const DISMISS_KEY = "metando-install-dismissed";

type Mode = "hidden" | "android" | "ios";

function detect(): Mode {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "hidden";
  if (window.__metandoInstall) return "android";
  const ios =
    /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /mac/i.test(navigator.userAgent));
  return ios ? "ios" : "hidden";
}

export default function InstallApp({ variant = "banner" }: Props) {
  // Renderowane tylko w przeglądarce (client:only), więc stan startowy czytamy od razu z okna.
  const [mode, setMode] = useState<Mode>(detect);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return variant === "banner" && localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [done, setDone] = useState(false);

  useEffect(() => {
    const onInstallable = () => {
      setMode(detect());
    };
    const onInstalled = () => {
      setDone(true);
    };
    window.addEventListener("metando-installable", onInstallable);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("metando-installable", onInstallable);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (done) {
    return (
      <p className="bg-ok-soft text-ok mb-4 rounded-2xl px-4 py-2.5 text-sm font-semibold" role="status">
        Gotowe — Metando jest na ekranie głównym telefonu.
      </p>
    );
  }
  if (mode === "hidden" || dismissed) return null;

  async function install() {
    const prompt = window.__metandoInstall;
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    window.__metandoInstall = undefined;
    if (choice.outcome === "accepted") setDone(true);
    else setMode(detect());
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // brak dostępu do pamięci przeglądarki — karta zniknie tylko do odświeżenia
    }
    setDismissed(true);
  }

  return (
    <section
      className={cn("bg-card text-ink relative rounded-[20px] p-4", variant === "banner" && "mb-4")}
      data-testid="install-app"
    >
      {variant === "banner" && (
        <button
          type="button"
          onClick={dismiss}
          className="text-ink-3 hover:text-ink absolute top-2 right-2 grid size-8 place-items-center rounded-full"
          aria-label="Nie teraz"
        >
          <X className="size-4" />
        </button>
      )}
      <div className="flex items-center gap-3 pr-6">
        <img src="/icons/icon-192.png" alt="" width={44} height={44} className="size-11 rounded-xl" />
        <div>
          <p className="text-sm font-bold">Metando na telefonie</p>
          <p className="text-ink-2 text-xs">Ikona na ekranie głównym, pełny ekran, bez szukania w przeglądarce.</p>
        </div>
      </div>
      {mode === "android" ? (
        <button
          type="button"
          onClick={() => void install()}
          className="bg-brand text-on-brand hover:bg-brand-hover mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-extrabold tracking-wide uppercase"
        >
          <Download className="size-4" aria-hidden="true" />
          Zainstaluj aplikację
        </button>
      ) : (
        <ol className="text-ink-2 mt-3 flex flex-col gap-1.5 text-sm">
          <li className="flex items-center gap-2">
            <span className="bg-card-2 text-ink grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold">
              1
            </span>
            Stuknij <Share className="text-ink size-4" aria-label="Udostępnij" />{" "}
            <strong className="text-ink">Udostępnij</strong> na dole Safari
          </li>
          <li className="flex items-center gap-2">
            <span className="bg-card-2 text-ink grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold">
              2
            </span>
            Wybierz <SquarePlus className="text-ink size-4" aria-hidden="true" />{" "}
            <strong className="text-ink">Do ekranu początkowego</strong>
          </li>
          <li className="flex items-center gap-2">
            <span className="bg-card-2 text-ink grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold">
              3
            </span>
            Potwierdź <strong className="text-ink">Dodaj</strong>
          </li>
        </ol>
      )}
    </section>
  );
}
