// „W pobliżu”: okolica oglądającego (GPS albo wpisana dzielnica) i promień, w którym szuka spotkań.
// Trzymamy je tylko w ciasteczku przeglądarki, z dokładnością do ok. 1 km — nie zapisujemy ich na serwerze.

export const NEAR_COOKIE = "metando_near";
export const NEAR_RADII = [1, 2, 3, 5, 7, 10, 15, 20, 30, 50] as const;
export const MAX_RADIUS_KM = NEAR_RADII[NEAR_RADII.length - 1];
export const DEFAULT_RADIUS_KM = 5;
const LABEL_MAX = 60;

export interface Near {
  lat: number;
  lng: number;
  radiusKm: number;
  /** Nazwa okolicy do wyświetlenia („Ursus”, „Twoja lokalizacja”). */
  label: string;
}

/** Zaokrąglenie do 0,01° (ok. 1 km) — więcej nie potrzeba do filtra, a mniej zdradza. */
export function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

export function serializeNear(near: Near): string {
  const label = near.label.trim().slice(0, LABEL_MAX);
  return [roundCoord(near.lat), roundCoord(near.lng), near.radiusKm, encodeURIComponent(label)].join("|");
}

export function parseNear(value: string | null | undefined): Near | null {
  if (!value) return null;
  const [lat, lng, radius, label = ""] = value.split("|");
  const near = {
    lat: Number(lat),
    lng: Number(lng),
    radiusKm: Number(radius),
    label: (() => {
      try {
        return decodeURIComponent(label).slice(0, LABEL_MAX);
      } catch {
        return "";
      }
    })(),
  };
  if (!Number.isFinite(near.lat) || Math.abs(near.lat) > 90) return null;
  if (!Number.isFinite(near.lng) || Math.abs(near.lng) > 180) return null;
  if (!(NEAR_RADII as readonly number[]).includes(near.radiusKm)) return null;
  return { ...near, lat: roundCoord(near.lat), lng: roundCoord(near.lng), label: near.label || "Twoja okolica" };
}

const EARTH_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Odległość po powierzchni Ziemi (wzór haversine) w kilometrach. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Prostokąt obejmujący koło o promieniu `radiusKm` (do zawężenia zapytania w bazie), z zapasem
 * `marginDeg` na zaokrąglone współrzędne publicznego widoku.
 */
export function boundingBox(near: Near, marginDeg = 0.01) {
  const dLat = near.radiusKm / 111.32 + marginDeg;
  const dLng = near.radiusKm / (111.32 * Math.max(Math.cos(toRad(near.lat)), 0.01)) + marginDeg;
  return { minLat: near.lat - dLat, maxLat: near.lat + dLat, minLng: near.lng - dLng, maxLng: near.lng + dLng };
}

const decimal = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 });

/** „0,4 km”, „2,3 km”, „12 km” — dziesiąte części tylko poniżej 10 km. */
export function formatDistance(km: number): string {
  return `${km < 10 ? decimal.format(Math.max(km, 0.1)) : String(Math.round(km))} km`;
}
