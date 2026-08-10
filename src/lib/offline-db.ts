import { openDB, deleteDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { MarkPaidInput, Subscription, SubscriptionInput } from '../types/subscription';
import type { Note, NoteInput } from '../types/notes';

export type PendingOpType =
  'create' | 'update' | 'delete' | 'mark-paid' | 'snooze' | 'restore-archived' | 'restore-trashed';

export type PendingOpPayload =
  SubscriptionInput | Partial<SubscriptionInput> | MarkPaidInput | { days: number };

/** Cola separada de la de subscriptions (pendingOps) — mismo shape, entidad
 * distinta. Evita meter un discriminador de entidad en el union existente
 * (y su exhaustiveness-check en sync.ts) solo para un segundo tipo offline. */
export type NotePendingOpType = 'create' | 'update' | 'delete';

export type NotePendingOpPayload = NoteInput | Partial<NoteInput>;

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
  notes: {
    key: string;
    value: Note & { _pending?: boolean };
  };
  notePendingOps: {
    key: number;
    value: {
      id?: number;
      type: NotePendingOpType;
      noteId: string;
      payload?: NotePendingOpPayload;
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
    dbPromise = openDB<BillsDB>(name, 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const store = db.createObjectStore('subscriptions', { keyPath: 'id' });
          store.createIndex('by-due-day', 'due_day');
          db.createObjectStore('pendingOps', {
            keyPath: 'id',
            autoIncrement: true,
          });
        }
        if (oldVersion < 2) {
          db.createObjectStore('notes', { keyPath: 'id' });
          db.createObjectStore('notePendingOps', {
            keyPath: 'id',
            autoIncrement: true,
          });
        }
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

export async function getLocalNotes(): Promise<Note[]> {
  const db = await getDb();
  return db.getAll('notes');
}

export async function putLocalNote(note: Note): Promise<void> {
  const db = await getDb();
  await db.put('notes', note);
}

export async function removeLocalNote(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('notes', id);
}

export async function replaceLocalNotes(notes: Note[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('notes', 'readwrite');
  await tx.store.clear();
  for (const note of notes) {
    await tx.store.put(note);
  }
  await tx.done;
}

/** Merge server list without clobbering rows tied to pending offline ops. */
export async function mergeRemoteNotes(remote: Note[]): Promise<void> {
  const pending = await getNotePendingOps();
  if (pending.length === 0) {
    await replaceLocalNotes(remote);
    return;
  }

  const pendingIds = new Set(pending.map((op) => op.noteId));
  const local = await getLocalNotes();
  const byId = new Map(local.map((n) => [n.id, n]));

  for (const note of remote) {
    if (!pendingIds.has(note.id)) {
      byId.set(note.id, note);
    }
  }

  const remoteIds = new Set(remote.map((n) => n.id));
  for (const id of [...byId.keys()]) {
    if (!remoteIds.has(id) && !pendingIds.has(id)) {
      byId.delete(id);
    }
  }

  await replaceLocalNotes([...byId.values()]);
}

export async function queueNotePendingOp(
  op: Omit<BillsDB['notePendingOps']['value'], 'id' | 'createdAt'>
): Promise<void> {
  const db = await getDb();
  await db.add('notePendingOps', { ...op, createdAt: new Date().toISOString() });
}

export async function getNotePendingOps() {
  const db = await getDb();
  return db.getAll('notePendingOps');
}

export async function clearNotePendingOp(id: number): Promise<void> {
  const db = await getDb();
  await db.delete('notePendingOps', id);
}

export function isOnline(): boolean {
  return navigator.onLine;
}
