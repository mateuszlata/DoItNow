// Stała lista sportów (FR-003). Musi być zgodna z ograniczeniem `sport`
// w supabase/migrations/20261008090931_create_events.sql.
export const SPORTS = [
  { id: "pilka-nozna", label: "Piłka nożna" },
  { id: "koszykowka", label: "Koszykówka" },
  { id: "siatkowka", label: "Siatkówka" },
  { id: "tenis", label: "Tenis" },
  { id: "badminton", label: "Badminton" },
  { id: "bieganie", label: "Bieganie" },
  { id: "rower", label: "Rower" },
  { id: "squash", label: "Squash" },
  { id: "tenis-stolowy", label: "Tenis stołowy" },
  { id: "inne", label: "Inne" },
] as const;

export type SportId = (typeof SPORTS)[number]["id"];

export const SPORT_IDS = SPORTS.map((s) => s.id) as [SportId, ...SportId[]];

export function sportLabel(id: string): string {
  return SPORTS.find((s) => s.id === id)?.label ?? id;
}
