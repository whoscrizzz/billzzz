# Style Guide — billzzz-pwa

## TypeScript

### Naming

```typescript
// Components: PascalCase
const SubscriptionCard = () => {};
const RecurrenceSheet = () => {};

// Functions: camelCase
function monthlyEquivalent() {}
const fetchSubscriptions = async () => {};

// Constants: UPPER_SNAKE_CASE
const LONG_PRESS_MS = 550;
const WEEKLY_TO_MONTHLY = 52 / 12;

// Types/Interfaces: PascalCase
interface Subscription {}
type Frequency = 'monthly' | 'weekly' | 'yearly' | 'once' | 'interval';
```

### Imports

```typescript
// Group imports: React, external libs, types, internal
import { useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

import type { Subscription } from '../types/subscription';
import { parseDueDates } from '../lib/due-dates-json';
import { formatMoney } from '../lib/format-money';
import { SnoozeMenu } from './SnoozeMenu';
```

### Async/Await

Prefer async/await over `.then()`:

```typescript
// ✓ Good
export async function fetchMe() {
  const res = await apiFetch(`${API_PREFIX}/auth/me`);
  return res.json() as Promise<{ user: { id: string; email: string | null } }>;
}

// ✗ Avoid
export function fetchMe() {
  return apiFetch(`${API_PREFIX}/auth/me`).then((res) => res.json());
}
```

### Error Handling

```typescript
// src/lib/api.ts — carries its own HTTP status so callers (e.g. the offline
// sync queue in useSubscriptions) can tell a permanent rejection (4xx) apart
// from a transient failure worth queuing for retry (network error, 5xx).
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function publicFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(body.error ?? `Request failed (${response.status})`, response.status);
  }
  return response;
}
```

### Comments

Only comment complex logic or non-obvious decisions:

```typescript
// ✓ Good - explains why
/**
 * Thrown on a non-ok API response. Carries the HTTP status so callers can
 * tell a permanent rejection (4xx) apart from a transient failure worth
 * queuing for retry (5xx).
 */
export class ApiError extends Error {
  /* ... */
}

// ✗ Avoid - obvious from code
// Get the user
const user = await getUser();
```

## React Components

### Functional Components Only

```typescript
// ✓ Good
export function SubscriptionCard({ subscription, onMarkPaid }: Props) {
  return <div>{subscription.name}</div>;
}

// ✗ Avoid
class SubscriptionCard extends React.Component {}
```

### Props Interface

`interface Props`, not `<Component>Props` — that's the name the repo actually
uses:

```typescript
// ✓ Good (src/components/SubscriptionCard.tsx)
interface Props {
  subscription: Subscription;
  onMarkPaid: (id: string) => void;
  onEdit: (sub: Subscription) => void;
  /** Hides the category when the list is already grouped by category. */
  hideCategory?: boolean;
}

export function SubscriptionCard({ subscription, onMarkPaid, onEdit, hideCategory }: Props) {
  // ...
}
```

### Hooks

Order hooks logically:

```typescript
export function useSubscriptions() {
  // State
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);

  // Effects
  useEffect(() => {
    void load();
  }, []);

  // Handlers
  const markPaid = (id: string) => {
    // ...
  };

  return { subscriptions, markPaid };
}
```

### Custom Hooks

```typescript
// src/hooks/useMediaQuery.ts
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setMatches(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [query]);

  return matches;
}
```

## Worker Code

`worker/src/` is flat — there's no `handlers/` or `db/` subfolder. An
endpoint is a function in whichever module it belongs to (`subscriptions.ts`,
`notes.ts`, ...), wired into `routes.ts` with an exact path match, not a
router library.

### Endpoint

```typescript
// worker/src/subscriptions.ts
export async function listSubscriptions(db: D1Database, userId: string): Promise<Response> {
  const { results } = await db
    .prepare(
      `SELECT * FROM subscriptions
       WHERE user_id = ? AND deleted_at IS NULL AND trashed_at IS NULL
       ORDER BY due_day ASC, name ASC`
    )
    .bind(userId)
    .all<SubscriptionRow>();

  return json({ subscriptions: results ?? [] });
}
```

### Route Registration

```typescript
// worker/src/routes.ts
if (url.pathname === apiPath('/subscriptions') && request.method === 'GET') {
  return listSubscriptions(env.DB, userId);
}
```

### Responses

`json`/`error` (`worker/src/env.ts`) are the only response helpers — never
`new Response(JSON.stringify(...))` by hand:

```typescript
export function json(data: unknown, status = 200, request?: Request, env?: Env): Response {
  const headers = request && env ? makeCorsHeaders(env, request) : corsHeaders;
  return Response.json(data, { status, headers });
}

export function error(message: string, status = 400, request?: Request, env?: Env): Response {
  const headers = request && env ? makeCorsHeaders(env, request) : corsHeaders;
  return Response.json({ error: message }, { status, headers });
}
```

## File Organization

```
src/
├── components/       # Flat — 40+ files, no per-feature subfolders
│   ├── SubscriptionCard.tsx
│   ├── RecurrenceSheet.tsx
│   └── AppLayout.tsx
├── hooks/
│   ├── useSubscriptions.ts
│   ├── useNotes.ts
│   └── useMediaQuery.ts
├── lib/              # Pure utilities (due-dates, spending-stats, API client...)
│   ├── api.ts        # The real API client — not src/services/
│   ├── spending-stats.ts
│   └── format-money.ts
├── types/
│   └── subscription.ts
└── services/
    └── update.ts     # PWA update-check logic only
```

## Testing

`node:test` + `node:assert/strict`, not Jest/Mocha — bundled with esbuild
(`scripts/test-helpers/load-ts-module.mjs`) to import the real TypeScript:

```javascript
// scripts/test-categories.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModule } from './test-helpers/load-ts-module.mjs';

const { categoryColor } = await loadTsModule('src/lib/categories.ts');

test('labels that mean "no category" resolve to a neutral gray', () => {
  const neutral = 'hsl(240 6% 55%)';
  assert.equal(categoryColor('Otros'), neutral);
  assert.equal(categoryColor('Sin categoría'), neutral);
});
```

A new `scripts/test-*.mjs` file also has to be added to the `test` script in
`package.json` — otherwise it never runs (see CLAUDE.md).

## Formatting Rules

- **Line length**: 100 chars (Prettier default)
- **Quotes**: Single quotes for strings
- **Semicolons**: Always
- **Trailing commas**: ES5 style (arrays/objects, no function params)
- **Indentation**: 2 spaces

Example:

```typescript
const user = {
  id: '123',
  name: 'John',
};

function greet(name: string) {
  console.log(`Hello, ${name}`);
}
```

## Checklist

Before committing:

- [ ] `npm run validate` passes (typecheck + lint + tests — the full gate,
      not just `npm test`)
- [ ] Code is formatted: `npm run fmt`
- [ ] No console.log left behind (use proper logging)
- [ ] Commit message is clear
