// „Składy na mecz”: podział graczy na dwie drużyny i ustawienie na boisku dla sportów drużynowych
// i gier rakietowych. Boisko w polu 100×150 (pion); drużyna A gra na dolnej połowie, B — na górnej (odbicie).
// Listy sportów i pozycji muszą być zgodne z supabase/migrations/*_lineups_more_sports.sql.

export interface PositionOption {
  id: string;
  label: string;
  short: string;
}

export type CourtKind = "football" | "basketball" | "volleyball" | "racket";

export interface Slot {
  x: number;
  y: number;
  /** Pozycja, dla której przeznaczone jest miejsce (dopasowanie graczy według ulubionej pozycji). */
  role: string;
}

interface SportLineup {
  court: CourtKind;
  /** Pozycje do wyboru w profilu; pusta lista = bez pozycji (gry rakietowe). */
  positions: PositionOption[];
  /** Pozycja, której potrzebuje każda drużyna dokładnie jedna (bramkarz, rozgrywający). */
  key?: { id: string; many: string; none: string; one: string };
  /** Kolejność rozdzielania pozycji między drużyny. */
  order: string[];
  /** Ustawienie drużyny A dla składu `size` osób. */
  formation: (size: number) => Slot[];
}

const ANY: PositionOption = { id: "obojetnie", label: "Obojętnie", short: "—" };

/** Zapas miejsc dla składów większych niż ustawienie: kolejny rząd przy środku boiska. */
function withExtra(base: Slot[], size: number, extraY: number): Slot[] {
  if (size <= base.length) return base.slice(0, Math.max(size, 0));
  const extra = size - base.length;
  return [
    ...base,
    ...Array.from({ length: extra }, (_, i) => ({
      x: Math.round((100 * (i + 1)) / (extra + 1)),
      y: extraY,
      role: "obojetnie",
    })),
  ];
}

function spread(count: number, y: number, role: string): Slot[] {
  return Array.from({ length: count }, (_, i) => ({ x: Math.round((100 * (i + 1)) / (count + 1)), y, role }));
}

function footballFormation(size: number): Slot[] {
  const table: Record<number, number[]> = {
    0: [],
    1: [1],
    2: [2],
    3: [2, 1],
    4: [2, 2],
    5: [2, 1, 2],
    6: [2, 3, 1],
    7: [3, 3, 1],
    8: [3, 3, 2],
    9: [4, 3, 2],
    10: [4, 4, 2],
  };
  const rows = table[Math.min(Math.max(size - 1, 0), 10)];
  const ys = rows.length === 1 ? [108] : rows.length === 2 ? [118, 92] : [122, 104, 87];
  const roles = rows.length === 1 ? ["atak"] : rows.length === 2 ? ["obrona", "atak"] : ["obrona", "pomoc", "atak"];
  const slots: Slot[] = [{ x: 50, y: 139, role: "bramka" }];
  rows.forEach((count, row) => slots.push(...spread(count, ys[row], roles[row])));
  return withExtra(slots, size, 82);
}

function basketballFormation(size: number): Slot[] {
  const five: Slot[] = [
    { x: 50, y: 96, role: "rozgrywajacy" },
    { x: 18, y: 108, role: "skrzydlowy" },
    { x: 82, y: 108, role: "skrzydlowy" },
    { x: 36, y: 128, role: "srodkowy" },
    { x: 64, y: 128, role: "srodkowy" },
  ];
  if (size <= 3) {
    return [
      { x: 50, y: 98, role: "rozgrywajacy" },
      { x: 26, y: 120, role: "skrzydlowy" },
      { x: 74, y: 120, role: "srodkowy" },
    ].slice(0, size);
  }
  return withExtra(size === 4 ? [five[0], five[1], five[2], five[3]] : five, size, 86);
}

function volleyballFormation(size: number): Slot[] {
  if (size <= 2)
    return [
      { x: 30, y: 110, role: "obojetnie" },
      { x: 70, y: 110, role: "obojetnie" },
    ].slice(0, size);
  if (size <= 4) {
    return [
      { x: 30, y: 92, role: "atakujacy" },
      { x: 70, y: 92, role: "rozgrywajacy" },
      { x: 30, y: 125, role: "przyjmujacy" },
      { x: 70, y: 125, role: "libero" },
    ].slice(0, size);
  }
  // Ustawienie 6-osobowe: trzech przy siatce, trzech w drugiej linii; rozgrywający z prawej z tyłu.
  return withExtra(
    [
      { x: 80, y: 126, role: "rozgrywajacy" },
      { x: 20, y: 90, role: "przyjmujacy" },
      { x: 50, y: 90, role: "srodkowy" },
      { x: 80, y: 90, role: "atakujacy" },
      { x: 20, y: 126, role: "przyjmujacy" },
      { x: 50, y: 126, role: "libero" },
    ],
    size,
    108,
  );
}

