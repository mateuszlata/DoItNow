import { z } from "astro/zod";
import type { SupabaseClient } from "@supabase/supabase-js";

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
