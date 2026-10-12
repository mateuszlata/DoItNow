// Strój użytkownika („moje barwy”): wzór, dwa kolory i numer albo inicjały. Służy jako avatar w składzie i czacie.
import type { Kit } from "@/lib/sports";

// Lista wzorów i kolorów musi być zgodna z ograniczeniami w supabase/migrations/*_player_kits.sql.

export const KIT_PATTERNS = [
  { id: "plain", label: "Gładka" },
  { id: "vstripes", label: "Pasy pionowe" },
  { id: "hoops", label: "Pasy poziome" },
  { id: "sash", label: "Szarfa" },
  { id: "halves", label: "Połówki" },
  { id: "sleeves", label: "Rękawy" },
  { id: "pin", label: "Prążki" },
] as const;

export const KIT_COLORS = [
  { hex: "#ffffff", label: "biały" },
  { hex: "#13261f", label: "czarny" },
  { hex: "#d62828", label: "czerwony" },
  { hex: "#1d3557", label: "granatowy" },
  { hex: "#7fb3e0", label: "błękitny" },
  { hex: "#f4d03f", label: "żółty" },
  { hex: "#2a9d55", label: "zielony" },
  { hex: "#7a1f3d", label: "bordowy" },
  { hex: "#ff7a1a", label: "pomarańczowy" },
  { hex: "#6a3fa0", label: "fioletowy" },
  { hex: "#c9a227", label: "złoty" },
  { hex: "#8d99ae", label: "szary" },
] as const;

export type KitPattern = (typeof KIT_PATTERNS)[number]["id"];

export interface PlayerKit {
  pattern: KitPattern;
  primary: string;
  secondary: string;
  /** Numer 0–99 albo 1–3 litery (inicjały). */
  label: string;
}

/** Kolumny stroju w tabeli profiles (null = strój jeszcze nie ustawiony). */
export interface KitColumns {
  kit_pattern: string | null;
  kit_primary: string | null;
  kit_secondary: string | null;
  kit_label: string | null;
}

export const KIT_COLUMNS = "kit_pattern, kit_primary, kit_secondary, kit_label";

const PATTERN_IDS: readonly string[] = KIT_PATTERNS.map((p) => p.id);
const COLOR_HEXES: readonly string[] = KIT_COLORS.map((c) => c.hex);
const NUMBER_LABEL = /^(?:0|[1-9][0-9]?)$/;
const INITIALS_LABEL = /^[A-ZĄĆĘŁŃÓŚŹŻ]{1,3}$/;

export function isKitLabel(value: string): boolean {
  return NUMBER_LABEL.test(value) || INITIALS_LABEL.test(value);
}

/** Sprawdza i porządkuje strój z formularza; `null`, gdy coś się nie zgadza. */
export function parseKit(input: {
  pattern: unknown;
  primary: unknown;
  secondary: unknown;
  label: unknown;
}): PlayerKit | null {
  const { pattern, primary, secondary } = input;
  const label = typeof input.label === "string" ? input.label.trim().toUpperCase() : "";
  if (typeof pattern !== "string" || !PATTERN_IDS.includes(pattern)) return null;
  if (typeof primary !== "string" || !COLOR_HEXES.includes(primary)) return null;
  if (typeof secondary !== "string" || !COLOR_HEXES.includes(secondary)) return null;
  const normalized = /^[0-9]{1,2}$/.test(label) ? String(Number(label)) : label;
  if (!isKitLabel(normalized)) return null;
  return { pattern: pattern as KitPattern, primary, secondary, label: normalized };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stały „losowy” strój z id konta — każdy ma barwy, zanim ustawi własne. */
export function defaultKit(userId: string): PlayerKit {
  const h = hash(userId);
  const primary = h % KIT_COLORS.length;
  const shift = 1 + ((h >>> 4) % (KIT_COLORS.length - 1));
  return {
    pattern: KIT_PATTERNS[(h >>> 8) % KIT_PATTERNS.length].id,
    primary: KIT_COLORS[primary].hex,
    secondary: KIT_COLORS[(primary + shift) % KIT_COLORS.length].hex,
    label: String((h >>> 12) % 100),
  };
}

/** Strój z kolumn profilu albo domyślny, gdy użytkownik go nie ustawił. */
export function kitFrom(columns: Partial<KitColumns> | null | undefined, userId: string): PlayerKit {
  const kit = columns
    ? parseKit({
        pattern: columns.kit_pattern,
        primary: columns.kit_primary,
        secondary: columns.kit_secondary,
        label: columns.kit_label,
      })
    : null;
  return kit ?? defaultKit(userId);
}

/** Czytelny kolor numeru na danym kolorze stroju. */
export function kitNumberColor(primary: string): string {
  const n = Number.parseInt(primary.slice(1), 16);
  const luminance = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return luminance > 0.6 ? "#13261f" : "#ffffff";
}

/** Sylwetki strojów w polu 48×52; `numberTop` to położenie numeru jako ułamek wysokości. */
export const JERSEY_SHAPES: Record<Kit, { body: string; stripe?: string; detail?: string; numberTop: number }> = {
  tank: {
    body: "M15 2h6c0 5 1.5 8 3 8s3-3 3-8h6c0 6 2 10 7 12v36H8V14c5-2 7-6 7-12z",
    stripe: "M8 44h32",
    numberTop: 0.32,
  },
  tee: {
    body: "M16 3l-6 3-9 8 5 8 6-4v32h24V18l6 4 5-8-9-8-6-3c-1 4-4 6-8 6s-7-2-8-6z",
    stripe: "M12 44h24",
    numberTop: 0.36,
  },
  polo: {
    body: "M16 3l-6 3-9 8 5 8 6-4v32h24V18l6 4 5-8-9-8-6-3c-1 4-4 6-8 6s-7-2-8-6z",
    detail: "M17 4l7 8 7-8M24 12v6",
    stripe: "M12 46h24",
    numberTop: 0.42,
  },
  cycling: {
    body: "M17 3l-7 3-8 15 7 4 5-9v34h20V16l5 9 7-4-8-15-7-3c-1 3-4 5-7 5s-6-2-7-5z",
    detail: "M24 8v9",
    stripe: "M14 46h20",
    numberTop: 0.42,
  },
  bib: {
    body: "M8 9h32a4 4 0 0 1 4 4v26a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V13a4 4 0 0 1 4-4z",
    numberTop: 0.36,
  },
};
