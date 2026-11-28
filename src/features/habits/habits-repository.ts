import type { SQLiteDatabase } from 'expo-sqlite';

import type { IconName } from '@/components/app-icon';
import { createId, nowIso } from '@/db/client';
import type {
  HabitLogEntry,
  HabitRecord,
  HabitsSnapshot,
  HabitWithStats,
  HabitYearStats,
} from '@/features/habits/types';
import { daysInMonth, toDateKey } from '@/utils/date-key';

type HabitRow = {
  id: string;
  user_id: string;
  title: string;
  color: string;
  icon: string;
  target_per_week: number;
  position: number;
  archived: number;
  created_at: string;
  updated_at: string;
};

type HabitLogRow = {
  id: string;
  habit_id: string;
  user_id: string;
  date_key: string;
  created_at: string;
};

function mapHabit(row: HabitRow): HabitRecord {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    color: row.color || '#3B82F6',
    icon: (row.icon as IconName) || 'checkCircle',
    targetPerWeek: row.target_per_week || 7,
    position: row.position ?? 0,
    archived: row.archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function shiftDateKey(base: Date, deltaDays: number): string {
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + deltaDays);
  return toDateKey(next);
}

export function computeHabitStreaks(
  completedDates: Set<string>,
  today: Date = new Date(),
): { currentStreak: number; bestStreak: number } {
  const todayKey = toDateKey(today);
  const yesterdayKey = shiftDateKey(today, -1);

  let currentStreak = 0;
  let cursorOffset = completedDates.has(todayKey)
    ? 0
    : completedDates.has(yesterdayKey)
      ? -1
      : null;

  if (cursorOffset !== null) {
    while (completedDates.has(shiftDateKey(today, cursorOffset))) {
      currentStreak += 1;
      cursorOffset -= 1;
    }
  }

  // Compute best streak across all logged dates
  const sorted = Array.from(completedDates).sort();
  let bestStreak = 0;
  let run = 0;
  let prevTime: number | null = null;

  for (const key of sorted) {
    const parts = key.split('-').map(Number);
    if (parts.length !== 3) {
      continue;
    }
    const utcMs = Date.UTC(parts[0], parts[1] - 1, parts[2]);
    if (prevTime !== null && utcMs - prevTime === 86400000) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > bestStreak) {
      bestStreak = run;
    }
    prevTime = utcMs;
  }

  return { currentStreak, bestStreak };
}

export function computeYearStats(
  habits: HabitWithStats[],
  year: number,
  selectedHabitId: string | 'all',
  today: Date = new Date(),
): HabitYearStats {
  let totalDaysInYear = 0;
  for (let m = 0; m < 12; m += 1) {
    totalDaysInYear += daysInMonth(year, m);
  }

  const yearPrefix = `${year}-`;

  if (selectedHabitId !== 'all') {
    const habit = habits.find((h) => h.id === selectedHabitId);
    if (!habit) {
      return {
        markedDays: 0,
        totalDaysInYear,
        yearPercent: 0,
        currentStreak: 0,
        bestStreak: 0,
      };
    }
    let markedDays = 0;
    habit.completedDates.forEach((key) => {
      if (key.startsWith(yearPrefix)) {
        markedDays += 1;
      }
    });
    return {
      markedDays,
      totalDaysInYear,
      yearPercent: Math.round((markedDays / totalDaysInYear) * 100),
      currentStreak: habit.currentStreak,
      bestStreak: habit.bestStreak,
    };
  }

  // Aggregate mode ('all'): a day counts if at least 1 habit was completed on that date
  const anyDoneDates = new Set<string>();
  let markedDays = 0;
  for (const h of habits) {
    h.completedDates.forEach((key) => {
      if (!anyDoneDates.has(key)) {
        anyDoneDates.add(key);
        if (key.startsWith(yearPrefix)) {
          markedDays += 1;
        }
      }
    });
  }

  const { currentStreak, bestStreak } = computeHabitStreaks(anyDoneDates, today);
  return {
    markedDays,
    totalDaysInYear,
    yearPercent: Math.round((markedDays / totalDaysInYear) * 100),
    currentStreak,
    bestStreak,
  };
}

export async function listHabitsWithStats(
  db: SQLiteDatabase,
  userId: string,
): Promise<HabitWithStats[]> {
  const [habitRows, logRows] = await Promise.all([
    db.getAllAsync<HabitRow>(
      `SELECT * FROM habits
       WHERE user_id = ? AND archived = 0
       ORDER BY position ASC, created_at ASC;`,
      userId,
    ),
    db.getAllAsync<HabitLogRow>(
      `SELECT * FROM habit_logs
       WHERE user_id = ?
       ORDER BY date_key ASC;`,
      userId,
    ),
  ]);

  const logsByHabit = new Map<string, Set<string>>();
  for (const row of logRows) {
    let set = logsByHabit.get(row.habit_id);
    if (!set) {
      set = new Set<string>();
      logsByHabit.set(row.habit_id, set);
    }
    set.add(row.date_key);
  }

  const today = new Date();
  const todayKey = toDateKey(today);

  return habitRows.map((row) => {
    const habit = mapHabit(row);
    const completedDates = logsByHabit.get(habit.id) ?? new Set<string>();
    const { currentStreak, bestStreak } = computeHabitStreaks(completedDates, today);
    return {
      ...habit,
      completedDates,
      currentStreak,
      bestStreak,
      completedToday: completedDates.has(todayKey),
    };
  });
}

