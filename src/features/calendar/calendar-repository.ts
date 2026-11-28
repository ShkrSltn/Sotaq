import type { SQLiteDatabase } from 'expo-sqlite';

import type { CalendarDataBundle, CalendarItem } from '@/features/calendar/types';
import {
  listBoards,
  loadBoardData,
  updateCard,
} from '@/features/kanban/kanban-repository';
import { type KanbanBoardData, PRIORITY_META } from '@/features/kanban/types';
import {
  ensureInitialTodoData,
  listKanbanTargets,
  loadTodoWorkspace,
  updateTodo,
} from '@/features/todos/todos-repository';

export async function loadCalendarBundle(
  db: SQLiteDatabase,
  userId: string,
): Promise<CalendarDataBundle> {
  await ensureInitialTodoData(db, userId);

  const [todoData, kanbanTargets, boards] = await Promise.all([
    loadTodoWorkspace(db, userId),
    listKanbanTargets(db, userId),
    listBoards(db, userId),
  ]);

  const boardDataList = await Promise.all(
    boards.map((board) => loadBoardData(db, board.id)),
  );

  const boardsById: Record<string, KanbanBoardData> = {};
  for (const bd of boardDataList) {
    if (bd) {
      boardsById[bd.board.id] = bd;
    }
  }

  const listTitleById = new Map<string, string>();
  for (const l of todoData.lists) {
    listTitleById.set(l.id, l.title);
  }

  const linkedCardIds = new Set<string>();
  const items: CalendarItem[] = [];

  for (const todo of todoData.todos) {
    if (todo.linkedCardId) {
      linkedCardIds.add(todo.linkedCardId);
    }
    const listName = todo.listId ? listTitleById.get(todo.listId) : null;
    items.push({
      key: `todo:${todo.id}`,
      kind: 'todo',
      id: todo.id,
      title: todo.title,
      dueDate: todo.dueDate,
      priority: todo.priority,
      isDone: todo.isDone,
      badgeLabel: todo.linkedCard?.columnTitle
        ? todo.linkedCard.columnTitle
        : listName ?? 'Задача',
      accentColor: todo.linkedCard?.columnAccent ?? PRIORITY_META[todo.priority].dotColor,
      todo,
    });
  }

  for (const bd of Object.values(boardsById)) {
    const colById = new Map(bd.columns.map((c) => [c.id, c]));
    for (const card of bd.cards) {
      if (linkedCardIds.has(card.id)) {
        continue;
      }
      const col = colById.get(card.columnId);
      items.push({
        key: `kanban:${card.id}`,
        kind: 'kanban',
        id: card.id,
        title: card.title,
        dueDate: card.dueDate,
        priority: card.priority,
        isDone: Boolean(col?.isDoneColumn),
        badgeLabel: col ? col.title : bd.board.title,
        accentColor: col?.accent ?? PRIORITY_META[card.priority].dotColor,
        card,
        boardId: bd.board.id,
      });
    }
  }

  return {
    items,
    lists: todoData.lists,
    kanbanTargets,
    boardsById,
  };
}

export async function rescheduleCalendarItem(
  db: SQLiteDatabase,
  item: CalendarItem,
  nextDueDate: string | null,
): Promise<void> {
  if (item.kind === 'todo') {
    await updateTodo(db, item.id, { dueDate: nextDueDate });
    return;
  }

  await updateCard(db, item.id, { dueDate: nextDueDate });
  // Keep any linked todo in sync if one points to this card
  await db.runAsync(
    'UPDATE todos SET due_date = ? WHERE linked_card_id = ?;',
    nextDueDate,
    item.id,
  );
}
