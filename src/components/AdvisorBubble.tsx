import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type SubmitEvent } from "react";
import { MapPin, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FoundEvent } from "@/lib/assistant";

// Doradca Metando: pomarańczowe kółko „AI” na każdej stronie. Można je przeciągnąć (przykleja się do krawędzi,
// położenie pamięta przeglądarka); kliknięcie otwiera rozmowę. Na stronie spotkania doradca zna też to spotkanie.

interface Turn {
  question: string;
  answer: string;
  known: boolean;
  onEvent: boolean;
  /** Spotkania znalezione przez doradcę (karty) i link do listy z tymi samymi filtrami. */
  events?: FoundEvent[];
  listHref?: string | null;
}

const SIZE = 56;
const POSITION_KEY = "metando-advisor-position";
const CHAT_KEY = "metando-advisor-chat";
const MAX_QUESTION = 300;
const EVENT_PATH = /^\/events\/([0-9a-f-]{36})(?:\/|$)/i;

interface Position {
  side: "left" | "right";
  /** Odległość środka kółka od dołu okna (px). */
  bottom: number;
}

function readJson<T>(storage: Storage | undefined, key: string, fallback: T): T {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(storage: Storage | undefined, key: string, value: unknown) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // bez zapamiętania — działa dalej
  }
}

/** Minimalna i maksymalna wysokość kółka: nad dolnym paskiem nawigacji i pod górną krawędzią. */
function clampBottom(bottom: number): number {
  return Math.min(Math.max(bottom, 136), window.innerHeight - 72);
}

