import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { GOOGLE_MAPS_API_KEY } from "astro:env/server";
import { createClient } from "@/lib/supabase";
import { searchPlaces } from "@/lib/services/places";
import { DEFAULT_CENTER } from "@/components/map/leaflet";

export const prerender = false;

const querySchema = z.object({
  q: z.string().trim().min(1).max(120),
  lat: z.coerce.number().min(-90).max(90).default(DEFAULT_CENTER[0]),
  lng: z.coerce.number().min(-180).max(180).default(DEFAULT_CENTER[1]),
  session: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  // Okolica szukającego — do odległości przy podpowiedziach (opcjonalnie).
  olat: z.coerce.number().min(-90).max(90).optional(),
  olng: z.coerce.number().min(-180).max(180).optional(),
});

// Podpowiedzi adresów i obiektów dla formularzy (tylko zalogowani — chroni darmową pulę Google).
export const GET: APIRoute = async (context) => {
  if (!context.locals.user) return Response.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  const params = Object.fromEntries(context.url.searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) return Response.json({ error: "INVALID_DATA" }, { status: 400 });

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return Response.json({ error: "NO_DATABASE" }, { status: 500 });

  const { q, lat, lng, session, olat, olng } = parsed.data;
  const origin = olat !== undefined && olng !== undefined ? { lat: olat, lng: olng } : null;
  const result = await searchPlaces(supabase, GOOGLE_MAPS_API_KEY, q, { lat, lng }, session, origin);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
};
