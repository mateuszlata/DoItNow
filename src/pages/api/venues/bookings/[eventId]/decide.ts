import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { decideVenueBooking } from "@/lib/services/venues";

export const prerender = false;

const decisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  venueId: z.uuid(),
  note: z.string().trim().max(300).optional(),
});

// Zarządca potwierdza albo odrzuca termin spotkania na swoim obiekcie.
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) return context.redirect("/auth/signin");

  const form = await context.request.formData();
  const parsed = decisionSchema.safeParse({
    decision: form.get("decision"),
    venueId: form.get("venueId"),
    note: form.get("note") ?? undefined,
  });
  if (!parsed.success) return context.redirect("/venues");
  const { decision, venueId, note } = parsed.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return context.redirect(`/venues/${venueId}/calendar?error=UNKNOWN`);

  const result = await decideVenueBooking(supabase, context.params.eventId ?? "", decision === "approve", note);
  const target = `/venues/${venueId}/calendar`;
  return context.redirect(result.ok ? `${target}?ok=${decision}` : `${target}?error=${result.code}`);
};
