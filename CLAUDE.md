# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read first

This repo maintains its own operational docs, more detailed than this file. Read them before making non-trivial changes:

- `AGENTS.md` — agent-facing rules (ports, secrets, git/deploy policy, forbidden actions)
- `memory.md` — operational state (bindings, runtime topology, current gotchas)
- `docs/ARCHITECTURE.md` — architecture in depth
- `docs/cloudflare/inventario.md` — Cloudflare bindings/IDs inventory

## Commands

```bash
npm run dev              # Vite frontend on :5173 (proxies /bills-api → :8787)
npm run dev:api           # Worker (API + D1) on :8787
npm run dev:api:reset     # Kill :8787, clear .wrangler/state, restart clean (use if SQLITE_BUSY)
npm run dev:full          # Build + single worker serving SPA + API on :8787

npm run validate          # typecheck + oxlint + tests — gate before every PR/deploy
npm run typecheck         # cf-typegen + tsc -b (root) + tsc -p worker/tsconfig.json --noEmit
npm run lint              # oxlint
npm test                  # runs all scripts/test-*.mjs via node --test
node --test scripts/test-stats.mjs   # run a single test file

npm run build             # cf-typegen + tsc -b + vite build + check-sw.mjs
npm run cf-typegen        # regenerate Worker types after editing wrangler.jsonc bindings
npm run deploy            # build + wrangler deploy
npm run deploy:safe       # validate + build + D1 remote migrate + deploy + smoke
npm run cf:preflight      # wrangler whoami/deployments/D1 + HTTP smoke, read-only
npm run postdeploy:smoke  # checks /, /bills-api/health in prod

npm run db:migrate:local  # D1 migrations, local
npm run db:migrate:remote # D1 migrations, remote (prod)
```

Tests are plain Node (`node --test`), one file per feature area in `scripts/` (`test-stats.mjs`, `test-import.mjs`, `test-notifications.mjs`, `test-webauthn-config.mjs`, `test-session-revocation.mjs`, `test-session-revoke-one.mjs`) — no test framework/runner config to look for.

Do not run `npm install -g wrangler`; it's a devDependency, always invoke via `npx wrangler` / npm scripts.

## Operational rules (hard constraints)

- **No deploy without explicit sign-off from the repo owner**, even though `deploy`/`deploy:safe` scripts exist and work.
- Never change DNS, routes, bindings, or production secrets without explicit OK.
- Never remove features or migrations without explicit OK.
- One change = one branch + PR; don't push experiments directly to `main`.
- Secrets live in `.dev.vars` (local, gitignored) or `wrangler secret put` (prod) — never in `wrangler.jsonc` (non-secret vars only) or committed anywhere.
- After editing `wrangler.jsonc` bindings, run `npm run cf-typegen` and check `worker/src/env.ts` still matches `Env`.

## Architecture

Single Cloudflare Worker serving both the SPA and the API — **not** a two-worker setup:

```
Browser → bills.whoscrizzz.com/*
  /bills-api/*  → Worker API (worker/src/index.ts → routes.ts) — D1, auth, push, email
  /*            → ASSETS (dist/, Vite-built SPA, fallback)
Cron (hourly)   → push notifications + email digests
```

- **Frontend**: React + Vite in `src/`, PWA via `vite-plugin-pwa` (manifest generated in `vite.config.ts` — there is no `public/manifest.json`). Workbox caches API responses `NetworkFirst`; auth routes are `NetworkOnly`.
- **Backend**: TypeScript in `worker/src/`, D1 binding `DB` (`bills-pwa-db`). API is entirely under `/bills-api` (`worker/src/constants.ts`); no `/v1` segment — `APP_VERSION` in `wrangler.jsonc` is only for client update checks (`src/services/update.ts` + `UpdatePrompt`).
- **Worker modules**: `routes.ts` (HTTP routing), `auth.ts`/`passkeys.ts` (sessions + WebAuthn), `subscriptions.ts` (CRUD, mark-paid, snooze), `notifications.ts` (push cron; `notify_hour` is wall-clock `America/Mexico_City`, see `timezone.ts`), `email-digest.ts` (Resend), `calendar.ts` (tokenized `.ics` feeds).
- **Client data flow**: `useSubscriptions` hook does optimistic updates against IndexedDB (`src/lib/offline-db.ts`), which queues pending ops (`create`, `update`, `delete`, `mark-paid`, `snooze`, `restore-archived`) and replays them on reconnect via `src/lib/sync.ts`.
- **Auth**: magic link + optional passkeys; session token in `localStorage`, state in `AuthContext` (`src/contexts/AuthContext.tsx`). Special route `/auth/verify` handles email links outside normal nav.
- **Navigation**: in-app tabs (`home | add | calendar | settings`) kept in sync with `?p=` query param via `src/lib/nav-route.ts`, not a router library.
- **Responsive UI**: single React tree for browser tab and installed PWA, breakpoint at 768px — desktop gets a sidebar and flat/category list toggle; mobile gets bottom nav, FAB quick-add, and swipe gestures on cards (preference stored in `localStorage`).

## Local dev ports

Fixed defaults: Worker `8787`, Vite `5173` — both `127.0.0.1` only (no tunnels, no Zero Trust, no exposing dev by public IP/DDNS). To run multiple worktrees/checkouts in parallel, override via `VITE_PORT`/`VITE_API_PORT` in a gitignored `.env.local` per checkout — check other worktrees' `.env.local` first to avoid collisions (`git worktree list`).
