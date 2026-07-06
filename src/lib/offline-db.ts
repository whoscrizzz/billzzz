import { openDB, deleteDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { MarkPaidInput, Subscription, SubscriptionInput } from '../types/subscription';

export type PendingOpType =
  | 'create'
  | 'update'
  | 'delete'
  | 'mark-paid'
  | 'snooze'
  | 'restore-archived';

export type PendingOpPayload =
  | SubscriptionInput
  | Partial<SubscriptionInput>
  | MarkPaidInput
  | { days: number };

interface BillsDB extends DBSchema {
  subscriptions: {
    key: string;
    value: Subscription & { _pending?: boolean };
    indexes: { 'by-due-day': number };
  };
  pendingOps: {
    key: number;
    value: {
      id?: number;
      type: PendingOpType;
      subscriptionId: string;
      payload?: PendingOpPayload;
      createdAt: string;
    };
  };
}

let boundUserId: string | null = null;
let dbPromise: Promise<IDBPDatabase<BillsDB>> | null = null;

function dbName(): string {
  return boundUserId ? `bills-pwa-u-${boundUserId}` : 'bills-pwa-guest';
}

/** Call on login/logout so IndexedDB is isolated per account. */
export function bindOfflineDbUser(userId: string | null): void {
  if (boundUserId === userId) return;
  boundUserId = userId;
  dbPromise = null;
}

export async function wipeOfflineDb(): Promise<void> {
  const name = dbName();
  dbPromise = null;
  boundUserId = null;
  try {
    await deleteDB(name);
  } catch {
    /* already gone */
  }
  try {
    await deleteDB('bills-pwa-guest');
  } catch {
    /* already gone */
  }
}

function getDb() {
  if (!dbPromise) {
    const name = dbName();
    dbPromise = openDB<BillsDB>(name, 1, {
      upgrade(db) {
        const store = db.createObjectStore('subscriptions', { keyPath: 'id' });
        store.createIndex('by-due-day', 'due_day');
        db.createObjectStore('pendingOps', {
          keyPath: 'id',
          autoIncrement: true,
        });
      },
    });
  }
  return dbPromise;
}

export async function getLocalSubscriptions(): Promise<Subscription[]> {
  const db = await getDb();
  return db.getAll('subscriptions');
}

export async function putLocalSubscription(sub: Subscription): Promise<void> {
  const db = await getDb();
  await db.put('subscriptions', sub);
}

export async function removeLocalSubscription(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('subscriptions', id);
}

export async function replaceLocalSubscriptions(subs: Subscription[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('subscriptions', 'readwrite');
  await tx.store.clear();
  for (const sub of subs) {
    await tx.store.put(sub);
  }
  await tx.done;
}

/** Merge server list without clobbering rows tied to pending offline ops. */
export async function mergeRemoteSubscriptions(remote: Subscription[]): Promise<void> {
  const pending = await getPendingOps();
  if (pending.length === 0) {
    await replaceLocalSubscriptions(remote);
    return;
  }

  const pendingIds = new Set(pending.map((op) => op.subscriptionId));
  const local = await getLocalSubscriptions();
  const byId = new Map(local.map((s) => [s.id, s]));

  for (const sub of remote) {
    if (!pendingIds.has(sub.id)) {
      byId.set(sub.id, sub);
    }
  }

  const remoteIds = new Set(remote.map((s) => s.id));
  for (const id of [...byId.keys()]) {
    if (!remoteIds.has(id) && !pendingIds.has(id)) {
      byId.delete(id);
    }
  }

  await replaceLocalSubscriptions([...byId.values()]);
}

export async function queuePendingOp(
  op: Omit<BillsDB['pendingOps']['value'], 'id' | 'createdAt'>
): Promise<void> {
  const db = await getDb();
  await db.add('pendingOps', { ...op, createdAt: new Date().toISOString() });
}

export async function getPendingOps() {
  const db = await getDb();
  return db.getAll('pendingOps');
}

export async function clearPendingOp(id: number): Promise<void> {
  const db = await getDb();
  await db.delete('pendingOps', id);
}

export function isOnline(): boolean {
  return navigator.onLine;
}
