---
bootstrapped_at: 2026-10-08T08:42:37Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: doitnow
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: doitnow
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

> A solo builder shipping a small web app for one city in a 3-week MVP window needs a starter where accounts, a database and a public deploy work out of the box, so effort goes into the sign-up workflow rather than plumbing. The 10x Astro Starter (Astro + React + TypeScript + Tailwind + Supabase + Cloudflare) is the recommended default for web apps in JavaScript/TypeScript and clears all four agent-friendly gates: it is typed end-to-end, convention-based, popular in training data and well documented. Auth is the only technology-forcing feature in the PRD and the starter carries it first-class; payments, realtime, AI and background jobs are out of scope. The 12-hour cutoffs and the past-event rules depend only on the current time when a request is made, so they need no scheduled jobs. Deployment goes to Cloudflare Pages (the starter's default) with GitHub Actions auto-deploying on merge to main. Scaffolding confidence is first-class, so expect mostly smooth setup with occasional manual steps. Configure Supabase row-level security early, because organizer-only edits and private contact data depend on it.

## Pre-scaffold verification

| Signal      | Value                                                     | Severity | Notes                                          |
| ----------- | --------------------------------------------------------- | -------- | ---------------------------------------------- |
| npm package | not run                                                   | —        | cmd_template starts with `git clone`; no create-* CLI |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-09-12 | fresh    | from card.docs_url                             |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0 (first clone attempt exited 128 with `SSL certificate OpenSSL verify result: unable to get local issuer certificate`; retried with `git -c http.sslBackend=schannel clone` — Windows certificate store, SSL verification kept on — which succeeded)
**Files moved**: 51 files (excluding `node_modules/`), 22 top-level entries
**Conflicts (.scaffold siblings)**: none
**.gitignore handling**: moved silently (absent in cwd)
**.bootstrap-scaffold cleanup**: deleted (upstream `.git/` removed before move-up)

Install note: `npm warn EBADENGINE` — `eslint-plugin-astro@3.1.0` requires node `^22.22.3 || ^24.16.0 || >=26.3.0`; local node is v24.13.1. Starter `.nvmrc` / card expects node 22.

## Post-scaffold audit

**Tool**: npm audit --json (exit 1 — vulnerabilities present; informational)
**Summary**: 0 CRITICAL, 10 HIGH, 2 MODERATE, 0 LOW
**Direct vs transitive**: 0/2/0/0 direct of total 0/10/2/0. Both direct HIGH findings (`@astrojs/cloudflare`, `wrangler`) are inherited through their dependency chains (miniflare, undici, sharp, @cloudflare/vite-plugin); npm's suggested fix is a semver-major change.

#### CRITICAL findings

None.

#### HIGH findings

- `@astrojs/cloudflare` (direct), range >=12.6.8 — via `@cloudflare/vite-plugin`, `wrangler`. Fix: `@astrojs/cloudflare@12.6.13` (semver-major).
- `wrangler` (direct), range >=4.16.0 — via `miniflare`, `undici`, `sharp`. Fix: `wrangler@4.15.2` (semver-major).
- `@cloudflare/vite-plugin` (transitive) — via `miniflare`/`wrangler`. Fix via `@astrojs/cloudflare`.
- `miniflare` (transitive) — via `undici`, `sharp`. Fix via `wrangler`.
- `undici` 7.0.0–7.29.0 (transitive) — GHSA-3wwx-pv8p-q78v, GHSA-pmjh-fq2x-6v4x, GHSA-r53p-7pc4-xj5r, GHSA-rfgv-xxqx-mfg5, GHSA-3xpg-4rpp-hhhm, GHSA-2jfj-6hjv-fm6j, GHSA-2gqq-gqf2-x968, GHSA-w293-vg96-wgc3, GHSA-8436-99hf-9mmv, GHSA-rx4f-c7p8-82vq (DoS, response splitting, cookie disclosure, TLS validation bypass in BalancedPool). Fix via `wrangler`.
- `sharp` <0.35.5 (transitive) — GHSA-wq5f-xc86-pv6w (librsvg CVE-2026-96889). Fix via `wrangler`.
- `brace-expansion` (transitive) — GHSA-q2hr-2g5m-vwhr, GHSA-qhr7-859c-m2p7, GHSA-6j4f-fj2g-mc7p (DoS). Fix available (`npm audit fix`).
- `devalue` <=5.9.2 (transitive) — GHSA-j22f-vq7h-c4qm, GHSA-hx4r-w6wj-j8fg, GHSA-mcm9-63f2-9j32, GHSA-wf3x-273g-mvxv, GHSA-x5rw-q4pp-hg5g, GHSA-4q55-j62x-fr9h. Fix available.
- `http-cache-semantics` <=4.2.0 (transitive) — GHSA-ch52-4w7c-c8xp. Fix available.
- `source-map-js` 1.0.0–1.2.1 (transitive) — GHSA-68fv-2mgg-jv7q (DoS). Fix available.

#### MODERATE findings

- `fast-uri` 3.0.0–3.1.7 (transitive) — GHSA-hrr3-gc8f-f4qj. Fix available.
- `smol-toml` <=1.8.0 (transitive) — GHSA-r4xh-jqrq-34v2. Fix available.

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                    | Value                |
| ----------------------- | -------------------- |
| bootstrapper_confidence | first-class          |
| quality_override        | false                |
| path_taken              | standard             |
| self_check_answers      | null                 |
| team_size               | solo                 |
| deployment_target       | cloudflare-pages     |
| ci_provider             | github-actions       |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true                 |
| has_payments            | false                |
| has_realtime            | false                |
| has_ai                  | false                |
| has_background_jobs     | false                |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
