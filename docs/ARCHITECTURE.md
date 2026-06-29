# Architecture — bills-pwa

## Overview

**bills-pwa** es una PWA de suscripciones full-stack desplegada en Cloudflare.

```
┌─────────────────┐
│   iOS/Android   │ (PWA installed)
│ bills.*.com     │
└────────┬────────┘
         │ HTTPS
         ▼
┌─────────────────────────────────────┐
│   Cloudflare Worker (bills-pwa)     │
├─────────────────────────────────────┤
│ Frontend (SPA)                      │ ◄─ Vite build → dist/
│ ├─ React                           │
│ ├─ PWA (Workbox)                   │
│ └─ WebAuthn (PassKeys)             │
├─────────────────────────────────────┤
│ Backend API (/bills-api/*)         │ ◄─ TypeScript Worker
│ ├─ Authentication                  │
│ ├─ Bill Management                 │
│ ├─ Rate Limiting                   │
│ ├─ Push Notifications              │
│ └─ Email Digests                   │
├─────────────────────────────────────┤
│ Cron (hourly)                      │
│ ├─ Push Notifications              │
│ └─ Email Digests                   │
└──────────┬────────────────────────┬─┘
           │                        │
           ▼                        ▼
        ┌──────────┐         ┌────────────┐
        │ D1 (SQL) │         │  Resend    │
        │ Database │         │  Email API │
        └──────────┘         └────────────┘
```

## Key Components

### Frontend (src/)
```
src/
├── components/
│   ├── ui/              # Buttons, modals, inputs
│   ├── layouts/         # Page wrappers
│   └── features/        # Complex features (bills, auth)
├── hooks/               # Custom React hooks
├── utils/               # Helper functions
├── types/               # TypeScript interfaces
├── services/
│   ├── api.ts          # API client
│   ├── storage.ts      # IndexedDB & localStorage
│   └── update.ts       # PWA update checks
├── styles/             # Global CSS
└── App.tsx
```

### Worker (worker/src/)
```
worker/src/
├── handlers/            # Route handlers
├── services/            # Business logic
│   ├── auth.ts         # WebAuthn
│   ├── bills.ts
│   ├── subscriptions.ts
│   └── notifications.ts
├── db/                 # Database queries
│   ├── users.ts
│   └── bills.ts
├── utils/              # Helper functions
├── middleware/         # Auth, rate-limit
└── index.ts            # Entry point
```

## Data Flow

### 1. Authentication (WebAuthn)
- Client: `navigator.credentials.create()` / `.get()`
- Worker: Verify challenge, issue JWT
- Storage: localStorage (JWT), IndexedDB (bills)

### 2. Bill Sync
- Poll: `/bills-api/bills` every 5 minutes
- Store: IndexedDB for offline
- UI: React state + SWR cache

### 3. Push Notifications
- Subscribe: `/bills-api/notifications/subscribe` (VAPID)
- Trigger: Hourly cron job
- Deliver: Cloudflare workers-push-event

### 4. Email Digests
- Generate: Hourly cron
- Send: Resend API
- Storage: Last sent timestamp in D1

## Bindings & Secrets

| Name | Type | Usage |
|------|------|-------|
| `DB` | D1 Database | All SQL queries |
| `ASSETS` | Static Files | SPA fallback (dist/) |
| `VAPID_PUBLIC_KEY` | Var | Client-side push |
| `VAPID_PRIVATE_KEY` | Secret | Sign push messages |
| `RESEND_API_KEY` | Secret | Email digests |
| `APP_VERSION` | Var | Client update checks |

## Deployment

### Local Development
```bash
npm run dev:api      # Worker on :8787
npm run dev          # Vite on :5173 (proxies /bills-api)
npm run dev:full     # Single-mode (SPA + API on 8787)
```

### Production
```bash
npm run validate     # typecheck + lint + tests
npm run build        # Build SPA + Worker
npm run deploy:safe  # Deploy + migrations + smoke tests
```

## PWA Configuration

`public/manifest.json`:
- `scope`: Limits app to bills.whoscrizzz.com/
- `start_url`: `?pwa=1` to track app version
- `display: standalone`: Full app experience
- `icons`: 192px + 512px for all platforms

`src/services/update.ts`:
- Checks `/bills-api/health` for `APP_VERSION`
- Triggers service worker update if mismatch
- Non-disruptive update UX (no reload forced)

## Rate Limiting

Implemented via `worker/src/middleware/rate-limit.ts`:
- Per-user limits (auth endpoint: 5/min)
- Per-IP limits (public endpoints: 20/min)
- Respects `X-Forwarded-For` header

## Version Strategy (Public PWA)

API versioning in `wrangler.jsonc`:
```json
"vars": {
  "APP_VERSION": "1.0.0",
  "API_VERSION": "v1"
}
```

Routes: `/bills-api/v1/...` (allows future `/v2/...`)

When making breaking changes:
1. Keep v1 endpoints working
2. Add v2 endpoints alongside
3. Bump `APP_VERSION` to trigger client update
4. Migrate clients gradually
