// Podpowiedzi adresów w formularzu ogłoszenia: Photon (komoot) — darmowe wyszukiwanie po danych
// OpenStreetMap, bez klucza API, przeznaczone do autouzupełniania (Nominatim tego zabrania).
const PHOTON_URL = "https://photon.komoot.io/api/";
/** Granice Polski (lon/lat): podpowiedzi spoza kraju nie mają sensu dla spotkań w mieście. */
const POLAND_BBOX = "14.07,49.0,24.15,54.84";

export interface PlaceSuggestion {
  /** Główna nazwa: obiekt („Orlik przy SP 12”) albo ulica z numerem. */
  title: string;
  /** Doprecyzowanie: ulica, dzielnica, miasto. */
  subtitle: string;
  lat: number;
  lng: number;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    district?: string;
    locality?: string;
    city?: string;
    county?: string;
    state?: string;
  };
}

/** Zamienia wynik Photona na podpowiedź z czytelnym tytułem i podtytułem. */
export function toSuggestion(feature: PhotonFeature): PlaceSuggestion {
  const p = feature.properties;
  const street = [p.street, p.housenumber].filter(Boolean).join(" ");
  const title = p.name ?? (street !== "" ? street : (p.city ?? p.county ?? "Bez nazwy"));
  const subtitle = [p.name ? street : "", p.district ?? p.locality, p.city, p.county, p.state]
    .filter((part): part is string => Boolean(part) && part !== title)
    .filter((part, i, all) => all.indexOf(part) === i)
    .join(", ");
  const [lng, lat] = feature.geometry.coordinates;
  return { title, subtitle, lat, lng };
}

/**
 * Do 5 podpowiedzi dla wpisanego tekstu, najpierw z okolic `near` (środek widocznej mapy).
 * Zwraca pustą listę przy krótkim zapytaniu albo błędzie sieci.
 */
export async function searchPlaces(
  query: string,
  near: { lat: number; lng: number },
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const params = new URLSearchParams({
    q,
    limit: "5",
    lat: near.lat.toFixed(4),
    lon: near.lng.toFixed(4),
    bbox: POLAND_BBOX,
  });
  const response = await fetch(`${PHOTON_URL}?${params.toString()}`, { signal });
  if (!response.ok) return [];
  const data = (await response.json()) as { features?: PhotonFeature[] };
  return (data.features ?? []).map(toSuggestion);
}
