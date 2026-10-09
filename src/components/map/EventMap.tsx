import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { TILE_ATTRIBUTION, TILE_URL, loadLeaflet, pinIcon } from "@/components/map/leaflet";

interface Props {
  lat: number;
  lng: number;
  label: string;
  /** Podgląd na karcie listy: niższy, bez przesuwania i przybliżania. */
  preview?: boolean;
}

/** Mapa tylko do odczytu z pinezką miejsca spotkania. */
export default function EventMap({ lat, lng, label, preview = false }: Props) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    void loadLeaflet().then((L) => {
      if (cancelled || !container.current) return;
      const map = L.map(container.current, {
        scrollWheelZoom: false,
        ...(preview && {
          dragging: false,
          zoomControl: false,
          touchZoom: false,
          doubleClickZoom: false,
          boxZoom: false,
          keyboard: false,
        }),
      }).setView([lat, lng], preview ? 15 : 16);
      L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
      L.marker([lat, lng], { icon: pinIcon(L), title: label }).addTo(map);
      destroy = () => map.remove();
    });
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [lat, lng, label, preview]);

  return (
    <div
      ref={container}
      className={preview ? "isolate h-36 w-full" : "isolate h-56 w-full"}
      role="region"
      aria-label={`Mapa: ${label}`}
      data-testid="event-map"
    />
  );
}
