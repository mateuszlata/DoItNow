import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { eventVersion } from "@/lib/services/live";

export const prerender = false;

// Odcisk stanu spotkania do odświeżania na żywo (strona pyta co kilkanaście sekund, gdy karta jest widoczna).
export const GET: APIRoute = async (context) => {
  const id = z.uuid().safeParse(context.params.id);
  if (!id.success) return Response.json({ error: "INVALID_DATA" }, { status: 400 });
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return Response.json({ error: "UNKNOWN" }, { status: 500 });

  const version = await eventVersion(supabase, id.data, Boolean(context.locals.user));
  return Response.json({ version }, { headers: { "Cache-Control": "no-store" } });
};
