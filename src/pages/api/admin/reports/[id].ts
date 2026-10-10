import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { dismissReports, hideMessage } from "@/lib/services/chat";

export const prerender = false;

const actionSchema = z.enum(["hide", "dismiss"]);

// Decyzja administratora w sprawie zgłoszonej wiadomości; uprawnienia sprawdza baza (is_admin).
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) return context.redirect("/auth/signin");
  const id = z.uuid().safeParse(context.params.id);
  const action = actionSchema.safeParse((await context.request.formData()).get("action"));
  if (!id.success || !action.success) return context.redirect("/admin/reports");

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return context.redirect("/admin/reports");

  const result =
    action.data === "hide" ? await hideMessage(supabase, id.data) : await dismissReports(supabase, id.data);
  return context.redirect(
    result.ok ? `/admin/reports?ok=${action.data === "hide" ? "hidden" : "dismissed"}` : "/admin/reports",
  );
};
