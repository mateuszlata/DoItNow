// Numery koszulek w składzie: kapitan (grający organizator) zawsze z „siódemką”,
// reszta w stałej kolejności dołączenia.
const NUMBERS = [7, 3, 11, 9, 5, 14, 8, 21, 4, 23, 10, 6, 12, 2, 13, 15, 17, 18, 19, 20, 22, 24, 25, 27, 30];

/** Numer koszulki dla miejsca `index` w składzie (0 = pierwsza koszulka). */
export function jerseyNumber(index: number): string {
  return String(NUMBERS[index] ?? index + 1);
}
