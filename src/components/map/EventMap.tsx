import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { TILE_ATTRIBUTION, TILE_URL, loadLeaflet, pinIcon } from "@/components/map/leaflet";

interface Props {
  lat: number;
  lng: number;
  label: string;
}

/** Mapa tylko do odczytu z pinezką miejsca spotkania. */
export default function EventMap({ lat, lng, label }: Props) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    void loadLeaflet().then((L) => {
      if (cancelled || !container.current) return;
      const map = L.map(container.current, { scrollWheelZoom: false }).setView([lat, lng], 15);
      L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
      L.marker([lat, lng], { icon: pinIcon(L), title: label }).addTo(map);
      destroy = () => map.remove();
    });
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [lat, lng, label]);

  return (
    <div
      ref={container}
      className="h-56 w-full overflow-hidden rounded-lg"
      role="region"
      aria-label={`Mapa: ${label}`}
      data-testid="event-map"
    />
  );
}
