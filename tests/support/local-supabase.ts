// Sprzątanie danych testowych na lokalnym Supabase. Klucz serwisowy pobieramy z `supabase status`,
// więc nie trafia do .env ani do repozytorium, a każde usuwanie odmawia pracy poza localhost.
import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";

export function assertLocalSupabase(url: string): void {
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Refusing to delete test data outside local Supabase (${host}).`);
  }
}

export function getLocalServiceRoleKey(): string {
  const fromEnv = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (fromEnv) return fromEnv;
  const output = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const match = /^SERVICE_ROLE_KEY="?([^"\r\n]+)"?$/m.exec(output);
  if (!match?.[1])
    throw new Error("Could not read SERVICE_ROLE_KEY from `npx supabase status`. Is local Supabase running?");
  return match[1];
}

function adminClient(url: string, serviceRoleKey: string): SupabaseClient {
  assertLocalSupabase(url);
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as SupabaseClient;
}

/** Usuwa konta; ogłoszenia, profile i zgłoszenia znikają kaskadowo. */
export async function deleteUsers(url: string, serviceRoleKey: string, ids: string[]): Promise<void> {
  const admin = adminClient(url, serviceRoleKey);
  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    // Konto mogło już zostać usunięte przez sam test (usuwanie własnego konta).
    if (error && error.status !== 404) throw new Error(`deleteUser ${id} failed: ${error.message}`);
  }
}

/** Usuwa konta, których e-mail zaczyna się od podanego prefiksu (np. konta jednego przebiegu testów). */
export async function deleteUsersByEmailPrefix(url: string, serviceRoleKey: string, prefix: string): Promise<number> {
  const admin = adminClient(url, serviceRoleKey);
  const ids: string[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    ids.push(...data.users.filter((u) => u.email?.startsWith(prefix)).map((u) => u.id));
    if (data.users.length < 1000) break;
  }
  await deleteUsers(url, serviceRoleKey, ids);
  return ids.length;
}
