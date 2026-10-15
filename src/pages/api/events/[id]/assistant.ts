import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { ANTHROPIC_API_KEY } from "astro:env/server";
import { createClient } from "@/lib/supabase";
import { ASSISTANT_QUESTION_MAX, askAssistant, eventContext, type AssistantEvent } from "@/lib/assistant";
import { listQuestions } from "@/lib/services/questions";

export const prerender = false;

const idSchema = z.uuid();
const bodySchema = z.object({ question: z.string().trim().min(3).max(ASSISTANT_QUESTION_MAX) });

// Kolumny widoczne dla pytającego: zalogowany widzi także dokładne miejsce, opis i link do trasy.
const PUBLIC_COLUMNS =
  "sport, area, starts_at, duration_minutes, spots, organizer_plays, guest_count, accepted_count, reserve_spots, reserve_count, min_people, requires_approval, cost_cents, level_min, level_max, route_destination, route_loop, route_distance_km, route_pace";
const MEMBER_COLUMNS = `${PUBLIC_COLUMNS}, status, place, description, route_url`;

function failure(error: string, message: string, status: number) {
  return Response.json({ error, message }, { status, headers: { "Cache-Control": "no-store" } });
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Pytanie do asystenta AI przy spotkaniu. Limity (osoba, adres IP, cały serwis) liczy baza.
export const POST: APIRoute = async (context) => {
  if (!ANTHROPIC_API_KEY) return failure("UNAVAILABLE", "Asystent jest chwilowo niedostępny.", 503);
  const id = idSchema.safeParse(context.params.id);
  const body = bodySchema.safeParse(await context.request.json().catch(() => null));
  if (!id.success) return failure("INVALID_DATA", "Nie znaleziono spotkania.", 400);
  if (!body.success) {
    return failure("INVALID_DATA", `Zadaj pytanie w 3–${String(ASSISTANT_QUESTION_MAX)} znakach.`, 400);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return failure("UNAVAILABLE", "Asystent jest chwilowo niedostępny.", 503);

  const ip = context.request.headers.get("CF-Connecting-IP") ?? context.clientAddress;
  const quota = await supabase.rpc("consume_assistant_quota", { p_ip_hash: await sha256(ip) });
  if (quota.error) return failure("UNAVAILABLE", "Asystent jest chwilowo niedostępny.", 503);
  if (quota.data === "user") {
    return failure(
      "LIMIT",
      context.locals.user
        ? "Na dziś wykorzystano limit pytań do asystenta. Zapytaj organizatora."
        : "Na dziś wykorzystano limit pytań bez konta. Zaloguj się albo zapytaj organizatora.",
      429,
    );
  }
  if (quota.data !== "ok") return failure("LIMIT", "Asystent ma dziś przerwę. Zapytaj organizatora.", 429);

  const row = context.locals.user
    ? await supabase.from("events").select(MEMBER_COLUMNS).eq("id", id.data).maybeSingle<AssistantEvent>()
    : await supabase.from("events_public").select(PUBLIC_COLUMNS).eq("id", id.data).maybeSingle<AssistantEvent>();
  if (!row.data) return failure("NOT_FOUND", "Nie znaleziono spotkania.", 404);

  const answered = (await listQuestions(supabase, id.data)).flatMap((q) =>
    q.answer === null ? [] : [{ body: q.body, answer: q.answer }],
  );
  try {
    const result = await askAssistant(ANTHROPIC_API_KEY, eventContext(row.data, answered), body.data.question);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // eslint-disable-next-line no-console -- log błędów wywołania modelu (Cloudflare Observability)
    console.error("assistant failed", error instanceof Error ? error.message : error);
    return failure("UNAVAILABLE", "Asystent jest chwilowo niedostępny. Zapytaj organizatora.", 502);
  }
};
