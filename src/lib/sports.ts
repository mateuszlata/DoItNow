// Stała lista sportów (FR-003). Musi być zgodna z ograniczeniem `sport`
// w supabase/migrations/20261008090931_create_events.sql.
// `emoji` i `color` służą kafelkowi sportu, a `icon` to ścieżka SVG ikony liniowej (24×24) na kartach i filtrach.
export const SPORTS = [
  {
    id: "pilka-nozna",
    label: "Piłka nożna",
    emoji: "⚽",
    color: "#4ade80",
    icon: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 7.5l4 2.9-1.5 4.6h-5L8 10.4z",
  },
  {
    id: "koszykowka",
    label: "Koszykówka",
    emoji: "🏀",
    color: "#fb923c",
    icon: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M3 12h18M12 3v18M6 5.5c2.5 3.5 2.5 9.5 0 13M18 5.5c-2.5 3.5-2.5 9.5 0 13",
  },
  {
    id: "siatkowka",
    label: "Siatkówka",
    emoji: "🏐",
    color: "#fde047",
    icon: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 3c-1 4 0 7 0 9M12 12c-3.5 1.8-6.5 4-7.8 4.5M12 12c3.5 1.8 6.5 4 7.8 4.5",
  },
  {
    id: "tenis",
    label: "Tenis",
    emoji: "🎾",
    color: "#bef264",
    icon: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M5.5 5.5c3 3.5 3 9.5 0 13M18.5 5.5c-3 3.5-3 9.5 0 13",
  },
  {
    id: "badminton",
    label: "Badminton",
    emoji: "🏸",
    color: "#7dd3fc",
    icon: "M9 17a3 3 0 1 0 6 0a3 3 0 1 0-6 0M10 14.5L7 4h10l-3 10.5M9.5 9h5",
  },
  {
    id: "bieganie",
    label: "Bieganie",
    emoji: "🏃",
    color: "#fb7185",
    icon: "M14 5a2 2 0 1 0 4 0a2 2 0 1 0-4 0M6 20l3.5-5 3 2V21M9.5 15l1.5-6 3.5 2.5H18M11 9L7 10l-2 3",
  },
  {
    id: "rower",
    label: "Rower",
    emoji: "🚴",
    color: "#22d3ee",
    icon: "M3 17a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M14 17a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M6.5 17l3.5-7h6l1.5 7M10 10l-1.5-3H6M15 7h2",
  },
  {
    id: "squash",
    label: "Squash",
    emoji: "🎾",
    color: "#a78bfa",
    icon: "M10 3.5a6 7 0 1 0 0.01 0M13 14l7 7M17 4a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0",
  },
  {
    id: "tenis-stolowy",
    label: "Tenis stołowy",
    emoji: "🏓",
    color: "#f87171",
    icon: "M13 3a7 7 0 1 1-6.5 9.5M8 14l-5 5 2 2 5-5M18 17a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
  },
  {
    id: "inne",
    label: "Inne",
    emoji: "🤸",
    color: "#cbd5e1",
    icon: "M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z",
  },
] as const;

export type SportId = (typeof SPORTS)[number]["id"];

export const SPORT_IDS = SPORTS.map((s) => s.id) as [SportId, ...SportId[]];

export const ALL_SPORTS_ICON = "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z";

export function sportIcon(id: string): string {
  return SPORTS.find((s) => s.id === id)?.icon ?? ALL_SPORTS_ICON;
}

export function sportLabel(id: string): string {
  return SPORTS.find((s) => s.id === id)?.label ?? id;
}

export function sportVisual(id: string): { emoji: string; color: string } {
  const sport = SPORTS.find((s) => s.id === id);
  return { emoji: sport?.emoji ?? "🤸", color: sport?.color ?? "#cbd5e1" };
}
