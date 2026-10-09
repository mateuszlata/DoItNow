// Kwoty trzymamy w groszach (liczby całkowite), a pokazujemy w złotych.

/** Kwota w groszach jako „120 zł” albo „12,50 zł”. */
export function formatPLN(cents: number): string {
  const zl = cents / 100;
  return `${new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: Number.isInteger(zl) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(zl)} zł`;
}

/** Cena wpisana w formularzu („120”, „12,5”, „12.50”) w groszach; null, gdy niepoprawna. */
export function parsePriceToCents(input: string): number | null {
  const normalized = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

/** Udział jednej osoby w koszcie: koszt dzielony przez liczbę miejsc w składzie, zaokrąglony w górę do grosza. */
export function shareCents(costCents: number, teamSize: number): number {
  return Math.ceil(costCents / Math.max(teamSize, 1));
}
