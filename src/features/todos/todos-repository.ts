import type { SQLiteDatabase } from 'expo-sqlite';

import { createId, nowIso } from '@/db/client';
import { ensureDefaultBoard, moveCard } from '@/features/kanban/kanban-repository';
import { addDaysDateKey } from '@/features/kanban/types';
import type {
  TodoItemRecord,
  TodoLinkedCardSummary,
  TodoListRecord,
  TodoPriority,
} from '@/features/todos/types';

type TodoListRow = {
  id: string;
  user_id: string | null;
  title: string;
  position: number;
  created_at: string;
};

type TodoJoinedRow = {
  id: string;
  user_id: string | null;
  list_id: string | null;
  title: string;
  notes: string;
  is_done: number;
  priority: string;
  due_date: string | null;
  position: number;
  linked_card_id: string | null;
  created_at: string;
  updated_at: string;
  card_board_id: string | null;
  card_board_title: string | null;
  card_column_id: string | null;
  card_column_title: string | null;
  card_column_accent: string | null;
  card_column_is_done: number | null;
};

export type BoardColumnOption = {
  boardId: string;
  boardTitle: string;
  columns: {
    id: string;
    title: string;
    accent: string;
    isDoneColumn: boolean;
  }[];
};

function normalizePriority(value: string): TodoPriority {
  if (value === 'high' || value === 'low' || value === 'medium') {
    return value;
  }
  return 'medium';
}

function mapList(row: TodoListRow): TodoListRecord {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    position: row.position,
    createdAt: row.created_at,
  };
}

