import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    // Testy integracyjne łączą się z lokalnym Supabase z .env (npx supabase start).
    env: loadEnv(mode, process.cwd(), ""),
    globalSetup: ["tests/integration/global-setup.ts"],
    testTimeout: 20_000,
  },
}));
