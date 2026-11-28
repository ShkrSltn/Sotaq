import type { SQLiteDatabase } from 'expo-sqlite';

import { nowIso } from '@/db/client';
import { listHabitsWithStats } from '@/features/habits/habits-repository';
import type { HabitWithStats } from '@/features/habits/types';
import type { KanbanPriority } from '@/features/kanban/types';
import { ensureInitialTodoData } from '@/features/todos/todos-repository';
import { todayKey } from '@/utils/date-key';

export type HomePlanItem = {
  key: string;
  kind: 'todo' | 'kanban_card';
  id: string;
  title: string;
  dueDate: string | null;
  priority: KanbanPriority;
  isDone: boolean;
  isOverdue: boolean;
  subtitle: string;
};

export type HomeRecentNote = {
  id: string;
  title: string;
  icon: string;
  isFavorite: boolean;
  updatedAt: string;
};

export type HomeLanguageSummary = {
  languageId: string;
  languageName: string;
  languageCode: string;
  totalWords: number;
  dueReviewCount: number;
  knownCount: number;
};

export type HomeDashboardData = {
  planItems: HomePlanItem[];
  overdueCount: number;
  todayCompletedTasks: number;
  todayTotalTasks: number;
  defaultTodoListId: string | null;
  habits: HabitWithStats[];
  recentNotes: HomeRecentNote[];
  languageSummary: HomeLanguageSummary | null;
};

export type HomePermissions = {
  todos: boolean;
  kanban: boolean;
  habits: boolean;
  notes: boolean;
  language: boolean;
};

const PRIORITY_RANK: Record<KanbanPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function normalizePriority(raw: string | null | undefined): KanbanPriority {
  if (raw === 'high' || raw === 'low') return raw;
  return 'medium';
}

