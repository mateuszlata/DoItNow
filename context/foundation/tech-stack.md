---
starter_id: 10x-astro-starter
package_manager: npm
project_name: doitnow
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
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
---

## Why this stack

A solo builder shipping a small web app for one city in a 3-week MVP window needs a starter where accounts, a database and a public deploy work out of the box, so effort goes into the sign-up workflow rather than plumbing. The 10x Astro Starter (Astro + React + TypeScript + Tailwind + Supabase + Cloudflare) is the recommended default for web apps in JavaScript/TypeScript and clears all four agent-friendly gates: it is typed end-to-end, convention-based, popular in training data and well documented. Auth is the only technology-forcing feature in the PRD and the starter carries it first-class; payments, realtime, AI and background jobs are out of scope. The 12-hour cutoffs and the past-event rules depend only on the current time when a request is made, so they need no scheduled jobs. Deployment goes to Cloudflare Workers with static assets (the adapter v14 default; Pages is no longer supported) with GitHub Actions auto-deploying on merge to main. Scaffolding confidence is first-class, so expect mostly smooth setup with occasional manual steps. Configure Supabase row-level security early, because organizer-only edits and private contact data depend on it.
