import type { AstroCookies } from "astro";

/** Motywy do testów wyglądu; wybór trzyma cookie `theme` (ustawiane przez przełącznik w pasku). */
export const THEMES = [
  { id: "a", label: "Miękkie bloki" },
  { id: "b", label: "Ciemny sportowy" },
  { id: "c", label: "Nagłówek marki" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "c";
export const THEME_COOKIE = "theme";

export function readTheme(cookies: AstroCookies): ThemeId {
  const value = cookies.get(THEME_COOKIE)?.value;
  return THEMES.some((t) => t.id === value) ? (value as ThemeId) : DEFAULT_THEME;
}
