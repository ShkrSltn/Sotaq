import type { Migration } from '@/db/migrations/001_initial';

export const migration003Todos: Migration = {
  version: 3,
  name: '003_todos',
  async up(db) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS todo_lists (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT,
        title TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS todos (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT,
        list_id TEXT REFERENCES todo_lists(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        is_done INTEGER NOT NULL DEFAULT 0,
        priority TEXT NOT NULL DEFAULT 'medium',
        due_date TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        linked_card_id TEXT REFERENCES kanban_cards(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_todos_list
        ON todos(list_id, is_done, position);

      CREATE INDEX IF NOT EXISTS idx_todos_due_date
        ON todos(due_date);

      CREATE INDEX IF NOT EXISTS idx_todos_linked_card
        ON todos(linked_card_id);
    `);
  },
};
