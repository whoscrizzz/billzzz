# Style Guide — bills-pwa

## TypeScript

### Naming
```typescript
// Components: PascalCase
const BillCard = () => {};
const UserProfileModal = () => {};

// Functions: camelCase
function calculateBillTotal() {}
const fetchUserBills = async () => {};

// Constants: UPPER_SNAKE_CASE
const MAX_RETRY_ATTEMPTS = 3;
const API_TIMEOUT_MS = 5000;

// Types/Interfaces: PascalCase
interface User {}
type BillStatus = 'pending' | 'paid' | 'overdue';
```

### Imports
```typescript
// Group imports: React, external libs, types, internal
import React, { useEffect, useState } from 'react';
import { idb } from 'idb';

import type { Bill, User } from '../types';
import { fetchBills } from '../services/api';
import { formatCurrency } from '../utils/format';
```

### Async/Await
Prefer async/await over `.then()`:
```typescript
// ✓ Good
async function loadBills() {
  try {
    const bills = await fetchBills();
    setBills(bills);
  } catch (e) {
    console.error('Failed to load bills:', e);
  }
}

// ✗ Avoid
function loadBills() {
  fetchBills()
    .then(bills => setBills(bills))
    .catch(e => console.error('Failed:', e));
}
```

### Error Handling
Always handle errors in async operations:
```typescript
// ✓ Good
try {
  await api.post('/bills', data);
  showNotification('Bill added');
} catch (error) {
  if (error instanceof NetworkError) {
    showNotification('Check your connection');
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### Comments
Only comment complex logic or non-obvious decisions:
```typescript
// ✓ Good - explains why
// Retry with exponential backoff to handle temporary network issues
async function fetchWithRetry(url, maxRetries = 3) {
  // ...
}

// ✗ Avoid - obvious from code
// Get the user
const user = await getUser();
```

## React Components

### Functional Components Only
```typescript
// ✓ Good
export const BillCard = ({ bill }: { bill: Bill }) => {
  return <div>{bill.name}</div>;
};

// ✗ Avoid
class BillCard extends React.Component {}
```

### Props Interface
```typescript
// ✓ Good
interface BillCardProps {
  bill: Bill;
  onEdit: (bill: Bill) => void;
  isLoading?: boolean;
}

export const BillCard = ({ bill, onEdit, isLoading = false }: BillCardProps) => {
  // ...
};
```

### Hooks
Order hooks logically:
```typescript
export const BillList = () => {
  // State
  const [bills, setBills] = useState<Bill[]>([]);
  const [filter, setFilter] = useState('all');

  // Effects
  useEffect(() => {
    loadBills();
  }, []);

  // Handlers
  const handleAddBill = () => {
    // ...
  };

  // Render
  return <div>{/* ... */}</div>;
};
```

### Custom Hooks
```typescript
// hooks/useFetch.ts
export function useFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetch(url)
      .then(r => r.json())
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [url]);

  return { data, loading, error };
}
```

## Worker Code

### Handlers
```typescript
// worker/src/handlers/bills.ts
import type { Env } from '../env';

export async function getBills(
  req: Request,
  env: Env
): Promise<Response> {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) return json({ error: 'Unauthorized' }, 401);

    const bills = await queryBills(env.DB, userId);
    return json({ bills });
  } catch (error) {
    console.error('GET /bills error:', error);
    return json({ error: 'Internal Server Error' }, 500);
  }
}
```

### Route Registration
```typescript
// worker/src/routes.ts
router.get('/api/v1/bills', (req) => getBills(req, env));
router.post('/api/v1/bills', (req) => createBill(req, env));
router.delete('/api/v1/bills/:id', (req) => deleteBill(req, env));
```

### Database Queries
```typescript
// worker/src/db/bills.ts
export async function queryBills(
  db: D1Database,
  userId: string
): Promise<Bill[]> {
  const { results } = await db
    .prepare('SELECT * FROM bills WHERE user_id = ? ORDER BY due_date ASC')
    .bind(userId)
    .all();

  return results as Bill[];
}
```

### Error Responses
```typescript
function json<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

## File Organization

```
src/
├── components/
│   ├── BillCard.tsx          # Single component per file
│   ├── BillList.tsx
│   ├── AuthModal.tsx
│   └── index.ts              # Re-export for cleaner imports
├── hooks/
│   ├── useFetch.ts
│   ├── useAuth.ts
│   └── index.ts
├── utils/
│   ├── format.ts             # formatCurrency, formatDate, etc.
│   ├── api.ts                # API client utilities
│   └── storage.ts            # IndexedDB, localStorage
├── types/
│   ├── index.ts              # Central types export
│   └── api.ts                # API response types
└── services/
    ├── api.ts                # Fetch methods
    └── update.ts             # PWA update logic
```

## Testing

### Unit Test Structure
```typescript
// scripts/test-notifications.mjs
describe('Notifications', () => {
  it('should parse notification payload', () => {
    const payload = { title: 'Bill Due', body: 'Pay $50' };
    const result = parseNotification(payload);
    expect(result).toEqual(payload);
  });
});
```

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
- [ ] Code is formatted: `npm run fmt`
- [ ] No lint errors: `npm run lint`
- [ ] Types are correct: `npm run typecheck`
- [ ] Tests pass: `npm test`
- [ ] Commit message is clear
- [ ] No console.log left behind (use proper logging)
