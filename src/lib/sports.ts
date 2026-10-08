// Stała lista sportów (FR-003). Musi być zgodna z ograniczeniem `sport`
// w supabase/migrations/20261008090931_create_events.sql.
// `emoji` to ikona sportu na karcie, a `color` jego kolor (tło kafelka, w motywie a całej karty).
export const SPORTS = [
  { id: "pilka-nozna", label: "Piłka nożna", emoji: "⚽", color: "#4ade80" },
  { id: "koszykowka", label: "Koszykówka", emoji: "🏀", color: "#fb923c" },
  { id: "siatkowka", label: "Siatkówka", emoji: "🏐", color: "#fde047" },
  { id: "tenis", label: "Tenis", emoji: "🎾", color: "#bef264" },
  { id: "badminton", label: "Badminton", emoji: "🏸", color: "#7dd3fc" },
  { id: "bieganie", label: "Bieganie", emoji: "🏃", color: "#fb7185" },
  { id: "rower", label: "Rower", emoji: "🚴", color: "#22d3ee" },
  { id: "squash", label: "Squash", emoji: "🎾", color: "#a78bfa" },
  { id: "tenis-stolowy", label: "Tenis stołowy", emoji: "🏓", color: "#f87171" },
  { id: "inne", label: "Inne", emoji: "🤸", color: "#cbd5e1" },
] as const;

export type SportId = (typeof SPORTS)[number]["id"];

export const SPORT_IDS = SPORTS.map((s) => s.id) as [SportId, ...SportId[]];

export function sportLabel(id: string): string {
  return SPORTS.find((s) => s.id === id)?.label ?? id;
}

export function sportVisual(id: string): { emoji: string; color: string } {
  const sport = SPORTS.find((s) => s.id === id);
  return { emoji: sport?.emoji ?? "🤸", color: sport?.color ?? "#cbd5e1" };
}
