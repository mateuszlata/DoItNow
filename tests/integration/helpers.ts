// Wspólne pomocniki testów integracyjnych na lokalnym Supabase (wymaga `npx supabase start`).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Integration tests need ${name} in .env (local Supabase).`);
  return value;
}

const url = requireEnv("SUPABASE_URL");
const key = requireEnv("SUPABASE_KEY");

export const HOUR = 3_600_000;
const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
let userCounter = 0;

export function anonClient(): SupabaseClient {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) as SupabaseClient;
}

export async function newUser(nick: string): Promise<{ client: SupabaseClient; id: string }> {
  const client = anonClient();
  userCounter += 1;
  const { data, error } = await client.auth.signUp({
    email: `it-${runId}-${String(userCounter)}@example.com`,
    password: "IntegrationTest-2026!",
    options: { data: { display_name: nick } },
  });
  if (error || !data.user) throw new Error(`signUp failed: ${error?.message ?? "no user"}`);
  return { client, id: data.user.id };
}

export async function insertEvent(
  organizer: { client: SupabaseClient; id: string },
  startsAt: Date,
  spots: number,
): Promise<string> {
  const { data, error } = await organizer.client
    .from("events")
    .insert({
      organizer_id: organizer.id,
      sport: "koszykowka",
      area: "Test",
      place: "Hala testowa",
      starts_at: startsAt.toISOString(),
      spots,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) throw new Error(`insert event failed: ${error.message}`);
  return data.id;
}

export async function acceptedCount(client: SupabaseClient, eventId: string): Promise<number> {
  const { data } = await client
    .from("events")
    .select("accepted_count")
    .eq("id", eventId)
    .single<{ accepted_count: number }>();
  return data?.accepted_count ?? -1;
}

export interface TestUser {
  client: SupabaseClient;
  id: string;
}
