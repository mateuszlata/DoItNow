import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import ShareMenu from "@/components/share/ShareMenu";

// Pasek „Zapraszasz znajomych?” nad składem: −/+ od razu rezerwuje lub zwalnia miejsca dla znajomych
// spoza Metando, a „Wyślij zaproszenie” wysyła osobisty link z gotową wiadomością.

interface Props {
  eventId: string;
  reserved: number;
  /** Twoi znajomi, którzy już odpowiedzieli „Będę” (poniżej tej liczby nie da się zejść). */
  confirmed: number;
  /** Ile miejsc można jeszcze zarezerwować (wolne miejsca w Metando minus jedno, które zawsze zostaje). */
  canAdd: number;
  token: string | null;
  origin: string;
  /** Wiadomość zaproszenia bez linku (link doklejamy na końcu). */
  messagePrefix: string;
  subject: string;
}

function reloadInPlace(eventId: string) {
  try {
    sessionStorage.setItem(`live-scroll:${eventId}`, String(window.scrollY));
  } catch {
    // bez zapamiętania przewinięcia
  }
  window.location.reload();
}

export default function InviteStepper({
  eventId,
  reserved,
  confirmed,
  canAdd,
  token: initialToken,
  origin,
  messagePrefix,
  subject,
}: Props) {
  const [count, setCount] = useState(reserved);
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = token ? `${origin}/i/${token}` : null;

  async function save(next: number) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/events/${eventId}/my-invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: next }),
      });
      const data = (await response.json()) as { token?: string; message?: string };
      if (!response.ok || !data.token) {
        setError(data.message ?? "Nie udało się zmienić liczby zaproszeń.");
        setBusy(false);
        return;
      }
      setCount(next);
      setToken(data.token);
      // Skład i szansa na mecz zależą od rezerwacji — odświeżamy stronę w tym samym miejscu.
      reloadInPlace(eventId);
    } catch {
      setError("Brak połączenia — spróbuj ponownie.");
      setBusy(false);
    }
  }

  const step = "bg-card-2 hover:bg-line grid size-10 place-items-center rounded-full disabled:opacity-40";

  return (
    <div className="flex flex-col gap-3" data-testid="invite-stepper">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-bold">Ilu znajomych zapraszasz?</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={step}
            disabled={busy || count <= confirmed}
            aria-label="Zaproś o jedną osobę mniej"
            onClick={() => void save(count - 1)}
          >
            <Minus className="size-4" aria-hidden="true" />
          </button>
          <span className="display w-8 text-center text-3xl leading-none" aria-live="polite" data-testid="invite-count">
            {count}
          </span>
          <button
            type="button"
            className={step}
            disabled={busy || canAdd <= 0}
            aria-label="Zaproś o jedną osobę więcej"
            onClick={() => void save(count + 1)}
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {url && (count > 0 || confirmed > 0) ? (
        <ShareMenu
          variant="button"
          label="Wyślij zaproszenie"
          text={`${messagePrefix}\n${url}`}
          url={url}
          subject={subject}
          className="w-full"
        />
      ) : (
        <p className="text-ink-3 text-xs">
          Dodaj miejsca dla znajomych — dostaniesz osobisty link, przez który odpowiedzą „Będę” bez zakładania konta.
        </p>
      )}

      {canAdd <= 0 && count === 0 && <p className="text-ink-3 text-xs">Brak wolnych miejsc w składzie.</p>}
      {error && (
        <p className="text-bad text-sm" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
