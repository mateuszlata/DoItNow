// Poziom sportowy: 1 rekreacyjnie … 4 wyczynowo. Gracz deklaruje go w każdym sporcie, organizator ustala zakres
// spotkania (puste = dla każdego). Opisy przy poziomach różnią się między sportami — inaczej „średnio” każdy
// rozumie po swojemu.

export const LEVELS = [1, 2, 3, 4] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_LABELS: Record<Level, string> = {
  1: "Rekreacyjnie",
  2: "Średnio",
  3: "Zaawansowanie",
  4: "Wyczynowo",
};

/** Przymiotniki do zakresu spotkania („Poziom: średni–zaawansowany”). */
const LEVEL_ADJECTIVES: Record<Level, string> = {
  1: "rekreacyjny",
  2: "średni",
  3: "zaawansowany",
  4: "wyczynowy",
};

const GENERAL: Record<Level, string> = {
  1: "dla zabawy, gram okazjonalnie",
  2: "gram regularnie, znam zasady",
  3: "dobra technika i kondycja",
  4: "gram lub grałem w klubie, startuję w zawodach",
};

const BY_SPORT: Record<string, Record<Level, string>> = {
  "pilka-nozna": {
    1: "kopię kilka razy w roku",
    2: "gram co tydzień ze znajomymi",
    3: "liga szóstek, amatorska drużyna",
    4: "grałem w klubie, ligi amatorskie na wysokim poziomie",
  },
  koszykowka: {
    1: "rzucam do kosza od czasu do czasu",
    2: "gram regularnie, znam zasady i krok",
    3: "amatorska liga, gram taktycznie",
    4: "grałem w klubie lub lidze szkolnej/akademickiej",
  },
  siatkowka: {
    1: "odbijam dla zabawy, na plaży czy w szkole",
    2: "gram regularnie, przyjmuję i wystawiam",
    3: "amatorska liga, atak i zagrywka z wyskoku",
    4: "grałem w klubie",
  },
  tenis: {
    1: "uczę się, krótkie wymiany",
    2: "utrzymuję wymianę, gram mecze ze znajomymi",
    3: "gram turnieje amatorskie, mocny serwis",
    4: "rankingi, ligi, gra klubowa",
  },
  badminton: {
    1: "odbijam rekreacyjnie",
    2: "znam zasady, gram regularnie",
    3: "smecze, gra deblowa z taktyką",
    4: "turnieje, gra klubowa",
  },
  squash: {
    1: "pierwsze miesiące gry",
    2: "gram regularnie, utrzymuję wymianę",
    3: "gram taktycznie, ligi amatorskie",
    4: "turnieje, gra klubowa",
  },
  "tenis-stolowy": {
    1: "odbijam dla zabawy",
    2: "gram regularnie, podkręcam",
    3: "liga amatorska, gram rotacjami",
    4: "liga, gra klubowa",
  },
  bieganie: {
    1: "biegam spokojnie, 5 km powyżej 35 min",
    2: "5 km w 28–35 min",
    3: "5 km w 22–28 min",
    4: "5 km poniżej 22 min",
  },
  rower: {
    1: "spokojnie, do 18 km/h",
    2: "18–24 km/h na dystansie",
    3: "25–30 km/h, dłuższe trasy",
    4: "powyżej 30 km/h, wyścigi",
  },
};

export function isLevel(value: unknown): value is Level {
  return typeof value === "number" && (LEVELS as readonly number[]).includes(value);
}

/** Opis poziomu w danym sporcie (albo ogólny). */
export function levelHint(sport: string, level: Level): string {
  return (BY_SPORT[sport] ?? GENERAL)[level];
}

/** „Dla każdego”, „Poziom średni”, „Poziom średni–zaawansowany”. */
export function levelRangeLabel(min: number | null, max: number | null): string {
  if (!isLevel(min) || !isLevel(max)) return "Dla każdego";
  return min === max ? `Poziom ${LEVEL_ADJECTIVES[min]}` : `Poziom ${LEVEL_ADJECTIVES[min]}–${LEVEL_ADJECTIVES[max]}`;
}

/** Zakresy do wyboru w formularzu spotkania (wartość „min-max”; pusta = dla każdego). */
export const LEVEL_RANGES = [
  { value: "", label: "Dla każdego" },
  { value: "1-1", label: "Rekreacyjnie" },
  { value: "1-2", label: "Rekreacyjnie – średnio" },
  { value: "2-2", label: "Średnio" },
  { value: "2-3", label: "Średnio – zaawansowanie" },
  { value: "3-3", label: "Zaawansowanie" },
  { value: "3-4", label: "Zaawansowanie – wyczynowo" },
  { value: "4-4", label: "Wyczynowo" },
] as const;

export function parseLevelRange(value: unknown): { min: Level; max: Level } | null {
  if (typeof value !== "string") return null;
  const match = /^([1-4])-([1-4])$/.exec(value);
  if (!match) return null;
  const min = Number(match[1]) as Level;
  const max = Number(match[2]) as Level;
  return min <= max ? { min, max } : null;
}

/** Czy zadeklarowany poziom gracza mieści się w zakresie spotkania (brak zakresu albo deklaracji = pasuje). */
export function fitsLevel(level: number | null, min: number | null, max: number | null): boolean {
  if (level === null || min === null || max === null) return true;
  return level >= min && level <= max;
}

/** „2× średnio, 1× zaawansowanie”. */
export function levelMixLabel(mix: { level: number; players: number }[]): string {
  return mix
    .filter((row) => isLevel(row.level))
    .map((row) => `${String(row.players)}× ${LEVEL_LABELS[row.level as Level].toLowerCase()}`)
    .join(", ");
}

/**
 * Warunek PostgREST („or”) dla filtra „pasujące do mojego poziomu”: spotkania dla każdego, w sportach bez mojej
 * deklaracji (jak w fitsLevel — brak danych pasuje) i te, których zakres obejmuje mój poziom w danym sporcie.
 * `null`, gdy nie podano żadnego poziomu — wtedy pasuje wszystko.
 */
export function levelFitFilter(levels: Partial<Record<string, Level>>): string | null {
  const declared = Object.entries(levels).filter((entry): entry is [string, Level] => isLevel(entry[1]));
  if (declared.length === 0) return null;
  const sports = declared.map(([sport]) => `"${sport}"`).join(",");
  const fits = declared.map(
    ([sport, level]) => `and(sport.eq."${sport}",level_min.lte.${String(level)},level_max.gte.${String(level)})`,
  );
  return ["level_min.is.null", `sport.not.in.(${sports})`, ...fits].join(",");
}
