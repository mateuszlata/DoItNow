import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { requestToJoin } from "@/lib/services/participations";
import { readDevice } from "@/lib/device";

export const prerender = false;

// FR-007: zgłoszenie chęci udziału.
export const POST: APIRoute = async (context) => {
  const eventId = context.params.id ?? "";
  if (!context.locals.user) return context.redirect("/auth/signin");

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return context.redirect(`/events/${eventId}?error=UNKNOWN`);

  // Miejsce gościa z tego urządzenia (odpowiedź „Będę” przed założeniem konta) przechodzi na konto.
  const result = await requestToJoin(supabase, eventId, readDevice(context.cookies));
  return context.redirect(result.ok ? `/events/${eventId}?ok=joined` : `/events/${eventId}?error=${result.code}`);
};
