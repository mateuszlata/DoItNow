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

/** Bieżąca data i czas w strefie aplikacji w formacie pola "datetime-local". */
export function nowLocalDateTime(timeZone = APP_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
  return parts.replace(" ", "T");
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
