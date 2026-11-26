import type { SQLiteDatabase } from 'expo-sqlite';

export type Migration = {
  version: number;
  name: string;
  up: (db: SQLiteDatabase) => Promise<void>;
};

export const migration001Initial: Migration = {
  version: 1,
  name: '001_initial',
  async up(db) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  },
};
