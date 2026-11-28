import type { Migration } from '@/db/migrations/001_initial';

export const migration009ProductivitySuite: Migration = {
  version: 9,
  name: '009_productivity_suite',
  async up(db) {
    await db.execAsync(`
      ALTER TABLE vocab_words ADD COLUMN next_review_at TEXT;
      ALTER TABLE vocab_words ADD COLUMN interval_days REAL NOT NULL DEFAULT 0;
      ALTER TABLE vocab_words ADD COLUMN ease_factor REAL NOT NULL DEFAULT 2.5;
      ALTER TABLE vocab_words ADD COLUMN last_reviewed_at TEXT;

      CREATE TABLE IF NOT EXISTS focus_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'focus',
        duration_seconds INTEGER NOT NULL,
        elapsed_seconds INTEGER NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0,
        linked_type TEXT,
        linked_id TEXT,
        linked_title TEXT NOT NULL DEFAULT '',
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_focus_sessions_user_date
        ON focus_sessions(user_id, ended_at DESC);

      CREATE TABLE IF NOT EXISTS habits (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#3B82F6',
        icon TEXT NOT NULL DEFAULT 'checkCircle',
        target_per_week INTEGER NOT NULL DEFAULT 7,
        position INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_habits_user_pos
        ON habits(user_id, archived, position ASC);

      CREATE TABLE IF NOT EXISTS habit_logs (
        id TEXT PRIMARY KEY NOT NULL,
        habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        date_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(habit_id, date_key)
      );

      CREATE INDEX IF NOT EXISTS idx_habit_logs_user_date
        ON habit_logs(user_id, date_key);
    `);
  },
};
