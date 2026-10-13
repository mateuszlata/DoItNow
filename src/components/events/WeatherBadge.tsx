import { useEffect, useState } from "react";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplet,
  Moon,
  Sun,
  type LucideIcon,
} from "lucide-react";
import {
  RAIN_LIKELY_FROM,
  RAIN_SURE_FROM,
  forecastFor,
  formatTemp,
  weatherKind,
  weatherLabel,
  type MatchWeather,
  type WeatherKind,
  type WeatherPoint,
} from "@/lib/weather";
import { cn } from "@/lib/utils";

// Pogoda na czas spotkania (prognoza Open-Meteo przez /api/weather): najgorsze warunki, najwyższa szansa
// opadów i suma opadu w godzinach meczu. Poza zasięgiem prognozy (16 dni) — data, od której się pojawi.

interface Props {
  /** Spotkanie — serwer bierze jego położenie z bazy (nie przyjmuje dowolnych współrzędnych). */
  eventId: string;
  startsAt: string;
  durationMinutes: number;
  /** `card` — mała plakietka na liście; `large` — na stronie spotkania, z opisem, wiatrem i odczuwalną. */
  size?: "card" | "large";
}

const dayFormat = new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit", timeZone: "Europe/Warsaw" });

// Jedno zapytanie na spotkanie (ta sama karta może się pojawić kilka razy, np. przy przeładowaniu wyspy).
const requests = new Map<string, Promise<WeatherPoint[]>>();

function loadPoints(eventId: string): Promise<WeatherPoint[]> {
  let request = requests.get(eventId);
  if (!request) {
    request = fetch(`/api/weather?event=${encodeURIComponent(eventId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ points: WeatherPoint[] }>) : { points: [] }))
      .then((data) => data.points)
      .catch(() => []);
    requests.set(eventId, request);
  }
  return request;
}

const ICONS: Record<WeatherKind, LucideIcon> = {
  clear: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
};

// Kolor plakietki mówi o warunkach: słońce ciepło, opady chłodno, burza ostrzegawczo.
const TONES: Record<WeatherKind, string> = {
  clear: "bg-bench text-page-deep",
  partly: "bg-bench/60 text-ink",
  cloudy: "bg-card-2 text-ink-2",
  fog: "bg-card-2 text-ink-2",
  drizzle: "bg-ok-soft text-ok",
  rain: "bg-ok-soft text-ok",
  snow: "bg-ok-soft text-ok",
  storm: "bg-warn-soft text-warn",
};

/** Ikona pogody (noc: księżyc zamiast słońca). */
function WeatherIcon({
  code,
  day,
  className,
  strokeWidth,
}: {
  code: number;
  day: boolean;
  className: string;
  strokeWidth: number;
}) {
  const kind = weatherKind(code);
  const props = { className, strokeWidth, "aria-hidden": true } as const;
  if (!day && kind === "clear") return <Moon {...props} />;
  if (!day && kind === "partly") return <CloudMoon {...props} />;
  const Icon = ICONS[kind];
  return <Icon {...props} />;
}

function mm(value: number): string {
  return `${value.toFixed(1).replace(".", ",")} mm`;
}

export default function WeatherBadge({ eventId, startsAt, durationMinutes, size = "card" }: Props) {
  const [match, setMatch] = useState<MatchWeather | null>(null);
  // Termin poza zasięgiem prognozy: dzień, od którego prognoza obejmie spotkanie.
  const [availableFrom, setAvailableFrom] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadPoints(eventId).then((points) => {
      if (cancelled) return;
      const at = new Date(startsAt);
      setMatch(forecastFor(points, at, durationMinutes));
      const last = points.at(-1);
      if (last && at.getTime() > new Date(last.t).getTime()) {
        const horizon = new Date(last.t).getTime() - Date.now();
        setAvailableFrom(new Date(at.getTime() - horizon));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [eventId, startsAt, durationMinutes]);

  if (!match) {
    if (!availableFrom) return null;
    const from = dayFormat.format(availableFrom);
    return (
      <span
        className={cn(
          "bg-card-2 text-ink-2 inline-flex items-center gap-1 rounded-full font-bold",
          size === "large" ? "px-3 py-1.5 text-xs" : "px-2 py-0.5 text-[12px]",
        )}
        title={`Prognoza pogody na czas spotkania pojawi się ${from}.`}
        data-testid="weather-later"
      >
        <CloudSun className="size-4" strokeWidth={2} aria-hidden="true" />
        Pogoda od {from}
      </span>
    );
  }

  const kind = weatherKind(match.code);
  const label = weatherLabel(match.code, match.start.day);
  const chance = match.prob;
  const rain = match.precip >= 0.1 ? mm(match.precip) : null;
  const feels =
    match.start.feels !== null && Math.abs(match.start.feels - match.start.temp) >= 3 ? match.start.feels : null;
  const gusty = match.gusts !== null && match.gusts >= 10 ? match.gusts : null;
  const title = [
    label,
    `${formatTemp(match.start.temp)}C`,
    feels !== null && `odczuwalna ${formatTemp(feels)}`,
    `szansa opadów ${String(match.prob ?? 0)}%`,
    rain && `opad ${rain}`,
    match.wind !== null && `wiatr ${String(Math.round(match.wind))} m/s`,
    gusty !== null && `porywy ${String(Math.round(gusty))} m/s`,
  ]
    .filter(Boolean)
    .join(" · ");

  if (size === "large") {
    return (
      <div
        className={cn("flex w-fit items-center gap-3 rounded-2xl px-4 py-2.5", TONES[kind])}
        title={title}
        data-testid="weather"
      >
        <WeatherIcon code={match.code} day={match.start.day} className="size-8 shrink-0" strokeWidth={1.9} />
        <div className="leading-tight">
          <p className="flex items-baseline gap-2">
            <span className="display text-3xl leading-none">{formatTemp(match.start.temp)}</span>
            {feels !== null && <span className="text-xs font-semibold">odczuwalna {formatTemp(feels)}</span>}
          </p>
          <p className="text-xs font-bold">
            {label} · szansa opadów {match.prob ?? 0}%{rain && <> · {rain}</>}
          </p>
          {match.wind !== null && (
            <p className="text-xs font-semibold">
              wiatr {Math.round(match.wind)} m/s{gusty !== null && <>, porywy do {Math.round(gusty)} m/s</>}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-bold", TONES[kind])}
      title={title}
      aria-label={`Prognoza na czas spotkania: ${title}`}
      data-testid="weather"
    >
      <WeatherIcon code={match.code} day={match.start.day} className="size-4" strokeWidth={2.2} />
      {formatTemp(match.start.temp)}
      <span className="hidden font-semibold sm:inline">{label}</span>
      {chance !== null && (
        <span
          className={cn(
            "inline-flex items-center gap-0.5",
            chance < RAIN_LIKELY_FROM ? "font-semibold opacity-60" : "text-ok",
            chance >= RAIN_SURE_FROM && "font-extrabold",
          )}
          data-testid="weather-rain"
        >
          <Droplet className="size-3.5" strokeWidth={2.4} aria-hidden="true" />
          {chance}%
        </span>
      )}
    </span>
  );
}
