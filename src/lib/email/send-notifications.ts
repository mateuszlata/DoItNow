import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { renderNotificationEmail, type QueuedEmail } from "@/lib/email/notification-email";

// Wysyłka kolejki powiadomień e-mail (zadanie cykliczne workera, src/worker.ts). Kolejkę wydaje baza
// (claim_notification_emails) tylko z sekretem workera; maile idą jedną paczką przez API Resend.

export const EMAIL_FROM = "Metando <powiadomienia@metando.pl>";
export const EMAIL_REPLY_TO = "kontakt@metando.pl";
const RESEND_BATCH_URL = "https://api.resend.com/emails/batch";

export interface EmailSendConfig {
  supabaseUrl: string;
  supabaseKey: string;
  notifySecret: string;
  resendApiKey: string;
  origin?: string;
  fetchImpl?: typeof fetch;
}

export async function sendNotificationEmails(
  config: EmailSendConfig,
): Promise<{ sent: number; failed: number; error?: string }> {
  const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const claimed = await supabase.rpc("claim_notification_emails", { p_secret: config.notifySecret, p_limit: 50 });
  if (claimed.error) return { sent: 0, failed: 0, error: claimed.error.message };
  const queue = (claimed.data ?? []) as QueuedEmail[];
  if (queue.length === 0) return { sent: 0, failed: 0 };

  const payload = queue.map((n) => {
    const mail = renderNotificationEmail(n, config.origin);
    return {
      from: EMAIL_FROM,
      to: [n.email],
      reply_to: EMAIL_REPLY_TO,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      headers: {
        "List-Unsubscribe": `<${mail.unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    };
  });

  let ok = false;
  let error: string | undefined;
  try {
    const response = await (config.fetchImpl ?? fetch)(RESEND_BATCH_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    ok = response.ok;
    if (!ok) error = `Resend HTTP ${String(response.status)}: ${(await response.text()).slice(0, 300)}`;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const ids = queue.map((n) => n.id);
  await supabase.rpc("finish_notification_emails", {
    p_secret: config.notifySecret,
    p_sent: ok ? ids : [],
    p_failed: ok ? [] : ids,
  });
  return ok ? { sent: ids.length, failed: 0 } : { sent: 0, failed: ids.length, error };
}

/** Wypisanie z maili linkiem z wiadomości (token z claim_notification_emails). */
export async function unsubscribeEmails(supabase: SupabaseClient, token: string): Promise<boolean> {
  const response = await supabase.rpc("unsubscribe_emails", { p_token: token });
  return !response.error && (response.data as unknown) === true;
}
