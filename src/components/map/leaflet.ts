import type * as Leaflet from "leaflet";

// Mapy OpenStreetMap: bez klucza API, wymagają podpisu z prawami autorskimi.
export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** Domyślny widok mapy w formularzu, gdy nie ma jeszcze pinezki (Warszawa). */
export const DEFAULT_CENTER: [number, number] = [52.2297, 21.0122];

/** Leaflet odwołuje się do `window`, więc ładujemy go dopiero w przeglądarce. */
export async function loadLeaflet(): Promise<typeof Leaflet> {
  const module = await import("leaflet");
  return module.default;
}

/** Pinezka jako emoji — bez obrazków znaczników, które gubią ścieżki po zbudowaniu aplikacji. */
export function pinIcon(L: typeof Leaflet): Leaflet.DivIcon {
  return L.divIcon({
    html: '<span style="font-size:32px;line-height:1">📍</span>',
    className: "",
    iconSize: [32, 32],
    iconAnchor: [16, 30],
  });
}
