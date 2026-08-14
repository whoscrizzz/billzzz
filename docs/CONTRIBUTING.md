# Contributing — Billzzz PWA

## Setup

### Requirements

- Node.js 22+
- npm 11+

### First Time

```bash
git clone https://github.com/whoscrizzz/billzzz-pwa.git
cd billzzz-pwa
npm ci
npm run cf-typegen
```

### Running Locally

**Dual dev (recommended):**

```bash
# Terminal 1: API on :8787
npm run dev:api

# Terminal 2: Frontend on :5173 (proxies /bills-api to :8787)
npm run dev
```

**Single mode:**

```bash
npm run dev:full  # SPA + API on :8787
```

**Multiple worktrees in parallel:** set `VITE_PORT`/`VITE_API_PORT` in a
gitignored `.env.local` per checkout to avoid port collisions between them —
the defaults above stay shared unless overridden.

## Code Style

### Formatting

```bash
npm run fmt       # Format all files
npm run fmt:check # Check formatting
```

Automatically runs on commit (via husky + lint-staged).

### Linting

```bash
npm run lint
```

### TypeScript

```bash
npm run typecheck
```

## Commit & Branches

### Branch Naming

- `feature/add-bill-scheduler` — New feature
- `fix/auth-token-refresh` — Bug fix
- `docs/update-readme` — Documentation
- `refactor/extract-api-client` — Refactoring
- `test/add-notification-tests` — Tests only

### Commit Messages

```text
feat: add bill scheduler

- Trigger email digest every hour
- Cache bills for 24 hours
- Add cron binding to wrangler.jsonc

Co-authored-by: Your Name <email>
```

Keep commits atomic. One feature = one commit (when possible).

### Pull Request

1. Branch from `main`
2. Push to GitHub
3. Create PR (use template: `.github/pull_request_template.md`)
4. Ensure CI passes (validate + build)
5. Request review
6. Merge via "Squash and merge" (keeps history clean)

## Testing & Validation

### Run All Checks

```bash
npm run validate  # typecheck + lint + test
```

### Unit Tests

```bash
npm test
```

Tests are in `scripts/`:

- `test-stats.mjs` — Build stats
- `test-import.mjs` — Module imports
- `test-notifications.mjs` — Notification logic
- `test-webauthn-config.mjs` — WebAuthn config

### Smoke Tests (post-deploy)

```bash
npm run postdeploy:smoke
```

## Database Migrations

### Create Migration

```bash
# Create a migration file in migrations/
# Format: YYYY-MM-DD_description.sql

npx wrangler d1 migrations create bills-pwa-db add_email_digest_table
```

### Apply Locally

```bash
npm run db:migrate:local
```

### Apply Remotely

```bash
npm run db:migrate:remote
# Or automatically (via npm run deploy:safe)
```

## Deployment

### Prerequisites

- GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- Local: `.dev.vars` with `VAPID_PRIVATE_KEY`, `RESEND_API_KEY`

### Deploy via GitHub Actions

```bash
# Push to main
git push origin main
# Actions auto-triggers (ci.yml)
```

### Deploy Locally

```bash
npm run deploy:safe
# or from Mac:
./scripts/deploy-production.sh
```

### Pre-Deploy Checklist

- [ ] All tests pass: `npm run validate`
- [ ] No console errors (dev mode)
- [ ] PWA manifest is correct
- [ ] Secrets are set: `.dev.vars` (local) or GitHub Secrets (CI)
- [ ] Database migrations are ready

## Adding a New API Endpoint

1. Create handler in `worker/src/handlers/`:

```typescript
// worker/src/handlers/my-feature.ts
export async function getMyFeature(req: Request, env: Env) {
  // Middleware: auth, rate-limit, etc.
  // Logic: validate, query DB, respond
  return json({ data: [...] });
}
```

1. Register in `worker/src/routes.ts`:

```typescript
router.get('/bills-api/my-feature', (req) => getMyFeature(req, env));
```

1. Add types in `src/types/`:

```typescript
// src/types/my-feature.ts
export interface MyFeature {
  id: string;
  name: string;
}
```

1. Create client in `src/services/api.ts`:

```typescript
export async function getMyFeature() {
  return fetch('/bills-api/my-feature').then(r => r.json());
}
```

1. Use in components:

```typescript
const { data } = useFetch(() => getMyFeature());
```

## Making PWA Changes

### Update Manifest

Edit the `manifest` block in `vite.config.ts` (canonical PWA manifest at build). Use `start_url` `/?pwa=1` and theme `#eef1f5`.

### Update Service Worker

Edit `vite.config.ts` (Workbox config) — runs pre-commit validation.

### Test PWA Offline

1. `npm run dev` (or `dev:full`)
2. DevTools → Application → Service Workers
3. Enable "Offline"
4. Verify functionality

## Troubleshooting

### `:8787` already in use

```bash
npm run dev:api:reset  # Kill process, clean state
```

### TypeScript errors after `wrangler.jsonc` change

```bash
npm run cf-typegen  # Regenerate worker types
```

### Prettier/lint-staged failing

```bash
npm run fmt  # Auto-fix all files
```

### D1 database issues

```bash
npx wrangler d1 info bills-pwa-db --local
# or reset local state:
rm -rf .wrangler/state/
npm run db:migrate:local
```

## Questions?

- Check `docs/ARCHITECTURE.md` for system design
- Check `docs/DEPLOY.md` for deployment details
- Check `memory.md` for operational status
- Open an issue on GitHub
