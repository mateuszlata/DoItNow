// Odliczanie do startu spotkania na kartach i w szczegółach („za 2 d 6 h 11 min”).
// Ta sama logika działa na serwerze (pierwszy widok) i w przeglądarce (skrypt odświeżający co sekundę).

export type CountdownState = "upcoming" | "soon" | "live" | "over";

/** Poniżej tylu milisekund do startu licznik zmienia się w wyróżnioną plakietkę. */
export const SOON_MS = 3 * 3_600_000;

export function formatCountdown(
  startMs: number,
  endMs: number,
  nowMs: number,
): { text: string; state: CountdownState } {
  if (nowMs >= endMs) return { text: "zakończone", state: "over" };
  if (nowMs >= startMs) return { text: "trwa teraz", state: "live" };
  const total = Math.floor((startMs - nowMs) / 1000);
  const d = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  let text: string;
  if (d > 0) text = `za ${String(d)} d ${String(h)} h ${String(m)} min`;
  else if (h > 0) text = `za ${String(h)} h ${String(m)} min`;
  // W ostatniej godzinie z sekundami — wtedy tykanie ma sens.
  else text = `za ${String(m)} min ${String(s).padStart(2, "0")} s`;
  return { text, state: startMs - nowMs <= SOON_MS ? "soon" : "upcoming" };
}
