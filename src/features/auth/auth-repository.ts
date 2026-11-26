import type { SQLiteDatabase } from 'expo-sqlite';

import { createId, nowIso } from '@/db/client';
import { generateSalt, hashPassword, verifyPassword } from '@/features/auth/password';
import {
  CONTROLLABLE_FEATURE_KEYS,
  type ControllableFeatureKey,
  type FeatureAccessMap,
  type RoleFeatureMatrix,
  type UserFeatureOverridesMap,
  type UserRecord,
  type UserRole,
} from '@/features/auth/types';
import { FEATURES } from '@/features/registry';

type UserRow = {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  password_salt: string;
  role: string;
  is_active: number;
  created_at: string;
  updated_at: string;
};

function normalizeRole(value: string): UserRole {
  return value === 'admin' ? 'admin' : 'user';
}

function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: normalizeRole(row.role),
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function validateUsername(raw: string): string | null {
  const normalized = normalizeUsername(raw);
  if (normalized.length < 3) {
    return 'Логин должен быть не короче 3 символов';
  }
  if (!/^[a-z0-9._-]+$/.test(normalized)) {
    return 'Логин может содержать только латиницу, цифры и . _ -';
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < 4) {
    return 'Пароль должен быть не короче 4 символов';
  }
  return null;
}

export async function ensureRoleFeatureDefaults(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const key of CONTROLLABLE_FEATURE_KEYS) {
      const def = FEATURES.find((item) => item.key === key);
      const userDefault = def?.defaultUserEnabled ? 1 : 0;

      await db.runAsync(
        `INSERT OR IGNORE INTO role_features (role, feature_key, enabled)
         VALUES ('admin', ?, 1), ('user', ?, ?);`,
        key,
        key,
        userDefault,
      );
    }
  });
}

export async function getUserCount(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM users;');
  return row?.count ?? 0;
}

async function openSessionForUser(db: SQLiteDatabase, userId: string): Promise<void> {
  const now = nowIso();
  const sessionId = createId();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE sessions SET is_current = 0 WHERE is_current = 1;');
    await db.runAsync(
      `INSERT INTO sessions (id, user_id, is_current, created_at, last_active_at)
       VALUES (?, ?, 1, ?, ?);`,
      sessionId,
      userId,
      now,
      now,
    );
  });
}

