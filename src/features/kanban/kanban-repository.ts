import type { SQLiteDatabase } from 'expo-sqlite';

import { createId, nowIso } from '@/db/client';
import {
  COLUMN_ACCENTS,
  type KanbanBoardColorDraft,
  type KanbanBoardColorRecord,
  type KanbanBoardData,
  type KanbanBoardRecord,
  type KanbanCardRecord,
  type KanbanColumnRecord,
  type KanbanPriority,
  type KanbanSubtaskRecord,
} from '@/features/kanban/types';

type BoardRow = {
  id: string;
  user_id: string | null;
  title: string;
  position: number;
  created_at: string;
  updated_at: string;
};

type ColumnRow = {
  id: string;
  board_id: string;
  title: string;
  accent: string;
  position: number;
  is_done_column: number;
  created_at: string;
};

type CardRow = {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  description: string;
  priority: string;
  due_date: string | null;
  color_id: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

type BoardColorRow = {
  id: string;
  board_id: string;
  name: string;
  color: string;
  position: number;
  created_at: string;
};

type SubtaskRow = {
  id: string;
  card_id: string;
  title: string;
  is_done: number;
  position: number;
};

function mapBoard(row: BoardRow): KanbanBoardRecord {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapColumn(row: ColumnRow): KanbanColumnRecord {
  return {
    id: row.id,
    boardId: row.board_id,
    title: row.title,
    accent: row.accent,
    position: row.position,
    isDoneColumn: row.is_done_column === 1,
    createdAt: row.created_at,
  };
}

function mapBoardColor(row: BoardColorRow): KanbanBoardColorRecord {
  return {
    id: row.id,
    boardId: row.board_id,
    name: row.name,
    color: row.color,
    position: row.position,
    createdAt: row.created_at,
  };
}

function normalizePriority(value: string): KanbanPriority {
  if (value === 'high' || value === 'low' || value === 'medium') {
    return value;
  }
  return 'medium';
}

export async function ensureDefaultBoard(
  db: SQLiteDatabase,
  userId: string,
): Promise<KanbanBoardRecord[]> {
  const existing = await listBoards(db, userId);
  if (existing.length > 0) {
    return existing;
  }

  const now = nowIso();
  const boardId = createId();
  const todoColId = createId();
  const doingColId = createId();
  const doneColId = createId();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO kanban_boards (id, user_id, title, position, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?);`,
      boardId,
      userId,
      'Основная',
      now,
      now,
    );

    await db.runAsync(
      `INSERT INTO kanban_columns (id, board_id, title, accent, position, is_done_column, created_at)
       VALUES (?, ?, ?, ?, 0, 0, ?),
              (?, ?, ?, ?, 1, 0, ?),
              (?, ?, ?, ?, 2, 1, ?);`,
      todoColId,
      boardId,
      'Сделать',
      '#6B7280',
      now,
      doingColId,
      boardId,
      'В работе',
      '#3B82F6',
      now,
      doneColId,
      boardId,
      'Готово',
      '#1E8E5A',
      now,
    );

    const card1Id = createId();
    await db.runAsync(
      `INSERT INTO kanban_cards
         (id, board_id, column_id, title, description, priority, due_date, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 0, ?, ?),
              (?, ?, ?, ?, ?, ?, NULL, 1, ?, ?),
              (?, ?, ?, ?, ?, ?, NULL, 0, ?, ?),
              (?, ?, ?, ?, ?, ?, NULL, 0, ?, ?);`,
      card1Id,
      boardId,
      todoColId,
      'Проверить на телефоне',
      'Открыть приложение через Expo Go и убедиться, что свайпы колонок работают плавно.',
      'high',
      now,
      now,
      createId(),
      boardId,
      todoColId,
      'Настроить роли и вход',
      'Этап 2: админ-панель и доступ по ролям.',
      'medium',
      now,
      now,
      createId(),
      boardId,
      doingColId,
      'Улучшить канбан',
      'SQLite, карточки с деталями, drag-and-drop на десктопе и удобные колонки на мобильном.',
      'medium',
      now,
      now,
      createId(),
      boardId,
      doneColId,
      'Подключить локальную SQLite',
      '',
      'low',
      now,
      now,
    );

    await db.runAsync(
      `INSERT INTO kanban_card_subtasks (id, card_id, title, is_done, position)
       VALUES (?, ?, ?, 1, 0),
              (?, ?, ?, 0, 1);`,
      createId(),
      card1Id,
      'Поднять локальный сервер',
      createId(),
      card1Id,
      'Проверить мобильную вёрстку',
    );
  });

  return listBoards(db, userId);
}

export async function listBoards(
  db: SQLiteDatabase,
  userId: string,
): Promise<KanbanBoardRecord[]> {
  const rows = await db.getAllAsync<BoardRow>(
    'SELECT * FROM kanban_boards WHERE user_id = ? ORDER BY position ASC, created_at ASC;',
    userId,
  );
  return rows.map(mapBoard);
}

export async function loadBoardData(
  db: SQLiteDatabase,
  boardId: string,
): Promise<KanbanBoardData | null> {
  const boardRow = await db.getFirstAsync<BoardRow>(
    'SELECT * FROM kanban_boards WHERE id = ?;',
    boardId,
  );
  if (!boardRow) {
    return null;
  }

  const [columnRows, cardRows, subtaskRows, colorRows] = await Promise.all([
    db.getAllAsync<ColumnRow>(
      'SELECT * FROM kanban_columns WHERE board_id = ? ORDER BY position ASC, created_at ASC;',
      boardId,
    ),
    db.getAllAsync<CardRow>(
      'SELECT * FROM kanban_cards WHERE board_id = ? ORDER BY position ASC, created_at ASC;',
      boardId,
    ),
    db.getAllAsync<SubtaskRow>(
      `SELECT s.* FROM kanban_card_subtasks s
       INNER JOIN kanban_cards c ON c.id = s.card_id
       WHERE c.board_id = ?
       ORDER BY s.position ASC;`,
      boardId,
    ),
    db.getAllAsync<BoardColorRow>(
      'SELECT * FROM kanban_board_colors WHERE board_id = ? ORDER BY position ASC, created_at ASC;',
      boardId,
    ),
  ]);

  const subtasksByCard = new Map<string, KanbanSubtaskRecord[]>();
  for (const row of subtaskRows) {
    const list = subtasksByCard.get(row.card_id) ?? [];
    list.push({
      id: row.id,
      cardId: row.card_id,
      title: row.title,
      isDone: row.is_done === 1,
      position: row.position,
    });
    subtasksByCard.set(row.card_id, list);
  }

  const cards: KanbanCardRecord[] = cardRows.map((row) => ({
    id: row.id,
    boardId: row.board_id,
    columnId: row.column_id,
    title: row.title,
    description: row.description,
    priority: normalizePriority(row.priority),
    dueDate: row.due_date,
    colorId: row.color_id ?? null,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    subtasks: subtasksByCard.get(row.id) ?? [],
  }));

  return {
    board: mapBoard(boardRow),
    columns: columnRows.map(mapColumn),
    cards,
    colors: colorRows.map(mapBoardColor),
  };
}

export async function createBoard(
  db: SQLiteDatabase,
  userId: string,
  title: string,
): Promise<KanbanBoardRecord> {
  const trimmed = title.trim();
  const now = nowIso();
  const boardId = createId();

  const maxRow = await db.getFirstAsync<{ max_pos: number | null }>(
    'SELECT MAX(position) AS max_pos FROM kanban_boards WHERE user_id = ?;',
    userId,
  );
  const nextPosition = (maxRow?.max_pos ?? -1) + 1;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO kanban_boards (id, user_id, title, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?);`,
      boardId,
      userId,
      trimmed,
      nextPosition,
      now,
      now,
    );

    await db.runAsync(
      `INSERT INTO kanban_columns (id, board_id, title, accent, position, is_done_column, created_at)
       VALUES (?, ?, ?, ?, 0, 0, ?),
              (?, ?, ?, ?, 1, 0, ?),
              (?, ?, ?, ?, 2, 1, ?);`,
      createId(),
      boardId,
      'Сделать',
      '#6B7280',
      now,
      createId(),
      boardId,
      'В работе',
      '#3B82F6',
      now,
      createId(),
      boardId,
      'Готово',
      '#1E8E5A',
      now,
    );
  });

  return {
    id: boardId,
    userId,
    title: trimmed,
    position: nextPosition,
    createdAt: now,
    updatedAt: now,
  };
}

