// Pogoda na czas spotkania z prognozy godzinowej Open-Meteo (do 16 dni, z szansą opadów).
// Dane: Open-Meteo.com, licencja CC BY 4.0 — podpis przy liście spotkań. Darmowy dostęp jest
// niekomercyjny: gdy Metando zacznie zarabiać, trzeba przejść na płatny plan Open-Meteo.

export const WEATHER_ATTRIBUTION = "Pogoda: Open-Meteo.com";

/** Jedna godzina prognozy. */
export interface WeatherPoint {
  /** Początek godziny (ISO, UTC). */
  t: string;
  /** Temperatura powietrza w °C. */
  temp: number;
  /** Temperatura odczuwalna w °C. */
  feels: number | null;
  /** Kod pogody WMO (0 bezchmurnie … 95–99 burza). */
  code: number;
  day: boolean;
  /** Opad w mm w tej godzinie. */
  precip: number | null;
  /** Szansa opadów w %. */
  prob: number | null;
  /** Wiatr i porywy w m/s. */
  wind: number | null;
  gusts: number | null;
}

export interface OpenMeteoResponse {
  hourly?: {
    time: string[];
    temperature_2m: (number | null)[];
    apparent_temperature?: (number | null)[];
    precipitation_probability?: (number | null)[];
    precipitation?: (number | null)[];
    weather_code: (number | null)[];
    wind_speed_10m?: (number | null)[];
    wind_gusts_10m?: (number | null)[];
    is_day?: (number | null)[];
  };
}

/** Zamienia odpowiedź Open-Meteo (kolumny) na listę godzin (to trafia do przeglądarki). */
export function toWeatherPoints(response: OpenMeteoResponse): WeatherPoint[] {
  const h = response.hourly;
  if (!h) return [];
  return h.time.flatMap((time, i) => {
    const temp = h.temperature_2m[i];
    const code = h.weather_code[i];
    if (temp == null || code == null) return [];
    return [
      {
        t: `${time}:00Z`,
        temp,
        feels: h.apparent_temperature?.[i] ?? null,
        code,
        day: (h.is_day?.[i] ?? 1) === 1,
        precip: h.precipitation?.[i] ?? null,
        prob: h.precipitation_probability?.[i] ?? null,
        wind: h.wind_speed_10m?.[i] ?? null,
        gusts: h.wind_gusts_10m?.[i] ?? null,
      },
    ];
  });
}

export interface MatchWeather {
  /** Warunki na początku meczu (temperatura, odczuwalna, pora dnia). */
  start: WeatherPoint;
  /** Najgorszy kod pogody w czasie meczu. */
  code: number;
  /** Najwyższa szansa opadów w czasie meczu (%). */
  prob: number | null;
  /** Suma opadu w czasie meczu (mm). */
  precip: number;
  /** Najsilniejszy wiatr i porywy w czasie meczu (m/s). */
  wind: number | null;
  gusts: number | null;
}

const HOUR = 3_600_000;

/**
 * Pogoda na cały mecz: godziny od startu do końca (co najmniej jedna). Null, gdy termin
 * wypada poza prognozą.
 */
export function forecastFor(points: WeatherPoint[], start: Date, durationMinutes: number): MatchWeather | null {
  const from = Math.floor(start.getTime() / HOUR) * HOUR;
  const to = Math.max(start.getTime() + durationMinutes * 60_000, from + 1);
  const hours = points.filter((p) => {
    const t = new Date(p.t).getTime();
    return t >= from && t < to;
  });
  const first = hours.at(0);
  if (!first) return null;
  const max = (values: (number | null)[]) => {
    const known = values.filter((v): v is number => v !== null);
    return known.length > 0 ? Math.max(...known) : null;
  };
  return {
    start: first,
    code: hours.reduce((worst, p) => (severity(p.code) > severity(worst) ? p.code : worst), first.code),
    prob: max(hours.map((p) => p.prob)),
    precip: hours.reduce((sum, p) => sum + (p.precip ?? 0), 0),
    wind: max(hours.map((p) => p.wind)),
    gusts: max(hours.map((p) => p.gusts)),
  };
}

export type WeatherKind = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

/** Rodzaj pogody z kodu WMO. */
export function weatherKind(code: number): WeatherKind {
  if (code >= 95) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if ((code >= 51 && code <= 57) || code === 61 || code === 80) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (code === 45 || code === 48) return "fog";
  if (code === 3) return "cloudy";
  if (code === 1 || code === 2) return "partly";
  return "clear";
}

const SEVERITY: Record<WeatherKind, number> = {
  clear: 0,
  partly: 1,
  cloudy: 2,
  fog: 3,
  drizzle: 4,
  rain: 5,
  snow: 6,
  storm: 7,
};

function severity(code: number): number {
  return SEVERITY[weatherKind(code)];
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

export function weatherLabel(code: number, day = true): string {
  const kind = weatherKind(code);
  if (kind === "clear" && !day) return "Bezchmurnie";
  if (code === 56 || code === 57 || code === 66 || code === 67) return "Marznący deszcz";
  if (code === 65 || code === 82) return "Ulewa";
  if (code === 80 || code === 81) return "Przelotny deszcz";
  return LABELS[kind];
}

/** „18°”, „-2°” — temperatura zaokrąglona do stopnia. */
export function formatTemp(temp: number): string {
  const rounded = Math.round(temp);
  return `${String(Object.is(rounded, -0) ? 0 : rounded)}°`;
}

/** Szansę opadów pokazujemy od 20% — niżej to szum. */
export const SHOW_RAIN_FROM = 20;