export async function createFirstAdmin(
  db: SQLiteDatabase,
  input: { username: string; displayName: string; password: string },
): Promise<UserRecord> {
  const existingCount = await getUserCount(db);
  if (existingCount > 0) {
    throw new Error('Администратор уже создан');
  }

  const usernameError = validateUsername(input.username);
  if (usernameError) {
    throw new Error(usernameError);
  }
  const passwordError = validatePassword(input.password);
  if (passwordError) {
    throw new Error(passwordError);
  }

  const username = normalizeUsername(input.username);
  const displayName = input.displayName.trim() || username;
  const salt = await generateSalt();
  const hash = await hashPassword(input.password, salt);
  const now = nowIso();
  const userId = createId();

  await ensureRoleFeatureDefaults(db);

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO users
         (id, username, display_name, password_hash, password_salt, role, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'admin', 1, ?, ?);`,
      userId,
      username,
      displayName,
      hash,
      salt,
      now,
      now,
    );

    // Claim any pre-auth local workspace data created in earlier stages.
    await db.runAsync('UPDATE kanban_boards SET user_id = ? WHERE user_id IS NULL;', userId);
    await db.runAsync('UPDATE todo_lists SET user_id = ? WHERE user_id IS NULL;', userId);
    await db.runAsync('UPDATE todos SET user_id = ? WHERE user_id IS NULL;', userId);
  });

  await openSessionForUser(db, userId);

  return {
    id: userId,
    username,
    displayName,
    role: 'admin',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

export async function authenticateUser(
  db: SQLiteDatabase,
  usernameInput: string,
  password: string,
): Promise<UserRecord> {
  const username = normalizeUsername(usernameInput);
  if (!username || !password) {
    throw new Error('Введите логин и пароль');
  }

  const row = await db.getFirstAsync<UserRow>(
    'SELECT * FROM users WHERE username = ?;',
    username,
  );
  if (!row) {
    throw new Error('Неверный логин или пароль');
  }

  const valid = await verifyPassword(password, row.password_salt, row.password_hash);
  if (!valid) {
    throw new Error('Неверный логин или пароль');
  }

  if (row.is_active !== 1) {
    throw new Error('Аккаунт отключён администратором');
  }

  await openSessionForUser(db, row.id);
  return mapUser(row);
}

export async function getCurrentSessionUser(db: SQLiteDatabase): Promise<UserRecord | null> {
  const row = await db.getFirstAsync<UserRow>(
    `SELECT u.*
     FROM sessions s
     INNER JOIN users u ON u.id = s.user_id
     WHERE s.is_current = 1 AND u.is_active = 1
     ORDER BY s.last_active_at DESC
     LIMIT 1;`,
  );

  if (!row) {
    return null;
  }

  await db.runAsync(
    'UPDATE sessions SET last_active_at = ? WHERE user_id = ? AND is_current = 1;',
    nowIso(),
    row.id,
  );

  return mapUser(row);
}

export async function logoutCurrentSession(db: SQLiteDatabase): Promise<void> {
  await db.runAsync('UPDATE sessions SET is_current = 0 WHERE is_current = 1;');
}

export async function getRoleFeatureMatrix(db: SQLiteDatabase): Promise<RoleFeatureMatrix> {
  await ensureRoleFeatureDefaults(db);

  const rows = await db.getAllAsync<{
    role: string;
    feature_key: string;
    enabled: number;
  }>('SELECT role, feature_key, enabled FROM role_features;');

  const matrix: RoleFeatureMatrix = {
    admin: { kanban: true, todos: true, notes: true, language: true },
    user: { kanban: true, todos: true, notes: true, language: true },
  };

  for (const row of rows) {
    const role = normalizeRole(row.role);
    const key = row.feature_key as ControllableFeatureKey;
    if (CONTROLLABLE_FEATURE_KEYS.includes(key)) {
      matrix[role][key] = row.enabled === 1;
    }
  }

  return matrix;
}

export async function setRoleFeatureEnabled(
  db: SQLiteDatabase,
  role: UserRole,
  featureKey: ControllableFeatureKey,
  enabled: boolean,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO role_features (role, feature_key, enabled)
     VALUES (?, ?, ?)
     ON CONFLICT(role, feature_key) DO UPDATE SET enabled = excluded.enabled;`,
    role,
    featureKey,
    enabled ? 1 : 0,
  );
}

export async function getUserFeatureOverrides(
  db: SQLiteDatabase,
  userId: string,
): Promise<UserFeatureOverridesMap> {
  const rows = await db.getAllAsync<{ feature_key: string; enabled: number }>(
    'SELECT feature_key, enabled FROM user_feature_overrides WHERE user_id = ?;',
    userId,
  );

  const map: UserFeatureOverridesMap = {};
  for (const row of rows) {
    const key = row.feature_key as ControllableFeatureKey;
    if (CONTROLLABLE_FEATURE_KEYS.includes(key)) {
      map[key] = row.enabled === 1;
    }
  }
  return map;
}