export async function renameBoard(db: SQLiteDatabase, boardId: string, title: string): Promise<void> {
  await db.runAsync(
    'UPDATE kanban_boards SET title = ?, updated_at = ? WHERE id = ?;',
    title.trim(),
    nowIso(),
    boardId,
  );
}

export async function deleteBoard(db: SQLiteDatabase, boardId: string): Promise<void> {
  await db.runAsync('DELETE FROM kanban_boards WHERE id = ?;', boardId);
}

export async function saveBoardColors(
  db: SQLiteDatabase,
  boardId: string,
  drafts: KanbanBoardColorDraft[],
): Promise<KanbanBoardColorRecord[]> {
  const now = nowIso();

  await db.withTransactionAsync(async () => {
    const existingRows = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM kanban_board_colors WHERE board_id = ?;',
      boardId,
    );
    const existingIds = new Set(existingRows.map((row) => row.id));
    const keptIds = new Set<string>();

    for (let index = 0; index < drafts.length; index += 1) {
      const item = drafts[index];
      const cleanName = item.name.trim();
      const cleanColor = item.color.trim();

      if (item.id && existingIds.has(item.id)) {
        keptIds.add(item.id);
        await db.runAsync(
          `UPDATE kanban_board_colors
           SET name = ?, color = ?, position = ?
           WHERE id = ? AND board_id = ?;`,
          cleanName,
          cleanColor,
          index,
          item.id,
          boardId,
        );
      } else {
        const nextId = createId();
        keptIds.add(nextId);
        await db.runAsync(
          `INSERT INTO kanban_board_colors (id, board_id, name, color, position, created_at)
           VALUES (?, ?, ?, ?, ?, ?);`,
          nextId,
          boardId,
          cleanName,
          cleanColor,
          index,
          now,
        );
      }
    }

    for (const oldId of existingIds) {
      if (!keptIds.has(oldId)) {
        await db.runAsync(
          'UPDATE kanban_cards SET color_id = NULL WHERE board_id = ? AND color_id = ?;',
          boardId,
          oldId,
        );
        await db.runAsync(
          'DELETE FROM kanban_board_colors WHERE id = ? AND board_id = ?;',
          oldId,
          boardId,
        );
      }
    }
  });

  const rows = await db.getAllAsync<BoardColorRow>(
    'SELECT * FROM kanban_board_colors WHERE board_id = ? ORDER BY position ASC, created_at ASC;',
    boardId,
  );
  return rows.map(mapBoardColor);
}

