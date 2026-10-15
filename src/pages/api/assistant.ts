import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { ANTHROPIC_API_KEY } from "astro:env/server";
import { createClient } from "@/lib/supabase";
import {
  ASSISTANT_HISTORY_MAX,
  ASSISTANT_QUESTION_MAX,
  askAssistant,
  eventContext,
  type AssistantEvent,
} from "@/lib/assistant";
import { listQuestions } from "@/lib/services/questions";

export const prerender = false;

const bodySchema = z.object({
  question: z.string().trim().min(2).max(ASSISTANT_QUESTION_MAX),
  // Strona spotkania, na której toczy się rozmowa (opcjonalnie).
  eventId: z.uuid().optional(),
  // Poprzednie wymiany bieżącej rozmowy (z przeglądarki).
  history: z
    .array(z.object({ question: z.string().max(ASSISTANT_QUESTION_MAX), answer: z.string().max(1000) }))
    .max(ASSISTANT_HISTORY_MAX)
    .optional(),
});

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

// Doradca Metando (AI): pytanie o działanie serwisu albo o oglądane spotkanie. Limity liczy baza.
export const POST: APIRoute = async (context) => {
  if (!ANTHROPIC_API_KEY) return failure("UNAVAILABLE", "Doradca jest chwilowo niedostępny.", 503);
  const body = bodySchema.safeParse(await context.request.json().catch(() => null));
  if (!body.success) {
    return failure("INVALID_DATA", `Napisz pytanie (do ${String(ASSISTANT_QUESTION_MAX)} znaków).`, 400);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return failure("UNAVAILABLE", "Doradca jest chwilowo niedostępny.", 503);

  const ip = context.request.headers.get("CF-Connecting-IP") ?? context.clientAddress;
  const quota = await supabase.rpc("consume_assistant_quota", { p_ip_hash: await sha256(ip) });
  if (quota.error) return failure("UNAVAILABLE", "Doradca jest chwilowo niedostępny.", 503);
  if (quota.data === "user") {
    return failure(
      "LIMIT",
      context.locals.user
        ? "Na dziś wykorzystano limit pytań do doradcy. Napisz do nas: kontakt@metando.pl."
        : "Na dziś wykorzystano limit pytań bez konta. Zaloguj się, żeby pytać dalej.",
      429,
    );
  }
  if (quota.data !== "ok") return failure("LIMIT", "Doradca ma dziś przerwę. Wróć jutro.", 429);

  let context_: string | null = null;
  const eventId = body.data.eventId;
  if (eventId) {
    const row = context.locals.user
      ? await supabase.from("events").select(MEMBER_COLUMNS).eq("id", eventId).maybeSingle<AssistantEvent>()
      : await supabase.from("events_public").select(PUBLIC_COLUMNS).eq("id", eventId).maybeSingle<AssistantEvent>();
    if (row.data) {
      const answered = (await listQuestions(supabase, eventId)).flatMap((q) =>
        q.answer === null ? [] : [{ body: q.body, answer: q.answer }],
      );
      context_ = eventContext(row.data, answered);
    }
  }

  try {
    const result = await askAssistant(ANTHROPIC_API_KEY, {
      question: body.data.question,
      eventContext: context_,
      history: body.data.history,
    });
    return Response.json({ ...result, onEvent: context_ !== null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // eslint-disable-next-line no-console -- log błędów wywołania modelu (Cloudflare Observability)
    console.error("assistant failed", error instanceof Error ? error.message : error);
    return failure("UNAVAILABLE", "Doradca jest chwilowo niedostępny. Spróbuj za chwilę.", 502);
  }
};
