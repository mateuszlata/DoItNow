import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { searchPlaces } from "@/lib/geocode";
import { DEFAULT_CENTER } from "@/components/map/leaflet";

export const prerender = false;

const querySchema = z.object({ q: z.string().trim().min(3).max(80) });

// Okolica dla filtra „W pobliżu” (dzielnica, osiedle, adres). Tylko OpenStreetMap (Photon) — bez puli Google,
// więc dostępne także bez logowania.
export const GET: APIRoute = async (context) => {
  const parsed = querySchema.safeParse(Object.fromEntries(context.url.searchParams));
  if (!parsed.success) return Response.json({ error: "INVALID_DATA" }, { status: 400 });
  const hits = await searchPlaces(parsed.data.q, { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] }).catch(() => []);
  return Response.json({ hits }, { headers: { "Cache-Control": "public, max-age=3600" } });
};