export async function createColumn(
  db: SQLiteDatabase,
  boardId: string,
  title: string,
  accent?: string,
): Promise<KanbanColumnRecord> {
  const now = nowIso();
  const id = createId();
  const maxRow = await db.getFirstAsync<{ max_pos: number | null }>(
    'SELECT MAX(position) AS max_pos FROM kanban_columns WHERE board_id = ?;',
    boardId,
  );
  const position = (maxRow?.max_pos ?? -1) + 1;
  const resolvedAccent = accent ?? COLUMN_ACCENTS[position % COLUMN_ACCENTS.length];

  await db.runAsync(
    `INSERT INTO kanban_columns (id, board_id, title, accent, position, is_done_column, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?);`,
    id,
    boardId,
    title.trim(),
    resolvedAccent,
    position,
    now,
  );

  return {
    id,
    boardId,
    title: title.trim(),
    accent: resolvedAccent,
    position,
    isDoneColumn: false,
    createdAt: now,
  };
}

export async function updateColumn(
  db: SQLiteDatabase,
  columnId: string,
  patch: { title?: string; accent?: string },
): Promise<void> {
  const existing = await db.getFirstAsync<ColumnRow>(
    'SELECT * FROM kanban_columns WHERE id = ?;',
    columnId,
  );
  if (!existing) {
    return;
  }

  await db.runAsync(
    'UPDATE kanban_columns SET title = ?, accent = ? WHERE id = ?;',
    patch.title !== undefined ? patch.title.trim() : existing.title,
    patch.accent !== undefined ? patch.accent : existing.accent,
    columnId,
  );
}

export async function deleteColumn(db: SQLiteDatabase, columnId: string): Promise<void> {
  await db.runAsync('DELETE FROM kanban_columns WHERE id = ?;', columnId);
}

