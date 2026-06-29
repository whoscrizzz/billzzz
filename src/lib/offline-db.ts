import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Subscription, SubscriptionInput } from '../types/subscription';

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
      type: 'create' | 'update' | 'delete';
      subscriptionId: string;
      payload?: SubscriptionInput | Partial<SubscriptionInput>;
      createdAt: string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<BillsDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<BillsDB>('bills-pwa', 1, {
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
