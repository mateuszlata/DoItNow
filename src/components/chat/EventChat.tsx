import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useEventChat } from "@/components/hooks/useEventChat";
import KitJersey from "@/components/KitJersey";
import ShareMenu from "@/components/share/ShareMenu";
import { kitFrom } from "@/lib/kit";
import { cn } from "@/lib/utils";
import { chatLayout, dividerLabel, messageTime } from "@/lib/chat-layout";
import { clearChatDraft, readChatDraft } from "@/lib/chat-draft";
import type { ChatMessage } from "@/types";

const MAX_LENGTH = 1000;

interface Props {
  eventId: string;
  currentUserId: string;
  isOrganizer: boolean;
  /** false po odwołaniu spotkania i 3 dni po jego końcu — czat tylko do czytania. */
  open: boolean;
  initialMessages: ChatMessage[];
  initialSyncedAt: string;
  /** Gotowa wiadomość do udostępnienia (opis spotkania + link). */
  shareText?: string;
  shareSubject?: string;
  shareUrl?: string;
}

const URL_PATTERN = /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]])/g;

/** Tekst wiadomości z klikalnymi linkami (tylko http/https; reszta jako zwykły tekst). */
function withLinks(text: string) {
  return text.split(URL_PATTERN).map((part, index) =>
    index % 2 === 1 ? (
      <a key={index} href={part} target="_blank" rel="noopener noreferrer nofollow ugc" className="break-all underline">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

/** Same emoji (kilka znaków) — większe i bez dymka, jak w komunikatorach. */
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\u200d|\ufe0f|\s){1,12}$/u;
function emojiOnly(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && !/[0-9#*]/.test(trimmed) && EMOJI_ONLY.test(trimmed);
}

/** Zaokrąglenia dymków w grupie: ciasno przy sąsiednich wiadomościach tej samej osoby. */
function bubbleShape(mine: boolean, first: boolean, last: boolean): string {
  if (first && last) return "rounded-2xl";
  if (mine)
    return cn(
      "rounded-l-2xl",
      first ? "rounded-tr-2xl rounded-br-md" : last ? "rounded-tr-md rounded-br-2xl" : "rounded-r-md",
    );
  return cn(
    "rounded-r-2xl",
    first ? "rounded-tl-2xl rounded-bl-md" : last ? "rounded-tl-md rounded-bl-2xl" : "rounded-l-md",
  );
}

export default function EventChat({
  eventId,
  currentUserId,
  isOrganizer,
  open,
  initialMessages,
  initialSyncedAt,
  shareText,
  shareSubject,
  shareUrl,
}: Props) {
  const { messages, error, sending, send, act } = useEventChat(eventId, initialMessages, initialSyncedAt);
  // Wiadomość zaczęta przed założeniem konta (zajawka czatu) czeka w polu, gotowa do wysłania.
  const [draft, setDraft] = useState(() => readChatDraft(eventId));
  const [notice, setNotice] = useState<string | null>(null);
  // Stuknięta wiadomość pokazuje godzinę i opcje (ukryj, zgłoś, usuń).
  const [active, setActive] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  // Przewija do najnowszej wiadomości, gdy przybywa wiadomości, a użytkownik jest przy dole listy.
  useEffect(() => {
    const element = list.current;
    if (!element || messages.length === lastCount.current) return;
    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
    if (lastCount.current === 0 || nearBottom) element.scrollTop = element.scrollHeight;
    lastCount.current = messages.length;
  }, [messages]);

  async function submit() {
    const body = draft.trim();
    if (!body || sending) return;
    if (await send(body)) {
      setDraft("");
      clearChatDraft(eventId);
    }
  }

  async function report(message: ChatMessage) {
    const reason = window.prompt("Dlaczego zgłaszasz tę wiadomość? (opcjonalnie)");
    if (reason === null) return;
    if (await act(message.id, "report", reason)) setNotice("Dziękujemy — zgłoszenie trafi do moderacji.");
  }

  async function hide(message: ChatMessage, own: boolean) {
    const question = own ? "Usunąć tę wiadomość?" : "Ukryć tę wiadomość przed wszystkimi?";
    if (window.confirm(question)) await act(message.id, "hide");
  }

  return (
    <section className="bg-card text-ink rounded-[20px] p-4" data-testid="event-chat" aria-label="Czat spotkania">
      <div className="flex items-center justify-between gap-3">
        <h2 className="display text-2xl leading-none">Czat</h2>
        <ShareMenu
          variant="chip"
          label="Zaproś znajomych"
          text={shareText ?? shareUrl ?? ""}
          url={shareUrl ?? ""}
          subject={shareSubject ?? "Metando"}
        />
      </div>
      <p className="text-ink-3 mt-1 text-xs">Widzą go organizator i osoby w składzie oraz na rezerwie.</p>

      <div
        ref={list}
        className="mt-3 flex max-h-[420px] min-h-24 flex-col overflow-y-auto pr-1"
        role="log"
        aria-live="polite"
        data-testid="chat-messages"
      >
        {messages.length === 0 && (
          <p className="text-ink-3 my-auto py-6 text-center text-sm">Nikt jeszcze nie napisał. Przywitaj się!</p>
        )}
        {(() => {
          const rows = chatLayout(messages);
          return messages.map((message, i) => {
            const { divider, first, last } = rows[i];
            const mine = message.author_id === currentUserId;
            const open = active === message.id;
            const big = !message.hidden && emojiOnly(message.body ?? "");
            const canHide = mine || isOrganizer;
            const canReport = !mine;
            return (
              <div key={message.id} className={cn(first ? "mt-3" : "mt-0.5", i === 0 && "mt-0")}>
                {divider && (
                  <p className="text-ink-3 mb-2 text-center text-[11px] font-semibold" data-testid="chat-divider">
                    {dividerLabel(message.created_at)}
                  </p>
                )}
                {first && !mine && <p className="text-ink-3 mb-0.5 pl-9 text-[11px]">{message.author_name}</p>}
                <div className={cn("flex items-end gap-1.5", mine && "justify-end")}>
                  {!mine && (
                    <span className="w-7 shrink-0" aria-hidden="true">
                      {last && <KitJersey kit={kitFrom(message, message.author_id)} width={28} />}
                    </span>
                  )}
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={open}
                    aria-label={`${mine ? "Twoja wiadomość" : message.author_name}, ${messageTime(message.created_at)} — pokaż opcje`}
                    title={messageTime(message.created_at)}
                    onClick={() => {
                      setActive(open ? null : message.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setActive(open ? null : message.id);
                      }
                    }}
                    className={cn(
                      "max-w-[80%] cursor-pointer text-sm break-words whitespace-pre-wrap",
                      big
                        ? "px-1 text-4xl leading-tight"
                        : cn(
                            "px-3.5 py-2",
                            bubbleShape(mine, first, last),
                            message.hidden
                              ? "text-ink-3 border-line border italic"
                              : mine
                                ? "bg-brand text-on-brand"
                                : "bg-card-2",
                          ),
                    )}
                    data-testid="chat-message"
                  >
                    {message.hidden ? "Wiadomość usunięta" : withLinks(message.body ?? "")}
                  </div>
                </div>
                {open && (
                  <p
                    className={cn("text-ink-3 mt-1 flex gap-3 text-[11px]", mine ? "justify-end" : "pl-9")}
                    data-testid="chat-message-details"
                  >
                    <span>{messageTime(message.created_at)}</span>
                    {!message.hidden && canHide && (
                      <button
                        type="button"
                        className="hover:text-ink font-semibold underline-offset-2 hover:underline"
                        onClick={() => void hide(message, mine)}
                      >
                        {mine ? "Usuń" : "Ukryj"}
                      </button>
                    )}
                    {!message.hidden && canReport && (
                      <button
                        type="button"
                        className="hover:text-ink font-semibold underline-offset-2 hover:underline"
                        onClick={() => void report(message)}
                      >
                        Zgłoś
                      </button>
                    )}
                  </p>
                )}
              </div>
            );
          });
        })()}
      </div>

      {(error ?? notice) && (
        <p className={cn("mt-2 text-xs", error ? "text-bad" : "text-ok")} role="status">
          {error ?? notice}
        </p>
      )}

      {open ? (
        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label htmlFor="chat-input" className="sr-only">
            Wiadomość
          </label>
          <textarea
            id="chat-input"
            rows={1}
            maxLength={MAX_LENGTH}
            value={draft}
            suppressHydrationWarning
            onChange={(e) => {
              setDraft(e.target.value);
              setNotice(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder="Napisz wiadomość…"
            className="border-line-strong bg-card focus:ring-brand max-h-32 min-h-11 flex-1 resize-none rounded-2xl border px-4 py-2.5 text-sm focus:ring-2 focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending || draft.trim().length === 0}
            className="bg-brand text-on-brand hover:bg-brand-hover grid size-11 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-50"
            aria-label="Wyślij wiadomość"
          >
            <Send className="size-4" />
          </button>
        </form>
      ) : (
        <p className="text-ink-3 mt-3 text-xs">Czat jest zamknięty — można tylko czytać wiadomości.</p>
      )}
      {open && draft.length > MAX_LENGTH - 100 && (
        <p className="text-ink-3 mt-1 text-right text-[11px]">
          {draft.length}/{MAX_LENGTH}
        </p>
      )}
    </section>
  );
}
