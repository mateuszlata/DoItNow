// Pogoda na godzinę spotkania z prognozy MET Norway (api.met.no, Locationforecast 2.0 „compact”).
// Dane: MET Norway, licencja CC BY 4.0 — podpis „Pogoda: MET Norway” przy liście spotkań.

export const WEATHER_ATTRIBUTION = "Pogoda: MET Norway (yr.no)";

/** Jeden punkt prognozy (co godzinę przez ok. 2,5 doby, potem co 6 h — do ok. 9 dni). */
export interface WeatherPoint {
  /** Początek okresu (ISO). */
  t: string;
  /** Temperatura powietrza w °C. */
  temp: number;
  /** Kod symbolu MET (np. `partlycloudy_day`, `lightrain`). */
  symbol: string | null;
  /** Opad w mm w następnej godzinie (albo 6 h dalej w prognozie). */
  precip: number | null;
  /** Wiatr w m/s. */
  wind: number | null;
}

interface MetSummary {
  summary?: { symbol_code?: string };
  details?: { precipitation_amount?: number };
}

export interface MetResponse {
  properties?: {
    timeseries?: {
      time: string;
      data: {
        instant: { details: { air_temperature?: number; wind_speed?: number } };
        next_1_hours?: MetSummary;
        next_6_hours?: MetSummary;
      };
    }[];
  };
}

/** Zamienia odpowiedź MET na zwięzłą listę punktów (to trafia do przeglądarki). */
export function toWeatherPoints(response: MetResponse): WeatherPoint[] {
  return (response.properties?.timeseries ?? []).flatMap((entry) => {
    const temp = entry.data.instant.details.air_temperature;
    if (temp === undefined) return [];
    const next = entry.data.next_1_hours ?? entry.data.next_6_hours;
    return [
      {
        t: entry.time,
        temp,
        symbol: next?.summary?.symbol_code ?? null,
        precip: next?.details?.precipitation_amount ?? null,
        wind: entry.data.instant.details.wind_speed ?? null,
      },
    ];
  });
}

/** Punkt prognozy najbliższy godzinie spotkania (najwyżej 3 h różnicy); null poza zasięgiem prognozy. */
export function forecastAt(points: WeatherPoint[], at: Date): WeatherPoint | null {
  let best: WeatherPoint | null = null;
  let bestDiff = Infinity;
  for (const point of points) {
    if (!point.symbol) continue;
    const diff = Math.abs(new Date(point.t).getTime() - at.getTime());
    if (diff < bestDiff) {
      best = point;
      bestDiff = diff;
    }
  }
  return bestDiff <= 3 * 3_600_000 ? best : null;
}

export type WeatherKind = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

/** Rodzaj pogody z kodu symbolu MET (bez pory dnia). */
export function weatherKind(symbol: string): WeatherKind {
  const base = symbol.replace(/_(day|night|polartwilight)$/, "");
  if (base.includes("thunder")) return "storm";
  if (base.includes("snow") || base.includes("sleet")) return "snow";
  if (base.startsWith("light") && base.includes("rain")) return "drizzle";
  if (base.includes("rain")) return "rain";
  if (base === "fog") return "fog";
  if (base === "cloudy") return "cloudy";
  if (base === "partlycloudy" || base === "fair") return "partly";
  return "clear";
}

export function isNight(symbol: string): boolean {
  return symbol.endsWith("_night");
}

const LABELS: Record<WeatherKind, string> = {
  clear: "Słonecznie",
  partly: "Częściowe zachmurzenie",
  cloudy: "Pochmurno",
  fog: "Mgła",
  drizzle: "Słaby deszcz",
  rain: "Deszcz",
  snow: "Śnieg",
  storm: "Burza",
};

export function weatherLabel(symbol: string): string {
  const kind = weatherKind(symbol);
  if (kind === "clear" && isNight(symbol)) return "Bezchmurnie";
  if (symbol.includes("sleet")) return "Deszcz ze śniegiem";
  if (symbol.startsWith("heavyrain")) return "Ulewa";
  return LABELS[kind];
}

/** „18°”, „-2°” — temperatura zaokrąglona do stopnia. */
export function formatTemp(temp: number): string {
  const rounded = Math.round(temp);
  return `${String(Object.is(rounded, -0) ? 0 : rounded)}°`;
}
