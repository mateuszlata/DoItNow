import type { TestProject } from "vitest/node";
import { getLocalServiceRoleKey } from "../support/local-supabase";

// Klucz serwisowy pobieramy raz i przekazujemy do testów przez `inject`, żeby mogły po sobie posprzątać.
// Bez działającego Supabase zostaje pusty: testy jednostkowe go nie potrzebują.
export default function setup(project: TestProject): void {
  let key: string;
  try {
    key = getLocalServiceRoleKey();
  } catch {
    key = "";
  }
  project.provide("serviceRoleKey", key);
}

declare module "vitest" {
  export interface ProvidedContext {
    serviceRoleKey: string;
  }
}
