import { useState } from "react";
import { Bell, Lock, Send } from "lucide-react";
import KitJersey from "@/components/KitJersey";
import { kitFrom } from "@/lib/kit";
import { chatLayout, dividerLabel } from "@/lib/chat-layout";
import { readChatDraft, saveChatDraft } from "@/lib/chat-draft";
import { cn } from "@/lib/utils";
import type { ChatPreviewMessage } from "@/types";

// Zajawka czatu dla osób bez konta: prawdziwy kształt rozmowy składu (koszulki, kolejność, długość wiadomości),
// bez nicków i treści. Gość ze składu czyta wiadomości organizatora (ustalenia). Pisać i czytać całość można
// po założeniu konta — pole wiadomości to zaproszenie, a zaczęta wiadomość czeka na po zalogowaniu.

interface Props {
  eventId: string;
  messages: ChatPreviewMessage[];
  /** Gość ze składu (odpowiedział „Będę”) — inny tekst zachęty. */
  guest: boolean;
  signupHref: string;
  signinHref: string;
}

/** „8 min temu”, „2 h temu”, „wczoraj” — kiedy była ostatnia wiadomość. */
function ago(iso: string): string {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${String(minutes)} min temu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${String(hours)} h temu`;
  return hours < 48 ? "wczoraj" : `${String(Math.round(hours / 24))} dni temu`;
}

function people(count: number): string {
  if (count === 1) return "1 osoba";
  return count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14)
    ? `${String(count)} osoby`
    : `${String(count)} osób`;
}

function messagesWord(count: number): string {
  if (count === 1) return "wiadomość";
  return "wiadomości";
}

/** Dymek z paskami zamiast tekstu: szerokość (% wiersza) i długości linii — jak prawdziwa wiadomość. */
function placeholder(length: number): { width: number; lines: number[] } {
  if (length > 60) return { width: 80, lines: [100, Math.min(Math.max(40 + (length - 60) * 0.5, 40), 90)] };
  return { width: Math.min(Math.max(16 + length, 18), 80), lines: [100] };
}

export default function ChatPreview({ eventId, messages, guest, signupHref, signinHref }: Props) {
  const [draft, setDraft] = useState(() => readChatDraft(eventId));
  const [invite, setInvite] = useState(false);
  const rows = chatLayout(messages.map((m) => ({ author_id: String(m.author_key), created_at: m.created_at })));
  const authors = new Set(messages.map((m) => m.author_key)).size;
  const last = messages.at(-1);

  return (
    <section className="bg-card text-ink rounded-[20px] p-4" data-testid="chat-preview" aria-label="Czat składu">
      <div className="flex items-center justify-between gap-3">
        <h2 className="display text-2xl leading-none">Czat</h2>
        <span className="bg-card-2 text-ink-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold">
          <Lock className="size-3" aria-hidden="true" />
          tylko dla składu
        </span>
      </div>
      {last && (
        <p className="text-ink-2 mt-1 text-xs" data-testid="chat-preview-stats">
          {people(authors)} ze składu · {messages.length} {messagesWord(messages.length)} · ostatnia{" "}
          {ago(last.created_at)}
        </p>
      )}

      <div className="mt-3 flex max-h-[360px] flex-col overflow-hidden" aria-hidden="true">
        {messages.map((message, i) => {
          const { divider, first, last: lastInGroup } = rows[i];
          const readable = message.body !== null;
          return (
            <div
              key={message.id}
              className={cn("chat-pop", first ? "mt-3" : "mt-0.5", i === 0 && "mt-0")}
              style={{ animationDelay: `${String(Math.min(i, 24) * 90)}ms` }}
            >
              {divider && (
                <p className="text-ink-3 mb-2 text-center text-[11px] font-semibold">
                  {dividerLabel(message.created_at)}
                </p>
              )}
              {first && message.from_organizer && (
                <p className="text-ink-3 mb-0.5 pl-9 text-[11px] font-semibold">organizator</p>
              )}
              <div className="flex items-end gap-1.5">
                <span className="w-7 shrink-0">
                  {lastInGroup && <KitJersey kit={kitFrom(message, `chat-${String(message.author_key)}`)} width={28} />}
                </span>
                {readable ? (
                  <p className="bg-card-2 max-w-[80%] rounded-2xl px-3.5 py-2 text-sm break-words whitespace-pre-wrap">
                    {message.body}
                  </p>
                ) : (
                  <span
                    className={cn(
                      "bg-card-2 flex flex-col gap-1.5 rounded-2xl px-3.5 py-3",
                      message.hidden && "opacity-50",
                    )}
                    style={{ width: `${String(placeholder(message.length).width)}%` }}
                  >
                    {placeholder(message.length).lines.map((width, line) => (
                      <span
                        key={line}
                        className="bg-line block h-2 rounded-full"
                        style={{ width: `${String(width)}%` }}
                      />
                    ))}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-ink-2 mt-3 text-xs">
        {guest
          ? "Ustalenia organizatora widzisz już teraz. Załóż konto, żeby czytać całą rozmowę i pisać do składu."
          : "To prawdziwa rozmowa składu. Załóż konto i dołącz do spotkania, żeby ją czytać i pisać."}
      </p>

      <form
        className="mt-2 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setInvite(true);
        }}
      >
        <label htmlFor="chat-preview-input" className="sr-only">
          Wiadomość
        </label>
        <textarea
          id="chat-preview-input"
          rows={1}
          maxLength={1000}
          value={draft}
          suppressHydrationWarning
          onFocus={() => {
            setInvite(true);
          }}
          onChange={(e) => {
            setDraft(e.target.value);
            saveChatDraft(eventId, e.target.value);
          }}
          placeholder="Napisz wiadomość…"
          className="border-line-strong bg-card focus:ring-brand max-h-32 min-h-11 flex-1 resize-none rounded-2xl border px-4 py-2.5 text-sm focus:ring-2 focus:outline-none"
          data-testid="chat-preview-input"
        />
        <button
          type="submit"
          className="bg-brand text-on-brand hover:bg-brand-hover grid size-11 shrink-0 place-items-center rounded-full transition-colors"
          aria-label="Wyślij wiadomość"
        >
          <Send className="size-4" />
        </button>
      </form>

      {invite && (
        <div
          className="bg-ink text-card mt-3 rounded-2xl p-4"
          role="dialog"
          aria-label="Dołącz do rozmowy"
          data-testid="chat-preview-invite"
        >
          <p className="text-sm font-bold">Załóż konto w 30 sekund i dołącz do rozmowy</p>
          <p className="mt-1 text-xs opacity-80">
            {draft.trim()
              ? "Twoja wiadomość poczeka — po zalogowaniu wrócisz tutaj i wyślesz ją jednym kliknięciem."
              : "Po zalogowaniu wrócisz prosto tutaj."}
          </p>
          <div className="mt-3 flex gap-2">
            <a
              href={signupHref}
              className="bg-brand text-on-brand grid h-10 flex-1 place-items-center rounded-full text-xs font-extrabold tracking-wide uppercase"
            >
              Załóż konto
            </a>
            <a
              href={signinHref}
              className="bg-card text-ink grid h-10 place-items-center rounded-full px-4 text-xs font-bold"
            >
              Mam konto
            </a>
          </div>
        </div>
      )}

      <p className="text-ink-2 mt-3 flex items-center gap-1.5 text-xs">
        <Bell className="size-3.5 shrink-0" aria-hidden="true" />Z kontem damy Ci znać, gdy ktoś napisze albo zmieni się
        termin.
      </p>
    </section>
  );
}