function racketFormation(size: number): Slot[] {
  if (size <= 1) return [{ x: 50, y: 118, role: "obojetnie" }].slice(0, size);
  return withExtra(
    [
      { x: 30, y: 112, role: "obojetnie" },
      { x: 70, y: 112, role: "obojetnie" },
    ],
    size,
    132,
  );
}

const RACKET: SportLineup = { court: "racket", positions: [], order: ["obojetnie"], formation: racketFormation };

export const SPORT_LINEUPS: Record<string, SportLineup> = {
  "pilka-nozna": {
    court: "football",
    positions: [
      { id: "bramka", label: "Bramka", short: "BR" },
      { id: "obrona", label: "Obrona", short: "OBR" },
      { id: "pomoc", label: "Pomoc", short: "POM" },
      { id: "atak", label: "Atak", short: "ATK" },
      ANY,
    ],
    key: {
      id: "bramka",
      many: "chętnych na bramkę",
      one: "Brakuje bramkarza w jednej drużynie — na bramce stanie ktoś z osób „obojętnie”.",
      none: "Nikt nie zgłosił się na bramkę — na bramkach staną osoby „obojętnie”. Może zmiany co 10 minut?",
    },
    order: ["obrona", "pomoc", "atak", "obojetnie", "bramka"],
    formation: footballFormation,
  },
  koszykowka: {
    court: "basketball",
    positions: [
      { id: "rozgrywajacy", label: "Rozgrywający", short: "ROZ" },
      { id: "skrzydlowy", label: "Skrzydłowy", short: "SKR" },
      { id: "srodkowy", label: "Środkowy", short: "ŚR" },
      ANY,
    ],
    order: ["rozgrywajacy", "srodkowy", "skrzydlowy", "obojetnie"],
    formation: basketballFormation,
  },
  siatkowka: {
    court: "volleyball",
    positions: [
      { id: "rozgrywajacy", label: "Rozgrywający", short: "ROZ" },
      { id: "przyjmujacy", label: "Przyjmujący", short: "PRZ" },
      { id: "srodkowy", label: "Środkowy", short: "ŚR" },
      { id: "atakujacy", label: "Atakujący", short: "ATA" },
      { id: "libero", label: "Libero", short: "LIB" },
      ANY,
    ],
    key: {
      id: "rozgrywajacy",
      many: "chętnych na rozegranie",
      one: "Jedna drużyna nie ma rozgrywającego — rozegra ktoś z osób „obojętnie”.",
      none: "Nikt nie zgłosił się do rozegrania — rozgrywać będą osoby „obojętnie”.",
    },
    order: ["rozgrywajacy", "libero", "srodkowy", "atakujacy", "przyjmujacy", "obojetnie"],
    formation: volleyballFormation,
  },
  tenis: RACKET,
  badminton: RACKET,
  "tenis-stolowy": RACKET,
};

export const LINEUP_SPORTS = Object.keys(SPORT_LINEUPS);
/** Sporty, w których gracz wybiera ulubioną pozycję w profilu. */
export const POSITION_SPORTS = LINEUP_SPORTS.filter((id) => SPORT_LINEUPS[id].positions.length > 0);

export function supportsLineup(sport: string): boolean {
  return Object.hasOwn(SPORT_LINEUPS, sport);
}

export function positionsFor(sport: string): PositionOption[] {
  return supportsLineup(sport) ? SPORT_LINEUPS[sport].positions : [];
}

export function isPosition(sport: string, value: unknown): value is string {
  return typeof value === "string" && positionsFor(sport).some((p) => p.id === value);
}

export function positionShort(sport: string, position: string): string {
  return positionsFor(sport).find((p) => p.id === position)?.short ?? "";
}

export function formation(sport: string, size: number): Slot[] {
  return supportsLineup(sport) ? SPORT_LINEUPS[sport].formation(size) : [];
}

/** Kolory znaczników drużyn (zgodne z ograniczeniem w supabase/migrations/*_match_lineups.sql). */
export const TEAM_COLORS = [
  { hex: "#ff7a1a", label: "pomarańczowe" },
  { hex: "#2a9d55", label: "zielone" },
  { hex: "#d62828", label: "czerwone" },
  { hex: "#1d3557", label: "granatowe" },
  { hex: "#f4d03f", label: "żółte" },
  { hex: "#ffffff", label: "białe" },
  { hex: "#6a3fa0", label: "fioletowe" },
  { hex: "#13261f", label: "czarne" },
] as const;

/** Domyślne kolory drużyn czytelne na danym boisku (pomarańcz ginie na parkiecie i boisku do siatkówki). */
export const DEFAULT_TEAM_COLORS: Record<CourtKind, [string, string]> = {
  football: ["#ff7a1a", "#ffffff"],
  basketball: ["#ffffff", "#1d3557"],
  volleyball: ["#ffffff", "#1d3557"],
  racket: ["#ff7a1a", "#ffffff"],
};

export interface LineupPlayer {
  userId: string;
  name: string;
  /** Ulubiona pozycja w danym sporcie („obojetnie”, gdy brak). */
  position: string;
}

