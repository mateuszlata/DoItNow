import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { decideParticipation } from "@/lib/services/participations";

export const prerender = false;

const decisionSchema = z.object({
  decision: z.enum(["accept", "reject"]),
  eventId: z.uuid(),
});

// FR-010: organizator akceptuje lub odrzuca zgłoszenie.
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) return context.redirect("/auth/signin");

  const form = await context.request.formData();
  const parsed = decisionSchema.safeParse({ decision: form.get("decision"), eventId: form.get("eventId") });
  if (!parsed.success) return context.redirect("/events");
  const { decision, eventId } = parsed.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return context.redirect(`/events/${eventId}?error=UNKNOWN`);

  const result = await decideParticipation(supabase, context.params.id ?? "", decision === "accept");
  const ok = decision === "accept" ? "accepted" : "rejected";
  return context.redirect(result.ok ? `/events/${eventId}?ok=${ok}` : `/events/${eventId}?error=${result.code}`);
};