export async function reorderColumns(
  db: SQLiteDatabase,
  boardId: string,
  orderedColumnIds: string[],
): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (let index = 0; index < orderedColumnIds.length; index += 1) {
      await db.runAsync(
        'UPDATE kanban_columns SET position = ? WHERE id = ? AND board_id = ?;',
        index,
        orderedColumnIds[index],
        boardId,
      );
    }
  });
}

export async function createCard(
  db: SQLiteDatabase,
  input: {
    boardId: string;
    columnId: string;
    title: string;
    description?: string;
    priority?: KanbanPriority;
    dueDate?: string | null;
    colorId?: string | null;
    subtasks?: string[];
  },
): Promise<KanbanCardRecord> {
  const now = nowIso();
  const id = createId();
  const maxRow = await db.getFirstAsync<{ max_pos: number | null }>(
    'SELECT MAX(position) AS max_pos FROM kanban_cards WHERE column_id = ?;',
    input.columnId,
  );
  const position = (maxRow?.max_pos ?? -1) + 1;
  const priority = input.priority ?? 'medium';
  const description = input.description?.trim() ?? '';
  const dueDate = input.dueDate ?? null;
  const colorId = input.colorId ?? null;
  const cleanSubtasks = (input.subtasks ?? [])
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const createdSubtasks: KanbanSubtaskRecord[] = [];

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO kanban_cards
         (id, board_id, column_id, title, description, priority, due_date, color_id, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      id,
      input.boardId,
      input.columnId,
      input.title.trim(),
      description,
      priority,
      dueDate,
      colorId,
      position,
      now,
      now,
    );

    for (let idx = 0; idx < cleanSubtasks.length; idx += 1) {
      const subId = createId();
      await db.runAsync(
        'INSERT INTO kanban_card_subtasks (id, card_id, title, is_done, position) VALUES (?, ?, ?, 0, ?);',
        subId,
        id,
        cleanSubtasks[idx],
        idx,
      );
      createdSubtasks.push({
        id: subId,
        cardId: id,
        title: cleanSubtasks[idx],
        isDone: false,
        position: idx,
      });
    }
  });

  return {
    id,
    boardId: input.boardId,
    columnId: input.columnId,
    title: input.title.trim(),
    description,
    priority,
    dueDate,
    colorId,
    position,
    createdAt: now,
    updatedAt: now,
    subtasks: createdSubtasks,
  };
}

export async function updateCard(
  db: SQLiteDatabase,
  cardId: string,
  patch: {
    title?: string;
    description?: string;
    priority?: KanbanPriority;
    dueDate?: string | null;
    colorId?: string | null;
  },
): Promise<void> {
  const existing = await db.getFirstAsync<CardRow>(
    'SELECT * FROM kanban_cards WHERE id = ?;',
    cardId,
  );
  if (!existing) {
    return;
  }

  await db.runAsync(
    `UPDATE kanban_cards
     SET title = ?, description = ?, priority = ?, due_date = ?, color_id = ?, updated_at = ?
     WHERE id = ?;`,
    patch.title !== undefined ? patch.title.trim() : existing.title,
    patch.description !== undefined ? patch.description : existing.description,
    patch.priority !== undefined ? patch.priority : existing.priority,
    patch.dueDate !== undefined ? patch.dueDate : existing.due_date,
    patch.colorId !== undefined ? patch.colorId : existing.color_id,
    nowIso(),
    cardId,
  );
}

export async function moveCard(
  db: SQLiteDatabase,
  cardId: string,
  targetColumnId: string,
  targetIndex?: number,
): Promise<void> {
  const card = await db.getFirstAsync<CardRow>('SELECT * FROM kanban_cards WHERE id = ?;', cardId);
  if (!card) {
    return;
  }

  const now = nowIso();
  const sourceColumnId = card.column_id;

  await db.withTransactionAsync(async () => {
    const targetRows = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM kanban_cards WHERE column_id = ? AND id != ? ORDER BY position ASC, created_at ASC;',
      targetColumnId,
      cardId,
    );

    const orderedTargetIds = targetRows.map((row) => row.id);
    const insertAt =
      targetIndex === undefined
        ? orderedTargetIds.length
        : Math.max(0, Math.min(targetIndex, orderedTargetIds.length));
    orderedTargetIds.splice(insertAt, 0, cardId);

    for (let index = 0; index < orderedTargetIds.length; index += 1) {
      const id = orderedTargetIds[index];
      if (id === cardId) {
        await db.runAsync(
          'UPDATE kanban_cards SET column_id = ?, position = ?, updated_at = ? WHERE id = ?;',
          targetColumnId,
          index,
          now,
          id,
        );
      } else {
        await db.runAsync('UPDATE kanban_cards SET position = ? WHERE id = ?;', index, id);
      }
    }

    if (sourceColumnId !== targetColumnId) {
      const sourceRows = await db.getAllAsync<{ id: string }>(
        'SELECT id FROM kanban_cards WHERE column_id = ? ORDER BY position ASC, created_at ASC;',
        sourceColumnId,
      );
      for (let index = 0; index < sourceRows.length; index += 1) {
        await db.runAsync(
          'UPDATE kanban_cards SET position = ? WHERE id = ?;',
          index,
          sourceRows[index].id,
        );
      }
    }
  });
}

