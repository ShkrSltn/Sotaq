import type { SQLiteDatabase } from 'expo-sqlite';

import { createId, nowIso } from '@/db/client';
import type { NoteBlockRecord, NoteBlockType, NotePageRecord } from '@/features/notes/types';

type PageRow = {
  id: string;
  user_id: string;
  parent_id: string | null;
  title: string;
  icon: string;
  is_favorite: number;
  position: number;
  created_at: string;
  updated_at: string;
};

type BlockRow = {
  id: string;
  page_id: string;
  type: string;
  content: string;
  checked: number;
  collapsed: number;
  toggle_body: string;
  position: number;
  updated_at: string;
};

const VALID_BLOCK_TYPES = new Set<NoteBlockType>([
  'paragraph',
  'h1',
  'h2',
  'h3',
  'bullet',
  'numbered',
  'todo',
  'quote',
  'callout',
  'code',
  'toggle',
  'divider',
]);

function normalizeBlockType(raw: string): NoteBlockType {
  return VALID_BLOCK_TYPES.has(raw as NoteBlockType) ? (raw as NoteBlockType) : 'paragraph';
}

function mapPage(row: PageRow): NotePageRecord {
  return {
    id: row.id,
    userId: row.user_id,
    parentId: row.parent_id,
    title: row.title,
    icon: row.icon,
    isFavorite: row.is_favorite === 1,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBlock(row: BlockRow): NoteBlockRecord {
  return {
    id: row.id,
    pageId: row.page_id,
    type: normalizeBlockType(row.type),
    content: row.content,
    checked: row.checked === 1,
    collapsed: row.collapsed === 1,
    toggleBody: row.toggle_body,
    position: row.position,
    updatedAt: row.updated_at,
  };
}

export async function ensureInitialNotes(
  db: SQLiteDatabase,
  userId: string,
): Promise<NotePageRecord[]> {
  const existing = await listNotePages(db, userId);
  if (existing.length > 0) {
    return existing;
  }

  const now = nowIso();
  const rootId = createId();
  const childId = createId();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO note_pages
         (id, user_id, parent_id, title, icon, is_favorite, position, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, 1, 0, ?, ?),
              (?, ?, ?, ?, ?, 0, 0, ?, ?);`,
      rootId,
      userId,
      'Быстрые мысли',
      '🧠',
      now,
      now,
      childId,
      userId,
      rootId,
      'Шпаргалка по редактору',
      '💡',
      now,
      now,
    );

    await db.runAsync(
      `INSERT INTO note_blocks
         (id, page_id, type, content, checked, collapsed, toggle_body, position, updated_at)
       VALUES (?, ?, 'callout', ?, 0, 0, '', 0, ?),
              (?, ?, 'h2', ?, 0, 0, '', 1, ?),
              (?, ?, 'bullet', ?, 0, 0, '', 2, ?),
              (?, ?, 'bullet', ?, 0, 0, '', 3, ?),
              (?, ?, 'todo', ?, 0, 0, '', 4, ?),
              (?, ?, 'toggle', ?, 0, 1, ?, 5, ?),
              (?, ?, 'paragraph', '', 0, 0, '', 6, ?);`,
      createId(),
      rootId,
      'Это ваш локальный Notion-редактор. Введите «/» в пустой строке, чтобы выбрать тип блока.',
      now,
      createId(),
      rootId,
      'Как быстро форматировать',
      now,
      createId(),
      rootId,
      'Начните строку с #, ##, ### для заголовков или -, 1., [] для списков',
      now,
      createId(),
      rootId,
      'Нажмите Enter для нового блока, Backspace на пустом блоке — для удаления или сброса типа',
      now,
      createId(),
      rootId,
      'Попробовать вложенную страницу слева',
      now,
      createId(),
      rootId,
      'Скрытая заметка (нажмите, чтобы раскрыть)',
      'Внутри раскрывающегося блока удобно прятать черновики и подробности.',
      now,
      createId(),
      rootId,
      now,
    );

    await db.runAsync(
      `INSERT INTO note_blocks
         (id, page_id, type, content, checked, collapsed, toggle_body, position, updated_at)
       VALUES (?, ?, 'quote', ?, 0, 0, '', 0, ?),
              (?, ?, 'code', ?, 0, 0, '', 1, ?);`,
      createId(),
      childId,
      'Хорошие мысли лучше записывать сразу, пока они свежие.',
      now,
      createId(),
      childId,
      '# Заголовок 1\n## Заголовок 2\n- Пункт списка\n[] Чек-лист\n> Цитата\n--- Разделитель',
      now,
    );
  });

  return listNotePages(db, userId);
}

export async function listNotePages(
  db: SQLiteDatabase,
  userId: string,
): Promise<NotePageRecord[]> {
  const rows = await db.getAllAsync<PageRow>(
    'SELECT * FROM note_pages WHERE user_id = ? ORDER BY position ASC, created_at ASC;',
    userId,
  );
  return rows.map(mapPage);
}

export async function searchNotePageIds(
  db: SQLiteDatabase,
  userId: string,
  query: string,
): Promise<Set<string>> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return new Set();
  }
  const like = `%${trimmed}%`;
  const rows = await db.getAllAsync<{ id: string }>(
    `SELECT DISTINCT p.id
     FROM note_pages p
     LEFT JOIN note_blocks b ON b.page_id = p.id
     WHERE p.user_id = ?
       AND (LOWER(p.title) LIKE ? OR LOWER(b.content) LIKE ? OR LOWER(b.toggle_body) LIKE ?);`,
    userId,
    like,
    like,
    like,
  );
  return new Set(rows.map((row) => row.id));
}

export async function createNotePage(
  db: SQLiteDatabase,
  userId: string,
  input?: { parentId?: string | null; title?: string; icon?: string },
): Promise<NotePageRecord> {
  const now = nowIso();
  const id = createId();
  const parentId = input?.parentId ?? null;
  const maxRow = parentId
    ? await db.getFirstAsync<{ max_pos: number | null }>(
        'SELECT MAX(position) AS max_pos FROM note_pages WHERE user_id = ? AND parent_id = ?;',
        userId,
        parentId,
      )
    : await db.getFirstAsync<{ max_pos: number | null }>(
        'SELECT MAX(position) AS max_pos FROM note_pages WHERE user_id = ? AND parent_id IS NULL;',
        userId,
      );
  const position = (maxRow?.max_pos ?? -1) + 1;
  const title = input?.title ?? '';
  const icon = input?.icon ?? '📄';

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO note_pages
         (id, user_id, parent_id, title, icon, is_favorite, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?);`,
      id,
      userId,
      parentId,
      title,
      icon,
      position,
      now,
      now,
    );

    await db.runAsync(
      `INSERT INTO note_blocks
         (id, page_id, type, content, checked, collapsed, toggle_body, position, updated_at)
       VALUES (?, ?, 'paragraph', '', 0, 0, '', 0, ?);`,
      createId(),
      id,
      now,
    );
  });

  return {
    id,
    userId,
    parentId,
    title,
    icon,
    isFavorite: false,
    position,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateNotePage(
  db: SQLiteDatabase,
  pageId: string,
  patch: { title?: string; icon?: string; isFavorite?: boolean },
): Promise<void> {
  const existing = await db.getFirstAsync<PageRow>(
    'SELECT * FROM note_pages WHERE id = ?;',
    pageId,
  );
  if (!existing) {
    return;
  }

  await db.runAsync(
    `UPDATE note_pages
     SET title = ?, icon = ?, is_favorite = ?, updated_at = ?
     WHERE id = ?;`,
    patch.title !== undefined ? patch.title : existing.title,
    patch.icon !== undefined ? patch.icon : existing.icon,
    patch.isFavorite !== undefined ? (patch.isFavorite ? 1 : 0) : existing.is_favorite,
    nowIso(),
    pageId,
  );
}

export async function deleteNotePage(db: SQLiteDatabase, pageId: string): Promise<void> {
  await db.runAsync('DELETE FROM note_pages WHERE id = ?;', pageId);
}

export async function loadPageBlocks(
  db: SQLiteDatabase,
  pageId: string,
): Promise<NoteBlockRecord[]> {
  const rows = await db.getAllAsync<BlockRow>(
    'SELECT * FROM note_blocks WHERE page_id = ? ORDER BY position ASC;',
    pageId,
  );
  if (rows.length > 0) {
    return rows.map(mapBlock);
  }

  // Always guarantee at least one editable paragraph block.
  const now = nowIso();
  const id = createId();
  await db.runAsync(
    `INSERT INTO note_blocks
       (id, page_id, type, content, checked, collapsed, toggle_body, position, updated_at)
     VALUES (?, ?, 'paragraph', '', 0, 0, '', 0, ?);`,
    id,
    pageId,
    now,
  );

  return [
    {
      id,
      pageId,
      type: 'paragraph',
      content: '',
      checked: false,
      collapsed: false,
      toggleBody: '',
      position: 0,
      updatedAt: now,
    },
  ];
}

export async function savePageBlocks(
  db: SQLiteDatabase,
  pageId: string,
  blocks: NoteBlockRecord[],
): Promise<void> {
  const now = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM note_blocks WHERE page_id = ?;', pageId);

    for (let index = 0; index < blocks.length; index += 1) {
      const block = blocks[index];
      await db.runAsync(
        `INSERT INTO note_blocks
           (id, page_id, type, content, checked, collapsed, toggle_body, position, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        block.id,
        pageId,
        block.type,
        block.content,
        block.checked ? 1 : 0,
        block.collapsed ? 1 : 0,
        block.toggleBody,
        index,
        now,
      );
    }

    await db.runAsync('UPDATE note_pages SET updated_at = ? WHERE id = ?;', now, pageId);
  });
}
