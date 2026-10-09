import type { AstroCookies } from "astro";

/** Kierunki wizualne Metando z Claude Design; wybór trzyma cookie `theme` (przełącznik w pasku). */
export const THEMES = [
  {
    id: "a",
    label: "Nocny Orlik",
    fonts: "family=Archivo:wdth,wght@62..125,400..900&family=Manrope:wght@400..800",
    color: "#0e1110",
  },
  {
    id: "b",
    label: "Podwórko",
    fonts: "family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=DM+Sans:opsz,wght@9..40,400..700",
    color: "#f6ebdd",
  },
  { id: "c", label: "Kort", fonts: "family=Unbounded:wght@400..800&family=Onest:wght@400..700", color: "#2f3dff" },
  {
    id: "d",
    label: "Szatnia",
    fonts: "family=Big+Shoulders+Display:wght@500..900&family=Work+Sans:wght@400..700",
    color: "#164a3a",
  },
  {
    id: "d2",
    label: "Szatnia ’96",
    fonts: "family=Big+Shoulders+Display:wght@500..900&family=Work+Sans:wght@400..700",
    color: "#0a2e23",
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "d2";
export const THEME_COOKIE = "theme";

export function readTheme(cookies: AstroCookies): ThemeId {
  const value = cookies.get(THEME_COOKIE)?.value;
  return THEMES.some((t) => t.id === value) ? (value as ThemeId) : DEFAULT_THEME;
}

export function themeInfo(id: ThemeId) {
  return THEMES.find((t) => t.id === id) ?? THEMES[THEMES.length - 1];
}
