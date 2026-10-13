import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { readDevice } from "@/lib/device";
import {
  MESSAGE_MAX_LENGTH,
  chatErrorMessage,
  listGuestMessages,
  listMessages,
  postMessage,
  type ChatErrorCode,
} from "@/lib/services/chat";

export const prerender = false;

const idSchema = z.uuid();
const afterSchema = z.iso.datetime({ offset: true }).optional();
const bodySchema = z.object({ body: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH) });

const STATUS: Partial<Record<ChatErrorCode, number>> = {
  NOT_AUTHENTICATED: 401,
  NOT_MEMBER: 403,
  CHAT_CLOSED: 403,
  EVENT_NOT_FOUND: 404,
  RATE_LIMITED: 429,
};

function failure(code: ChatErrorCode) {
  return Response.json({ error: code, message: chatErrorMessage(code) }, { status: STATUS[code] ?? 400 });
}

// Wiadomości czatu wydarzenia; `after` zwraca tylko nowe i świeżo ukryte (odświeżanie).
// Gość bez konta z „Będę” czyta czat po identyfikatorze urządzenia.
export const GET: APIRoute = async (context) => {
  const device = context.locals.user ? null : readDevice(context.cookies);
  if (!context.locals.user && !device) return failure("NOT_AUTHENTICATED");
  const id = idSchema.safeParse(context.params.id);
  const after = afterSchema.safeParse(context.url.searchParams.get("after") ?? undefined);
  if (!id.success || !after.success) return Response.json({ error: "INVALID_DATA" }, { status: 400 });

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return failure("UNKNOWN");

  // Znacznik do następnego odświeżenia, z 5 s zakładki na różnicę zegarów serwera i bazy (duplikaty scala klient).
  const syncedAt = new Date(Date.now() - 5000).toISOString();
  const result = device
    ? await listGuestMessages(supabase, id.data, device, after.data)
    : await listMessages(supabase, id.data, after.data);
  if (!result.ok) return failure(result.code);
  return Response.json({ messages: result.data, syncedAt }, { headers: { "Cache-Control": "no-store" } });
};

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) return failure("NOT_AUTHENTICATED");
  const id = idSchema.safeParse(context.params.id);
  const body = bodySchema.safeParse(await context.request.json().catch(() => null));
  if (!id.success) return Response.json({ error: "INVALID_DATA" }, { status: 400 });
  if (!body.success) {
    return failure(body.error.issues[0]?.code === "too_big" ? "MESSAGE_TOO_LONG" : "MESSAGE_EMPTY");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return failure("UNKNOWN");

  const result = await postMessage(supabase, id.data, body.data.body);
  if (!result.ok) return failure(result.code);
  return Response.json({ id: result.data }, { status: 201 });
};
