import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { inviteErrorMessage, setMyInvites } from "@/lib/services/invites";

export const prerender = false;

const bodySchema = z.object({ count: z.number().int().min(0).max(49) });

// Gracz ze składu ustawia, ilu znajomych spoza Metando zaprasza (rezerwuje lub zwalnia miejsca).
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) return Response.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  const id = z.uuid().safeParse(context.params.id);
  const body = bodySchema.safeParse(await context.request.json().catch(() => null));
  if (!id.success || !body.success) {
    return Response.json({ error: "INVALID_COUNT", message: inviteErrorMessage("INVALID_COUNT") }, { status: 400 });
  }
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return Response.json({ error: "UNKNOWN" }, { status: 500 });

  const result = await setMyInvites(supabase, id.data, body.data.count);
  if (!result.ok) {
    return Response.json({ error: result.code, message: inviteErrorMessage(result.code) }, { status: 409 });
  }
  return Response.json({ token: result.token, url: `${context.url.origin}/i/${result.token}` });
};
