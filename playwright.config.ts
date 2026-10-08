import { defineConfig, devices } from "@playwright/test";

// Testy działają na produkcyjnym buildzie (osobny port, żeby nie kolidować z `npm run dev`):
// tryb deweloperski ładuje w przeglądarce setki modułów i jest za wolny na testy końcowe.
const port = 4322;
const baseURL = process.env.BASE_URL ?? `http://localhost:${String(port)}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "mobile-chromium", use: { ...devices["Pixel 7"] } }],
  // Wymaga lokalnego Supabase (`npx supabase start`) i sekretów w .dev.vars.
  webServer: {
    command: `npm run build && npm run preview -- --port ${String(port)}`,
    url: `${baseURL}/events`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
