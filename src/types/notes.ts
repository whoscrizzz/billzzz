export interface Note {
  id: string;
  user_id: string;
  title: string;
  body: string;
  category: string | null;
  trashed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoteInput {
  /** Id generado por el cliente para que el create sea idempotente — ver
   * createNote en worker/src/notes.ts. */
  id?: string;
  title: string;
  body?: string;
  category?: string | null;
}

export interface Reminder {
  id: string;
  user_id: string;
  title: string;
  due_at: string;
  done: number;
  notified_at: string | null;
  trashed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReminderInput {
  title: string;
  due_at: string;
}
