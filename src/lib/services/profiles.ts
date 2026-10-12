import { z } from "astro/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { KIT_COLUMNS, kitFrom, type KitColumns, type PlayerKit } from "@/lib/kit";

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