export interface Assignment {
  user_id: string;
  team: 0 | 1;
  /** Miejsce w ustawieniu drużyny (indeks w `formation`). */
  slot: number;
}

export function mirrorSlot(slot: Slot): Slot {
  return { ...slot, x: 100 - slot.x, y: 150 - slot.y };
}

/** Rozstawia graczy drużyny na miejsca: najpierw zgodnie z ulubioną pozycją, potem na wolne miejsca. */
function assignSlots(sport: string, team: 0 | 1, players: LineupPlayer[]): Assignment[] {
  const slots = formation(sport, players.length);
  const free = slots.map((_, i) => i);
  const result: Assignment[] = [];
  const waiting: LineupPlayer[] = [];
  for (const player of players) {
    const index = free.find((i) => slots[i].role === player.position);
    if (index === undefined) {
      waiting.push(player);
    } else {
      free.splice(free.indexOf(index), 1);
      result.push({ user_id: player.userId, team, slot: index });
    }
  }
  // Kluczowe miejsce (bramka, rozegranie) obsadzamy najpierw kimś „obojętnie”.
  waiting.sort((a, b) => Number(b.position === "obojetnie") - Number(a.position === "obojetnie"));
  for (const player of waiting) {
    const index = free.shift() ?? Math.min(slots.length, 10);
    result.push({ user_id: player.userId, team, slot: Math.min(index, 10) });
  }
  return result;
}

export interface SplitResult {
  assignments: Assignment[];
  /** Podpowiedzi dla organizatora (konflikty pozycji). */
  notes: string[];
}

/** Podział według ulubionych pozycji: kluczowa pozycja po jednej na drużynę, reszta po równo, pozycja po pozycji. */
export function splitByPositions(sport: string, players: LineupPlayer[]): SplitResult {
  const config = supportsLineup(sport) ? SPORT_LINEUPS[sport] : RACKET;
  const teams: [LineupPlayer[], LineupPlayer[]] = [[], []];
  const notes: string[] = [];
  const placed = new Set<LineupPlayer>();

  if (config.key) {
    const keyRole = config.key.id;
    const keyPlayers = players.filter((p) => p.position === keyRole);
    keyPlayers.slice(0, 2).forEach((p, i) => {
      teams[i].push(p);
      placed.add(p);
    });
    if (keyPlayers.length > 2) {
      const rest = keyPlayers
        .slice(2)
        .map((p) => p.name)
        .join(", ");
      notes.push(
        `${String(keyPlayers.length)} ${config.key.many} — ${keyPlayers[0].name} i ${keyPlayers[1].name} w różnych drużynach, ${rest} na innych pozycjach. Może zmiana w przerwie?`,
      );
    } else if (players.length >= 2) {
      if (keyPlayers.length === 1) notes.push(config.key.one);
      if (keyPlayers.length === 0) notes.push(config.key.none);
    }
  }

  let turn = 1;
  const order = [...config.order, ...players.map((p) => p.position)];
  for (const position of new Set(order)) {
    for (const player of players.filter((p) => p.position === position && !placed.has(p))) {
      const target = teams[0].length < teams[1].length ? 0 : teams[1].length < teams[0].length ? 1 : turn;
      teams[target].push(player);
      placed.add(player);
      turn = 1 - turn;
    }
  }
  return { assignments: [...assignSlots(sport, 0, teams[0]), ...assignSlots(sport, 1, teams[1])], notes };
}

/** Losowy podział po równo; `random` do testów. */
export function randomSplit(sport: string, players: LineupPlayer[], random: () => number = Math.random): SplitResult {
  const shuffled = [...players];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const teams: [LineupPlayer[], LineupPlayer[]] = [[], []];
  shuffled.forEach((p, i) => teams[i % 2].push(p));
  return { assignments: [...assignSlots(sport, 0, teams[0]), ...assignSlots(sport, 1, teams[1])], notes: [] };
}

/** Zamiana dwóch graczy miejscami (drużyna i pozycja na boisku). */
export function swapPlayers(assignments: Assignment[], first: string, second: string): Assignment[] {
  const a = assignments.find((x) => x.user_id === first);
  const b = assignments.find((x) => x.user_id === second);
  if (!a || !b) return assignments;
  return assignments.map((x) =>
    x.user_id === first
      ? { ...x, team: b.team, slot: b.slot }
      : x.user_id === second
        ? { ...x, team: a.team, slot: a.slot }
        : x,
  );
}

/** Odczyt zapisanych składów: tylko wpisy osób, które nadal grają. */
export function parseAssignments(value: unknown, players: string[]): Assignment[] {
  if (!Array.isArray(value)) return [];
  const known = new Set(players);
  return value.flatMap((item: unknown) => {
    if (typeof item !== "object" || item === null) return [];
    const { user_id: userId, team, slot } = item as Record<string, unknown>;
    if (typeof userId !== "string" || !known.has(userId)) return [];
    if ((team !== 0 && team !== 1) || typeof slot !== "number") return [];
    return [{ user_id: userId, team, slot }];
  });
}
