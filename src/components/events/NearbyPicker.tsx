import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, LocateFixed, MapPin, X } from "lucide-react";
import { DEFAULT_RADIUS_KM, NEAR_COOKIE, NEAR_RADII, serializeNear, type Near } from "@/lib/near";
import type { PlaceSuggestion } from "@/lib/geocode";
import { cn } from "@/lib/utils";

// Filtr „W pobliżu” na liście spotkań: okolica z GPS albo wpisana dzielnica i promień.
// Zapisuje je tylko w ciasteczku tej przeglądarki (zaokrąglone do ok. 1 km) i przeładowuje listę.

interface Props {
  near: Pick<Near, "label" | "radiusKm"> | null;
  /** Ile spotkań (przy obecnych filtrach) jest w każdym promieniu — do listy wyboru. */
  counts?: Partial<Record<number, number>> | null;
}

function save(near: Near | null) {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = near
    ? `${NEAR_COOKIE}=${encodeURIComponent(serializeNear(near))}; path=/; max-age=31536000; samesite=lax${secure}`
    : `${NEAR_COOKIE}=; path=/; max-age=0; samesite=lax${secure}`;
  // Nowy filtr = lista od początku (bez „Pokaż więcej”).
  const url = new URL(window.location.href);
  url.searchParams.delete("show");
  if (!near) url.searchParams.delete("sort");
  window.location.assign(url.toString());
}

