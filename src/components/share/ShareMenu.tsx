import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AtSign,
  Copy,
  Link2,
  Mail,
  MessageCircle,
  MessageSquareText,
  MessagesSquare,
  Send,
  Share2,
} from "lucide-react";
import {
  MESSENGER_WEB,
  gmailLink,
  mailtoLink,
  smsLink,
  telegramLink,
  whatsappLink,
  type ShareInput,
} from "@/lib/share-links";
import { cn } from "@/lib/utils";

// Menu udostępniania z wyborem: gotowa wiadomość (opis spotkania + link) albo sam link.
// Na telefonie: systemowe udostępnianie wiadomości lub samego linku i kopiowanie;
// na komputerze: WhatsApp, Messenger, Gmail, e-mail, Telegram, kopiowanie wiadomości lub linku, więcej.

interface Props {
  /** Pełna wiadomość z linkiem (src/lib/share.ts). */
  text: string;
  url: string;
  subject: string;
  /** Wygląd przycisku: ikona w kółku, szeroki przycisk albo mały „chip”. */
  variant?: "icon" | "button" | "chip";
  label?: string;
  /** Pole tekstowe z wiadomością do edycji (np. zaproszenie) — ma pierwszeństwo przed `text`. */
  textareaId?: string;
  className?: string;
}

