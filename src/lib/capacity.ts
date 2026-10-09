// Liczenie składu: `spots` to miejsca do obsadzenia, a organizator, który gra, zajmuje jedno więcej.
interface Capacity {
  spots: number;
  organizer_plays: boolean;
}

/** Liczba osób w całym składzie, np. 12 przy grze 6 na 6. */
export function teamSize(event: Capacity): number {
  return event.spots + (event.organizer_plays ? 1 : 0);
}

/** Wolne miejsca: miejsca do obsadzenia minus zaakceptowani uczestnicy. */
export function freeSpots(event: Capacity & { accepted_count: number }): number {
  return Math.max(event.spots - event.accepted_count, 0);
}

/** Zajęte miejsca w składzie, łącznie z grającym organizatorem. */
export function takenSpots(event: Capacity & { accepted_count: number }): number {
  return event.accepted_count + (event.organizer_plays ? 1 : 0);
}

/** Ilu osób brakuje do minimum (0 = spotkanie dojdzie do skutku); null, gdy organizator nie ustawił minimum. */
export function missingToMinimum(
  event: Capacity & { accepted_count: number; min_people: number | null },
): number | null {
  if (event.min_people === null) return null;
  return Math.max(event.min_people - takenSpots(event), 0);
}

/** Wolne miejsca na liście rezerwowej. */
export function freeReserve(event: { reserve_spots: number; reserve_count: number }): number {
  return Math.max(event.reserve_spots - event.reserve_count, 0);
}

/** Krótki opis stanu minimum do kart i szczegółów. */
export function minimumLabel(event: Capacity & { accepted_count: number; min_people: number | null }): string | null {
  const missing = missingToMinimum(event);
  if (missing === null) return null;
  if (missing === 0) return `Spotkanie dojdzie do skutku (min. ${String(event.min_people)})`;
  const people = missing === 1 ? "osoby" : "osób";
  return `Brakuje ${String(missing)} ${people} do minimum (${String(event.min_people)})`;
}

/** Odmiana „wolne / wolnych” do liczby miejsc: 1, 2–4 (poza 12–14) → „wolne”, reszta → „wolnych”. */
export function freeWord(count: number): string {
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  if (count === 1 || (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14))) return "wolne";
  return "wolnych";
}
