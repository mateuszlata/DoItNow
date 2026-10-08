import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { DEFAULT_CENTER, TILE_ATTRIBUTION, TILE_URL, loadLeaflet, pinIcon } from "@/components/map/leaflet";

interface Props {
  /** Wartości z formularza (puste, gdy brak pinezki). */
  initialLat: string;
  initialLng: string;
}

function parse(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Wybór miejsca spotkania na mapie: kliknięcie stawia pinezkę, którą można przeciągnąć albo usunąć.
 * Współrzędne trafiają do ukrytych pól `lat` i `lng` formularza.
 */
export default function MapPicker({ initialLat, initialLng }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const marker = useRef<Leaflet.Marker | null>(null);
  const initial = parse(initialLat) !== null && parse(initialLng) !== null;
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(
    initial ? { lat: Number(initialLat), lng: Number(initialLng) } : null,
  );

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    void loadLeaflet().then((L) => {
      if (cancelled || !container.current) return;
      const start = point ? ([point.lat, point.lng] as [number, number]) : DEFAULT_CENTER;
      const map = L.map(container.current).setView(start, point ? 15 : 11);
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

      if (point) place(point.lat, point.lng);
      map.on("click", (e: Leaflet.LeafletMouseEvent) => {
        place(e.latlng.lat, e.latlng.lng);
      });
      destroy = () => {
        marker.current = null;
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

  function clear() {
    marker.current?.remove();
    marker.current = null;
    setPoint(null);
  }

  return (
    <div>
      <div
        ref={container}
        className="h-64 w-full overflow-hidden rounded-lg border border-white/20"
        role="application"
        aria-label="Mapa: kliknij, aby zaznaczyć miejsce spotkania"
        data-testid="map-picker"
      />
      <input type="hidden" name="lat" value={point ? String(point.lat) : ""} />
      <input type="hidden" name="lng" value={point ? String(point.lng) : ""} />
      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-blue-100/60">
        <span>
          {point
            ? "Pinezka ustawiona — możesz ją przeciągnąć."
            : "Kliknij na mapie, aby zaznaczyć miejsce (opcjonalnie)."}
        </span>
        {point && (
          <button type="button" onClick={clear} className="text-purple-300 hover:underline">
            Usuń pinezkę
          </button>
        )}
      </div>
    </div>
  );
}
