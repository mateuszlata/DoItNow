---
project: doitnow
researched_at: 2026-10-08
recommended_platform: Cloudflare Workers (static assets)
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 7 SSR + React 19 islands (@astrojs/cloudflare v14)
  runtime: Cloudflare workerd (nodejs_compat); database: external Supabase Postgres (eu-west-1)
---

## Recommendation

**Deploy on Cloudflare Workers (with static assets), on the Free plan, upgrading to Workers Paid ($5/month) as soon as CPU-limit errors appear.**

Cloudflare is the only candidate that passed all five agent-friendly criteria (10/10). Deploying, rolling back and tailing logs all work through `wrangler` with no dashboard needed, and the docs are published as `llms.txt` and Markdown. It also costs $0 at the expected traffic of 10k–100k requests/month, which matches the top interview priority (minimize cost). The app is already running there (`https://doitnow.doitnow-app.workers.dev`) with the starter's adapter, so the decision carries no migration cost.

Interview answers that drove the weights:

- **Persistent connections:** "don't know". Today the app is request/response only, so no platform was filtered out.
- **Priority:** minimize cost.
- **Platform familiarity:** none in particular.
- **Reach:** a single region (one Polish city).
- **External providers:** fine (Supabase stays).

## Platform Comparison

Scoring: Pass = 2, Partial = 1, Fail = 0. Research checked 2026-10-08.

| Platform           | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total  | Cost at 10k–100k req/month              |
| ------------------ | --------- | ------------------ | ------------------- | ----------------- | ----------------- | ------ | --------------------------------------- |
| Cloudflare Workers | Pass      | Pass               | Pass                | Pass              | Pass              | **10** | $0 (Free), $5 flat (Paid)               |
| Render             | Partial   | Pass               | Pass                | Pass              | Pass              | 9      | $0 with ~1 min cold start; ~$7 Starter  |
| Vercel             | Pass      | Pass               | Pass                | Partial           | Partial           | 8      | $0 Hobby (non-commercial only); $20 Pro |
| Fly.io             | Pass      | Pass               | Pass                | Partial           | Partial           | 8      | ~$2–4 pay-as-you-go, no free tier       |
| Netlify            | Partial   | Pass               | Pass                | Partial           | Partial           | 7      | $0 until the credit cap pauses the site |
| Railway            | Partial   | Pass               | Pass                | Partial           | Partial           | 7      | $5 Hobby (US only); EU needs Pro        |

**Cloudflare Workers**

- **CLI and operations:**
  - `wrangler deploy` deploys.
  - `wrangler rollback [VERSION_ID]` rolls back to any of the last 100 versions.
  - `wrangler versions deploy <id>@10%` does gradual rollouts.
  - `wrangler tail --format pretty --status error` streams logs.
- **Docs and MCP:** docs are published as `llms.txt` and `.md` pages. Official MCP servers cover docs, bindings, builds and observability.
- **Free plan limits:** 100k requests/day, **10 ms CPU per request**, 50 subrequests and 128 MB memory. Static assets are free.
- **Persistent connections:** available later through Durable Objects with WebSocket Hibernation (GA, on the Free plan with the SQLite backend).

**Render**

- **Strengths:** GA MCP server since 2025-08-21, plus deploy hooks and a REST API.
- **Rollback:** only from the dashboard or the API, not the CLI.
- **Free tier:** web services spin down after 15 min idle and take about 1 minute to wake up, so a low-traffic city app would almost always start cold.
- **Paid tier:** an always-on Starter instance is about $7/month.
- **Plans:** changed on 2026-04-23. Hobby bandwidth is now 5 GB.
- **Region:** Frankfurt is available.
- **Migration:** moving would need `@astrojs/node`.

**Vercel**

- **CLI and docs:** strong CLI (`vercel --prod`, `vercel rollback`, `vercel logs --follow`) and `llms.txt`.
- **Hobby limits:**
  - Rollback goes back only to the previous production deployment.
  - Commercial use is not allowed.
  - Only one region; it defaults to `iad1` and must be set to `dub1`/`fra1` near Supabase.
- **MCP:** launched as a public beta.
- **WebSockets:** beta since 2026-06-22.
- **Migration:** moving would need `@astrojs/vercel` ≥ 11.0.3, because CVE-2026-73424 affects ISR in older versions.

**Fly.io**

- **Runtime:** any container on microVMs. Fully CLI-driven (`fly deploy`, `fly logs`).
- **Rollback:** there is no `rollback` command; you redeploy an older image with `fly deploy --image <ref>`.
- **Free tier:** none for new organizations since 2024-10-07.
- **Region:** the Warsaw region was deprecated, so `fra`/`ams` is closest.
- **MCP:** `fly mcp server` is experimental.
- **Effort:** needs a Dockerfile and `@astrojs/node`.

**Netlify**

