import type { Migration } from '@/db/migrations/001_initial';

export const migration004AuthRbac: Migration = {
  version: 4,
  name: '004_auth_rbac',
  async up(db) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY NOT NULL,
        username TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_users_username
        ON users(username);

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        is_current INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        last_active_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_current
        ON sessions(is_current);

      CREATE TABLE IF NOT EXISTS role_features (
        role TEXT NOT NULL,
        feature_key TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (role, feature_key)
      );

      CREATE TABLE IF NOT EXISTS user_feature_overrides (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        feature_key TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        PRIMARY KEY (user_id, feature_key)
      );
    `);
  },
};
