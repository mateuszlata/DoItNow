// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  redirects: {
    "/": { status: 302, destination: "/events" },
  },
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: cloudflare(),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      // Klucz Google Places (New), tylko po stronie serwera; bez niego wyszukiwarka używa OpenStreetMap.
      GOOGLE_MAPS_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      // Cloudflare Turnstile na rejestracji; bez kluczy (lokalnie, w CI) formularz działa bez widgetu.
      TURNSTILE_SITE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      TURNSTILE_SECRET_KEY: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
