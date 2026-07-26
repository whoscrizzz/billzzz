# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read first

This repo maintains its own operational docs, more detailed than this file. Read them before making non-trivial changes:

- `AGENTS.md` — agent-facing rules (ports, secrets, git/deploy policy, forbidden actions)
- `memory.md` — operational state (bindings, runtime topology, current gotchas)
- `docs/ARCHITECTURE.md` — architecture in depth
- `docs/CONTRIBUTING.md` / `docs/STYLE_GUIDE.md` — setup and code style
- `docs/DEPLOY.md`, `docs/cloudflare/inventario.md` — deploy flow and Cloudflare bindings/IDs

## Commands

```bash
npm run dev               # Vite frontend on :5173 (proxies /bills-api → :8787)
npm run dev:api           # Worker (API + D1) on :8787
npm run dev:api:reset     # Kill :8787, clear .wrangler/state, restart clean (use if SQLITE_BUSY)
npm run dev:full          # Build + single worker serving SPA + API on :8787

npm run validate          # typecheck + oxlint + tests — gate before every PR/deploy
npm run typecheck         # cf-typegen + tsc -b (root) + tsc -p worker/tsconfig.json --noEmit
npm run lint              # oxlint
npm test                  # runs the scripts/test-*.mjs suite via node --test
node --test scripts/test-stats.mjs   # run a single test file
npm run fmt               # prettier --write (fmt:check for CI-style verification)

npm run build             # cf-typegen + tsc -b + vite build + check-sw.mjs
npm run cf-typegen        # regenerate Worker types after editing wrangler.jsonc bindings
npm run deploy            # build + wrangler deploy
npm run deploy:safe       # validate + build + D1 remote migrate + deploy + smoke
npm run cf:preflight      # wrangler whoami/deployments/D1 + HTTP smoke, read-only
npm run postdeploy:smoke  # checks /, /bills-api/health in prod

npm run db:migrate:local  # D1 migrations, local
npm run db:migrate:remote # D1 migrations, remote (prod)
```

Node 24 (`.nvmrc`, CI); `package.json` engines allows ≥22.

Tests are plain Node (`node --test`), one file per feature area in `scripts/`: `test-stats.mjs`, `test-import.mjs`, `test-notifications.mjs`, `test-dedup-claim.mjs`, `test-webauthn-config.mjs`, `test-session-revocation.mjs`, `test-session-revoke-one.mjs`. No test framework/runner config to look for — the list of files lives in the `test` script, so **a new `scripts/test-*.mjs` file must be added there or it never runs**. Tests import the real TypeScript modules through `scripts/test-helpers/load-ts-module.mjs` (esbuild bundle → dynamic import); never reimplement worker logic inside a test.

`npx wrangler` only — do not `npm install -g wrangler`, it's a devDependency.

## Operational rules (hard constraints)

- **No deploy without explicit sign-off from the repo owner**, even though `deploy`/`deploy:safe` scripts exist and work.
- Never change DNS, routes, bindings, or production secrets without explicit OK.
- Never remove features or migrations without explicit OK.
- One change = one branch + PR (template at `.github/pull_request_template.md`); don't push experiments directly to `main`.
- Secrets live in `.dev.vars` (local, gitignored) or `wrangler secret put` (prod) — never in `wrangler.jsonc` (non-secret vars only) or committed anywhere. Runtime secrets: `VAPID_PRIVATE_KEY`, `RESEND_API_KEY`.
- After editing `wrangler.jsonc` bindings, run `npm run cf-typegen` and check `worker/src/env.ts` still matches `Env` (`worker-configuration.d.ts` is generated and gitignored).
- Husky pre-commit runs `lint-staged` (prettier + oxlint) **and** `npm run typecheck`; commits with type errors fail locally.

## Architecture

Single Cloudflare Worker serving both the SPA and the API — **not** a two-worker setup:

```
Browser → bills.whoscrizzz.com/*
  /bills-api/*  → Worker API (worker/src/index.ts → routes.ts) — D1, auth, push, email
  /*            → ASSETS (dist/, Vite-built SPA, SPA fallback)
Cron (*/15 min) → push notifications + email digests + expired-auth-row purge
```

