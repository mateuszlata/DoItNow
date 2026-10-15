# Rules for AI

This file provides guidance to AI Agent when working with code in this repository.

## Business rules

Domain rules (instant join by default or organizer approval when the event has `requires_approval`, removing participants via `remove_participant`, spot limit, reserve list with automatic promotion via `settle_event`, withdrawal possible any time before the start (late ones only need a confirmation), a 12 h cutoff for editing, cancellation with handover to participants via `respond_to_cancellation`), plus venue rules for events held at a manager's venue (opening hours, no overlap via the `events_venue_no_overlap` exclusion constraint, sport on offer, cost from the hourly price) applied by the `apply_venue_rules` trigger (which also resets `venue_status` to pending on any booking change) and venue managers' booking decisions via `decide_venue_booking`, plus the event chat (members only via `is_event_member`, posting with a rate limit and closing 3 days after the event in `post_event_message`, hiding by author/organizer/admin and reports in `hide_event_message` / `report_event_message`, a message reported by 3 people hiding itself (`auto_hidden`) until an admin hides it for good or restores it via `dismiss_message_reports`; a word filter `is_text_clean` over the `blocked_words` table (normalizes diacritics, leetspeak, separators, repeats) rejects vulgar messages with `MESSAGE_BLOCKED` and vulgar nicks with `NICK_BLOCKED`, regression corpus in `tests/integration/word-filter.test.ts`; chat tables have no policies at all, only these functions; admins are rows in `public.admins`, added manually), invites from every squad member (`set_my_invites` per-inviter seat pools, `respond_to_invite` / `release_stale_invites` callable by anon behind a random token and Turnstile, a trigger releasing an inviter's unanswered seats when they leave the squad; guests without an account can also join from the event page via `join_event_as_guest` as the organizer's guests, never taking the last seat or joining events with approval, and then read the event via `guest_event_view` by their device id; people without an account see only a chat teaser from `event_chat_preview` — kits, times and message lengths, no nicks or text, plus the organizer's messages for guests who answered yes; `join_event_claiming_guest` moves that guest seat to the account when the same device later joins with an account; the `invite_responses_limit` trigger caps new guest answers at 30 per event and 200 service-wide per hour, independent of Turnstile; the `events_clean_new` trigger resets status and guest counters on every new event), and notifications (triggers on participations, events and chat messages queue rows in `notifications` through `queue_notification`, which honours each user's `notification_settings` — a master switch and category × channel (e-mail, phone) toggles — and never notifies people about their own actions; `queue_reminders` queues one reminder per player about a day before; the worker cron in `src/worker.ts` sends e-mails every 5 min via Resend through `claim_notification_emails` / `finish_notification_emails`, callable only with the worker secret `NOTIFY_SECRET` whose SHA-256 is in `internal_secrets`, and `unsubscribe_emails` behind the per-user token in every mail, handled by `POST /wypisz` in the worker entry), skill levels (players declare 1–4 per sport in `player_levels`, organizers set an optional range via `set_event_level`, `event_level_mix` gives the squad's level counts — also to anon; levels never block joining, the app only warns), routes for rides and runs (`route_*` columns; the meeting place is the gathering point used by the map, nearby and weather; changes via `set_event_route`, organizer only; destination, loop, distance and pace are public, the route link only for signed-in users), questions to the organizer (`ask_event_question` for any signed-in non-organizer with the word filter and limits, `answer_event_question` organizer only, `hide_event_question`; `list_event_questions` shows answered ones to everyone incl. anon without the asker, open ones only to the author and organizer; notifications `question` / `answered`), an AI assistant on the event page (`src/lib/assistant.ts`, Claude Haiku via `ANTHROPIC_API_KEY`, answers only from what the viewer can see plus Metando rules and the organizer’s answers, structured `{known, answer}` so unknowns go to the organizer; daily limits in `consume_assistant_quota`: 20 per user, 5 per IP hash, 300 service-wide; quality check on the real model with `npx vitest run -c vitest.eval.config.ts`), and match lineups for team and racket sports (`set_event_lineup` / `clear_event_lineup`: organizer only, players from the squad only, members read via RLS) are enforced in Postgres functions in `supabase/migrations/`; tables have no direct insert/update policies for those changes. App services in `src/lib/services/` call these functions and map their error codes to Polish messages.

## Key conventions

- **Path alias**: `@/*` maps to `./src/*` (tsconfig paths).
- **Astro components** for static content/layout; **React components** only when interactivity is needed.
- **Tailwind class merging**: use the `cn()` helper from `@/lib/utils` (clsx + tailwind-merge) for conditional/merged class names. Do not concatenate class strings manually.
- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style variant. Install new ones with `npx shadcn@latest add [name]`.
- **API routes**: use uppercase `GET`, `POST` exports; validate input with zod.
- **Supabase migrations**: `supabase/migrations/` using naming format `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables with granular per-operation, per-role policies.
- **React**: no Next.js directives ("use client" etc.). Extract hooks to `src/components/hooks/`.
- **Services/helpers** go in `src/lib/` (or `src/lib/services/` for extracted business logic).
- **Shared types** (entities, DTOs) go in `src/types.ts`.

## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime)
- `npm run build` — production build (SSR via `@astrojs/cloudflare`)
- `npm run preview` — preview production build
- `npm run lint` — ESLint with type-checked rules
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (includes prettier-plugin-astro + prettier-plugin-tailwindcss)
- `npm test` — Vitest: unit tests (`tests/unit`) and integration tests against local Supabase (`tests/integration`, needs `npx supabase start`). Integration tests delete the accounts they create.
- `npm run test:e2e` — Playwright end-to-end tests (`tests/e2e`) against the production build on port 4322 (builds and starts `astro preview` itself, or reuses a running one).
- `npm run smoke` — dependency-free auth-flow smoke test (`scripts/smoke.mjs`) against a running server, `BASE_URL` env (default `http://localhost:4321`). Run after dependency upgrades; CI runs it against the production preview with a local Supabase.

Pre-commit hooks: husky + lint-staged runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

## Architecture

**Astro 7 SSR app** with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui components. Deployed to Cloudflare Workers.

### Rendering mode

Full server-side rendering (`output: "server"` in astro.config.mjs). All pages are server-rendered by default. API routes must export `const prerender = false`.

### Auth flow

- `src/lib/supabase.ts` — creates a Supabase SSR client using `@supabase/ssr` with cookie-based sessions. Uses `astro:env/server` for `SUPABASE_URL` and `SUPABASE_KEY` (server-only secrets declared in astro.config.mjs `env.schema`).
- `src/middleware.ts` — runs on every request, resolves the current user, attaches to `context.locals.user`. Redirects unauthenticated users away from routes listed in `PROTECTED_ROUTES`.
- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`
- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`
- Protected pages are listed in `PROTECTED_ROUTES` in `src/middleware.ts` (e.g. `/my`, `/venues`, `/events/new`).

## CI

GitHub Actions (`.github/workflows/ci.yml`) on every push and PR to `main`:

- **ci** — lint, `astro check`, build.
- **test** — local Supabase in CI (migrations applied on start, no secrets), `npm test`, smoke test and Playwright e2e against the production preview.
- **deploy** — on push to `main` after both jobs pass: `wrangler deploy` to Cloudflare Workers. Needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets (skipped with a warning when missing). `SUPABASE_URL` / `SUPABASE_KEY` for production are Worker secrets (`npx wrangler secret put`).

## Environment

- Node.js v22.14.0 (see `.nvmrc`)
- Env vars: `SUPABASE_URL`, `SUPABASE_KEY` (copy `.env.example` to `.env` for Node, or `.dev.vars` for Cloudflare local dev)
- `ANTHROPIC_API_KEY` (optional server secret, Anthropic API, separate prepaid billing with a spend limit): without it the assistant field is hidden.
- Worker-only secrets (Cloudflare, not in astro env): `RESEND_API_KEY` (Resend, domain metando.pl verified, eu-west-1) and `NOTIFY_SECRET` (its SHA-256 is inserted by the e-mail migration; tests set a local one). Contact address `kontakt@metando.pl` is Cloudflare Email Routing to the operator mailbox.
- Optional server secrets: `GOOGLE_MAPS_API_KEY` (Google Places API (New) for address search via `/api/places/*`; without it the search falls back to Photon/OpenStreetMap) `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` (Cloudflare Turnstile on sign-up, sign-in and guest answers, verified server-side in `src/lib/turnstile.ts`; without them sign-up works without the widget, as in local dev and CI). The Google key never reaches the browser; usage stays inside the free monthly pool through the rolling daily budget in `consume_places_quota`.
- Local Supabase: `npx supabase start` (requires Docker)
- Cloudflare local dev: secrets go in `.dev.vars` (gitignored)
- Deploy: `npx wrangler deploy` (requires Cloudflare account + `wrangler` auth)