export async function createHabit(
  db: SQLiteDatabase,
  userId: string,
  input: {
    title: string;
    color?: string;
    icon?: IconName;
    targetPerWeek?: number;
  },
): Promise<HabitRecord> {
  const id = createId();
  const now = nowIso();
  const title = input.title.trim();
  const color = input.color ?? '#3B82F6';
  const icon = input.icon ?? 'flame';
  const targetPerWeek = Math.max(1, Math.min(7, input.targetPerWeek ?? 7));

  const maxRow = await db.getFirstAsync<{ max_pos: number | null }>(
    'SELECT MAX(position) AS max_pos FROM habits WHERE user_id = ?;',
    userId,
  );
  const position = (maxRow?.max_pos ?? -1) + 1;

  await db.runAsync(
    `INSERT INTO habits (id, user_id, title, color, icon, target_per_week, position, archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?);`,
    id,
    userId,
    title,
    color,
    icon,
    targetPerWeek,
    position,
    now,
    now,
  );

  return {
    id,
    userId,
    title,
    color,
    icon,
    targetPerWeek,
    position,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateHabit(
  db: SQLiteDatabase,
  habitId: string,
  patch: {
    title?: string;
    color?: string;
    icon?: IconName;
    targetPerWeek?: number;
  },
): Promise<void> {
  const existing = await db.getFirstAsync<HabitRow>('SELECT * FROM habits WHERE id = ?;', habitId);
  if (!existing) {
    return;
  }
  await db.runAsync(
    `UPDATE habits
     SET title = ?, color = ?, icon = ?, target_per_week = ?, updated_at = ?
     WHERE id = ?;`,
    patch.title !== undefined ? patch.title.trim() || existing.title : existing.title,
    patch.color ?? existing.color,
    patch.icon ?? existing.icon,
    patch.targetPerWeek !== undefined
      ? Math.max(1, Math.min(7, patch.targetPerWeek))
      : existing.target_per_week,
    nowIso(),
    habitId,
  );
}

export async function deleteHabit(db: SQLiteDatabase, habitId: string): Promise<void> {
  await db.runAsync('DELETE FROM habits WHERE id = ?;', habitId);
}

export async function reorderHabits(
  db: SQLiteDatabase,
  userId: string,
  orderedIds: string[],
): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < orderedIds.length; i += 1) {
      await db.runAsync(
        'UPDATE habits SET position = ? WHERE id = ? AND user_id = ?;',
        i,
        orderedIds[i],
        userId,
      );
    }
  });
}

export async function toggleHabitLog(
  db: SQLiteDatabase,
  userId: string,
  habitId: string,
  dateKey: string,
): Promise<boolean> {
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM habit_logs WHERE habit_id = ? AND date_key = ?;',
    habitId,
    dateKey,
  );
  if (existing) {
    await db.runAsync('DELETE FROM habit_logs WHERE id = ?;', existing.id);
    return false;
  }
  await db.runAsync(
    `INSERT INTO habit_logs (id, habit_id, user_id, date_key, created_at)
     VALUES (?, ?, ?, ?, ?);`,
    createId(),
    habitId,
    userId,
    dateKey,
    nowIso(),
  );
  return true;
}

export async function setAllHabitsForDate(
  db: SQLiteDatabase,
  userId: string,
  habitIds: string[],
  dateKey: string,
  done: boolean,
): Promise<void> {
  if (habitIds.length === 0) {
    return;
  }
  const now = nowIso();
  await db.withTransactionAsync(async () => {
    for (const habitId of habitIds) {
      if (done) {
        await db.runAsync(
          `INSERT OR IGNORE INTO habit_logs (id, habit_id, user_id, date_key, created_at)
           VALUES (?, ?, ?, ?, ?);`,
          createId(),
          habitId,
          userId,
          dateKey,
          now,
        );
      } else {
        await db.runAsync(
          'DELETE FROM habit_logs WHERE habit_id = ? AND date_key = ?;',
          habitId,
          dateKey,
        );
      }
    }
  });
}

export async function captureHabitsSnapshot(
  db: SQLiteDatabase,
  userId: string,
): Promise<HabitsSnapshot> {
  const [habitRows, logRows] = await Promise.all([
    db.getAllAsync<HabitRow>(
      'SELECT * FROM habits WHERE user_id = ? ORDER BY position ASC;',
      userId,
    ),
    db.getAllAsync<HabitLogRow>(
      'SELECT * FROM habit_logs WHERE user_id = ? ORDER BY date_key ASC;',
      userId,
    ),
  ]);

  const logs: HabitLogEntry[] = logRows.map((row) => ({
    id: row.id,
    habitId: row.habit_id,
    dateKey: row.date_key,
    createdAt: row.created_at,
  }));

  return {
    habits: habitRows.map(mapHabit),
    logs,
  };
}

export async function restoreHabitsSnapshot(
  db: SQLiteDatabase,
  userId: string,
  snapshot: HabitsSnapshot,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM habits WHERE user_id = ?;', userId);
    for (let i = 0; i < snapshot.habits.length; i += 1) {
      const h = snapshot.habits[i];
      await db.runAsync(
        `INSERT INTO habits (id, user_id, title, color, icon, target_per_week, position, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        h.id,
        userId,
        h.title,
        h.color,
        h.icon,
        h.targetPerWeek,
        h.position ?? i,
        h.archived ? 1 : 0,
        h.createdAt,
        h.updatedAt,
      );
    }

    const validHabitIds = new Set(snapshot.habits.map((h) => h.id));
    for (const log of snapshot.logs) {
      if (!validHabitIds.has(log.habitId)) {
        continue;
      }
      await db.runAsync(
        `INSERT INTO habit_logs (id, habit_id, user_id, date_key, created_at)
         VALUES (?, ?, ?, ?, ?);`,
        log.id,
        log.habitId,
        userId,
        log.dateKey,
        log.createdAt,
      );
    }
  });
}
