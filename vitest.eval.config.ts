import path from "node:path";
import { defineConfig } from "vitest/config";

// Kontrola jakości asystenta AI na prawdziwym modelu (tests/eval) — osobno od `npm test`, bo kosztuje.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    include: ["tests/eval/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
