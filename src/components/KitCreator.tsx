import { useState } from "react";
import { Check, Dices } from "lucide-react";
import KitJersey from "@/components/KitJersey";
import { KIT_COLORS, KIT_PATTERNS, isKitLabel, type PlayerKit } from "@/lib/kit";
import { cn } from "@/lib/utils";

// Kreator stroju („moje barwy”): wzór, dwa kolory i numer albo inicjały z podglądem na żywo.
// Zapis zwykłym formularzem do /api/profile/kit — ukryte pola odzwierciedlają stan kreatora.

interface Props {
  initialKit: PlayerKit;
  nick: string;
  /** Strój właśnie zapisany — przycisk pokazuje „Zapisano”, dopóki nic się nie zmieni. */
  saved?: boolean;
}

const PREVIEW_SPORTS = [
  { sport: "pilka-nozna", label: "Piłka" },
  { sport: "koszykowka", label: "Kosz" },
  { sport: "tenis", label: "Tenis" },
  { sport: "rower", label: "Rower" },
  { sport: "bieganie", label: "Bieg" },
];

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export default function KitCreator({ initialKit, nick, saved = false }: Props) {
  const [kit, setKitState] = useState<PlayerKit>(initialKit);
  const [dirty, setDirty] = useState(false);
  const showSaved = saved && !dirty;
  // Każda zmiana stroju przywraca przycisk „Zapisz strój”.
  const setKit: typeof setKitState = (value) => {
    setDirty(true);
    setKitState(value);
  };
  const [mode, setMode] = useState<"number" | "initials">(/^\d+$/.test(initialKit.label) ? "number" : "initials");
  const [draft, setDraft] = useState(initialKit.label);
  const draftValid = isKitLabel(draft.trim().toUpperCase()) && (mode === "number") === /^\d+$/.test(draft.trim());

  function updateLabel(value: string) {
    setDraft(value);
    const label = value.trim().toUpperCase();
    const normalized = /^\d{1,2}$/.test(label) ? String(Number(label)) : label;
    if (isKitLabel(normalized)) setKit((k) => ({ ...k, label: normalized }));
  }

  function randomize() {
    const primary = pick(KIT_COLORS).hex;
    const others = KIT_COLORS.filter((c) => c.hex !== primary);
    const label = String(Math.floor(Math.random() * 100));
    setKit({ pattern: pick(KIT_PATTERNS).id, primary, secondary: pick(others).hex, label });
    setMode("number");
    setDraft(label);
  }

  const chip = "rounded-full border px-3 py-1.5 text-xs font-bold transition-colors";
  const chipOn = "border-ink bg-ink text-card";
  const chipOff = "border-line-strong bg-card text-ink hover:border-ink";

  return (
    <form method="POST" action="/api/profile/kit" className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <input type="hidden" name="pattern" value={kit.pattern} />
      <input type="hidden" name="primary" value={kit.primary} />
      <input type="hidden" name="secondary" value={kit.secondary} />
      <input type="hidden" name="label" value={kit.label} />

      <div className="flex flex-col gap-4">
        <fieldset>
          <legend className="text-ink-2 mb-2 text-sm font-bold">Wzór</legend>
          <div className="flex flex-wrap gap-1.5">
            {KIT_PATTERNS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={kit.pattern === p.id}
                className={cn(chip, kit.pattern === p.id ? chipOn : chipOff)}
                onClick={() => {
                  setKit((k) => ({ ...k, pattern: p.id }));
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </fieldset>

        {(
          [
            ["primary", "Kolor główny"],
            ["secondary", "Kolor dodatkowy"],
          ] as const
        ).map(([key, title]) => (
          <fieldset key={key}>
            <legend className="text-ink-2 mb-2 text-sm font-bold">{title}</legend>
            <div className="flex flex-wrap gap-2">
              {KIT_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  aria-label={`${title}: ${c.label}`}
                  aria-pressed={kit[key] === c.hex}
                  className={cn(
                    "border-line-strong size-8 rounded-full border transition-shadow",
                    kit[key] === c.hex && "ring-ink ring-offset-card ring-2 ring-offset-2",
                  )}
                  style={{ background: c.hex }}
                  onClick={() => {
                    setKit((k) => ({ ...k, [key]: c.hex }));
                  }}
                />
              ))}
            </div>
          </fieldset>
        ))}

        <fieldset>
          <legend className="text-ink-2 mb-2 text-sm font-bold">Na koszulce</legend>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={mode === "number"}
              className={cn(chip, mode === "number" ? chipOn : chipOff)}
              onClick={() => {
                setMode("number");
                updateLabel(/^\d+$/.test(kit.label) ? kit.label : "10");
              }}
            >
              Numer
            </button>
            <button
              type="button"
              aria-pressed={mode === "initials"}
              className={cn(chip, mode === "initials" ? chipOn : chipOff)}
              onClick={() => {
                setMode("initials");
                updateLabel(/^\d+$/.test(kit.label) ? nick.slice(0, 2) : kit.label);
              }}
            >
              Inicjały
            </button>
            <label className="sr-only" htmlFor="kit-label">
              {mode === "number" ? "Numer od 0 do 99" : "Inicjały, 1–3 litery"}
            </label>
            <input
              id="kit-label"
              value={draft}
              inputMode={mode === "number" ? "numeric" : "text"}
              maxLength={mode === "number" ? 2 : 3}
              onChange={(e) => {
                updateLabel(e.target.value);
              }}
              aria-invalid={!draftValid}
              className={cn(
                "bg-card text-ink h-9 w-20 rounded-full border px-3 text-center text-sm font-bold uppercase",
                draftValid ? "border-line-strong" : "border-bad",
              )}
            />
          </div>
          {!draftValid && (
            <p className="text-bad mt-1 text-xs">
              {mode === "number" ? "Wpisz numer od 0 do 99." : "Wpisz 1–3 litery."}
            </p>
          )}
        </fieldset>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={!draftValid}
            className={cn(
              "inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-extrabold tracking-wide uppercase transition-colors disabled:opacity-50",
              showSaved ? "bg-free text-white" : "bg-brand text-on-brand hover:bg-brand-hover",
            )}
          >
            {showSaved && <Check className="size-4" aria-hidden="true" />}
            {showSaved ? "Zapisano" : "Zapisz strój"}
          </button>
          <button
            type="button"
            onClick={randomize}
            className="text-ink-2 hover:text-ink inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-bold"
          >
            <Dices className="size-4" aria-hidden="true" />
            Losuj
          </button>
        </div>
      </div>

      <div className="bg-page rounded-2xl p-4" data-testid="kit-preview">
        <div className="flex items-end justify-between gap-1">
          {PREVIEW_SPORTS.map((p) => (
            <div key={p.sport} className="flex flex-col items-center gap-1">
              <KitJersey kit={kit} sport={p.sport} width={58} />
              <span className="text-page-ink-2 text-[11px]">{p.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-4">
          <KitJersey kit={kit} width={96} backName={nick} />
          <div className="text-page-ink-2 text-xs">
            <p className="text-page-ink font-bold">Tak widzą Cię inni</p>
            <p className="mt-1">W składzie, w czacie i przy Twoim nicku.</p>
            <div className="mt-2 flex items-end gap-2">
              <KitJersey kit={kit} width={24} />
              <KitJersey kit={kit} width={18} />
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
