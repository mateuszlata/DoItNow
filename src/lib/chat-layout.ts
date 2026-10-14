// Układ czatu jak w komunikatorach: wiadomości jednej osoby pisane pod rząd tworzą grupę (nick i koszulka raz),
// a godzina pojawia się jako separator tylko po dłuższej przerwie albo zmianie dnia.

/** Przerwa, po której pokazujemy separator z godziną. */
export const TIME_DIVIDER_GAP_MS = 15 * 60_000;
/** Przerwa, po której kolejna wiadomość tej samej osoby zaczyna nową grupę. */
export const GROUP_GAP_MS = 5 * 60_000;

export interface ChatRow {
  /** Separator z godziną przed tą wiadomością. */
  divider: boolean;
  /** Pierwsza wiadomość grupy (nad nią nick autora). */
  first: boolean;
  /** Ostatnia wiadomość grupy (obok niej koszulka autora). */
  last: boolean;
}

const warsawDay = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" });

export function chatLayout(messages: { author_id: string; created_at: string }[]): ChatRow[] {
  const at = messages.map((m) => new Date(m.created_at).getTime());
  const divider = messages.map(
    (_, i) =>
      i === 0 || at[i] - at[i - 1] >= TIME_DIVIDER_GAP_MS || warsawDay.format(at[i]) !== warsawDay.format(at[i - 1]),
  );
  const first = messages.map(
    (m, i) => divider[i] || m.author_id !== messages[i - 1].author_id || at[i] - at[i - 1] > GROUP_GAP_MS,
  );
  return messages.map((_, i) => ({
    divider: divider[i],
    first: first[i],
    last: i === messages.length - 1 || first[i + 1],
  }));
}

const timeFormat = new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" });
const dayFormat = new Intl.DateTimeFormat("pl-PL", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "Europe/Warsaw",
});

/** Etykieta separatora: „Dziś 13:58”, „Wczoraj 21:10”, „pon., 12 paź, 18:00”. */
export function dividerLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const day = warsawDay.format(date);
  const time = timeFormat.format(date);
  if (day === warsawDay.format(now)) return `Dziś ${time}`;
  if (day === warsawDay.format(new Date(now.getTime() - 86_400_000))) return `Wczoraj ${time}`;
  return `${dayFormat.format(date)}, ${time}`;
}

export function messageTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}
