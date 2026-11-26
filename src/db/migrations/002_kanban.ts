import type { Migration } from '@/db/migrations/001_initial';

export const migration002Kanban: Migration = {
  version: 2,
  name: '002_kanban',
  async up(db) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS kanban_boards (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT,
        title TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS kanban_columns (
        id TEXT PRIMARY KEY NOT NULL,
        board_id TEXT NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        accent TEXT NOT NULL DEFAULT '#6B7280',
        position INTEGER NOT NULL DEFAULT 0,
        is_done_column INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_kanban_columns_board
        ON kanban_columns(board_id, position);

      CREATE TABLE IF NOT EXISTS kanban_cards (
        id TEXT PRIMARY KEY NOT NULL,
        board_id TEXT NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
        column_id TEXT NOT NULL REFERENCES kanban_columns(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT 'medium',
        due_date TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_kanban_cards_column
        ON kanban_cards(column_id, position);

      CREATE INDEX IF NOT EXISTS idx_kanban_cards_board
        ON kanban_cards(board_id);

      CREATE TABLE IF NOT EXISTS kanban_card_subtasks (
        id TEXT PRIMARY KEY NOT NULL,
        card_id TEXT NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        is_done INTEGER NOT NULL DEFAULT 0,
        position INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_kanban_subtasks_card
        ON kanban_card_subtasks(card_id, position);
    `);
  },
};
