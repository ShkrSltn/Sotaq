import type { SQLiteDatabase } from 'expo-sqlite';

import { createId, nowIso } from '@/db/client';
import { computeFocusAnalytics } from '@/features/focus/focus-analytics';
import {
  DEFAULT_FOCUS_SETTINGS,
  type FocusAnalytics,
  type FocusLinkTarget,
  type FocusMode,
  type FocusSessionRecord,
  type FocusSettings,
  type FocusStats,
} from '@/features/focus/types';

type SessionRow = {
  id: string;
  user_id: string;
  mode: string;
  duration_seconds: number;
  elapsed_seconds: number;
  completed: number;
  linked_type: string | null;
  linked_id: string | null;
  linked_title: string;
  started_at: string;
  ended_at: string;
};

type SettingsRow = {
  user_id: string;
  focus_minutes: number;
  short_break_minutes: number;
  long_break_minutes: number;
  daily_goal_minutes: number;
  sound_enabled: number;
  auto_start_breaks: number;
  updated_at: string;
};

function normalizeMode(raw: string): FocusMode {
  if (raw === 'short_break' || raw === 'long_break') {
    return raw;
  }
  return 'focus';
}

function mapSession(row: SessionRow): FocusSessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    mode: normalizeMode(row.mode),
    durationSeconds: row.duration_seconds,
    elapsedSeconds: row.elapsed_seconds,
    completed: row.completed === 1,
    linkedType:
      row.linked_type === 'todo' || row.linked_type === 'kanban_card' ? row.linked_type : null,
    linkedId: row.linked_id,
    linkedTitle: row.linked_title,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

export async function getFocusSettings(
  db: SQLiteDatabase,
  userId: string,
): Promise<FocusSettings> {
  const row = await db.getFirstAsync<SettingsRow>(
    `SELECT * FROM focus_settings WHERE user_id = ? LIMIT 1;`,
    userId,
  );
  if (!row) {
    return { ...DEFAULT_FOCUS_SETTINGS };
  }
  return {
    focusMinutes: Math.max(5, Math.min(120, row.focus_minutes)),
    shortBreakMinutes: Math.max(1, Math.min(30, row.short_break_minutes)),
    longBreakMinutes: Math.max(5, Math.min(60, row.long_break_minutes)),
    dailyGoalMinutes: Math.max(15, Math.min(600, row.daily_goal_minutes)),
    soundEnabled: row.sound_enabled === 1,
    autoStartBreaks: row.auto_start_breaks === 1,
  };
}

export async function upsertFocusSettings(
  db: SQLiteDatabase,
  userId: string,
  next: FocusSettings,
): Promise<FocusSettings> {
  const clean: FocusSettings = {
    focusMinutes: Math.max(5, Math.min(120, Math.round(next.focusMinutes))),
    shortBreakMinutes: Math.max(1, Math.min(30, Math.round(next.shortBreakMinutes))),
    longBreakMinutes: Math.max(5, Math.min(60, Math.round(next.longBreakMinutes))),
    dailyGoalMinutes: Math.max(15, Math.min(600, Math.round(next.dailyGoalMinutes))),
    soundEnabled: Boolean(next.soundEnabled),
    autoStartBreaks: Boolean(next.autoStartBreaks),
  };

  await db.runAsync(
    `INSERT INTO focus_settings
       (user_id, focus_minutes, short_break_minutes, long_break_minutes, daily_goal_minutes, sound_enabled, auto_start_breaks, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       focus_minutes = excluded.focus_minutes,
       short_break_minutes = excluded.short_break_minutes,
       long_break_minutes = excluded.long_break_minutes,
       daily_goal_minutes = excluded.daily_goal_minutes,
       sound_enabled = excluded.sound_enabled,
       auto_start_breaks = excluded.auto_start_breaks,
       updated_at = excluded.updated_at;`,
    userId,
    clean.focusMinutes,
    clean.shortBreakMinutes,
    clean.longBreakMinutes,
    clean.dailyGoalMinutes,
    clean.soundEnabled ? 1 : 0,
    clean.autoStartBreaks ? 1 : 0,
    nowIso(),
  );

  return clean;
}

