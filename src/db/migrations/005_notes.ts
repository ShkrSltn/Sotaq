import type { Migration } from '@/db/migrations/001_initial';

export const migration005Notes: Migration = {
  version: 5,
  name: '005_notes',
  async up(db) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS note_pages (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        parent_id TEXT REFERENCES note_pages(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT '',
        icon TEXT NOT NULL DEFAULT '📄',
        is_favorite INTEGER NOT NULL DEFAULT 0,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_note_pages_user_parent
        ON note_pages(user_id, parent_id, position);

      CREATE TABLE IF NOT EXISTS note_blocks (
        id TEXT PRIMARY KEY NOT NULL,
        page_id TEXT NOT NULL REFERENCES note_pages(id) ON DELETE CASCADE,
        type TEXT NOT NULL DEFAULT 'paragraph',
        content TEXT NOT NULL DEFAULT '',
        checked INTEGER NOT NULL DEFAULT 0,
        collapsed INTEGER NOT NULL DEFAULT 0,
        toggle_body TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_note_blocks_page
        ON note_blocks(page_id, position);
    `);
  },
};