- **Frontend**: React 19 + Vite in `src/`, PWA via `vite-plugin-pwa` (manifest generated in `vite.config.ts` — there is no `public/manifest.json`).
- **Backend**: TypeScript in `worker/src/`, D1 binding `DB` (`bills-pwa-db`). API is entirely under `/bills-api` (`worker/src/constants.ts`) — deliberately *not* `/api`, which would hit the zone WAF on `whoscrizzz.com`. Routes have no `/v1` segment; the `API_VERSION` var in `wrangler.jsonc` is currently unused, and `APP_VERSION` only feeds client update checks (`src/services/update.ts` + `UpdatePrompt`).
- **Worker modules**: `index.ts` (fetch + `scheduled` + security headers), `routes.ts` (HTTP routing), `auth.ts`/`passkeys.ts`/`webauthn-config.ts` (sessions + WebAuthn), `rate-limit.ts`, `subscriptions.ts` (CRUD, mark-paid, snooze, payment records), `settings.ts` (user settings, export/import, `/health`), `notifications.ts` + `notification-health.ts` (push cron), `email-digest.ts` (Resend), `calendar.ts` (tokenized `.ics` feeds), `due-dates.ts`/`due-dates-json.ts` (due-date math), `timezone.ts`.
- **Client data flow**: `useSubscriptions` does optimistic updates against IndexedDB (`src/lib/offline-db.ts`), which queues pending ops (`create`, `update`, `delete`, `mark-paid`, `snooze`, `restore-archived`) and replays them on reconnect via `src/lib/sync.ts`. The IndexedDB name is per-account (`bills-pwa-u-<userId>`); call `bindOfflineDbUser` on login/logout so accounts stay isolated.
- **Auth**: magic link (link or 6-digit short code) + optional passkeys; session token in `localStorage`, state in `AuthContext` (`src/contexts/AuthContext.tsx`). Special route `/auth/verify` handles email links outside normal nav. `GET /bills-api/auth/verify` intentionally 405s — verification is POST-only so email scanners can't burn the token.
- **Navigation**: in-app tabs (`home | add | calendar | settings`) kept in sync with the `?p=` query param via `src/lib/nav-route.ts`, not a router library. Heavy panels are `React.lazy` imports in `App.tsx`.
- **Responsive UI**: single React tree for browser tab and installed PWA, breakpoint at 768px — desktop gets a sidebar (collapsible to an icon rail) and flat/category list toggle; mobile gets bottom nav, FAB quick-add, and swipe gestures on cards. A `FloatingCalculator` in `AppLayout` persists across tabs, and the topbar avatar doubles as the online/offline indicator. Dark mode is `prefers-color-scheme` only (neutral grays, `src/App.css`) — no manual theme switch.
- **UI prefs** (list layout, sort mode, last login email, sidebar collapsed) go through `src/lib/ui-prefs.ts`; add new `localStorage` keys there rather than inline.

## Data model (D1, `migrations/`)

Forward-only numbered SQL files, applied with the `db:migrate:*` scripts. Tables: `users`, `sessions`, `magic_links`, `subscriptions`, `payment_records`, `push_subscriptions`, `notification_log`, `notification_attempts`, `passkey_credentials`, `webauthn_challenges`, `auth_rate_limits`.

- `subscriptions.due_dates` is a JSON array of `{ date, amount? }` entries (per-date optional override); parse/serialize only through `due-dates-json.ts`, and read the effective amount with `currentDueAmount`.
- `payment_records` is the payment history behind `/bills-api/payments` (list, delete one, clear all); mark-paid writes it and un-marking pops the last record.
- `notification_log` stores the dedup key; `notification_attempts` stores per-attempt outcomes (`sent`/`failed`/`expired`) feeding `/bills-api/notifications/health`.

## Conventions and gotchas

- **Worker and SPA are separate bundles with no shared imports.** `due-dates.ts`, `due-dates-json.ts`, and the timezone allowlist exist as parallel copies in `worker/src/` and `src/lib/` (`notify-timezone.ts`). Change one, change the other — the copies' comments say so, and drift silently splits client and server due-date math.
- **Notification timing**: `notify_hour` is a wall-clock hour in the *owning user's* timezone (`users.timezone`, default `America/Mexico_City`, picked from the allowlist in `worker/src/timezone.ts`). The cron fires every 15 minutes; `shouldNotifyNow` gates on the `[notify_hour, notify_hour+1)` window, upcoming within `notify_days_before`, and overdue up to 7 days.
- **Dedup is a claim, not a check.** `sendDueNotifications` INSERTs the `subId:nextDue:daysLeft` key into `notification_log` *before* sending (UNIQUE constraint makes it atomic across overlapping ticks) and releases the claim if there are no endpoints or every delivery failed. Keep that ordering when touching push code. Same pattern in `rate-limit.ts`: one UPSERT with `RETURNING`, never SELECT-then-UPDATE.
- **Every response passes through `withSecurityHeaders`** in `worker/src/index.ts`, including static assets. The CSP is strict same-origin (`script-src 'self'`, `connect-src 'self'`) — any external font, script, image host, or analytics endpoint requires editing that header, and there is currently no reason to.
- **Service worker gate**: `npm run build` runs `scripts/check-sw.mjs`, which fails if `dist/sw.js` lost its `/bills-api/` runtime route or leaked the literal `API_PREFIX` identifier. Workbox precaches the app shell and marks `/bills-api/*` `NetworkOnly` (no API responses are cached); push handling lives in `public/sw-push.js`, pulled in via `importScripts`. `registerType` is `'prompt'` — updates surface through `UpdatePrompt`, they don't auto-apply.
- **Language**: user-facing strings, API error messages, and commit messages are Spanish (`es-MX`); identifiers, code comments, and docs headings are English. Match the surrounding file.
- **Formatting/lint**: prettier (single quotes, 100 cols, semicolons, es5 trailing commas) and oxlint with `typescript/no-floating-promises` and `react/rules-of-hooks` as errors — floating promises in async handlers will fail `validate`.
- **CI**: `.github/workflows/ci.yml` runs `npm audit --audit-level=high --omit=dev` (production deps only) plus `validate` and `build` on every PR. `deploy.yml` deploys on push to `main` when the Cloudflare secrets are present, and skips with a warning when they aren't.

## Local dev ports

Fixed defaults: Worker `8787`, Vite `5173` — both `127.0.0.1` only (no tunnels, no Zero Trust, no exposing dev by public IP/DDNS). To run multiple worktrees/checkouts in parallel, override via `VITE_PORT`/`VITE_API_PORT` in a gitignored `.env.local` per checkout — both `vite.config.ts` and `scripts/dev-api.mjs` read it through Vite's `loadEnv`, so the two stay consistent. Check other worktrees' `.env.local` first to avoid collisions (`git worktree list`).
