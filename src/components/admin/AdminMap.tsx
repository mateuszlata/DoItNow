import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { DEFAULT_CENTER, TILE_ATTRIBUTION, TILE_URL, loadLeaflet } from "@/components/map/leaflet";

interface Props {
  pins: { lat: number; lng: number; sport: string }[];
}

/** Mapa spotkań z ostatnich 90 dni dla panelu administratora — każda kropka to jedno spotkanie. */
export default function AdminMap({ pins }: Props) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    void loadLeaflet().then((L) => {
      if (cancelled || !container.current) return;
      const map = L.map(container.current, { scrollWheelZoom: false }).setView(DEFAULT_CENTER, 6);
      L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
      const points = pins.map((p) =>
        L.circleMarker([p.lat, p.lng], {
          radius: 7,
          color: "#13261F",
          weight: 2,
          fillColor: "#FF7A1A",
          fillOpacity: 0.85,
        })
          .bindTooltip(p.sport)
          .addTo(map),
      );
      if (points.length > 0) map.fitBounds(L.featureGroup(points).getBounds(), { padding: [24, 24], maxZoom: 14 });
      destroy = () => map.remove();
    });
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [pins]);

  return (
    <div
      ref={container}
      className="isolate h-80 w-full rounded-2xl"
      role="region"
      aria-label="Mapa spotkań z ostatnich 90 dni"
    />
  );
}
