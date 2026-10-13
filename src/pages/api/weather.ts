import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { toWeatherPoints, type OpenMeteoResponse } from "@/lib/weather";

export const prerender = false;

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const HOURLY = [
  "temperature_2m",
  "apparent_temperature",
  "precipitation_probability",
  "precipitation",
  "weather_code",
  "wind_speed_10m",
  "wind_gusts_10m",
  "is_day",
].join(",");
const USER_AGENT = "Metando/1.0 https://metando.pl";
const CACHE_SECONDS = 1800;

const querySchema = z.object({ event: z.uuid() });

interface Point {
  lat: number | null;
  lng: number | null;
}

interface EdgeCache {
  match(key: Request): Promise<Response | undefined>;
  put(key: Request, value: Response): Promise<void>;
}

/** Pamięć podręczna Cloudflare (w workerze); w innych środowiskach jej nie ma. */
function edgeCache(): EdgeCache | null {
  const caches = (globalThis as unknown as { caches?: { default?: EdgeCache } }).caches;
  return caches?.default ?? null;
}

// Prognoza dla nadchodzącego spotkania. Przyjmujemy id spotkania, a nie dowolne współrzędne — położenie bierzemy
// z bazy (dokładne dla zalogowanych, zaokrąglone z publicznego widoku dla gości), więc nie da się nami odpytywać
// Open-Meteo o dowolne miejsca. Współrzędne zaokrąglamy do 0,01° (ok. 1 km): spotkania w okolicy dzielą jedną
// odpowiedź z pamięci podręcznej.
export const GET: APIRoute = async (context) => {
  const parsed = querySchema.safeParse(Object.fromEntries(context.url.searchParams));
  if (!parsed.success) return Response.json({ error: "INVALID_DATA" }, { status: 400 });
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return Response.json({ points: [] }, { status: 503 });

  const row = context.locals.user
    ? await supabase.from("events").select("lat, lng").eq("id", parsed.data.event).maybeSingle<Point>()
    : await supabase
        .from("events_public")
        .select("lat:approx_lat, lng:approx_lng")
        .eq("id", parsed.data.event)
        .maybeSingle<Point>();
  const point = row.data;
  if (point?.lat == null || point.lng == null) return Response.json({ points: [] }, { status: 404 });
  const lat = point.lat.toFixed(2);
  const lng = point.lng.toFixed(2);

  const cache = edgeCache();
  const key = new Request(`https://metando.pl/__weather/v2/${lat},${lng}`);
  const cached = await cache?.match(key).catch(() => undefined);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({
      latitude: lat,
      longitude: lng,
      hourly: HOURLY,
      forecast_days: "16",
      timezone: "UTC",
      wind_speed_unit: "ms",
    });
    const upstream = await fetch(`${FORECAST_URL}?${params.toString()}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!upstream.ok) return Response.json({ points: [] }, { status: 502 });
    const points = toWeatherPoints((await upstream.json()) as OpenMeteoResponse);
    const response = Response.json(
      { points },
      { headers: { "Cache-Control": `public, max-age=${String(CACHE_SECONDS)}` } },
    );
    await cache?.put(key, response.clone()).catch(() => undefined);
    return response;
  } catch {
    return Response.json({ points: [] }, { status: 502 });
  }
};
