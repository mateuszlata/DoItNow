// „Składy na mecz” (piłka nożna): podział graczy na dwie drużyny i ustawienie na boisku.
// Boisko w polu 100×150 (pion); drużyna A broni dolnej bramki, B — górnej (pozycje odbite).

export const FOOTBALL_POSITIONS = [
  { id: "bramka", label: "Bramka", short: "BR" },
  { id: "obrona", label: "Obrona", short: "OBR" },
  { id: "pomoc", label: "Pomoc", short: "POM" },
  { id: "atak", label: "Atak", short: "ATK" },
  { id: "obojetnie", label: "Obojętnie", short: "—" },
] as const;

export type FootballPosition = (typeof FOOTBALL_POSITIONS)[number]["id"];

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

export interface LineupPlayer {
  userId: string;
  name: string;
  position: FootballPosition;
}

export interface Assignment {
  user_id: string;
  team: 0 | 1;
  /** Miejsce w ustawieniu drużyny (0 = bramkarz). */
  slot: number;
}

export interface Slot {
  x: number;
  y: number;
  role: "bramka" | "obrona" | "pomoc" | "atak";
}

export function isFootballPosition(value: unknown): value is FootballPosition {
  return typeof value === "string" && FOOTBALL_POSITIONS.some((p) => p.id === value);
}

/** Rzędy zawodników z pola (bez bramkarza) dla drużyny liczącej `size` osób. */
function rows(fieldPlayers: number): number[] {
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
  return table[Math.min(Math.max(fieldPlayers, 0), 10)];
}

/** Ustawienie drużyny A (dolna połowa); drużyna B używa odbicia przez `mirrorSlot`. */
export function formation(size: number): Slot[] {
  const field = rows(Math.min(size, 11) - 1);
  const ys = field.length === 1 ? [108] : field.length === 2 ? [118, 92] : [122, 104, 87];
  const roles: Slot["role"][] =
    field.length === 1 ? ["atak"] : field.length === 2 ? ["obrona", "atak"] : ["obrona", "pomoc", "atak"];
  const slots: Slot[] = [{ x: 50, y: 139, role: "bramka" }];
  field.forEach((count, row) => {
    for (let i = 0; i < count; i++) {
      slots.push({ x: Math.round((100 * (i + 1)) / (count + 1)), y: ys[row], role: roles[row] });
    }
  });
  return slots;
}

export function mirrorSlot(slot: Slot): Slot {
  return { ...slot, x: 100 - slot.x, y: 150 - slot.y };
}

const ROLE_ORDER: Record<FootballPosition, number> = { bramka: 0, obrona: 1, pomoc: 2, obojetnie: 3, atak: 4 };

/** Kolejność miejsc w drużynie: bramkarz, potem od obrony do ataku. */
function toAssignments(team: 0 | 1, players: LineupPlayer[]): Assignment[] {
  const goalkeeper = players.find((p) => p.position === "bramka");
  const rest = players.filter((p) => p !== goalkeeper).sort((a, b) => ROLE_ORDER[a.position] - ROLE_ORDER[b.position]);
  const ordered = goalkeeper ? [goalkeeper, ...rest] : rest;
  // Bez chętnego bramkarza pierwsze miejsce (bramka) zajmuje ktoś „obojętnie” albo z obrony.
  if (!goalkeeper && ordered.length > 0) {
    const index = Math.max(
      ordered.findIndex((p) => p.position === "obojetnie"),
      0,
    );
    ordered.unshift(...ordered.splice(index, 1));
  }
  return ordered.map((p, slot) => ({ user_id: p.userId, team, slot: Math.min(slot, 10) }));
}

export interface SplitResult {
  assignments: Assignment[];
  /** Podpowiedzi dla organizatora (konflikty pozycji). */
  notes: string[];
}

/** Podział według ulubionych pozycji: bramkarze do różnych drużyn, reszta po równo, pozycja po pozycji. */
export function splitByPositions(players: LineupPlayer[]): SplitResult {
  const teams: [LineupPlayer[], LineupPlayer[]] = [[], []];
  const notes: string[] = [];
  const keepers = players.filter((p) => p.position === "bramka");
  keepers.slice(0, 2).forEach((p, i) => teams[i].push(p));
  if (keepers.length > 2) {
    notes.push(
      `${String(keepers.length)} chętnych na bramkę — bronią ${keepers[0].name} i ${keepers[1].name}, ` +
        `${keepers
          .slice(2)
          .map((p) => p.name)
          .join(", ")} w polu. Może zmiana bramkarzy w przerwie?`,
    );
  } else if (keepers.length < 2 && players.length >= 2) {
    notes.push(
      keepers.length === 1
        ? "Brakuje bramkarza w jednej drużynie — na bramce stanie ktoś z osób „obojętnie”."
        : "Nikt nie zgłosił się na bramkę — na bramkach staną osoby „obojętnie”. Może zmiany co 10 minut?",
    );
  }

  const placed = new Set(teams.flat());
  let turn = 1;
  for (const position of ["obrona", "pomoc", "atak", "obojetnie", "bramka"] as const) {
    for (const player of players.filter((p) => p.position === position && !placed.has(p))) {
      const target = teams[0].length < teams[1].length ? 0 : teams[1].length < teams[0].length ? 1 : turn;
      teams[target].push(player);
      placed.add(player);
      turn = 1 - turn;
    }
  }
  return { assignments: [...toAssignments(0, teams[0]), ...toAssignments(1, teams[1])], notes };
}

/** Losowy podział po równo; `random` do testów. */
export function randomSplit(players: LineupPlayer[], random: () => number = Math.random): SplitResult {
  const shuffled = [...players];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const teams: [LineupPlayer[], LineupPlayer[]] = [[], []];
  shuffled.forEach((p, i) => teams[i % 2].push(p));
  return { assignments: [...toAssignments(0, teams[0]), ...toAssignments(1, teams[1])], notes: [] };
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
