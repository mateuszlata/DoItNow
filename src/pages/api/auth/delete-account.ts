import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";

export const prerender = false;

// Wpisanie słowa USUŃ chroni przed przypadkowym kliknięciem.
const confirmSchema = z.object({ confirm: z.string().trim().toUpperCase().pipe(z.literal("USUŃ")) });

// Usunięcie własnego konta (RODO): kasuje konto i powiązane dane, potem wylogowuje.
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) return context.redirect("/auth/signin");

  const form = await context.request.formData();
  const parsed = confirmSchema.safeParse({ confirm: form.get("confirm") ?? "" });
  if (!parsed.success) return context.redirect("/my?error=DELETE_CONFIRM");

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return context.redirect("/my?error=DELETE_FAILED");

  const { error } = await supabase.rpc("delete_own_account");
  if (error) return context.redirect("/my?error=DELETE_FAILED");

  await supabase.auth.signOut();
  return context.redirect("/events?deleted=1");
};