- **Rollback:** the CLI cannot roll back (UI or API only).
- **Free plan:** has a hard credit cap that pauses every site. Each production deploy costs 15 credits, so deploy-on-push CI could hit the cap before traffic does.
- **Region:** functions default to Ohio, and changing the region needs Pro, so every Supabase query would cross the Atlantic on Free.
- **Persistent connections:** not supported.

**Railway**

- **Rollback:** only from the dashboard, and only while the image is retained (24–72 h).
- **Region:** EU West requires the Pro plan (staff answer, 2026-04-09), so Hobby would run in the US.
- **Deprecation:** config-as-code via `railway.json` stops being read on 2026-12-01.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Full marks on all five criteria and the cheapest option ($0, or $5 flat), with a fully CLI-driven loop for deploys, rollback and logs. It is the starter's native target: `astro dev` and `astro preview` already run on workerd through the Cloudflare Vite plugin, so local behaviour matches production. It requires no migration.

#### 2. Vercel

It is $0 for a non-commercial community app, and pinning the function region to Dublin (`dub1`) would put compute next to Supabase. It ranks below Cloudflare for three reasons:

- **Rollback:** on Hobby it is limited to the previous deployment.
- **MCP:** still beta.
- **Commercial use:** the non-commercial clause would force a $20/month Pro plan if the app ever makes money.

Switching would also require an adapter and env migration.

#### 3. Render

It has a higher raw score than Vercel (GA MCP server, deploy hooks, rollback via API). But the free tier's ~1-minute cold start is unacceptable for a "who plays tonight" app with sparse traffic, and the always-on fix costs about $7/month. That conflicts with the cost-first priority.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **The 10 ms CPU limit on the Free plan.** Waiting on Supabase does not count, but server-rendering the list page (up to 500 cards) or a heavy details page can exceed it. The request then fails with a Cloudflare error (1102) instead of just being slow.
2. **Compute far from the database.** The Worker runs at the edge near the user (Warsaw), while Supabase is in Ireland (~30–40 ms one way). The details page makes several sequential queries (top bar profile, pending count, event, participations, own participation), so latency adds up to hundreds of milliseconds.
3. **Code and schema deploy separately.** `wrangler rollback` reverts code only. Deploying code before `supabase db push` breaks production (this nearly happened on 2026-10-08), and rolling back after a migration can leave code and schema mismatched.
4. **Manual deploys.** The GitHub repository has no `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` secrets, so CI skips the deploy job and production is deployed by hand from a laptop. Once, a stale `dist/` was deployed under the old worker name.
5. **workerd is not Node.** A dependency that relies on Node-only APIs or CommonJS can pass locally and fail in production, and production errors are minified by default.

### Pre-Mortem — How This Could Fail

DoItNow gets shared in a local Facebook group and 300 people arrive over one weekend. The list page, now holding hundreds of cards, intermittently exceeds the Free plan's 10 ms CPU budget, and some visitors see a Cloudflare error page. They conclude the app is broken. Nobody notices, because no one reads `wrangler tail` and the failures are random. That same weekend a new feature is deployed from a laptop before the matching `supabase db push`. The event details page returns 500 for an hour, and `wrangler rollback` does not help because the schema had moved on in the meantime. Even when everything works, every click waits on four or five round trips to Ireland, so pages feel sluggish on mobile. Six months later the conclusion is that the platform itself was fine. The failure came from four untested assumptions: that the free CPU budget was enough, that nobody needed to watch the logs, that deploys could stay manual, and that the database distance did not matter.

### Unknown Unknowns

