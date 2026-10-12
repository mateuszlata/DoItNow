import { z } from "astro/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { KIT_COLUMNS, kitFrom, type KitColumns, type PlayerKit } from "@/lib/kit";
import { isFootballPosition, type FootballPosition } from "@/lib/lineup";

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

export async function getFootballPosition(supabase: SupabaseClient, userId: string): Promise<FootballPosition> {
  const { data } = await supabase
    .from("profiles")
    .select("football_position")
    .eq("id", userId)
    .maybeSingle<{ football_position: string | null }>();
  return isFootballPosition(data?.football_position) ? data.football_position : "obojetnie";
}

export async function saveFootballPosition(
  supabase: SupabaseClient,
  userId: string,
  position: FootballPosition,
): Promise<boolean> {
  const { error } = await supabase.from("profiles").update({ football_position: position }).eq("id", userId);
  return !error;
}
