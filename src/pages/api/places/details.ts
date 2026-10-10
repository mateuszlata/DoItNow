import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { GOOGLE_MAPS_API_KEY } from "astro:env/server";
import { createClient } from "@/lib/supabase";
import { placeDetails } from "@/lib/services/places";

export const prerender = false;

const querySchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{10,300}$/),
  session: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
});

// Współrzędne i adres miejsca wybranego z podpowiedzi Google.
export const GET: APIRoute = async (context) => {
  if (!context.locals.user) return Response.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  const parsed = querySchema.safeParse(Object.fromEntries(context.url.searchParams));
  if (!parsed.success) return Response.json({ error: "INVALID_DATA" }, { status: 400 });

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return Response.json({ error: "NO_DATABASE" }, { status: 500 });

  const result = await placeDetails(supabase, GOOGLE_MAPS_API_KEY, parsed.data.id, parsed.data.session);
  return Response.json(result, { status: result.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
};
