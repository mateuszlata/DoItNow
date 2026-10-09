import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { DEFAULT_CENTER, TILE_ATTRIBUTION, TILE_URL, loadLeaflet, pinIcon } from "@/components/map/leaflet";
import { searchPlaces, type PlaceSuggestion } from "@/lib/geocode";

interface Props {
  /** Wartości z formularza (puste, gdy brak pinezki). */
  initialLat: string;
  initialLng: string;
  /** Pole formularza, w które wpisuje się wybrany adres, gdy jest puste. */
  fillField?: string;
}

function parse(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Wybór miejsca spotkania: wyszukiwarka adresów z podpowiedziami (jak w mapach Google) albo kliknięcie
 * w mapę stawia pinezkę, którą można przeciągnąć lub usunąć. Współrzędne trafiają do ukrytych pól
 * `lat` i `lng` formularza; wybrany adres wpisuje się w puste pole „Dokładne miejsce”.
 */
export default function MapPicker({ initialLat, initialLng, fillField = "place" }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const marker = useRef<Leaflet.Marker | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const placeRef = useRef<((lat: number, lng: number) => void) | null>(null);
  // Tekst wybranej podpowiedzi — po wyborze nie szukamy go ponownie.
  const [chosen, setChosen] = useState<string | null>(null);
  const initial = parse(initialLat) !== null && parse(initialLng) !== null;
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(
    initial ? { lat: Number(initialLat), lng: Number(initialLng) } : null,
  );

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    void loadLeaflet().then((L) => {
      if (cancelled || !container.current) return;
      const start = point ? ([point.lat, point.lng] as [number, number]) : DEFAULT_CENTER;
      const map = L.map(container.current).setView(start, point ? 15 : 11);
      mapRef.current = map;
      L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);

      const place = (lat: number, lng: number) => {
        const rounded = { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
        if (marker.current) {
          marker.current.setLatLng([rounded.lat, rounded.lng]);
        } else {
          marker.current = L.marker([rounded.lat, rounded.lng], { icon: pinIcon(L), draggable: true }).addTo(map);
          marker.current.on("dragend", () => {
            const pos = marker.current?.getLatLng();
            if (pos) place(pos.lat, pos.lng);
          });
        }
        setPoint(rounded);
      };
      placeRef.current = place;

      if (point) place(point.lat, point.lng);
      map.on("click", (e: Leaflet.LeafletMouseEvent) => {
        place(e.latlng.lat, e.latlng.lng);
      });
      destroy = () => {
        marker.current = null;
        mapRef.current = null;
        placeRef.current = null;
        map.remove();
      };
    });
    return () => {
      cancelled = true;
      destroy?.();
    };
    // Mapę tworzymy raz; dalsze zmiany pinezki obsługuje sam Leaflet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Podpowiedzi po krótkiej przerwie w pisaniu; poprzednie zapytanie jest anulowane.
  useEffect(() => {
    if (query.trim().length < 3 || query === chosen) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const center = mapRef.current?.getCenter() ?? { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] };
      setSearching(true);
      searchPlaces(query, center, controller.signal)
        .then((found) => {
          setSuggestions(found);
          setActive(-1);
          setOpen(true);
        })
        .catch(() => {
          // Przerwane albo nieudane wyszukiwanie — zostają dotychczasowe podpowiedzi.
        })
        .finally(() => {
          setSearching(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, chosen]);

  // Przy krótkim zapytaniu nie pokazujemy starych podpowiedzi.
  const shown = query.trim().length >= 3 && query !== chosen ? suggestions : [];

  function choose(suggestion: PlaceSuggestion) {
    placeRef.current?.(suggestion.lat, suggestion.lng);
    mapRef.current?.setView([suggestion.lat, suggestion.lng], 17);
    const label = [suggestion.title, suggestion.subtitle].filter(Boolean).join(", ");
    setChosen(label);
    setQuery(label);
    setOpen(false);
    setSuggestions([]);
    // Puste pole „Dokładne miejsce” wypełniamy wybranym adresem.
    const form = container.current?.closest("form");
    const placeField = form?.elements.namedItem(fillField);
    if (placeField instanceof HTMLInputElement && placeField.value.trim() === "") {
      placeField.value = [suggestion.title, suggestion.subtitle.split(", ")[0]].filter(Boolean).join(", ");
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      // Enter w wyszukiwarce nie wysyła formularza ogłoszenia.
      e.preventDefault();
      if (open && shown.length > 0) choose(shown[active >= 0 ? active : 0]);
    } else if (e.key === "ArrowDown" && shown.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % shown.length);
    } else if (e.key === "ArrowUp" && shown.length > 0) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? shown.length - 1 : i - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function clear() {
    marker.current?.remove();
    marker.current = null;
    setPoint(null);
  }

  const showList = open && shown.length > 0;

  return (
    <div>
      <div className="relative mb-2">
        <label htmlFor="place-search" className="sr-only">
          Szukaj adresu lub miejsca
        </label>
        <input
          id="place-search"
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => {
            setOpen(true);
          }}
          onBlur={() => {
            // Opóźnienie, żeby kliknięcie w podpowiedź zdążyło zadziałać.
            setTimeout(() => {
              setOpen(false);
            }, 150);
          }}
          placeholder="Adres lub miejsce, np. Raszyńska 8 Warszawa"
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls="place-suggestions"
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `place-option-${String(active)}` : undefined}
          className="border-line-strong bg-card text-ink placeholder:text-ink-3 focus:ring-brand w-full rounded-full border py-2 pr-4 pl-10 text-sm focus:ring-2 focus:outline-none"
          data-testid="place-search"
        />
        <svg
          className="text-ink-3 pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM16 16l5 5" />
        </svg>
        {showList && (
          <ul
            id="place-suggestions"
            role="listbox"
            className="border-line bg-card absolute inset-x-0 top-full z-[1100] mt-1 overflow-hidden rounded-2xl border shadow-lg"
          >
            {shown.map((s, i) => (
              <li
                key={`${String(s.lat)},${String(s.lng)},${String(i)}`}
                id={`place-option-${String(i)}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(s);
                }}
                className={`cursor-pointer px-4 py-2.5 text-sm ${i === active ? "bg-card-2" : "hover:bg-card-2"}`}
              >
                <span className="text-ink block font-semibold">{s.title}</span>
                {s.subtitle && <span className="text-ink-3 block text-xs">{s.subtitle}</span>}
              </li>
            ))}
          </ul>
        )}
        {open && !searching && query.trim().length >= 3 && shown.length === 0 && (
          <p className="text-ink-3 mt-1 px-4 text-xs">Brak podpowiedzi — zaznacz miejsce kliknięciem w mapę.</p>
        )}
      </div>
      <div
        ref={container}
        className="border-line-strong isolate h-64 w-full overflow-hidden rounded-lg border"
        role="application"
        aria-label="Mapa: kliknij, aby zaznaczyć miejsce spotkania"
        data-testid="map-picker"
      />
      <input type="hidden" name="lat" value={point ? String(point.lat) : ""} />
      <input type="hidden" name="lng" value={point ? String(point.lng) : ""} />
      <div className="text-ink-3 mt-1 flex items-center justify-between gap-2 text-xs">
        <span>
          {point
            ? "Pinezka ustawiona — możesz ją przeciągnąć."
            : "Wyszukaj adres albo kliknij na mapie, aby zaznaczyć miejsce."}
        </span>
        {point && (
          <button type="button" onClick={clear} className="text-link hover:underline">
            Usuń pinezkę
          </button>
        )}
      </div>
      <p className="text-ink-3 mt-0.5 text-[11px]">Podpowiedzi adresów: Photon (komoot), dane © OpenStreetMap.</p>
    </div>
  );
}
