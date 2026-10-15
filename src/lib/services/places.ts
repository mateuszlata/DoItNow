// Wyszukiwanie adresów i obiektów: Google Places (New) przez nasz serwer, w ramach darmowej puli
// pilnowanej budżetem kroczącym w bazie (consume_places_quota); po wyczerpaniu przydziału, bez klucza
// albo przy błędzie Google — Photon (OpenStreetMap). Klucz Google nigdy nie trafia do przeglądarki.
import type { SupabaseClient } from "@supabase/supabase-js";
import { searchPlaces as searchPhoton } from "@/lib/geocode";
import { distanceKm } from "@/lib/near";

/** Darmowa pula Google na miesiąc z marginesem (10 000 zapytań, liczymy do 9 500). */
export const PLACES_MONTHLY_LIMIT = 9500;
/** Limit zapytań do Google na jednego użytkownika na godzinę. */
export const PLACES_USER_HOURLY_LIMIT = 60;

const GOOGLE_URL = "https://places.googleapis.com/v1";

export interface PlaceHit {
  /** Identyfikator miejsca Google albo `osm:<lat>,<lng>` dla wyników OpenStreetMap. */
  id: string;
  title: string;
  subtitle: string;
  /** Współrzędne są od razu tylko w wynikach OpenStreetMap; dla Google pobiera je `placeDetails`. */
  lat?: number;
  lng?: number;
  /** Odległość od okolicy szukającego (`origin`) w km — odróżnia miejscowości o tej samej nazwie. */
  distanceKm?: number;
}

export interface PlaceSearchResult {
  source: "google" | "osm";
  hits: PlaceHit[];
}

type QuotaResult = "ok" | "daily" | "user";

async function consume(supabase: SupabaseClient, api: "autocomplete" | "details"): Promise<QuotaResult> {
  const response = await supabase.rpc("consume_places_quota", {
    p_api: api,
    p_monthly_limit: PLACES_MONTHLY_LIMIT,
    p_user_hourly_limit: PLACES_USER_HOURLY_LIMIT,
  });
  // Błąd licznika traktujemy jak wyczerpany przydział: wtedy szukamy w OpenStreetMap.
  if (response.error) return "daily";
  const result: unknown = response.data;
  return result === "ok" || result === "user" ? result : "daily";
}

async function osm(
  query: string,
  near: { lat: number; lng: number },
  origin: { lat: number; lng: number } | null,
): Promise<PlaceSearchResult> {
  // OpenStreetMap zwraca czasem tę samą ulicę kilka razy (osobne odcinki) — zostawiamy jedną.
  const found = (await searchPhoton(query, near).catch(() => [])).filter(
    (s, i, all) => all.findIndex((o) => o.title === s.title && o.subtitle === s.subtitle) === i,
  );
  return {
    source: "osm",
    hits: found.map((s) => ({
      id: `osm:${String(s.lat)},${String(s.lng)}`,
      ...s,
      ...(origin ? { distanceKm: Math.round(distanceKm(origin, s)) } : {}),
    })),
  };
}

interface GoogleAutocomplete {
  suggestions?: {
    placePrediction?: {
      placeId: string;
      structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } };
      text?: { text: string };
      distanceMeters?: number;
    };
  }[];
}

/** Podpowiedzi dla wpisanego tekstu, najpierw z okolic `near`; z `origin` — z odległością od niego. */
export async function searchPlaces(
  supabase: SupabaseClient,
  apiKey: string | undefined,
  query: string,
  near: { lat: number; lng: number },
  sessionToken: string,
  origin: { lat: number; lng: number } | null = null,
): Promise<PlaceSearchResult> {
  const q = query.trim();
  if (q.length < 3) return { source: apiKey ? "google" : "osm", hits: [] };
  if (!apiKey || (await consume(supabase, "autocomplete")) !== "ok") return osm(q, near, origin);

  const response = await fetch(`${GOOGLE_URL}/places:autocomplete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
    body: JSON.stringify({
      input: q,
      sessionToken,
      languageCode: "pl",
      regionCode: "pl",
      includedRegionCodes: ["pl"],
      locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 50000 } },
      ...(origin ? { origin: { latitude: origin.lat, longitude: origin.lng } } : {}),
    }),
  }).catch(() => null);
  if (!response?.ok) return osm(q, near, origin);

  const data = (await response.json()) as GoogleAutocomplete;
  const hits = (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .slice(0, 5)
    .map((p) => ({
      id: p.placeId,
      title: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "Bez nazwy",
      subtitle: p.structuredFormat?.secondaryText?.text ?? "",
      ...(p.distanceMeters !== undefined ? { distanceKm: Math.round(p.distanceMeters / 1000) } : {}),
    }));
  return { source: "google", hits };
}

/** Współrzędne i adres wybranego miejsca Google (Place Details Essentials, kończy sesję podpowiedzi). */
export async function placeDetails(
  supabase: SupabaseClient,
  apiKey: string | undefined,
  placeId: string,
  sessionToken: string,
): Promise<{ ok: true; lat: number; lng: number; address: string } | { ok: false; reason: "quota" | "error" }> {
  if (!apiKey || !/^[A-Za-z0-9_-]{10,300}$/.test(placeId)) return { ok: false, reason: "error" };
  if ((await consume(supabase, "details")) !== "ok") return { ok: false, reason: "quota" };
  const params = new URLSearchParams({ sessionToken, languageCode: "pl", regionCode: "pl" });
  const response = await fetch(`${GOOGLE_URL}/places/${placeId}?${params.toString()}`, {
    headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "location,formattedAddress" },
  }).catch(() => null);
  if (!response?.ok) return { ok: false, reason: "error" };
  const data = (await response.json()) as {
    location?: { latitude: number; longitude: number };
    formattedAddress?: string;
  };
  if (!data.location) return { ok: false, reason: "error" };
  return {
    ok: true,
    lat: data.location.latitude,
    lng: data.location.longitude,
    address: (data.formattedAddress ?? "").replace(/, Polska$/, ""),
  };
}

export interface QuotaStats {
  api: "autocomplete" | "details";
  used_month: number;
  used_today: number;
  allowed_today: number;
  days_left: number;
}

export async function quotaStats(supabase: SupabaseClient): Promise<QuotaStats[]> {
  const response = await supabase.rpc("places_quota_stats", { p_monthly_limit: PLACES_MONTHLY_LIMIT });
  if (response.error) throw new Error(`Nie udało się pobrać statystyk: ${response.error.message}`);
  const rows: unknown = response.data;
  return rows as QuotaStats[];
}
