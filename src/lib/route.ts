// Trasa spotkań w ruchu (rower, bieganie): miejsce spotkania jest punktem zbiórki, a cel albo pętla,
// dystans i tempo opisują, dokąd i jak szybko jedziemy lub biegniemy.

export const ROUTE_SPORTS = ["rower", "bieganie"] as const;

export function isRouteSport(sport: string): boolean {
  return (ROUTE_SPORTS as readonly string[]).includes(sport);
}

export interface RouteFields {
  route_destination: string | null;
  route_loop: boolean;
  route_distance_km: number | null;
  route_pace: string | null;
}

/** Podpowiedź tempa w formularzu, zależnie od sportu. */
export function pacePlaceholder(sport: string): string {
  return sport === "bieganie" ? "np. 5:30–6:00/km" : "np. 25–28 km/h";
}

/** Dystans po polsku: „35 km”, „12,5 km”. */
export function formatDistanceKm(km: number): string {
  return `${String(km).replace(".", ",")} km`;
}

/** Krótki opis trasy na kartę i stronę spotkania, np. „→ Olsztyn · 35 km · 25–28 km/h”; null bez trasy. */
export function routeSummary(event: RouteFields): string | null {
  const target = event.route_loop ? "pętla" : event.route_destination ? `→ ${event.route_destination}` : null;
  const parts = [
    target,
    event.route_distance_km !== null ? formatDistanceKm(event.route_distance_km) : null,
    event.route_pace,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : null;
}