- **Workers, not Pages.** `@astrojs/cloudflare` v14 dropped Cloudflare Pages support, and Cloudflare steers new projects to Workers static assets. `tech-stack.md` still says `deployment_target: cloudflare-pages`, but the project actually deploys as a Worker with static assets (`wrangler.jsonc`, `main: @astrojs/cloudflare/entrypoints/server`).
- **Custom domain.** The `*.workers.dev` subdomain is free. A custom domain (e.g. `doitnow.pl`) requires moving that domain's DNS to a Cloudflare zone.
- **Rollback limits.** `wrangler rollback` reaches only the last 100 versions. It is refused if the old version used a KV, R2 or Queues binding that has since been deleted.
- **Adapter changes between major versions.** `Astro.locals.runtime` was removed in favour of `cloudflare:workers`. Sessions default to a KV binding named `SESSION`, which is eventually consistent (up to 60 s). The default image service is now the paid Images binding unless `imageService: 'compile'` is set. Read the adapter changelog before every major upgrade.
- **Local tooling.** Since Astro 6, `astro dev` and `astro preview` already run on workerd through the Cloudflare Vite plugin, so a separate `wrangler dev` is redundant. Corporate or antivirus TLS interception (Norton Web Shield on the author's machine) breaks `wrangler` unless `NODE_OPTIONS=--use-system-ca` is set.

## Operational Story

- **Preview deploys:** none today. Previews are built locally with `npm run build && npm run preview` (workerd, port 4322), and the CI runs e2e against that preview. If needed later, `wrangler versions upload` creates a preview URL for a version without promoting it.
- **Secrets:**
  - Production `SUPABASE_URL` and `SUPABASE_KEY` (publishable key only) are Worker secrets set with `Get-Clipboard | npx wrangler secret put <NAME> --name doitnow`. Only Cloudflare account members can read them.
  - Local values live in `.dev.vars` (gitignored).
  - CI deploy credentials (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) belong in GitHub Actions secrets and are not set yet.
  - Rotation: put the new value with `wrangler secret put`, which takes effect immediately with no redeploy.
- **Rollback:**
  - `npx wrangler deployments list --name doitnow` lists deployments.
  - `npx wrangler rollback <VERSION_ID> -m "reason"` reverts in seconds.
  - Database migrations do **not** roll back. A schema change needs a new forward migration, and migrations must stay backward-compatible with the previously deployed code.
- **Approval:**
  - **Human only:** applying migrations to the cloud database (`supabase db push`, needs the DB password), setting or rotating secrets, adding domains, deleting workers or KV namespaces.
  - **Agent may do it unattended:** build, `wrangler deploy` after the matching migration is confirmed applied, read-only log tailing, and REST probes with the publishable key.
- **Logs:**
  - Runtime: `npx wrangler tail doitnow --format pretty --status error`. Workers Observability is enabled in `wrangler.jsonc`.
  - Pipeline: `gh run list` and `gh run view <id> --log-failed`.
  - Database: Supabase dashboard logs.

## Risk Register

| Risk                                                                        | Source                              | Likelihood | Impact | Mitigation                                                                                                                                                                                                 |
| --------------------------------------------------------------------------- | ----------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Requests fail when SSR exceeds the Free plan's 10 ms CPU limit              | Devil's advocate / Research finding | M          | H      | Watch `wrangler tail --status error` after each release and before sharing the app publicly; switch to Workers Paid ($5/month) at the first CPU-limit error; keep list pages paginated (20 per page today) |
| Code deployed before its database migration breaks production               | Devil's advocate / Pre-mortem       | M          | H      | Fixed order: `supabase db push`, then verify via REST, then `wrangler deploy`; write migrations so the previous code keeps working; document the order in CLAUDE.md                                        |
| Rollback reverts code but not schema                                        | Pre-mortem                          | L          | M      | Forward-only migrations; additive schema changes (new columns with defaults) before removals                                                                                                               |
| Manual laptop deploys ship a stale or wrong build                           | Devil's advocate                    | M          | M      | Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` to GitHub secrets so CI deploys after lint, tests and e2e pass                                                                                      |
| Sequential Supabase round trips (edge to Ireland) make pages feel slow      | Devil's advocate                    | M          | M      | Run independent queries in parallel (`Promise.all`); measure with `wrangler tail`; consider Cloudflare Smart Placement to run the Worker near the database (check its current status first)                |
| A Node-only or CommonJS dependency works locally but fails on workerd       | Devil's advocate                    | L          | M      | Keep e2e tests on `astro preview` (workerd); add deps to `optimizeDeps.include` when needed                                                                                                                |
| Adapter major upgrade breaks APIs (runtime access, sessions, image service) | Unknown unknowns                    | M          | M      | Read the `@astrojs/cloudflare` changelog before upgrading; run `npm run smoke` and the e2e suite after upgrades                                                                                            |
| `tech-stack.md` says Cloudflare Pages, but the project runs on Workers      | Unknown unknowns                    | H          | L      | Update `deployment_target` to Workers static assets                                                                                                                                                        |
| Need for realtime features (live slot updates, chat)                        | Interview ("don't know")            | L          | M      | Durable Objects with WebSocket Hibernation (GA, on the Free plan) when needed, without leaving the platform                                                                                                |

## Getting Started

The project is already deployed. These are the version-accurate steps for this stack (Astro 7.3, `@astrojs/cloudflare` 14.3, `wrangler` 4.131):

1. Build and preview locally on workerd. No separate `wrangler dev` is needed:

   ```bash
   npm run build
   npm run preview
   ```

2. Apply new migrations to the cloud database first (human, with the DB password from the clipboard):

   ```powershell
   $p=[uri]::EscapeDataString((Get-Clipboard)); npx supabase db push --db-url "postgresql://postgres.dmxguwlbgehjlxjelvlr:$p@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"
   ```

3. Deploy the Worker. Set `NODE_OPTIONS=--use-system-ca` on a machine with TLS-intercepting antivirus:

   ```bash
   npm run build
   npx wrangler deploy
   ```

4. Turn on CI deploys by adding the repository secrets from the clipboard:

   ```powershell
   Get-Clipboard | gh secret set CLOUDFLARE_API_TOKEN
   ```

   ```powershell
   Get-Clipboard | gh secret set CLOUDFLARE_ACCOUNT_ID
   ```

5. Watch production errors after a release:

   ```bash
   npx wrangler tail doitnow --format pretty --status error
   ```

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