export default function AdvisorBubble() {
  const [position, setPosition] = useState<Position>(() =>
    readJson<Position>(globalThis.localStorage, POSITION_KEY, { side: "right", bottom: 136 }),
  );
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>(() => readJson<Turn[]>(globalThis.sessionStorage, CHAT_KEY, []));
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const eventId = EVENT_PATH.exec(globalThis.location.pathname)?.[1] ?? null;

  useEffect(() => {
    writeJson(globalThis.sessionStorage, CHAT_KEY, turns.slice(-20));
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [turns, open]);

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    start.current = { x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const s = start.current;
    if (!s) return;
    if (!s.moved && Math.hypot(event.clientX - s.x, event.clientY - s.y) < 6) return;
    s.moved = true;
    setDrag({ x: event.clientX, y: event.clientY });
  }

  function onPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const s = start.current;
    start.current = null;
    if (!s?.moved) {
      setOpen(true);
      return;
    }
    // Przyklejenie do bliższej krawędzi, wysokość w bezpiecznym pasie.
    const next: Position = {
      side: event.clientX < window.innerWidth / 2 ? "left" : "right",
      bottom: clampBottom(window.innerHeight - event.clientY),
    };
    setDrag(null);
    setPosition(next);
    writeJson(globalThis.localStorage, POSITION_KEY, next);
  }

  async function ask(text: string) {
    const q = text.trim();
    if (q.length < 2 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          eventId: eventId ?? undefined,
          history: turns.slice(-4).map((t) => ({ question: t.question, answer: t.answer })),
        }),
      });
      const data = (await response.json()) as Partial<Turn> & { message?: string };
      const events = Array.isArray(data.events) ? data.events.slice(0, 3) : [];
      if (!response.ok || typeof data.answer !== "string") {
        setError(data.message ?? "Doradca jest chwilowo niedostępny.");
        return;
      }
      setTurns((prev) => [
        ...prev,
        {
          question: q,
          answer: data.answer ?? "",
          known: data.known === true,
          onEvent: data.onEvent === true,
          events,
          listHref: typeof data.listHref === "string" && data.listHref.startsWith("/events?") ? data.listHref : null,
        },
      ]);
      setQuestion("");
    } catch {
      setError("Brak połączenia. Spróbuj ponownie.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(question);
  }

  // Pytanie, na które doradca nie zna odpowiedzi, trafia do formularza „Zapytaj organizatora” na stronie spotkania.
  const organizerForm = typeof document === "undefined" ? null : document.querySelector("#zapytaj-organizatora");
  function forwardToOrganizer(text: string) {
    const box = document.querySelector<HTMLDetailsElement>("#zapytaj-organizatora");
    const field = document.querySelector<HTMLTextAreaElement>("#question-body");
    if (!box || !field) return;
    setOpen(false);
    box.open = true;
    field.value = text;
    field.scrollIntoView({ behavior: "smooth", block: "center" });
    field.focus();
  }

  const suggestions = eventId
    ? ["Ile to kosztuje?", "Czy są jeszcze wolne miejsca?", "Do kiedy mogę zrezygnować?"]
    : ["Znajdź mi grę w ten weekend", "Jak dołączyć do spotkania?", "Jak wystawić spotkanie?"];

  const style = drag
    ? { left: drag.x - SIZE / 2, top: drag.y - SIZE / 2 }
    : { [position.side]: 12, bottom: position.bottom - SIZE / 2 };

  return (
    <>
      {!open && (
        <button
          type="button"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setOpen(true);
          }}
          aria-label="Porozmawiaj z doradcą Metando (AI)"
          title="Porozmawiaj z doradcą Metando"
          style={style}
          className={cn(
            "bg-brand text-on-brand fixed z-[1300] grid size-14 touch-none place-items-center rounded-full shadow-[0_6px_20px_rgba(0,0,0,0.35)] select-none",
            drag ? "cursor-grabbing" : "cursor-pointer transition-[left,right,bottom] duration-200",
          )}
          data-testid="advisor-bubble"
        >
          <Sparkles className="size-6" aria-hidden="true" />
          <span className="bg-ink text-card absolute -top-1 -right-1 rounded-full px-1.5 text-[10px] leading-4 font-extrabold">
            AI
          </span>
        </button>
      )}

      {open && (
        <section
          role="dialog"
          aria-label="Doradca Metando"
          className="bg-ink text-card fixed inset-x-2 bottom-2 z-[1300] flex max-h-[78vh] flex-col rounded-[22px] shadow-[0_10px_40px_rgba(0,0,0,0.45)] sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[390px]"
          data-testid="advisor-panel"
        >
          <header className="flex items-start gap-3 border-b border-white/10 p-4">
            <span className="bg-brand text-on-brand grid size-10 shrink-0 place-items-center rounded-full">
              <Sparkles className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-bold">
                Doradca Metando
                <span className="bg-brand text-on-brand rounded-full px-1.5 text-[10px] leading-4 font-extrabold">
                  AI
                </span>
              </p>
              <p className="text-xs opacity-70">
                Odpowiada automatycznie na podstawie instrukcji Metando{eventId ? " i tego ogłoszenia" : ""} — może się
                pomylić.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
              }}
              aria-label="Zamknij doradcę"
              className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </header>

          <div ref={list} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4" aria-live="polite">
            {turns.length === 0 && (
              <div className="grid gap-2">
                <p className="text-sm opacity-80">
                  Cześć! Pomogę Ci w Metando{eventId ? " i odpowiem na pytania o to spotkanie" : ""}. Zapytaj albo
                  wybierz:
                </p>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void ask(s)}
                    className="justify-self-start rounded-full border border-white/25 px-3 py-1.5 text-left text-sm hover:bg-white/10"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {turns.map((turn, i) => (
              <div key={i} className="grid gap-2">
                <p className="max-w-[85%] justify-self-end rounded-2xl rounded-br-md bg-white/12 px-3.5 py-2 text-sm">
                  {turn.question}
                </p>
                <div className="bg-card text-ink max-w-[92%] rounded-2xl rounded-bl-md px-3.5 py-2.5">
                  <p className="text-ink-3 mb-1 flex items-center gap-1 text-[10px] font-extrabold tracking-wide uppercase">
                    <Sparkles className="size-3" aria-hidden="true" />
                    Doradca AI
                  </p>
                  <p className="text-sm whitespace-pre-line" data-testid="advisor-answer">
                    {turn.answer}
                  </p>
                  {turn.events && turn.events.length > 0 && (
                    <ul className="mt-2 grid gap-1.5">
                      {turn.events.map((e) => (
                        <li key={e.id}>
                          <a
                            href={`/events/${e.id}`}
                            className="border-line hover:border-brand block rounded-xl border px-3 py-2"
                            data-testid="advisor-event"
                          >
                            <span className="block text-sm font-bold">
                              {e.sport} · {e.when}
                            </span>
                            <span className="text-ink-3 flex items-center gap-1 text-xs">
                              <MapPin className="size-3 shrink-0" aria-hidden="true" />
                              {e.area}
                              {e.distance_km !== null && ` · ${e.distance_km.toLocaleString("pl-PL")} km`}
                              {" · "}
                              {e.free > 0 ? `wolne ${String(e.free)} z ${String(e.team)}` : "brak wolnych miejsc"}
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  {turn.listHref && (
                    <a href={turn.listHref} className="text-link mt-2 inline-block text-sm font-bold underline">
                      Pokaż wszystkie na liście
                    </a>
                  )}
                  {!turn.known && turn.onEvent && organizerForm && (
                    <button
                      type="button"
                      onClick={() => {
                        forwardToOrganizer(turn.question);
                      }}
                      className="bg-brand text-on-brand hover:bg-brand-hover mt-2 h-9 rounded-full px-4 text-xs font-extrabold tracking-wide uppercase"
                    >
                      Zapytaj organizatora
                    </button>
                  )}
                  {!turn.known && !(turn.onEvent && organizerForm) && (
                    <a
                      href="mailto:kontakt@metando.pl"
                      className="text-link mt-2 inline-block text-sm font-bold underline"
                    >
                      Napisz do nas: kontakt@metando.pl
                    </a>
                  )}
                </div>
              </div>
            ))}
            {busy && <p className="text-sm opacity-70">Doradca pisze…</p>}
            {error && <p className="text-brand text-sm">{error}</p>}
          </div>

          <form onSubmit={submit} className="flex gap-2 border-t border-white/10 p-3">
            <label htmlFor="advisor-question" className="sr-only">
              Pytanie do doradcy
            </label>
            <input
              id="advisor-question"
              type="text"
              value={question}
              maxLength={MAX_QUESTION}
              onChange={(e) => {
                setQuestion(e.target.value);
              }}
              placeholder="Zapytaj albo napisz, czego szukasz…"
              className="bg-card text-ink placeholder:text-ink-3 focus:ring-brand h-11 min-w-0 flex-1 rounded-full px-4 text-sm focus:ring-2 focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || question.trim().length < 2}
              className="bg-brand text-on-brand hover:bg-brand-hover h-11 shrink-0 rounded-full px-4 text-xs font-extrabold tracking-wide uppercase disabled:opacity-40"
            >
              Wyślij
            </button>
          </form>
          {turns.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setTurns([]);
              }}
              className="pb-3 text-xs underline opacity-60 hover:opacity-100"
            >
              Nowa rozmowa
            </button>
          )}
        </section>
      )}
    </>
  );
}
