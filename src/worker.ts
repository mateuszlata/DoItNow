// Wejście workera: strony Astro (fetch), wypisanie z maili (POST /wypisz) i zadanie cykliczne co 5 min
// (scheduled) — wysyłka powiadomień e-mail.
import { handle } from "@astrojs/cloudflare/handler";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sendNotificationEmails, unsubscribeEmails } from "@/lib/email/send-notifications";

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_KEY?: string;
  NOTIFY_SECRET?: string;
  RESEND_API_KEY?: string;
}

interface Ctx {
  waitUntil(promise: Promise<unknown>): void;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Wypisanie z maili: przycisk na stronie /wypisz oraz „wypisz się jednym kliknięciem” ze skrzynki pocztowej
 * (POST bez nagłówka Origin, którego Astro by nie przepuściło). Token jest losowy, więc nie potrzeba logowania.
 */
async function unsubscribe(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("t") ?? "";
  const body = await request.text().catch(() => "");
  const oneClick = body.includes("List-Unsubscribe=One-Click");
  const done =
    UUID_PATTERN.test(token) && env.SUPABASE_URL && env.SUPABASE_KEY
      ? await unsubscribeEmails(
          createClient(env.SUPABASE_URL, env.SUPABASE_KEY, { auth: { persistSession: false } }) as SupabaseClient,
          token,
        )
      : false;
  if (oneClick) return new Response(done ? "OK" : "Not found", { status: done ? 200 : 404 });
  return Response.redirect(`${url.origin}/wypisz?t=${encodeURIComponent(token)}&${done ? "done" : "error"}=1`, 303);
}

export default {
  fetch(request: Request, env: Env, ctx: Ctx) {
    if (request.method === "POST" && new URL(request.url).pathname === "/wypisz") return unsubscribe(request, env);
    return handle(request, env, ctx);
  },
  scheduled(_controller: unknown, env: Env, ctx: Ctx) {
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY || !env.NOTIFY_SECRET || !env.RESEND_API_KEY) return;
    ctx.waitUntil(
      sendNotificationEmails({
        supabaseUrl: env.SUPABASE_URL,
        supabaseKey: env.SUPABASE_KEY,
        notifySecret: env.NOTIFY_SECRET,
        resendApiKey: env.RESEND_API_KEY,
      }).then((result) => {
        // eslint-disable-next-line no-console -- log zadania cyklicznego (Cloudflare Observability)
        if (result.sent || result.failed || result.error) console.log("notification emails", result);
      }),
    );
  },
};
