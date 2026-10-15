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
  type EventSearch,
  type EventSearchResult,
} from "@/lib/assistant";
import { listQuestions } from "@/lib/services/questions";
import { listUpcomingEvents } from "@/lib/services/events";
import { getLevels } from "@/lib/services/profiles";
import { searchPlaces } from "@/lib/geocode";
import { NEAR_COOKIE, NEAR_RADII, parseNear, type Near } from "@/lib/near";
import { freeSpots, teamSize } from "@/lib/capacity";
import { sportLabel } from "@/lib/sports";
import { formatEventDay, formatTimeRange } from "@/lib/time";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Środek Polski — punkt odniesienia przy szukaniu nazwy miejscowości bez zapisanej okolicy. */
const POLAND_CENTER = { lat: 52.07, lng: 19.48 };

/** Najbliższy oferowany promień nie mniejszy niż podany. */
function snapRadius(km: number): number {
  return NEAR_RADII.find((r) => r >= km) ?? NEAR_RADII[NEAR_RADII.length - 1];
}

/** Wyszukiwarka dla doradcy: te same filtry i uprawnienia co lista „Gramy”. */
function eventSearch(
  supabase: SupabaseClient,
  userId: string | null,
  saved: Near | null,
): (filters: EventSearch) => Promise<EventSearchResult> {
  return async (filters) => {
    let near = saved;
    if (filters.place) {
      const hit = (await searchPlaces(filters.place, saved ?? POLAND_CENTER).catch(() => [])).at(0);
      near = hit ? { lat: hit.lat, lng: hit.lng, radiusKm: 10, label: hit.title } : near;
    }
    if (near && filters.radius_km) near = { ...near, radiusKm: snapRadius(filters.radius_km) };
    const levels = filters.fit_level && userId ? await getLevels(supabase, userId) : null;
    const { events } = await listUpcomingEvents(
      supabase,
      { sports: filters.sports, when: filters.when, day: filters.day, near, sort: near ? "distance" : "time", levels },
      { authenticated: userId !== null, limit: 8 },
    );
    return {
      scope: near
        ? `${near.label}, ${near.radiusKm === 0 ? "bez limitu odległości" : `promień ${String(near.radiusKm)} km`}`
        : "cała Polska (pytający nie podał okolicy)",
      events: events.map((e) => ({
        id: e.id,
        sport: sportLabel(e.sport),
        when: `${formatEventDay(e.starts_at)}, ${formatTimeRange(e.starts_at, e.duration_minutes)}`,
        area: e.area,
        free: freeSpots(e),
        team: teamSize(e),
        distance_km: e.distance_km === undefined ? null : Math.round(e.distance_km * 10) / 10,
      })),
    };
  };
}

/** Lista „Gramy” z tymi samymi filtrami (okolicę i promień lista bierze z ciasteczka „W pobliżu”). */
function listHref(search: EventSearch | null): string | null {
  if (!search) return null;
  const params = new URLSearchParams();
  if (search.sports?.length) params.set("sports", search.sports.join(","));
  else params.set("all", "1");
  if (search.when) params.set("when", search.when);
  else if (search.day) params.set("day", search.day);
  if (search.fit_level) params.set("fit", "1");
  return `/events?${params.toString()}`;
}

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
      search: eventSearch(
        supabase,
        context.locals.user?.id ?? null,
        parseNear(context.cookies.get(NEAR_COOKIE)?.value),
      ),
    });
    return Response.json(
      {
        known: result.known,
        answer: result.answer,
        events: result.events,
        listHref: listHref(result.search),
        onEvent: context_ !== null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    // eslint-disable-next-line no-console -- log błędów wywołania modelu (Cloudflare Observability)
    console.error("assistant failed", error instanceof Error ? error.message : error);
    return failure("UNAVAILABLE", "Doradca jest chwilowo niedostępny. Spróbuj za chwilę.", 502);
  }
};
