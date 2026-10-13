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
  Moon,
  Sun,
  type LucideIcon,
} from "lucide-react";
import {
  forecastAt,
  formatTemp,
  isNight,
  weatherKind,
  weatherLabel,
  type WeatherKind,
  type WeatherPoint,
} from "@/lib/weather";
import { cn } from "@/lib/utils";

// Pogoda na godzinę spotkania (prognoza MET Norway przez /api/weather). Pokazuje się dopiero, gdy
// termin mieści się w prognozie (ok. 9 dni) — wcześniej nic nie zajmuje miejsca na karcie.

interface Props {
  lat: number;
  lng: number;
  startsAt: string;
  /** `card` — mała plakietka na liście; `large` — na stronie spotkania, z opisem i wiatrem. */
  size?: "card" | "large";
}

const dayFormat = new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit", timeZone: "Europe/Warsaw" });

// Jedno zapytanie na okolicę, wspólne dla wszystkich kart na stronie.
const requests = new Map<string, Promise<WeatherPoint[]>>();

function loadPoints(lat: number, lng: number): Promise<WeatherPoint[]> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  let request = requests.get(key);
  if (!request) {
    request = fetch(`/api/weather?lat=${lat.toFixed(2)}&lng=${lng.toFixed(2)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ points: WeatherPoint[] }>) : { points: [] }))
      .then((data) => data.points)
      .catch(() => []);
    requests.set(key, request);
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
function WeatherIcon({ symbol, className, strokeWidth }: { symbol: string; className: string; strokeWidth: number }) {
  const kind = weatherKind(symbol);
  const props = { className, strokeWidth, "aria-hidden": true } as const;
  if (isNight(symbol) && kind === "clear") return <Moon {...props} />;
  if (isNight(symbol) && kind === "partly") return <CloudMoon {...props} />;
  const Icon = ICONS[kind];
  return <Icon {...props} />;
}

export default function WeatherBadge({ lat, lng, startsAt, size = "card" }: Props) {
  const [point, setPoint] = useState<WeatherPoint | null>(null);
  // Termin poza zasięgiem prognozy: dzień, od którego prognoza obejmie spotkanie.
  const [availableFrom, setAvailableFrom] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadPoints(lat, lng).then((points) => {
      if (cancelled) return;
      const at = new Date(startsAt);
      setPoint(forecastAt(points, at));
      const last = points.at(-1);
      if (last && at.getTime() > new Date(last.t).getTime() + 3 * 3_600_000) {
        const horizon = new Date(last.t).getTime() - Date.now();
        setAvailableFrom(new Date(at.getTime() - horizon));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [lat, lng, startsAt]);

  if (!point?.symbol) {
    if (!availableFrom) return null;
    const from = dayFormat.format(availableFrom);
    return (
      <span
        className={cn(
          "bg-card-2 text-ink-2 inline-flex items-center gap-1 rounded-full font-bold",
          size === "large" ? "px-3 py-1.5 text-xs" : "px-2 py-0.5 text-[12px]",
        )}
        title={`Prognoza pogody na godzinę spotkania pojawi się ${from}.`}
        data-testid="weather-later"
      >
        <CloudSun className="size-4" strokeWidth={2} aria-hidden="true" />
        Pogoda od {from}
      </span>
    );
  }
  const kind = weatherKind(point.symbol);
  const label = weatherLabel(point.symbol);
  const rain = point.precip !== null && point.precip >= 0.1 ? `${point.precip.toFixed(1).replace(".", ",")} mm` : null;
  const title = [
    label,
    `${formatTemp(point.temp)}C`,
    rain && `opad ${rain}`,
    point.wind !== null && `wiatr ${String(Math.round(point.wind))} m/s`,
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
        <WeatherIcon symbol={point.symbol} className="size-8 shrink-0" strokeWidth={1.9} />
        <div className="leading-tight">
          <p className="display text-3xl leading-none">{formatTemp(point.temp)}</p>
          <p className="text-xs font-bold">
            {label}
            {rain && <> · {rain}</>}
            {point.wind !== null && <> · wiatr {Math.round(point.wind)} m/s</>}
          </p>
        </div>
      </div>
    );
  }

  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-bold", TONES[kind])}
      title={title}
      aria-label={`Prognoza na godzinę spotkania: ${title}`}
      data-testid="weather"
    >
      <WeatherIcon symbol={point.symbol} className="size-4" strokeWidth={2.2} />
      {formatTemp(point.temp)}
      <span className="hidden font-semibold sm:inline">{label}</span>
      {rain && <span className="font-semibold opacity-80">{rain}</span>}
    </span>
  );
}
