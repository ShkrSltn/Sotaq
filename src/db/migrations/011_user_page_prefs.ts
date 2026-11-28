import type { Migration } from '@/db/migrations/001_initial';

export const migration011UserPagePrefs: Migration = {
  version: 11,
  name: '011_user_page_prefs',
  async up(db) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS user_page_prefs (
        user_id TEXT NOT NULL,
        feature_key TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        position INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, feature_key)
      );

      CREATE INDEX IF NOT EXISTS idx_user_page_prefs_user
        ON user_page_prefs(user_id, position ASC);
    `);
  },
};
