import { sportLabel } from "@/lib/sports";
import { formatEventDay, formatTimeRange } from "@/lib/time";

/** Powiadomienie z kolejki do wysłania mailem (claim_notification_emails w bazie). */
export interface QueuedEmail {
  id: string;
  email: string;
  display_name: string | null;
  category: string;
  type: string;
  data: Record<string, unknown> | null;
  event_id: string | null;
  sport: string | null;
  area: string | null;
  place: string | null;
  starts_at: string | null;
  duration_minutes: number | null;
  unsubscribe_token: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
  /** Adres jednym kliknięciem (nagłówek List-Unsubscribe). */
  unsubscribeUrl: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);
}

/** Nagłówek i zdanie wprowadzające dla rodzaju powiadomienia; `who` — nick osoby z danych. */
function headline(type: string, who: string, question: string): { title: string; lead: string } {
  switch (type) {
    case "question":
      return {
        title: "Nowe pytanie o spotkanie",
        lead: `Ktoś pyta: „${question}”. Odpowiedź zobaczą wszyscy oglądający.`,
      };
    case "answered":
      return { title: "Organizator odpowiedział", lead: `Jest odpowiedź na Twoje pytanie: „${question}”.` };
    case "request":
      return {
        title: `${who} chce dołączyć`,
        lead: `${who} zgłasza się do Twojego spotkania. Zaakceptuj albo odrzuć.`,
      };
    case "joined":
      return { title: `${who} jest w składzie`, lead: `${who} dołącza do Twojego spotkania.` };
    case "reserve":
      return { title: `${who} na rezerwie`, lead: `${who} zapisuje się na rezerwę w Twoim spotkaniu.` };
    case "withdrew":
      return { title: `${who} rezygnuje`, lead: `${who} wypisuje się z Twojego spotkania.` };
    case "accepted":
      return { title: "Jesteś w składzie", lead: "Organizator przyjął Twoje zgłoszenie. Do zobaczenia na boisku!" };
    case "accepted_reserve":
      return {
        title: "Jesteś na rezerwie",
        lead: "Organizator przyjął Cię na rezerwę — wskoczysz, gdy zwolni się miejsce.",
      };
    case "promoted":
      return { title: "Wchodzisz do składu", lead: "Zwolniło się miejsce — awansujesz z rezerwy do składu." };
    case "rejected":
      return {
        title: "Zgłoszenie nieprzyjęte",
        lead: "Organizator nie przyjął zgłoszenia. Poszukaj innego spotkania.",
      };
    case "removed":
      return { title: "Nie jesteś już w składzie", lead: "Organizator usunął Cię ze składu tego spotkania." };
    case "cancelled":
      return { title: "Spotkanie odwołane", lead: "Organizator odwołał spotkanie, w którym grasz." };
    case "changed":
      return {
        title: "Zmiana w spotkaniu",
        lead: "Organizator zmienił termin albo miejsce. Sprawdź, czy nadal możesz.",
      };
    case "reminder":
      return { title: "Jutro grasz", lead: "Przypominamy o jutrzejszym spotkaniu." };
    case "chat":
      return { title: "Nowe wiadomości na czacie", lead: "W czacie spotkania pojawiły się nowe wiadomości." };
    default:
      return { title: "Powiadomienie z Metando", lead: "Coś się zmieniło w Twoim spotkaniu." };
  }
}

/** Treść maila (temat, tekst i HTML) dla powiadomienia z kolejki. */
export function renderNotificationEmail(n: QueuedEmail, origin = "https://metando.pl"): RenderedEmail {
  const who = typeof n.data?.name === "string" && n.data.name.trim() ? n.data.name.trim() : "Ktoś";
  const question = typeof n.data?.question === "string" ? n.data.question : "";
  const { title, lead } = headline(n.type, who, question);
  const sport = n.sport ? sportLabel(n.sport) : null;
  const when =
    n.starts_at && n.duration_minutes
      ? `${formatEventDay(n.starts_at)}, ${formatTimeRange(n.starts_at, n.duration_minutes)}`
      : null;
  const where = [n.area, n.place].filter(Boolean).join(" · ") || null;
  // Pytania i odpowiedzi prowadzą prosto do sekcji pytań na stronie spotkania.
  const anchor = n.type === "question" || n.type === "answered" ? "#pytania" : "";
  const eventUrl = n.event_id ? `${origin}/events/${n.event_id}${anchor}` : `${origin}/my`;
  const settingsUrl = `${origin}/my#powiadomienia`;
  const unsubscribeUrl = `${origin}/wypisz?t=${n.unsubscribe_token}`;
  const subject = sport ? `${title} · ${sport}${when ? `, ${when}` : ""}` : title;

  const text = [
    title,
    "",
    lead,
    "",
    ...[sport, when, where].filter((line): line is string => Boolean(line)),
    "",
    `Zobacz spotkanie: ${eventUrl}`,
    "",
    "—",
    "Dostajesz ten e-mail, bo masz konto w Metando.",
    `Ustawienia powiadomień: ${settingsUrl}`,
    `Wypisz się z e-maili: ${unsubscribeUrl}`,
  ].join("\n");

  const details = [
    sport && `<strong>${escapeHtml(sport)}</strong>`,
    when && escapeHtml(when),
    where && escapeHtml(where),
  ]
    .filter(Boolean)
    .join("<br>");
  const html = `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;background:#0f3b2e;font-family:Arial,Helvetica,sans-serif;color:#13241c">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f3b2e;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 4px 14px;font-size:22px;font-weight:800;font-style:italic;letter-spacing:-0.5px;color:#ff7a1a">METANDO</td></tr>
<tr><td style="background:#f2ead6;border-radius:20px;padding:24px">
<h1 style="margin:0 0 8px;font-size:24px;line-height:1.15;color:#13241c">${escapeHtml(title)}</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#3d4a42">${escapeHtml(lead)}</p>
${details ? `<p style="margin:0 0 20px;padding:12px 14px;background:#e6dcc2;border-radius:14px;font-size:15px;line-height:1.5">${details}</p>` : ""}
<a href="${eventUrl}" style="display:inline-block;background:#ff7a1a;color:#13241c;text-decoration:none;font-weight:800;font-size:14px;letter-spacing:0.5px;text-transform:uppercase;padding:13px 22px;border-radius:999px">Zobacz spotkanie</a>
</td></tr>
<tr><td style="padding:16px 4px;font-size:12px;line-height:1.6;color:#a9c2b4">
Dostajesz ten e-mail, bo masz konto w Metando.<br>
<a href="${settingsUrl}" style="color:#d9e7de">Ustawienia powiadomień</a> · <a href="${unsubscribeUrl}" style="color:#d9e7de">Wypisz się z e-maili</a>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  return { subject, text, html, unsubscribeUrl };
}
