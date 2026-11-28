import type { Migration } from '@/db/migrations/001_initial';

export const migration010FocusPro: Migration = {
  version: 10,
  name: '010_focus_pro',
  async up(db) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS focus_settings (
        user_id TEXT PRIMARY KEY NOT NULL,
        focus_minutes INTEGER NOT NULL DEFAULT 25,
        short_break_minutes INTEGER NOT NULL DEFAULT 5,
        long_break_minutes INTEGER NOT NULL DEFAULT 15,
        daily_goal_minutes INTEGER NOT NULL DEFAULT 100,
        sound_enabled INTEGER NOT NULL DEFAULT 1,
        auto_start_breaks INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_focus_sessions_user_mode_date
        ON focus_sessions(user_id, mode, ended_at DESC);
    `);
  },
};