function mapTodo(row: TodoJoinedRow): TodoItemRecord {
  const linkedCard: TodoLinkedCardSummary | null =
    row.linked_card_id &&
    row.card_board_id &&
    row.card_board_title &&
    row.card_column_id &&
    row.card_column_title
      ? {
          cardId: row.linked_card_id,
          boardId: row.card_board_id,
          boardTitle: row.card_board_title,
          columnId: row.card_column_id,
          columnTitle: row.card_column_title,
          columnAccent: row.card_column_accent ?? '#6B7280',
          isDoneColumn: row.card_column_is_done === 1,
        }
      : null;

  return {
    id: row.id,
    userId: row.user_id,
    listId: row.list_id,
    title: row.title,
    notes: row.notes,
    isDone: row.is_done === 1,
    priority: normalizePriority(row.priority),
    dueDate: row.due_date,
    position: row.position,
    linkedCardId: row.linked_card_id,
    linkedCard,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function ensureInitialTodoData(db: SQLiteDatabase, userId: string): Promise<void> {
  const existingLists = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM todo_lists WHERE user_id = ?;',
    userId,
  );
  if ((existingLists?.count ?? 0) > 0) {
    return;
  }

  const now = nowIso();
  const inboxId = createId();
  const personalId = createId();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO todo_lists (id, user_id, title, position, created_at)
       VALUES (?, ?, ?, 0, ?),
              (?, ?, ?, 1, ?);`,
      inboxId,
      userId,
      'Входящие',
      now,
      personalId,
      userId,
      'Личное',
      now,
    );

    const today = addDaysDateKey(0);
    const tomorrow = addDaysDateKey(1);

    await db.runAsync(
      `INSERT INTO todos
         (id, user_id, list_id, title, notes, is_done, priority, due_date, position, linked_card_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 'high', ?, 0, NULL, ?, ?),
              (?, ?, ?, ?, ?, 0, 'medium', ?, 1, NULL, ?, ?),
              (?, ?, ?, ?, ?, 1, 'low', NULL, 2, NULL, ?, ?);`,
      createId(),
      userId,
      inboxId,
      'Разобрать задачи на сегодня',
      'Можно привязать важные пункты прямо к Канбану.',
      today,
      now,
      now,
      createId(),
      userId,
      personalId,
      'Купить продукты',
      '',
      tomorrow,
      now,
      now,
      createId(),
      userId,
      inboxId,
      'Подключить SQLite для списка задач',
      '',
      now,
      now,
    );
  });
}

export async function loadTodoWorkspace(
  db: SQLiteDatabase,
  userId: string,
): Promise<{
  lists: TodoListRecord[];
  todos: TodoItemRecord[];
}> {
  const [listRows, todoRows] = await Promise.all([
    db.getAllAsync<TodoListRow>(
      'SELECT * FROM todo_lists WHERE user_id = ? ORDER BY position ASC, created_at ASC;',
      userId,
    ),
    db.getAllAsync<TodoJoinedRow>(
      `SELECT t.*,
              c.board_id AS card_board_id,
              b.title AS card_board_title,
              c.column_id AS card_column_id,
              col.title AS card_column_title,
              col.accent AS card_column_accent,
              col.is_done_column AS card_column_is_done
       FROM todos t
       LEFT JOIN kanban_cards c ON c.id = t.linked_card_id
       LEFT JOIN kanban_boards b ON b.id = c.board_id
       LEFT JOIN kanban_columns col ON col.id = c.column_id
       WHERE t.user_id = ?
       ORDER BY t.is_done ASC, t.position ASC, t.created_at DESC;`,
      userId,
    ),
  ]);

  return {
    lists: listRows.map(mapList),
    todos: todoRows.map(mapTodo),
  };
}

export async function createTodoList(
  db: SQLiteDatabase,
  userId: string,
  title: string,
): Promise<TodoListRecord> {
  const trimmed = title.trim();
  const id = createId();
  const now = nowIso();
  const maxRow = await db.getFirstAsync<{ max_pos: number | null }>(
    'SELECT MAX(position) AS max_pos FROM todo_lists WHERE user_id = ?;',
    userId,
  );
  const position = (maxRow?.max_pos ?? -1) + 1;

  await db.runAsync(
    'INSERT INTO todo_lists (id, user_id, title, position, created_at) VALUES (?, ?, ?, ?, ?);',
    id,
    userId,
    trimmed,
    position,
    now,
  );

  return { id, userId, title: trimmed, position, createdAt: now };
}

export async function renameTodoList(
  db: SQLiteDatabase,
  listId: string,
  title: string,
): Promise<void> {
  await db.runAsync('UPDATE todo_lists SET title = ? WHERE id = ?;', title.trim(), listId);
}

export async function deleteTodoList(db: SQLiteDatabase, listId: string): Promise<void> {
  await db.runAsync('DELETE FROM todo_lists WHERE id = ?;', listId);
}

export async function createTodo(
  db: SQLiteDatabase,
  userId: string,
  input: {
    title: string;
    listId: string | null;
    priority?: TodoPriority;
    dueDate?: string | null;
  },
): Promise<string> {
  const id = createId();
  const now = nowIso();
  const minRow = await db.getFirstAsync<{ min_pos: number | null }>(
    'SELECT MIN(position) AS min_pos FROM todos WHERE user_id = ? AND is_done = 0;',
    userId,
  );
  const position = (minRow?.min_pos ?? 1) - 1;

  await db.runAsync(
    `INSERT INTO todos
       (id, user_id, list_id, title, notes, is_done, priority, due_date, position, linked_card_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, '', 0, ?, ?, ?, NULL, ?, ?);`,
    id,
    userId,
    input.listId,
    input.title.trim(),
    input.priority ?? 'medium',
    input.dueDate ?? null,
    position,
    now,
    now,
  );

  return id;
}

export async function updateTodo(
  db: SQLiteDatabase,
  todoId: string,
  patch: {
    title?: string;
    notes?: string;
    listId?: string | null;
    priority?: TodoPriority;
    dueDate?: string | null;
  },
): Promise<void> {
  const existing = await db.getFirstAsync<{
    title: string;
    notes: string;
    list_id: string | null;
    priority: string;
    due_date: string | null;
    linked_card_id: string | null;
  }>(
    'SELECT title, notes, list_id, priority, due_date, linked_card_id FROM todos WHERE id = ?;',
    todoId,
  );
  if (!existing) {
    return;
  }

  const nextTitle = patch.title !== undefined ? patch.title.trim() : existing.title;
  const nextNotes = patch.notes !== undefined ? patch.notes : existing.notes;
  const nextListId = patch.listId !== undefined ? patch.listId : existing.list_id;
  const nextPriority = patch.priority !== undefined ? patch.priority : existing.priority;
  const nextDueDate = patch.dueDate !== undefined ? patch.dueDate : existing.due_date;
  const now = nowIso();

  await db.runAsync(
    `UPDATE todos
     SET title = ?, notes = ?, list_id = ?, priority = ?, due_date = ?, updated_at = ?
     WHERE id = ?;`,
    nextTitle,
    nextNotes,
    nextListId,
    nextPriority,
    nextDueDate,
    now,
    todoId,
  );

  // Keep linked Kanban card metadata in sync when edited from To-Do.
  if (existing.linked_card_id) {
    await db.runAsync(
      `UPDATE kanban_cards
       SET title = ?, description = ?, priority = ?, due_date = ?, updated_at = ?
       WHERE id = ?;`,
      nextTitle,
      nextNotes,
      nextPriority,
      nextDueDate,
      now,
      existing.linked_card_id,
    );
  }
}

export async function toggleTodoDone(
  db: SQLiteDatabase,
  todoId: string,
  isDone: boolean,
): Promise<void> {
  const now = nowIso();
  await db.runAsync(
    'UPDATE todos SET is_done = ?, updated_at = ? WHERE id = ?;',
    isDone ? 1 : 0,
    now,
    todoId,
  );

  const linked = await db.getFirstAsync<{
    linked_card_id: string | null;
  }>('SELECT linked_card_id FROM todos WHERE id = ?;', todoId);

  if (!linked?.linked_card_id) {
    return;
  }

  const card = await db.getFirstAsync<{
    id: string;
    board_id: string;
    column_id: string;
  }>('SELECT id, board_id, column_id FROM kanban_cards WHERE id = ?;', linked.linked_card_id);
  if (!card) {
    return;
  }

  const boardColumns = await db.getAllAsync<{
    id: string;
    is_done_column: number;
  }>(
    'SELECT id, is_done_column FROM kanban_columns WHERE board_id = ? ORDER BY position ASC;',
    card.board_id,
  );
  if (boardColumns.length === 0) {
    return;
  }

  const doneCol =
    boardColumns.find((col) => col.is_done_column === 1) ?? boardColumns[boardColumns.length - 1];
  const openCol = boardColumns.find((col) => col.is_done_column === 0) ?? boardColumns[0];

  if (isDone && doneCol && card.column_id !== doneCol.id) {
    await moveCard(db, card.id, doneCol.id);
  } else if (!isDone && doneCol && openCol && card.column_id === doneCol.id) {
    await moveCard(db, card.id, openCol.id);
  }
}

export async function deleteTodo(db: SQLiteDatabase, todoId: string): Promise<void> {
  await db.runAsync('DELETE FROM todos WHERE id = ?;', todoId);
}

export async function clearCompletedTodos(db: SQLiteDatabase, userId: string): Promise<void> {
  await db.runAsync('DELETE FROM todos WHERE user_id = ? AND is_done = 1;', userId);
}

export async function listKanbanTargets(
  db: SQLiteDatabase,
  userId: string,
): Promise<BoardColumnOption[]> {
  const boards = await ensureDefaultBoard(db, userId);
  const columns = await db.getAllAsync<{
    id: string;
    board_id: string;
    title: string;
    accent: string;
    is_done_column: number;
  }>('SELECT id, board_id, title, accent, is_done_column FROM kanban_columns ORDER BY position ASC;');

  return boards.map((board) => ({
    boardId: board.id,
    boardTitle: board.title,
    columns: columns
      .filter((col) => col.board_id === board.id)
      .map((col) => ({
        id: col.id,
        title: col.title,
        accent: col.accent,
        isDoneColumn: col.is_done_column === 1,
      })),
  }));
}

export async function sendTodoToKanban(
  db: SQLiteDatabase,
  todoId: string,
  boardId: string,
  columnId: string,
): Promise<void> {
  const todo = await db.getFirstAsync<{
    id: string;
    title: string;
    notes: string;
    priority: string;
    due_date: string | null;
    linked_card_id: string | null;
  }>('SELECT id, title, notes, priority, due_date, linked_card_id FROM todos WHERE id = ?;', todoId);
  if (!todo) {
    return;
  }

  if (todo.linked_card_id) {
    await moveCard(db, todo.linked_card_id, columnId);
    return;
  }

  const now = nowIso();
  const cardId = createId();
  const maxRow = await db.getFirstAsync<{ max_pos: number | null }>(
    'SELECT MAX(position) AS max_pos FROM kanban_cards WHERE column_id = ?;',
    columnId,
  );
  const position = (maxRow?.max_pos ?? -1) + 1;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO kanban_cards
         (id, board_id, column_id, title, description, priority, due_date, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      cardId,
      boardId,
      columnId,
      todo.title,
      todo.notes,
      todo.priority,
      todo.due_date,
      position,
      now,
      now,
    );

    await db.runAsync(
      'UPDATE todos SET linked_card_id = ?, updated_at = ? WHERE id = ?;',
      cardId,
      now,
      todoId,
    );
  });
}

export async function unlinkTodoFromKanban(db: SQLiteDatabase, todoId: string): Promise<void> {
  await db.runAsync(
    'UPDATE todos SET linked_card_id = NULL, updated_at = ? WHERE id = ?;',
    nowIso(),
    todoId,
  );
}
