import type { SQLiteDatabase } from 'expo-sqlite';

import { createId, nowIso } from '@/db/client';
import type {
  FocusLinkTarget,
  FocusMode,
  FocusSessionRecord,
  FocusStats,
} from '@/features/focus/types';
import { addDaysDateKey, toDateKey } from '@/features/kanban/types';

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

export async function getFocusStats(db: SQLiteDatabase, userId: string): Promise<FocusStats> {
  const rows = await db.getAllAsync<SessionRow>(
    `SELECT * FROM focus_sessions
     WHERE user_id = ? AND mode = 'focus'
     ORDER BY ended_at DESC
     LIMIT 120;`,
    userId,
  );

  const todayKey = toDateKey(new Date());
  const weekStartKey = addDaysDateKey(-6);

  let todaySeconds = 0;
  let todaySessions = 0;
  let weekSeconds = 0;
  let weekSessions = 0;

  const mapped = rows.map(mapSession);
  for (const session of mapped) {
    const dateKey = session.endedAt.slice(0, 10);
    if (dateKey === todayKey) {
      todaySeconds += session.elapsedSeconds;
      if (session.completed || session.elapsedSeconds >= 60) {
        todaySessions += 1;
      }
    }
    if (dateKey >= weekStartKey) {
      weekSeconds += session.elapsedSeconds;
      if (session.completed || session.elapsedSeconds >= 60) {
        weekSessions += 1;
      }
    }
  }

  return {
    todayMinutes: Math.round(todaySeconds / 60),
    todaySessions,
    weekMinutes: Math.round(weekSeconds / 60),
    weekSessions,
    recentSessions: mapped.slice(0, 10),
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
