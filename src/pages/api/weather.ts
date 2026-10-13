import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { toWeatherPoints, type MetResponse } from "@/lib/weather";

export const prerender = false;

const MET_URL = "https://api.met.no/weatherapi/locationforecast/2.0/compact";
// MET Norway wymaga przedstawienia się w nagłówku User-Agent (nazwa i adres serwisu).
const USER_AGENT = "Metando/1.0 https://metando.pl";
const CACHE_SECONDS = 1800;

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

interface EdgeCache {
  match(key: Request): Promise<Response | undefined>;
  put(key: Request, value: Response): Promise<void>;
}

/** Pamięć podręczna Cloudflare (w workerze); w innych środowiskach jej nie ma. */
function edgeCache(): EdgeCache | null {
  const caches = (globalThis as unknown as { caches?: { default?: EdgeCache } }).caches;
  return caches?.default ?? null;
}

// Prognoza dla okolicy spotkania. Współrzędne zaokrąglamy do 0,01° (ok. 1 km) — wystarczy dla pogody,
// a wiele spotkań w okolicy dzieli jedną odpowiedź z pamięci podręcznej (MET prosi o ograniczanie zapytań).
export const GET: APIRoute = async (context) => {
  const parsed = querySchema.safeParse(Object.fromEntries(context.url.searchParams));
  if (!parsed.success) return Response.json({ error: "INVALID_DATA" }, { status: 400 });
  const lat = parsed.data.lat.toFixed(2);
  const lng = parsed.data.lng.toFixed(2);

  const cache = edgeCache();
  const key = new Request(`https://metando.pl/__weather/${lat},${lng}`);
  const cached = await cache?.match(key).catch(() => undefined);
  if (cached) return cached;

  try {
    const upstream = await fetch(`${MET_URL}?lat=${lat}&lon=${lng}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!upstream.ok) return Response.json({ points: [] }, { status: 502 });
    const points = toWeatherPoints((await upstream.json()) as MetResponse);
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
