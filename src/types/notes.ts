export interface Note {
  id: string;
  user_id: string;
  title: string;
  body: string;
  category: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoteInput {
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
  created_at: string;
  updated_at: string;
}

export interface ReminderInput {
  title: string;
  due_at: string;
}