function readCookie(): Near | null {
  const raw = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${NEAR_COOKIE}=`))
    ?.slice(NEAR_COOKIE.length + 1);
  if (!raw) return null;
  const [lat, lng, , label = ""] = decodeURIComponent(raw).split("|");
  return { lat: Number(lat), lng: Number(lng), radiusKm: DEFAULT_RADIUS_KM, label: decodeURIComponent(label) };
}

const chip = "inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold whitespace-nowrap";

function eventsWord(count: number): string {
  if (count === 1) return "spotkanie";
  const tens = count % 100;
  const ones = count % 10;
  return ones >= 2 && ones <= 4 && (tens < 12 || tens > 14) ? "spotkania" : "spotkań";
}

/** Wybór promienia: lista w stylu aplikacji z liczbą spotkań przy każdej odległości. */
function RadiusMenu({
  value,
  counts,
  onPick,
}: {
  value: number;
  counts: Partial<Record<number, number>> | null;
  onPick: (km: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Zamykanie: kliknięcie poza listą albo Esc.
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

  const count = (km: number) => counts?.[km] ?? 0;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="bg-page-deep text-page-ink hover:bg-page-2 inline-flex h-10 items-center gap-1.5 rounded-full pr-3 pl-4 text-sm font-bold transition-colors"
        data-testid="near-radius"
      >
        <span className="text-page-ink-2 font-semibold">w promieniu</span>
        {value} km
        {counts && (
          <span className="bg-brand text-on-brand rounded-full px-2 py-0.5 text-xs font-extrabold">{count(value)}</span>
        )}
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Promień — liczba spotkań w zasięgu"
          className="bg-card text-ink border-line absolute left-0 z-[1200] mt-2 w-60 rounded-2xl border p-1.5 shadow-xl"
        >
          {NEAR_RADII.map((km) => {
            const selected = km === value;
            const n = count(km);
            return (
              <li key={km} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (!selected) onPick(km);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                    selected ? "bg-ink text-card" : "hover:bg-card-2",
                  )}
                >
                  <span className="flex items-center gap-2 font-bold">
                    <Check className={cn("size-4", !selected && "invisible")} aria-hidden="true" />
                    {km} km
                  </span>
                  {counts && (
                    <span
                      className={cn(
                        "text-xs",
                        selected ? "text-card" : n === 0 ? "text-ink-3" : "text-ink-2",
                        n > 0 && "font-bold",
                      )}
                    >
                      {n === 0 ? "brak spotkań" : `${String(n)} ${eventsWord(n)}`}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function NearbyPicker({ near, counts }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceSuggestion[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  // Podpowiedzi okolicy po krótkiej przerwie w pisaniu.
  useEffect(() => {
    if (query.trim().length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/places/area?${new URLSearchParams({ q: query }).toString()}`, { signal: controller.signal })
        .then((r) => (r.ok ? (r.json() as Promise<{ hits: PlaceSuggestion[] }>) : { hits: [] }))
        .then((data) => {
          setHits(data.hits);
          setStatus(
            data.hits.length === 0 ? "Nic nie znaleźliśmy — spróbuj nazwy dzielnicy albo ulicy z miastem." : null,
          );
        })
        .catch(() => {
          // przerwane albo brak sieci — zostają poprzednie podpowiedzi
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const radius = near?.radiusKm ?? DEFAULT_RADIUS_KM;

  function useGps() {
    if (!("geolocation" in navigator)) {
      setStatus("Ta przeglądarka nie udostępnia lokalizacji — wpisz dzielnicę.");
      return;
    }
    setStatus("Sprawdzamy, gdzie jesteś…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        save({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          radiusKm: radius,
          label: "Twoja lokalizacja",
        });
      },
      () => {
        setStatus("Nie mamy dostępu do lokalizacji. Zezwól na nią w przeglądarce albo wpisz dzielnicę.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  }

  function choose(hit: PlaceSuggestion) {
    save({ lat: hit.lat, lng: hit.lng, radiusKm: radius, label: hit.title });
  }

  function setRadius(km: number) {
    const current = readCookie();
    if (current) save({ ...current, radiusKm: km });
  }

  return (
    <div className="mb-4" data-testid="nearby">
      {near && !open ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setOpen(true);
            }}
            className={cn(chip, "bg-card text-ink max-w-full")}
            title="Zmień okolicę"
          >
            <MapPin className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{near.label}</span>
          </button>
          <RadiusMenu value={near.radiusKm} counts={counts ?? null} onPick={setRadius} />
          <button
            type="button"
            onClick={() => {
              save(null);
            }}
            className="text-page-ink-2 hover:text-page-ink grid size-10 place-items-center rounded-full"
            aria-label="Wyłącz filtr „W pobliżu”"
            title="Pokaż spotkania z całego miasta"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : !open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
          }}
          className={cn(chip, "bg-page-2 text-page-ink hover:bg-page-deep")}
        >
          <MapPin className="size-4" aria-hidden="true" />
          Pokaż spotkania w pobliżu
        </button>
      ) : (
        <div className="bg-card text-ink rounded-[20px] p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-bold">Gdzie szukasz spotkań?</p>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
              }}
              className="text-ink-3 hover:text-ink -mt-1 -mr-1 grid size-8 place-items-center rounded-full"
              aria-label="Zamknij"
            >
              <X className="size-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={useGps}
            className="bg-brand text-on-brand hover:bg-brand-hover mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-extrabold tracking-wide uppercase"
          >
            <LocateFixed className="size-4" aria-hidden="true" />
            Użyj mojej lokalizacji
          </button>
          <label className="text-ink-2 mt-3 block text-sm">
            albo wpisz dzielnicę lub adres
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setStatus(null);
              }}
              placeholder="np. Mokotów, Warszawa"
              className="border-line-strong bg-card text-ink focus:ring-brand mt-1 w-full rounded-lg border px-3 py-2 focus:ring-2 focus:outline-none"
            />
          </label>
          {query.trim().length >= 3 && hits.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {hits.map((hit) => (
                <li key={`${String(hit.lat)},${String(hit.lng)}`}>
                  <button
                    type="button"
                    onClick={() => {
                      choose(hit);
                    }}
                    className="hover:bg-card-2 w-full rounded-xl px-3 py-2 text-left text-sm"
                  >
                    <span className="font-bold">{hit.title}</span>
                    {hit.subtitle && <span className="text-ink-3"> · {hit.subtitle}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {status && (
            <p className="text-ink-2 mt-2 text-xs" role="status">
              {status}
            </p>
          )}
          <p className="text-ink-3 mt-3 text-xs">
            Okolicę zapamiętamy tylko w tej przeglądarce, z dokładnością do ok. 1 km. Nie zapisujemy jej na serwerze.
          </p>
        </div>
      )}
    </div>
  );
}