export async function loadHomeDashboard(
  db: SQLiteDatabase,
  userId: string,
  perms: HomePermissions,
): Promise<HomeDashboardData> {
  const today = todayKey();
  const now = nowIso();

  if (perms.todos) {
    await ensureInitialTodoData(db, userId);
  }

  const [todoRows, defaultListRow, cardRows, habits, noteRows, langRow] = await Promise.all([
    perms.todos
      ? db.getAllAsync<{
          id: string;
          title: string;
          due_date: string | null;
          priority: string;
          is_done: number;
          linked_card_id: string | null;
          list_title: string | null;
        }>(
          `SELECT t.id, t.title, t.due_date, t.priority, t.is_done, t.linked_card_id, l.title AS list_title
           FROM todos t
           LEFT JOIN todo_lists l ON l.id = t.list_id
           WHERE t.user_id = ?
             AND (
               (t.is_done = 0 AND t.due_date IS NOT NULL AND t.due_date <= ?)
               OR (t.is_done = 1 AND t.due_date = ?)
             )
           ORDER BY t.is_done ASC, t.due_date ASC, t.position ASC
           LIMIT 30;`,
          userId,
          today,
          today,
        )
      : Promise.resolve([]),

    perms.todos
      ? db.getFirstAsync<{ id: string }>(
          'SELECT id FROM todo_lists WHERE user_id = ? ORDER BY position ASC, created_at ASC LIMIT 1;',
          userId,
        )
      : Promise.resolve(null),

    perms.kanban
      ? db.getAllAsync<{
          id: string;
          title: string;
          due_date: string | null;
          priority: string;
          col_title: string;
          board_title: string;
          is_done_column: number;
        }>(
          `SELECT c.id, c.title, c.due_date, c.priority, col.title AS col_title, b.title AS board_title, col.is_done_column
           FROM kanban_cards c
           INNER JOIN kanban_columns col ON col.id = c.column_id
           INNER JOIN kanban_boards b ON b.id = c.board_id
           WHERE b.user_id = ?
             AND c.due_date IS NOT NULL
             AND c.due_date <= ?
             AND col.is_done_column = 0
           ORDER BY c.due_date ASC, c.updated_at DESC
           LIMIT 20;`,
          userId,
          today,
        )
      : Promise.resolve([]),

    perms.habits ? listHabitsWithStats(db, userId) : Promise.resolve([]),

    perms.notes
      ? db.getAllAsync<{
          id: string;
          title: string;
          icon: string;
          is_favorite: number;
          updated_at: string;
        }>(
          `SELECT id, title, icon, is_favorite, updated_at
           FROM note_pages
           WHERE user_id = ?
           ORDER BY is_favorite DESC, updated_at DESC
           LIMIT 4;`,
          userId,
        )
      : Promise.resolve([]),

    perms.language
      ? db.getFirstAsync<{ id: string; name: string; code: string }>(
          'SELECT id, name, code FROM languages WHERE user_id = ? ORDER BY position ASC, created_at ASC LIMIT 1;',
          userId,
        )
      : Promise.resolve(null),
  ]);

  const linkedCardIds = new Set<string>();
  const activePlan: HomePlanItem[] = [];
  let overdueCount = 0;
  let todayCompletedTasks = 0;
  let todayActiveCount = 0;

  for (const row of todoRows) {
    if (row.linked_card_id) {
      linkedCardIds.add(row.linked_card_id);
    }
    const isDone = row.is_done === 1;
    if (isDone) {
      if (row.due_date === today) {
        todayCompletedTasks += 1;
      }
      continue;
    }
    const isOverdue = Boolean(row.due_date && row.due_date < today);
    if (isOverdue) {
      overdueCount += 1;
    } else {
      todayActiveCount += 1;
    }
    activePlan.push({
      key: `todo:${row.id}`,
      kind: 'todo',
      id: row.id,
      title: row.title,
      dueDate: row.due_date,
      priority: normalizePriority(row.priority),
      isDone: false,
      isOverdue,
      subtitle: row.list_title || 'Задача',
    });
  }

  for (const row of cardRows) {
    if (linkedCardIds.has(row.id)) {
      continue;
    }
    const isOverdue = Boolean(row.due_date && row.due_date < today);
    if (isOverdue) {
      overdueCount += 1;
    } else {
      todayActiveCount += 1;
    }
    activePlan.push({
      key: `card:${row.id}`,
      kind: 'kanban_card',
      id: row.id,
      title: row.title,
      dueDate: row.due_date,
      priority: normalizePriority(row.priority),
      isDone: false,
      isOverdue,
      subtitle: `${row.board_title} · ${row.col_title}`,
    });
  }

  activePlan.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  });

  let languageSummary: HomeLanguageSummary | null = null;
  if (langRow) {
    const counts = await db.getFirstAsync<{
      total: number;
      known: number;
      due: number;
    }>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'known' THEN 1 ELSE 0 END) AS known,
         SUM(CASE WHEN status != 'known' AND (next_review_at IS NULL OR next_review_at <= ?) THEN 1 ELSE 0 END) AS due
       FROM vocab_words
       WHERE language_id = ?;`,
      now,
      langRow.id,
    );

    languageSummary = {
      languageId: langRow.id,
      languageName: langRow.name,
      languageCode: langRow.code,
      totalWords: counts?.total ?? 0,
      knownCount: counts?.known ?? 0,
      dueReviewCount: counts?.due ?? 0,
    };
  }

  return {
    planItems: activePlan.slice(0, 8),
    overdueCount,
    todayCompletedTasks,
    todayTotalTasks: todayCompletedTasks + todayActiveCount + overdueCount,
    defaultTodoListId: defaultListRow?.id ?? null,
    habits,
    recentNotes: noteRows.map((r) => ({
      id: r.id,
      title: r.title,
      icon: r.icon,
      isFavorite: r.is_favorite === 1,
      updatedAt: r.updated_at,
    })),
    languageSummary,
  };
}
