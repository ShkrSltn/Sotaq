import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { runMigrations } from '@/db/migrations';

export const DATABASE_NAME = 'sotaq.db';
export const DB_LOCK_CHANNEL = 'sotaq-sqlite-lock';

export type InitializedDatabase = {
  db: SQLiteDatabase;
  schemaVersion: number;
};

type GlobalDbCache = {
  __sotaqDbPromise?: Promise<InitializedDatabase> | null;
  __sotaqDbInstance?: SQLiteDatabase | null;
  __sotaqUnloadWired?: boolean;
};

const globalCache = globalThis as unknown as GlobalDbCache;

export function isOpfsLockError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  const name = error instanceof Error ? error.name : '';
  return (
    name === 'NoModificationAllowedError' ||
    /no modification allowed/i.test(msg) ||
    /createSyncAccessHandle/i.test(msg)
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serializeTransactions(db: SQLiteDatabase): void {
  const originalWithTx = db.withTransactionAsync.bind(db);
  let txQueue: Promise<void> = Promise.resolve();

  db.withTransactionAsync = async (task: () => Promise<void>): Promise<void> => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = txQueue;
    txQueue = previous.then(() => gate);
    await previous;
    try {
      await originalWithTx(task);
    } finally {
      release();
    }
  };
}

function wireWebUnloadCleanup() {
  if (
    Platform.OS !== 'web' ||
    typeof window === 'undefined' ||
    globalCache.__sotaqUnloadWired
  ) {
    return;
  }
  globalCache.__sotaqUnloadWired = true;

  const release = () => {
    const db = globalCache.__sotaqDbInstance;
    if (db) {
      globalCache.__sotaqDbInstance = null;
      globalCache.__sotaqDbPromise = null;
      db.closeAsync().catch(() => {});
    }
  };

  window.addEventListener('pagehide', release);
  window.addEventListener('beforeunload', release);
}

async function openAndMigrate(): Promise<InitializedDatabase> {
  // Dynamic import keeps expo-sqlite out of SSR server evaluation on web.
  const SQLite = await import('expo-sqlite');

  let db: SQLiteDatabase | null = null;
  let lastError: unknown = null;

  // Retry briefly on Web if a previous reload worker is still releasing the OPFS handle.
  const maxAttempts = Platform.OS === 'web' ? 4 : 1;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      break;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1 && isOpfsLockError(err)) {
        await delay(260 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }

  if (!db) {
    throw lastError ?? new Error('Не удалось открыть базу данных SQLite.');
  }

  serializeTransactions(db);
  globalCache.__sotaqDbInstance = db;
  wireWebUnloadCleanup();

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
  if (!globalCache.__sotaqDbPromise) {
    globalCache.__sotaqDbPromise = openAndMigrate().catch((error) => {
      globalCache.__sotaqDbPromise = null;
      globalCache.__sotaqDbInstance = null;
      throw error;
    });
  }

  return globalCache.__sotaqDbPromise;
}

export async function closeInitializedDatabase(): Promise<void> {
  const db = globalCache.__sotaqDbInstance;
  globalCache.__sotaqDbInstance = null;
  globalCache.__sotaqDbPromise = null;
  if (db) {
    try {
      await db.closeAsync();
    } catch {
      // Ignore close errors if worker is already closed
    }
  }
}

export function createId(): string {
  return Crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