export async function deleteCard(db: SQLiteDatabase, cardId: string): Promise<void> {
  await db.runAsync('DELETE FROM kanban_cards WHERE id = ?;', cardId);
}

export async function addSubtask(
  db: SQLiteDatabase,
  cardId: string,
  title: string,
): Promise<KanbanSubtaskRecord> {
  const id = createId();
  const maxRow = await db.getFirstAsync<{ max_pos: number | null }>(
    'SELECT MAX(position) AS max_pos FROM kanban_card_subtasks WHERE card_id = ?;',
    cardId,
  );
  const position = (maxRow?.max_pos ?? -1) + 1;
  const trimmed = title.trim();

  await db.runAsync(
    'INSERT INTO kanban_card_subtasks (id, card_id, title, is_done, position) VALUES (?, ?, ?, 0, ?);',
    id,
    cardId,
    trimmed,
    position,
  );

  return { id, cardId, title: trimmed, isDone: false, position };
}

export async function toggleSubtask(
  db: SQLiteDatabase,
  subtaskId: string,
  isDone: boolean,
): Promise<void> {
  await db.runAsync(
    'UPDATE kanban_card_subtasks SET is_done = ? WHERE id = ?;',
    isDone ? 1 : 0,
    subtaskId,
  );
}

export async function deleteSubtask(db: SQLiteDatabase, subtaskId: string): Promise<void> {
  await db.runAsync('DELETE FROM kanban_card_subtasks WHERE id = ?;', subtaskId);
}

export async function reorderSubtasks(
  db: SQLiteDatabase,
  cardId: string,
  orderedSubtaskIds: string[],
): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (let index = 0; index < orderedSubtaskIds.length; index += 1) {
      await db.runAsync(
        'UPDATE kanban_card_subtasks SET position = ? WHERE id = ? AND card_id = ?;',
        index,
        orderedSubtaskIds[index],
        cardId,
      );
    }
  });
}

export async function restoreBoardSnapshot(
  db: SQLiteDatabase,
  boardId: string,
  snapshot: { columns: KanbanColumnRecord[]; cards: KanbanCardRecord[] },
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM kanban_cards WHERE board_id = ?;', boardId);
    await db.runAsync('DELETE FROM kanban_columns WHERE board_id = ?;', boardId);

    for (let idx = 0; idx < snapshot.columns.length; idx += 1) {
      const col = snapshot.columns[idx];
      await db.runAsync(
        `INSERT INTO kanban_columns
           (id, board_id, title, accent, position, is_done_column, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        col.id,
        boardId,
        col.title,
        col.accent,
        idx,
        col.isDoneColumn ? 1 : 0,
        col.createdAt,
      );
    }

    for (const card of snapshot.cards) {
      await db.runAsync(
        `INSERT INTO kanban_cards
           (id, board_id, column_id, title, description, priority, due_date, color_id, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        card.id,
        boardId,
        card.columnId,
        card.title,
        card.description,
        card.priority,
        card.dueDate,
        card.colorId ?? null,
        card.position,
        card.createdAt,
        card.updatedAt,
      );

      for (let subIdx = 0; subIdx < card.subtasks.length; subIdx += 1) {
        const sub = card.subtasks[subIdx];
        await db.runAsync(
          `INSERT INTO kanban_card_subtasks (id, card_id, title, is_done, position)
           VALUES (?, ?, ?, ?, ?);`,
          sub.id,
          card.id,
          sub.title,
          sub.isDone ? 1 : 0,
          subIdx,
        );
      }
    }
  });
}
