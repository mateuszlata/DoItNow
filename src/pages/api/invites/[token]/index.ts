import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { TURNSTILE_SECRET_KEY } from "astro:env/server";
import { createClient } from "@/lib/supabase";
import { ensureDevice } from "@/lib/device";
import { respondToInvite } from "@/lib/services/invites";
import { TURNSTILE_FIELD, verifyTurnstile } from "@/lib/turnstile";

export const prerender = false;

const formSchema = z.object({
  name: z.string().trim().min(1).max(40),
  answer: z.enum(["yes", "no"]),
});

// Odpowiedź zaproszonego bez konta: „Będę” / „Nie będę” (Turnstile chroni przed botami).
export const POST: APIRoute = async (context) => {
  const token = z
    .string()
    .regex(/^[a-f0-9]{32,64}$/)
    .safeParse(context.params.token);
  if (!token.success) return context.redirect("/events");
  const back = (query: string) => context.redirect(`/i/${token.data}?${query}`);

  const form = await context.request.formData();
  const parsed = formSchema.safeParse({ name: form.get("name") ?? "", answer: form.get("answer") });
  if (!parsed.success) return back("error=NAME_REQUIRED");

  const human = await verifyTurnstile(
    TURNSTILE_SECRET_KEY,
    form.get(TURNSTILE_FIELD),
    context.request.headers.get("CF-Connecting-IP"),
  );
  if (!human) return back("error=BOT_CHECK");

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return back("error=UNKNOWN");
  const result = await respondToInvite(supabase, {
    token: token.data,
    device: ensureDevice(context.cookies),
    name: parsed.data.name,
    answer: parsed.data.answer,
  });
  return back(result.ok ? `ok=${parsed.data.answer}` : `error=${result.code}`);
};
