import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { runMigrations } from '@/db/migrations';

export const DATABASE_NAME = 'sotaq.db';

export type InitializedDatabase = {
  db: SQLiteDatabase;
  schemaVersion: number;
};

let pendingOpen: Promise<InitializedDatabase> | null = null;

async function openAndMigrate(): Promise<InitializedDatabase> {
  // Dynamic import keeps expo-sqlite out of SSR server evaluation on web.
  const SQLite = await import('expo-sqlite');
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  const schemaVersion = await runMigrations(db);

  const now = nowIso();
  await db.runAsync(
    `INSERT INTO app_meta (key, value, updated_at)
     VALUES ('last_boot_at', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
    now,
    now,
  );

  return { db, schemaVersion };
}

export function getInitializedDatabase(): Promise<InitializedDatabase> {
  if (!pendingOpen) {
    pendingOpen = openAndMigrate().catch((error) => {
      pendingOpen = null;
      throw error;
    });
  }

  return pendingOpen;
}

export function createId(): string {
  return Crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
