import { useState, type SubmitEvent } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  eventId: string;
  /** Pytający może zapytać organizatora na tej stronie (zalogowany, nie organizator, spotkanie otwarte). */
  canAskOrganizer: boolean;
  /** Link do logowania dla osób bez konta. */
  signinHref: string | null;
}

interface Reply {
  known: boolean;
  answer: string;
}

const MAX = 300;

/** Asystent AI przy spotkaniu: krótka odpowiedź z ogłoszenia, a gdy jej tam nie ma — „Zapytaj organizatora”. */
export default function EventAssistant({ eventId, canAskOrganizer, signinHref }: Props) {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [reply, setReply] = useState<Reply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function ask(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (text.length < 3 || busy) return;
    setBusy(true);
    setError(null);
    setReply(null);
    try {
      const response = await fetch(`/api/events/${eventId}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = (await response.json()) as Partial<Reply> & { message?: string };
      if (!response.ok || typeof data.answer !== "string") {
        setError(data.message ?? "Asystent jest chwilowo niedostępny.");
      } else {
        setAsked(text);
        setReply({ known: data.known === true, answer: data.answer });
        setQuestion("");
      }
    } catch {
      setError("Brak połączenia. Spróbuj ponownie.");
    } finally {
      setBusy(false);
    }
  }

  // Pytanie, na które asystent nie zna odpowiedzi, przenosimy do formularza „Zapytaj organizatora”.
  function forwardToOrganizer() {
    const field = document.querySelector<HTMLTextAreaElement>("#question-body");
    if (!field) return;
    field.value = asked;
    field.scrollIntoView({ behavior: "smooth", block: "center" });
    field.focus();
  }

  return (
    <div className="bg-card-2 mt-3 rounded-2xl p-3" data-testid="event-assistant">
      <form onSubmit={(e) => void ask(e)} className="flex gap-2">
        <label htmlFor="assistant-question" className="sr-only">
          Pytanie do asystenta
        </label>
        <input
          id="assistant-question"
          type="text"
          value={question}
          maxLength={MAX}
          onChange={(e) => {
            setQuestion(e.target.value);
          }}
          placeholder="Zapytaj asystenta, np. ile kosztuje?"
          className="border-line-strong bg-card text-ink placeholder:text-ink-3 focus:ring-brand h-10 min-w-0 flex-1 rounded-full border px-4 text-sm focus:ring-2 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || question.trim().length < 3}
          className="bg-ink text-card inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-xs font-extrabold tracking-wide uppercase disabled:opacity-40"
        >
          <Sparkles className="size-4" aria-hidden="true" />
          {busy ? "Myślę…" : "Zapytaj"}
        </button>
      </form>
      <p className="text-ink-3 mt-1.5 px-1 text-[11px]">
        Odpowiada asystent AI na podstawie ogłoszenia — może się pomylić. Wiążące są informacje od organizatora.
      </p>

      {error && <p className="text-bad mt-2 px-1 text-sm">{error}</p>}
      {reply && (
        <div className="mt-2 grid gap-2" aria-live="polite">
          <p className="text-ink-2 px-1 text-xs">Twoje pytanie: {asked}</p>
          <p
            className={cn(
              "rounded-2xl px-3.5 py-2.5 text-sm",
              reply.known ? "bg-card text-ink" : "bg-warn-soft text-warn",
            )}
            data-testid="assistant-answer"
          >
            {reply.answer}
          </p>
          {!reply.known && canAskOrganizer && (
            <button
              type="button"
              onClick={forwardToOrganizer}
              className="text-link justify-self-start px-1 text-sm font-bold underline"
            >
              Zapytaj organizatora →
            </button>
          )}
          {!reply.known && !canAskOrganizer && signinHref && (
            <a href={signinHref} className="text-link justify-self-start px-1 text-sm font-bold underline">
              Zaloguj się, aby zapytać organizatora →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
