import type { SupabaseClient } from "@supabase/supabase-js";
import { SPORT_IDS } from "@/lib/sports";

// Ulubione sporty użytkownika (tabela user_sport_preferences, widoczna tylko dla właściciela).

/** Zostawia tylko znane sporty, bez powtórzeń, w kolejności z listy SPORTS. */
export function normalizeSports(values: Iterable<string>): string[] {
  const chosen = new Set(values);
  return SPORT_IDS.filter((id) => chosen.has(id));
}

/** Lista sportów z parametru adresu („pilka-nozna,tenis”); `null`, gdy parametru nie ma. */
export function parseSportsParam(value: string | null): string[] | null {
  if (value === null) return null;
  return normalizeSports(value.split(","));
}

/** `null` — użytkownik jeszcze nie wybrał; pusta lista — interesuje go wszystko. */
export async function getFavoriteSports(supabase: SupabaseClient, userId: string): Promise<string[] | null> {
  const { data } = await supabase
    .from("user_sport_preferences")
    .select("sports")
    .eq("user_id", userId)
    .maybeSingle<{ sports: string[] }>();
  return data ? normalizeSports(data.sports) : null;
}

export async function saveFavoriteSports(
  supabase: SupabaseClient,
  userId: string,
  sports: Iterable<string>,
): Promise<boolean> {
  const { error } = await supabase
    .from("user_sport_preferences")
    .upsert({ user_id: userId, sports: normalizeSports(sports), updated_at: new Date().toISOString() });
  return !error;
}
