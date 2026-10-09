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

/**
 * Pinezka Metando: pomarańczowa kropla z ciemną obwódką i kropką (projekt D2), rysowana w HTML —
 * bez obrazków znaczników, które gubią ścieżki po zbudowaniu aplikacji.
 */
export function pinIcon(L: typeof Leaflet): Leaflet.DivIcon {
  return L.divIcon({
    html:
      '<span style="display:grid;place-items:center;width:34px;height:34px;border-radius:99px 99px 99px 5px;' +
      'transform:rotate(-45deg);background:#FF7A1A;box-shadow:0 0 0 3px #13261F,0 4px 10px rgb(0 0 0 / 0.35)">' +
      '<span style="width:11px;height:11px;border-radius:99px;background:#13261F"></span></span>',
    className: "",
    iconSize: [34, 34],
    // Czubek kropli (lewy dolny róg przed obrotem) wskazuje miejsce.
    iconAnchor: [17, 41],
  });
}
