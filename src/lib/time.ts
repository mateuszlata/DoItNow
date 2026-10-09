// Czas wydarzeń jest wprowadzany i wyświetlany w strefie Europe/Warsaw,
// niezależnie od strefy serwera (Cloudflare Workers działają w UTC).
export const APP_TIME_ZONE = "Europe/Warsaw";

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Zamienia czas lokalny w strefie aplikacji ("YYYY-MM-DDTHH:mm") na moment w czasie. */
export function localDateTimeToDate(local: string, timeZone = APP_TIME_ZONE): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) return null;
  const [, y, m, d, h, min] = match.map(Number);
  const guess = Date.UTC(y, m - 1, d, h, min);
  const offset = timeZoneOffsetMs(new Date(guess), timeZone);
  let utc = guess - offset;
  // Korekta dla dni zmiany czasu letniego/zimowego.
  const correctedOffset = timeZoneOffsetMs(new Date(utc), timeZone);
  if (correctedOffset !== offset) utc = guess - correctedOffset;
  return new Date(utc);
}

/** Zwraca przedział [początek, koniec) doby "YYYY-MM-DD" w strefie aplikacji. */
export function dayRange(day: string, timeZone = APP_TIME_ZONE): { from: Date; to: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const from = localDateTimeToDate(`${day}T00:00`, timeZone);
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const to = localDateTimeToDate(`${next.toISOString().slice(0, 10)}T00:00`, timeZone);
  return from && to ? { from, to } : null;
}

/** Moment w czasie jako czas lokalny strefy aplikacji w formacie pola "datetime-local". */
export function toLocalDateTime(date: Date | string, timeZone = APP_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
  return parts.replace(" ", "T");
}

/** Bieżąca data i czas w strefie aplikacji w formacie pola "datetime-local". */
export function nowLocalDateTime(timeZone = APP_TIME_ZONE): string {
  return toLocalDateTime(new Date(), timeZone);
}

export function formatEventDate(iso: string, timeZone = APP_TIME_ZONE): string {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Szybkie filtry terminu na liście ogłoszeń. */
export const WHEN_OPTIONS = ["today", "tomorrow", "weekend"] as const;
export type When = (typeof WHEN_OPTIONS)[number];

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Przedział [początek, koniec) dla „dziś”, „jutro” albo „weekend” (najbliższa sobota i niedziela,
 * a w weekend — bieżący) w strefie aplikacji.
 */
export function whenRange(
  when: string,
  now: Date = new Date(),
  timeZone = APP_TIME_ZONE,
): { from: Date; to: Date } | null {
  const today = toLocalDateTime(now, timeZone).slice(0, 10);
  if (when === "today") return dayRange(today, timeZone);
  if (when === "tomorrow") return dayRange(addDays(today, 1), timeZone);
  if (when !== "weekend") return null;
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const saturday = weekday === 0 ? addDays(today, -1) : addDays(today, 6 - weekday);
  const start = dayRange(saturday, timeZone);
  const end = dayRange(addDays(saturday, 1), timeZone);
  return start && end ? { from: start.from, to: end.to } : null;
}

/** Godzina wydarzenia, np. „18:00”. */
export function formatEventTime(iso: string, timeZone = APP_TIME_ZONE): string {
  return new Intl.DateTimeFormat("pl-PL", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** Dzień tygodnia i data do dużego nagłówka, np. { weekday: "sobota", date: "10.10" }. */
export function eventDayParts(iso: string, timeZone = APP_TIME_ZONE): { weekday: string; date: string } {
  const date = new Date(iso);
  const weekday = new Intl.DateTimeFormat("pl-PL", { timeZone, weekday: "long" }).format(date);
  const dayMonth = new Intl.DateTimeFormat("pl-PL", { timeZone, day: "2-digit", month: "2-digit" }).format(date);
  return { weekday, date: dayMonth };
}
