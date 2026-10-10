import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { chatErrorMessage, reportMessage } from "@/lib/services/chat";

export const prerender = false;

const bodySchema = z.object({ reason: z.string().trim().max(500).optional() });

// Zgłoszenie wiadomości do moderacji.
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) return Response.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  const id = z.uuid().safeParse(context.params.id);
  const body = bodySchema.safeParse((await context.request.json().catch(() => ({}))) ?? {});
  if (!id.success || !body.success) return Response.json({ error: "INVALID_DATA" }, { status: 400 });

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return Response.json({ error: "UNKNOWN" }, { status: 500 });

  const result = await reportMessage(supabase, id.data, body.data.reason);
  if (!result.ok) {
    return Response.json({ error: result.code, message: chatErrorMessage(result.code) }, { status: 403 });
  }
  return Response.json({ ok: true });
};