interface Item {
  label: string;
  icon: ReactNode;
  color: string;
  href?: (input: ShareInput) => string;
  action?: (input: ShareInput) => Promise<string | null>;
  /** Gdzie pokazać: na telefonie z systemowym udostępnianiem („native”) albo w pozostałych przypadkach. */
  only?: "native" | "fallback";
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Systemowe menu udostępniania; false, gdy przeglądarka go nie ma. */
async function systemShare(data: ShareData): Promise<boolean> {
  if (typeof navigator.share !== "function") return false;
  try {
    await navigator.share(data);
  } catch {
    // anulowane — nic nie robimy
  }
  return true;
}

const ITEMS: Item[] = [
  {
    label: "Wyślij wiadomość",
    icon: <Share2 className="size-4" />,
    color: "#13261F",
    only: "native",
    action: async ({ text, subject }) => {
      await systemShare({ title: subject, text });
      return null;
    },
  },
  {
    label: "Wyślij sam link",
    icon: <Link2 className="size-4" />,
    color: "#3E5249",
    only: "native",
    action: async ({ url, subject }) => {
      await systemShare({ title: subject, url });
      return null;
    },
  },
  {
    label: "WhatsApp",
    icon: <MessageCircle className="size-4" />,
    color: "#25D366",
    href: whatsappLink,
    only: "fallback",
  },
  {
    label: "Messenger",
    only: "fallback",
    icon: <MessagesSquare className="size-4" />,
    color: "#0866FF",
    action: async ({ text }) => {
      const copied = await copy(text);
      window.open(MESSENGER_WEB, "_blank", "noopener");
      return copied ? "Wiadomość skopiowana — wklej ją w rozmowie w Messengerze." : null;
    },
  },
  { label: "Gmail", icon: <Mail className="size-4" />, color: "#EA4335", href: gmailLink, only: "fallback" },
  { label: "E-mail", icon: <AtSign className="size-4" />, color: "#5B6B62", href: mailtoLink, only: "fallback" },
  { label: "Telegram", icon: <Send className="size-4" />, color: "#229ED9", href: telegramLink, only: "fallback" },
  {
    label: "Kopiuj wiadomość",
    icon: <Copy className="size-4" />,
    color: "#FF7A1A",
    action: async ({ text }) => ((await copy(text)) ? "✓ Skopiowano wiadomość z linkiem." : null),
  },
  {
    label: "Kopiuj link",
    icon: <Link2 className="size-4" />,
    color: "#A84A00",
    action: async ({ url }) => ((await copy(url)) ? "✓ Skopiowano sam link." : null),
  },
];

const SMS_ITEM: Item = {
  label: "SMS",
  icon: <MessageSquareText className="size-4" />,
  color: "#13261F",
  href: smsLink,
  only: "fallback",
};

function isTouch(): boolean {
  return window.matchMedia("(pointer: coarse)").matches;
}

export default function ShareMenu({
  text,
  url,
  subject,
  variant = "button",
  label = "Udostępnij",
  textareaId,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  // Zamykanie: kliknięcie poza menu albo Esc.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const input = (): ShareInput => {
    // Pusta treść w polu do edycji = wiadomość domyślna.
    const edited = textareaId
      ? (document.getElementById(textareaId) as HTMLTextAreaElement | null)?.value.trim()
      : undefined;
    return { text: edited === undefined || edited === "" ? text : edited, url, subject };
  };

  function onTrigger() {
    setNote(null);
    setOpen((value) => !value);
  }

  // Telefon z systemowym udostępnianiem: krótka lista (wiadomość / sam link / kopiowanie);
  // komputer albo brak systemowego menu: lista serwisów (na telefonie bez niego także SMS).
  const touch = typeof window !== "undefined" && isTouch();
  const hasSystemShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const native = touch && hasSystemShare;
  const items = [...ITEMS, ...(touch && !native ? [SMS_ITEM] : [])].filter(
    (item) => !item.only || (item.only === "native") === native,
  );

  return (
    <div ref={root} className={cn("relative inline-block", className)}>
      <button
        type="button"
        onClick={onTrigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={variant === "icon" ? label : undefined}
        className={cn(
          variant === "icon" &&
            "bg-page-2 text-page-ink hover:bg-page-deep grid size-11 place-items-center rounded-full transition-colors",
          variant === "button" &&
            "bg-ink text-card h-12 w-full rounded-full px-5 text-sm font-extrabold tracking-wide uppercase",
          variant === "chip" &&
            "bg-card-2 hover:bg-line rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
        )}
        data-testid="share-trigger"
      >
        {variant === "icon" ? <Share2 className="size-5" aria-hidden="true" /> : label}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Udostępnij przez"
          className="bg-card text-ink border-line absolute right-0 z-[1200] mt-2 w-64 rounded-2xl border p-2 shadow-xl"
          data-testid="share-menu"
        >
          {items.map((item) => {
            const content = (
              <>
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-full text-white"
                  style={{ background: item.color }}
                  aria-hidden="true"
                >
                  {item.icon}
                </span>
                {item.label}
              </>
            );
            const itemClass =
              "hover:bg-card-2 flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-bold";
            return item.href ? (
              <a
                key={item.label}
                role="menuitem"
                href={item.href(input())}
                target={item.label === "E-mail" || item.label === "SMS" ? undefined : "_blank"}
                rel="noopener noreferrer"
                className={itemClass}
                onClick={(event) => {
                  // Wiadomość mogła zostać zmieniona po otwarciu menu — budujemy link na nowo.
                  event.currentTarget.href = item.href?.(input()) ?? event.currentTarget.href;
                  setOpen(false);
                }}
              >
                {content}
              </a>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={itemClass}
                onClick={() => {
                  void item.action?.(input()).then((message) => {
                    setNote(message);
                    setOpen(false);
                  });
                }}
              >
                {content}
              </button>
            );
          })}
          {hasSystemShare && !native && (
            <button
              type="button"
              role="menuitem"
              className="hover:bg-card-2 text-ink-2 flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-bold"
              onClick={() => {
                setOpen(false);
                void systemShare({ title: subject, text: input().text });
              }}
            >
              <span className="bg-card-2 grid size-8 place-items-center rounded-full" aria-hidden="true">
                <Share2 className="size-4" />
              </span>
              Więcej…
            </button>
          )}
        </div>
      )}

      {note && (
        <p
          role="status"
          className="bg-ink text-card absolute right-0 z-[1200] mt-2 w-64 rounded-xl px-3 py-2 text-xs"
          onClick={() => {
            setNote(null);
          }}
        >
          {note}
        </p>
      )}
    </div>
  );
}
