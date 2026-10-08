// Stała lista sportów (FR-003). Musi być zgodna z ograniczeniem `sport`
// w supabase/migrations/20261008090931_create_events.sql.
// `emoji` to grafika w tle karty, a `accent` kolor paska karty (pełne nazwy klas, żeby Tailwind je wygenerował).
export const SPORTS = [
  { id: "pilka-nozna", label: "Piłka nożna", emoji: "⚽", accent: "border-l-green-400" },
  { id: "koszykowka", label: "Koszykówka", emoji: "🏀", accent: "border-l-orange-400" },
  { id: "siatkowka", label: "Siatkówka", emoji: "🏐", accent: "border-l-yellow-300" },
  { id: "tenis", label: "Tenis", emoji: "🎾", accent: "border-l-lime-300" },
  { id: "badminton", label: "Badminton", emoji: "🏸", accent: "border-l-sky-300" },
  { id: "bieganie", label: "Bieganie", emoji: "🏃", accent: "border-l-rose-400" },
  { id: "rower", label: "Rower", emoji: "🚴", accent: "border-l-cyan-400" },
  { id: "squash", label: "Squash", emoji: "🎾", accent: "border-l-violet-400" },
  { id: "tenis-stolowy", label: "Tenis stołowy", emoji: "🏓", accent: "border-l-red-400" },
  { id: "inne", label: "Inne", emoji: "🤸", accent: "border-l-slate-300" },
] as const;

export type SportId = (typeof SPORTS)[number]["id"];

export const SPORT_IDS = SPORTS.map((s) => s.id) as [SportId, ...SportId[]];

export function sportLabel(id: string): string {
  return SPORTS.find((s) => s.id === id)?.label ?? id;
}

export function sportVisual(id: string): { emoji: string; accent: string } {
  const sport = SPORTS.find((s) => s.id === id);
  return { emoji: sport?.emoji ?? "🤸", accent: sport?.accent ?? "border-l-slate-300" };
}
