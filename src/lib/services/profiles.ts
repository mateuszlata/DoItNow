import { z } from "astro/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { KIT_COLUMNS, kitFrom, type KitColumns, type PlayerKit } from "@/lib/kit";
import { isPosition } from "@/lib/lineup";

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, "Nick musi mieć co najmniej 2 znaki.")
  .max(30, "Nick może mieć maks. 30 znaków.");

export async function getDisplayName(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle<{
    display_name: string;
  }>();
  return data?.display_name ?? null;
}

/** Strój użytkownika (własny albo domyślny z id konta). */
export async function getKit(supabase: SupabaseClient, userId: string): Promise<PlayerKit> {
  const { data } = await supabase.from("profiles").select(KIT_COLUMNS).eq("id", userId).maybeSingle<KitColumns>();
  return kitFrom(data, userId);
}

export async function saveKit(supabase: SupabaseClient, userId: string, kit: PlayerKit): Promise<boolean> {
  const { error } = await supabase
    .from("profiles")
    .update({ kit_pattern: kit.pattern, kit_primary: kit.primary, kit_secondary: kit.secondary, kit_label: kit.label })
    .eq("id", userId);
  return !error;
}

/** Ulubione pozycje użytkownika: sport → pozycja (brak wpisu = „obojętnie”). */
export async function getPositions(supabase: SupabaseClient, userId: string): Promise<Record<string, string>> {
  const { data } = await supabase.from("player_positions").select("sport, position").eq("user_id", userId);
  const result: Record<string, string> = {};
  for (const row of (data ?? []) as { sport: string; position: string }[]) {
    if (isPosition(row.sport, row.position)) result[row.sport] = row.position;
  }
  return result;
}

export async function savePosition(
  supabase: SupabaseClient,
  userId: string,
  sport: string,
  position: string,
): Promise<boolean> {
  if (!isPosition(sport, position)) return false;
  const { error } = await supabase.from("player_positions").upsert({ user_id: userId, sport, position });
  return !error;
}
