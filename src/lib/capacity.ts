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