export async function setUserFeatureOverride(
  db: SQLiteDatabase,
  userId: string,
  featureKey: ControllableFeatureKey,
  value: boolean | null,
): Promise<void> {
  if (value === null) {
    await db.runAsync(
      'DELETE FROM user_feature_overrides WHERE user_id = ? AND feature_key = ?;',
      userId,
      featureKey,
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO user_feature_overrides (user_id, feature_key, enabled)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id, feature_key) DO UPDATE SET enabled = excluded.enabled;`,
    userId,
    featureKey,
    value ? 1 : 0,
  );
}

export async function computeEffectiveFeatures(
  db: SQLiteDatabase,
  user: UserRecord,
): Promise<FeatureAccessMap> {
  const [matrix, overrides] = await Promise.all([
    getRoleFeatureMatrix(db),
    getUserFeatureOverrides(db, user.id),
  ]);

  const roleFeatures = matrix[user.role];

  return {
    home: true,
    admin: user.role === 'admin',
    kanban: overrides.kanban ?? roleFeatures.kanban,
    todos: overrides.todos ?? roleFeatures.todos,
    notes: overrides.notes ?? roleFeatures.notes,
    language: overrides.language ?? roleFeatures.language,
  };
}

export async function listUsers(db: SQLiteDatabase): Promise<UserRecord[]> {
  const rows = await db.getAllAsync<UserRow>(
    'SELECT * FROM users ORDER BY CASE WHEN role = \'admin\' THEN 0 ELSE 1 END, created_at ASC;',
  );
  return rows.map(mapUser);
}

async function countActiveAdmins(db: SQLiteDatabase, excludeUserId?: string): Promise<number> {
  const row = excludeUserId
    ? await db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?;",
        excludeUserId,
      )
    : await db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active = 1;",
      );
  return row?.count ?? 0;
}

export async function createUserByAdmin(
  db: SQLiteDatabase,
  input: {
    username: string;
    displayName: string;
    password: string;
    role: UserRole;
  },
): Promise<UserRecord> {
  const usernameError = validateUsername(input.username);
  if (usernameError) {
    throw new Error(usernameError);
  }
  const passwordError = validatePassword(input.password);
  if (passwordError) {
    throw new Error(passwordError);
  }

  const username = normalizeUsername(input.username);
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM users WHERE username = ?;',
    username,
  );
  if (existing) {
    throw new Error('Пользователь с таким логином уже существует');
  }

  const displayName = input.displayName.trim() || username;
  const salt = await generateSalt();
  const hash = await hashPassword(input.password, salt);
  const now = nowIso();
  const id = createId();

  await db.runAsync(
    `INSERT INTO users
       (id, username, display_name, password_hash, password_salt, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?);`,
    id,
    username,
    displayName,
    hash,
    salt,
    input.role,
    now,
    now,
  );

  return {
    id,
    username,
    displayName,
    role: input.role,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateUserByAdmin(
  db: SQLiteDatabase,
  userId: string,
  patch: {
    displayName?: string;
    role?: UserRole;
    isActive?: boolean;
    newPassword?: string;
  },
): Promise<void> {
  const existing = await db.getFirstAsync<UserRow>('SELECT * FROM users WHERE id = ?;', userId);
  if (!existing) {
    throw new Error('Пользователь не найден');
  }

  const nextRole = patch.role ?? normalizeRole(existing.role);
  const nextActive = patch.isActive !== undefined ? patch.isActive : existing.is_active === 1;

  // Prevent locking out the last active admin.
  if (existing.role === 'admin' && (nextRole !== 'admin' || !nextActive)) {
    const otherAdmins = await countActiveAdmins(db, userId);
    if (otherAdmins === 0) {
      throw new Error('Нельзя понизить или отключить последнего активного администратора');
    }
  }

  let nextHash = existing.password_hash;
  let nextSalt = existing.password_salt;
  if (patch.newPassword && patch.newPassword.length > 0) {
    const passwordError = validatePassword(patch.newPassword);
    if (passwordError) {
      throw new Error(passwordError);
    }
    nextSalt = await generateSalt();
    nextHash = await hashPassword(patch.newPassword, nextSalt);
  }

  const nextDisplayName =
    patch.displayName !== undefined
      ? patch.displayName.trim() || existing.username
      : existing.display_name;

  await db.runAsync(
    `UPDATE users
     SET display_name = ?, role = ?, is_active = ?, password_hash = ?, password_salt = ?, updated_at = ?
     WHERE id = ?;`,
    nextDisplayName,
    nextRole,
    nextActive ? 1 : 0,
    nextHash,
    nextSalt,
    nowIso(),
    userId,
  );

  if (!nextActive) {
    await db.runAsync('UPDATE sessions SET is_current = 0 WHERE user_id = ?;', userId);
  }
}

export async function deleteUserByAdmin(
  db: SQLiteDatabase,
  targetUserId: string,
  actingAdminId: string,
): Promise<void> {
  if (targetUserId === actingAdminId) {
    throw new Error('Нельзя удалить собственный аккаунт');
  }

  const target = await db.getFirstAsync<UserRow>('SELECT * FROM users WHERE id = ?;', targetUserId);
  if (!target) {
    return;
  }

  if (target.role === 'admin') {
    const otherAdmins = await countActiveAdmins(db, targetUserId);
    if (otherAdmins === 0) {
      throw new Error('Нельзя удалить последнего администратора');
    }
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM kanban_boards WHERE user_id = ?;', targetUserId);
    await db.runAsync('DELETE FROM todos WHERE user_id = ?;', targetUserId);
    await db.runAsync('DELETE FROM todo_lists WHERE user_id = ?;', targetUserId);
    await db.runAsync('DELETE FROM note_pages WHERE user_id = ?;', targetUserId);
    await db.runAsync('DELETE FROM users WHERE id = ?;', targetUserId);
  });
}
