// Gotowe wiadomości do udostępniania (WhatsApp, Messenger, e-mail): zamiast samego linku — krótki opis
// spotkania i zachęta. Link jest częścią tekstu, bo część aplikacji pomija osobne pole z adresem.
import { sportLabel, sportVisual } from "@/lib/sports";
import { formatEventDay, formatTimeRange } from "@/lib/time";

interface ShareEvent {
  sport: string;
  area: string;
  starts_at: string;
  duration_minutes: number;
}

function when(event: ShareEvent): string {
  return `${formatEventDay(event.starts_at)}, ${formatTimeRange(event.starts_at, event.duration_minutes)}`;
}

function missing(count: number): string {
  return count === 1 ? "Brakuje jeszcze 1 osoby." : `Brakuje jeszcze ${String(count)} osób.`;
}

/** Udostępnienie ogłoszenia w Metando: termin, okolica, ile osób brakuje. */
export function eventShareText(event: ShareEvent, freeSpots: number, url: string): string {
  const head = `${sportVisual(event.sport).emoji} ${sportLabel(event.sport)} — ${when(event)}, ${event.area}`;
  const call =
    freeSpots > 0
      ? `${missing(freeSpots)} Wchodzisz? 👇`
      : "Skład prawie w komplecie — zapisz się na rezerwę, jeśli są miejsca 👇";
  return `${head}\n${call}\n${url}`;
}

/** Zaproszenie organizatora dla znajomych spoza Metando (odpowiedź bez zakładania konta). */
export function inviteShareText(event: ShareEvent, url: string): string {
  const head = `${sportVisual(event.sport).emoji} ${sportLabel(event.sport)} — ${when(event)}, ${event.area}`;
  return `Hej! Zbieram ekipę: ${head}.\nBędziesz? Kliknij i daj znać jednym przyciskiem (bez zakładania konta) 👇\n${url}`;
}