export async function saveFocusSession(
  db: SQLiteDatabase,
  userId: string,
  input: {
    mode: FocusMode;
    durationSeconds: number;
    elapsedSeconds: number;
    completed: boolean;
    linkedTarget: FocusLinkTarget | null;
    startedAt: string;
  },
): Promise<void> {
  const endedAt = nowIso();
  await db.runAsync(
    `INSERT INTO focus_sessions
       (id, user_id, mode, duration_seconds, elapsed_seconds, completed, linked_type, linked_id, linked_title, started_at, ended_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    createId(),
    userId,
    input.mode,
    input.durationSeconds,
    input.elapsedSeconds,
    input.completed ? 1 : 0,
    input.linkedTarget?.type ?? null,
    input.linkedTarget?.id ?? null,
    input.linkedTarget?.title ?? '',
    input.startedAt,
    endedAt,
  );
}

export async function deleteFocusSession(
  db: SQLiteDatabase,
  userId: string,
  sessionId: string,
): Promise<void> {
  await db.runAsync(
    `DELETE FROM focus_sessions WHERE id = ? AND user_id = ?;`,
    sessionId,
    userId,
  );
}

export async function getFocusAnalytics(
  db: SQLiteDatabase,
  userId: string,
  dailyGoalMinutes: number,
): Promise<FocusAnalytics> {
  const rows = await db.getAllAsync<SessionRow>(
    `SELECT * FROM focus_sessions
     WHERE user_id = ? AND mode = 'focus'
     ORDER BY ended_at DESC
     LIMIT 500;`,
    userId,
  );

  return computeFocusAnalytics(rows.map(mapSession), dailyGoalMinutes);
}

export function deriveFocusStats(analytics: FocusAnalytics): FocusStats {
  return {
    todayMinutes: analytics.todayCompletedMinutes,
    todaySessions: analytics.todayCompletedSessions,
    todayAbandoned: analytics.todayAbandonedSessions,
    weekMinutes: analytics.weekCompletedMinutes,
    weekSessions: analytics.weekCompletedSessions,
    recentSessions: analytics.recentSessions.slice(0, 10),
  };
}

export async function listLinkableFocusTargets(
  db: SQLiteDatabase,
  userId: string,
): Promise<FocusLinkTarget[]> {
  const [todoRows, cardRows] = await Promise.all([
    db.getAllAsync<{ id: string; title: string; list_title: string | null }>(
      `SELECT t.id, t.title, l.title AS list_title
       FROM todos t
       LEFT JOIN todo_lists l ON l.id = t.list_id
       WHERE t.user_id = ? AND t.is_done = 0
       ORDER BY t.position ASC, t.created_at DESC
       LIMIT 60;`,
      userId,
    ),
    db.getAllAsync<{ id: string; title: string; col_title: string; board_title: string }>(
      `SELECT c.id, c.title, col.title AS col_title, b.title AS board_title
       FROM kanban_cards c
       INNER JOIN kanban_columns col ON col.id = c.column_id
       INNER JOIN kanban_boards b ON b.id = c.board_id
       WHERE b.user_id = ? AND col.is_done_column = 0
       ORDER BY c.updated_at DESC
       LIMIT 60;`,
      userId,
    ),
  ]);

  const targets: FocusLinkTarget[] = [];
  for (const row of todoRows) {
    targets.push({
      type: 'todo',
      id: row.id,
      title: row.title,
      subtitle: row.list_title ? `Задача · ${row.list_title}` : 'Задача',
    });
  }
  for (const row of cardRows) {
    targets.push({
      type: 'kanban_card',
      id: row.id,
      title: row.title,
      subtitle: `Доска · ${row.board_title} / ${row.col_title}`,
    });
  }
  return targets;
}
