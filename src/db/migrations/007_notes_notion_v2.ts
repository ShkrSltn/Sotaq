import type { Migration } from '@/db/migrations/001_initial';

export const migration007NotesNotionV2: Migration = {
  version: 7,
  name: '007_notes_notion_v2',
  async up(db) {
    await db.execAsync(`
      ALTER TABLE note_pages ADD COLUMN cover_color TEXT;
      ALTER TABLE note_pages ADD COLUMN full_width INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE note_blocks ADD COLUMN indent_level INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE note_blocks ADD COLUMN block_color TEXT;
      ALTER TABLE note_blocks ADD COLUMN linked_page_id TEXT REFERENCES note_pages(id) ON DELETE CASCADE;
    `);
  },
};
