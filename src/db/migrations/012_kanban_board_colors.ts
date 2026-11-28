import type { Migration } from '@/db/migrations/001_initial';

export const migration012KanbanBoardColors: Migration = {
  version: 12,
  name: '012_kanban_board_colors',
  async up(db) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS kanban_board_colors (
        id TEXT PRIMARY KEY NOT NULL,
        board_id TEXT NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
        name TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_kanban_board_colors_board
        ON kanban_board_colors(board_id, position);

      ALTER TABLE kanban_cards
        ADD COLUMN color_id TEXT REFERENCES kanban_board_colors(id) ON DELETE SET NULL;
    `);
  },
};
