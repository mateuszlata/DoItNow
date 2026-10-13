import { useEffect, useState } from "react";
import { ChevronDown, LocateFixed, MapPin, X } from "lucide-react";
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
          <label className="bg-page-deep text-page-ink relative inline-flex h-10 items-center rounded-full pr-9 pl-4 text-sm font-bold">
            <span className="text-page-ink-2 mr-1.5 font-semibold">w promieniu</span>
            <select
              value={near.radiusKm}
              onChange={(e) => {
                setRadius(Number(e.target.value));
              }}
              aria-label="Promień — w nawiasie liczba spotkań"
              className="absolute inset-0 cursor-pointer opacity-0"
              data-testid="near-radius"
            >
              {NEAR_RADII.map((km) => (
                <option key={km} value={km}>
                  {km} km{counts ? ` (${String(counts[km] ?? 0)})` : ""}
                </option>
              ))}
            </select>
            <span aria-hidden="true">
              {near.radiusKm} km{counts ? ` (${String(counts[near.radiusKm] ?? 0)})` : ""}
            </span>
            <ChevronDown className="pointer-events-none absolute right-3 size-4" aria-hidden="true" />
          </label>
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
