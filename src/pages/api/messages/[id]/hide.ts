import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { chatErrorMessage, hideMessage } from "@/lib/services/chat";

export const prerender = false;

// Ukrycie wiadomości: autor usuwa własną, organizator lub administrator ukrywa cudzą.
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) return Response.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  const id = z.uuid().safeParse(context.params.id);
  if (!id.success) return Response.json({ error: "INVALID_DATA" }, { status: 400 });

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return Response.json({ error: "UNKNOWN" }, { status: 500 });

  const result = await hideMessage(supabase, id.data);
  if (!result.ok) {
    return Response.json({ error: result.code, message: chatErrorMessage(result.code) }, { status: 403 });
  }
  return Response.json({ ok: true });
};
