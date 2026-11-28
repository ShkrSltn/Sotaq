import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { migration001Initial, type Migration } from '@/db/migrations/001_initial';
import { migration002Kanban } from '@/db/migrations/002_kanban';
import { migration003Todos } from '@/db/migrations/003_todos';
import { migration004AuthRbac } from '@/db/migrations/004_auth_rbac';
import { migration005Notes } from '@/db/migrations/005_notes';
import { migration006LanguageLab } from '@/db/migrations/006_language_lab';
import { migration007NotesNotionV2 } from '@/db/migrations/007_notes_notion_v2';

export const MIGRATIONS: readonly Migration[] = [
  migration001Initial,
  migration002Kanban,
  migration003Todos,
  migration004AuthRbac,
  migration005Notes,
  migration006LanguageLab,
  migration007NotesNotionV2,
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;

export async function runMigrations(db: SQLiteDatabase): Promise<number> {
  await db.execAsync('PRAGMA foreign_keys = ON;');

  if (Platform.OS !== 'web') {
    await db.execAsync('PRAGMA journal_mode = WAL;');
  }

  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  let currentVersion = versionRow?.user_version ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) {
      continue;
    }

    await db.withTransactionAsync(async () => {
      await migration.up(db);
      await db.execAsync(`PRAGMA user_version = ${migration.version};`);
    });

    currentVersion = migration.version;
  }

  return currentVersion;
}
