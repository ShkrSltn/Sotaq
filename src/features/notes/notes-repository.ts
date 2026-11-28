import type { SQLiteDatabase } from 'expo-sqlite';

import { createId, nowIso } from '@/db/client';
import {
  BLOCK_COLORS,
  MAX_INDENT_LEVEL,
  type NoteBlockColor,
  type NoteBlockRecord,
  type NoteBlockType,
  type NotePageRecord,
  PAGE_COVERS,
  type PageCoverKey,
} from '@/features/notes/types';

type PageRow = {
  id: string;
  user_id: string;
  parent_id: string | null;
  title: string;
  icon: string;
  is_favorite: number;
  cover_color: string | null;
  full_width: number;
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
  indent_level: number;
  block_color: string | null;
  linked_page_id: string | null;
  position: number;
  updated_at: string;
};

const VALID_BLOCK_TYPES = new Set<NoteBlockType>([
  'paragraph',
  'h1',
  'h2',
  'h3',
  'h4',
  'bullet',
  'numbered',
  'todo',
  'quote',
  'callout',
  'code',
  'toggle',
  'divider',
  'page',
]);

function normalizeBlockType(raw: string): NoteBlockType {
  return VALID_BLOCK_TYPES.has(raw as NoteBlockType) ? (raw as NoteBlockType) : 'paragraph';
}

function normalizeBlockColor(raw: string | null | undefined): NoteBlockColor {
  if (raw && raw in BLOCK_COLORS) {
    return raw as NoteBlockColor;
  }
  return 'default';
}

function normalizeCover(raw: string | null | undefined): PageCoverKey | null {
  if (raw && raw in PAGE_COVERS) {
    return raw as PageCoverKey;
  }
  return null;
}

function mapPage(row: PageRow): NotePageRecord {
  return {
    id: row.id,
    userId: row.user_id,
    parentId: row.parent_id,
    title: row.title,
    icon: row.icon,
    isFavorite: row.is_favorite === 1,
    coverColor: normalizeCover(row.cover_color),
    fullWidth: row.full_width === 1,
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
    indentLevel: Math.max(0, Math.min(MAX_INDENT_LEVEL, row.indent_level ?? 0)),
    blockColor: normalizeBlockColor(row.block_color),
    linkedPageId: row.linked_page_id ?? null,
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
         (id, user_id, parent_id, title, icon, is_favorite, cover_color, full_width, position, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, 1, 'slate', 0, 0, ?, ?),
              (?, ?, ?, ?, ?, 0, NULL, 0, 0, ?, ?);`,
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
         (id, page_id, type, content, checked, collapsed, toggle_body, indent_level, block_color, linked_page_id, position, updated_at)
       VALUES (?, ?, 'callout', ?, 0, 0, '', 0, 'blue', NULL, 0, ?),
              (?, ?, 'h2', ?, 0, 0, '', 0, 'default', NULL, 1, ?),
              (?, ?, 'bullet', ?, 0, 0, '', 0, 'default', NULL, 2, ?),
              (?, ?, 'bullet', ?, 0, 0, '', 1, 'default', NULL, 3, ?),
              (?, ?, 'todo', ?, 0, 0, '', 0, 'default', NULL, 4, ?),
              (?, ?, 'page', '', 0, 0, '', 0, 'default', ?, 5, ?),
              (?, ?, 'toggle', ?, 0, 1, ?, 0, 'default', NULL, 6, ?),
              (?, ?, 'paragraph', '', 0, 0, '', 0, 'default', NULL, 7, ?);`,
      createId(),
      rootId,
      'Наведите на любой блок слева: «+» вставит блок ниже, а «⋮⋮» можно перетаскивать или открыть «Превратить в». Нажмите ⌘K / Ctrl+K для быстрого поиска.',
      now,
      createId(),
      rootId,
      'Как быстро работать как в Notion',
      now,
      createId(),
      rootId,
      'Введите «/» и выбирайте блоки стрелками ↑ / ↓ + Enter (попробуйте /page для вложенной страницы)',
      now,
      createId(),
      rootId,
      'Tab / Shift+Tab меняют отступ, а перетаскивание за ⋮⋮ показывает синюю линию вставки',
      now,
      createId(),
      rootId,
      'Перетащить этот блок выше или сменить его тип через ⋮⋮ → Превратить в',
      now,
      createId(),
      rootId,
      childId,
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
         (id, page_id, type, content, checked, collapsed, toggle_body, indent_level, block_color, linked_page_id, position, updated_at)
       VALUES (?, ?, 'quote', ?, 0, 0, '', 0, 'default', NULL, 0, ?),
              (?, ?, 'code', ?, 0, 0, '', 0, 'default', NULL, 1, ?);`,
      createId(),
      childId,
      'Хорошие мысли лучше записывать сразу, пока они свежие.',
      now,
      createId(),
      childId,
      '# Заголовок 1   ## Заголовок 2   ### Заголовок 3\n- Список   1. Нумерация   [] Чек-лист   > Цитата\n/page — создать вложенную страницу прямо в тексте\nTab / Shift+Tab — вложенность блоков\nCmd/Ctrl + K — быстрый переход по страницам',
      now,
    );
  });

  return listNotePages(db, userId);
}

export async function ensureDemoNotePages(
  db: SQLiteDatabase,
  userId: string,
): Promise<NotePageRecord[]> {
  const metaKey = `notes_showcase_v2_${userId}`;
  const seeded = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_meta WHERE key = ?;',
    metaKey,
  );
  if (seeded) {
    await ensureDiaryDemoPage(db, userId);
    return listNotePages(db, userId);
  }

  const now = nowIso();
  const maxRootRow = await db.getFirstAsync<{ max_pos: number | null }>(
    'SELECT MAX(position) AS max_pos FROM note_pages WHERE user_id = ? AND parent_id IS NULL;',
    userId,
  );
  const basePos = (maxRootRow?.max_pos ?? -1) + 1;

  const hubId = createId();
  const sotaqIdeasId = createId();
  const booksId = createId();
  const journalId = createId();
  const techId = createId();

  await db.withTransactionAsync(async () => {
    // Pages (3 root pages + 2 nested subpages under Hub)
    await db.runAsync(
      `INSERT INTO note_pages
         (id, user_id, parent_id, title, icon, is_favorite, cover_color, full_width, position, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, 1, 'ocean', 0, ?, ?, ?),
              (?, ?, ?, ?, ?, 0, 'violet', 0, 0, ?, ?),
              (?, ?, ?, ?, ?, 0, 'forest', 0, 1, ?, ?),
              (?, ?, NULL, ?, ?, 1, 'amber', 0, ?, ?, ?),
              (?, ?, NULL, ?, ?, 0, 'slate', 1, ?, ?, ?);`,
      hubId,
      userId,
      'Личный хаб — 2026',
      '🧭',
      basePos,
      now,
      now,
      sotaqIdeasId,
      userId,
      hubId,
      'Идеи и роадмап Sotaq',
      '🚀',
      now,
      now,
      booksId,
      userId,
      hubId,
      'Конспекты и книги',
      '📚',
      now,
      now,
      journalId,
      userId,
      'Ежедневный журнал',
      '⚡',
      basePos + 1,
      now,
      now,
      techId,
      userId,
      'Технические заметки',
      '🛠',
      basePos + 2,
      now,
      now,
    );

    // 1. Blocks for "Личный хаб — 2026"
    await db.runAsync(
      `INSERT INTO note_blocks
         (id, page_id, type, content, checked, collapsed, toggle_body, indent_level, block_color, linked_page_id, position, updated_at)
       VALUES (?, ?, 'callout', ?, 0, 0, '', 0, 'blue', NULL, 0, ?),
              (?, ?, 'h2', ?, 0, 0, '', 0, 'default', NULL, 1, ?),
              (?, ?, 'todo', ?, 1, 0, '', 0, 'default', NULL, 2, ?),
              (?, ?, 'todo', ?, 0, 0, '', 0, 'default', NULL, 3, ?),
              (?, ?, 'todo', ?, 0, 0, '', 1, 'default', NULL, 4, ?),
              (?, ?, 'todo', ?, 0, 0, '', 1, 'default', NULL, 5, ?),
              (?, ?, 'divider', '', 0, 0, '', 0, 'default', NULL, 6, ?),
              (?, ?, 'h2', ?, 0, 0, '', 0, 'default', NULL, 7, ?),
              (?, ?, 'page', '', 0, 0, '', 0, 'default', ?, 8, ?),
              (?, ?, 'page', '', 0, 0, '', 0, 'default', ?, 9, ?),
              (?, ?, 'divider', '', 0, 0, '', 0, 'default', NULL, 10, ?),
              (?, ?, 'quote', ?, 0, 0, '', 0, 'default', NULL, 11, ?);`,
      createId(),
      hubId,
      'Главное правило этой недели: меньше распыляться, закрывать по 1–2 конкретных шага в день и сразу фиксировать мысли здесь.',
      now,
      createId(),
      hubId,
      'Фокус на неделю',
      now,
      createId(),
      hubId,
      'Собрать базу Sotaq: SQLite, Канбан, To-Do, роли и Заметки',
      now,
      createId(),
      hubId,
      'Подключить реальную AI-модель в раздел «Языки»',
      now,
      createId(),
      hubId,
      'Выбрать провайдера (Gemini / OpenAI / локальный Ollama)',
      now,
      createId(),
      hubId,
      'Протестировать разбор 5 реальных предложений',
      now,
      createId(),
      hubId,
      now,
      createId(),
      hubId,
      'Вложенные разделы',
      now,
      createId(),
      hubId,
      sotaqIdeasId,
      now,
      createId(),
      hubId,
      booksId,
      now,
      createId(),
      hubId,
      now,
      createId(),
      hubId,
      'Ясность рождается в тот момент, когда мысль перенесена из головы на чистый лист.',
      now,
    );

    // 2. Blocks for "Идеи и роадмап Sotaq" (subpage)
    await db.runAsync(
      `INSERT INTO note_blocks
         (id, page_id, type, content, checked, collapsed, toggle_body, indent_level, block_color, linked_page_id, position, updated_at)
       VALUES (?, ?, 'callout', ?, 0, 0, '', 0, 'purple', NULL, 0, ?),
              (?, ?, 'h1', ?, 0, 0, '', 0, 'default', NULL, 1, ?),
              (?, ?, 'bullet', ?, 0, 0, '', 0, 'default', NULL, 2, ?),
              (?, ?, 'bullet', ?, 0, 0, '', 1, 'default', NULL, 3, ?),
              (?, ?, 'bullet', ?, 0, 0, '', 1, 'default', NULL, 4, ?),
              (?, ?, 'bullet', ?, 0, 0, '', 2, 'default', NULL, 5, ?),
              (?, ?, 'h2', ?, 0, 0, '', 0, 'default', NULL, 6, ?),
              (?, ?, 'toggle', ?, 0, 1, ?, 0, 'gray', NULL, 7, ?),
              (?, ?, 'toggle', ?, 0, 0, ?, 0, 'green', NULL, 8, ?);`,
      createId(),
      sotaqIdeasId,
      'Черновик идей: всё, что хочется постепенно добавить в личную систему по мере надобности.',
      now,
      createId(),
      sotaqIdeasId,
      'Следующие фичи',
      now,
      createId(),
      sotaqIdeasId,
      'Языковой тренажёр с ИИ',
      now,
      createId(),
      sotaqIdeasId,
      'Авторазбор новых слов: транскрипция, оттенки значения, живые примеры',
      now,
      createId(),
      sotaqIdeasId,
      'Разбор целых предложений на слова и грамматические правила',
      now,
      createId(),
      sotaqIdeasId,
      'Добавление незнакомого слова прямо из разбора в личный словарь',
      now,
      createId(),
      sotaqIdeasId,
      'Скрытые заметки по архитектуре',
      now,
      createId(),
      sotaqIdeasId,
      'Как потом добавить синхронизацию между телефоном и ПК',
      'У всех таблиц уже есть UUID и updated_at — позже можно подключить простой sync-эндпоинт или Turso/Supabase без переделки экранов.',
      now,
      createId(),
      sotaqIdeasId,
      'Что уже работает стабильно',
      'Локальная SQLite (v7), авторизация с ролями Admin/User, Канбан с drag-and-drop, To-Do со связью с доской и этот Notion-редактор.',
      now,
    );

    // 3. Blocks for "Конспекты и книги" (subpage)
    await db.runAsync(
      `INSERT INTO note_blocks
         (id, page_id, type, content, checked, collapsed, toggle_body, indent_level, block_color, linked_page_id, position, updated_at)
       VALUES (?, ?, 'h2', ?, 0, 0, '', 0, 'default', NULL, 0, ?),
              (?, ?, 'quote', ?, 0, 0, '', 0, 'default', NULL, 1, ?),
              (?, ?, 'h3', ?, 0, 0, '', 0, 'default', NULL, 2, ?),
              (?, ?, 'numbered', ?, 0, 0, '', 0, 'default', NULL, 3, ?),
              (?, ?, 'numbered', ?, 0, 0, '', 0, 'default', NULL, 4, ?),
              (?, ?, 'numbered', ?, 0, 0, '', 0, 'default', NULL, 5, ?),
              (?, ?, 'paragraph', ?, 0, 0, '', 0, 'yellow', NULL, 6, ?),
              (?, ?, 'toggle', ?, 0, 1, ?, 0, 'default', NULL, 7, ?);`,
      createId(),
      booksId,
      'Atomic Habits — ключевые мысли',
      now,
      createId(),
      booksId,
      'Вы не поднимаетесь до уровня своих целей — вы опускаетесь до уровня своих систем.',
      now,
      createId(),
      booksId,
      'Три принципа, которые стоит применять',
      now,
      createId(),
      booksId,
      'Сделать полезное действие максимально очевидным и в 1 клик (убрать трение).',
      now,
      createId(),
      booksId,
      'Правило 2 минут: начинать любую привычку с крошечного шага, который невозможно пропустить.',
      now,
      createId(),
      booksId,
      'Отмечать прогресс визуально — даже маленькая серия держит мотивацию.',
      now,
      createId(),
      booksId,
      'Важное выделение: можно подкрашивать ключевые абзацы через меню «⋮⋮ → Цвет блока», чтобы при быстром просмотре сразу цепляться глазом.',
      now,
      createId(),
      booksId,
      'Цитаты и выписки из главы 4',
      'Привычки формируются не временем, а частотой повторений. Важнее сделать 10 минут 20 раз, чем 3 часа 1 раз.',
      now,
    );

    // 4. Blocks for "Ежедневный журнал"
    await db.runAsync(
      `INSERT INTO note_blocks
         (id, page_id, type, content, checked, collapsed, toggle_body, indent_level, block_color, linked_page_id, position, updated_at)
       VALUES (?, ?, 'callout', ?, 0, 0, '', 0, 'yellow', NULL, 0, ?),
              (?, ?, 'h2', ?, 0, 0, '', 0, 'default', NULL, 1, ?),
              (?, ?, 'todo', ?, 1, 0, '', 0, 'default', NULL, 2, ?),
              (?, ?, 'todo', ?, 0, 0, '', 0, 'default', NULL, 3, ?),
              (?, ?, 'h2', ?, 0, 0, '', 0, 'default', NULL, 4, ?),
              (?, ?, 'bullet', ?, 0, 0, '', 0, 'default', NULL, 5, ?),
              (?, ?, 'bullet', ?, 0, 0, '', 1, 'default', NULL, 6, ?),
              (?, ?, 'divider', '', 0, 0, '', 0, 'default', NULL, 7, ?),
              (?, ?, 'h2', ?, 0, 0, '', 0, 'default', NULL, 8, ?),
              (?, ?, 'numbered', ?, 0, 0, '', 0, 'default', NULL, 9, ?),
              (?, ?, 'numbered', ?, 0, 0, '', 0, 'default', NULL, 10, ?),
              (?, ?, 'toggle', ?, 0, 1, ?, 0, 'default', NULL, 11, ?);`,
      createId(),
      journalId,
      'Шаблон дневной заметки: дублируйте эту страницу через «⋯ → Дублировать» в сайдбаре, чтобы быстро вести записи по дням.',
      now,
      createId(),
      journalId,
      'Главное на сегодня',
      now,
      createId(),
      journalId,
      'Проверить обновлённый редактор заметок и потаскать блоки',
      now,
      createId(),
      journalId,
      'Выучить 5 новых слов и разобрать 2 предложения',
      now,
      createId(),
      journalId,
      'Поток мыслей',
      now,
      createId(),
      journalId,
      'Удобно, когда заметки, задачи и канбан живут в одном локальном приложении без лишнего мусора.',
      now,
      createId(),
      journalId,
      'Нажмите Enter в середине строки или Tab для вложенного пункта — всё работает как в Notion.',
      now,
      createId(),
      journalId,
      now,
      createId(),
      journalId,
      'Вечерняя рефлексия',
      now,
      createId(),
      journalId,
      'Что сегодня получилось лучше всего?',
      now,
      createId(),
      journalId,
      'Что можно упростить завтра?',
      now,
      createId(),
      journalId,
      'Наброски на завтра',
      'Подумать, какие новые личные модули добавить следующими (трекер привычек, финансы или календарь).',
      now,
    );

    // 5. Blocks for "Технические заметки" (Full-width example)
    await db.runAsync(
      `INSERT INTO note_blocks
         (id, page_id, type, content, checked, collapsed, toggle_body, indent_level, block_color, linked_page_id, position, updated_at)
       VALUES (?, ?, 'callout', ?, 0, 0, '', 0, 'green', NULL, 0, ?),
              (?, ?, 'h2', ?, 0, 0, '', 0, 'default', NULL, 1, ?),
              (?, ?, 'code', ?, 0, 0, '', 0, 'default', NULL, 2, ?),
              (?, ?, 'h2', ?, 0, 0, '', 0, 'default', NULL, 3, ?),
              (?, ?, 'callout', ?, 0, 0, '', 0, 'red', NULL, 4, ?),
              (?, ?, 'code', ?, 0, 0, '', 0, 'default', NULL, 5, ?);`,
      createId(),
      techId,
      'Эта страница открыта в режиме «Во всю ширину» (переключается в правом верхнем меню ⋯) — удобно для кода и длинных заметок.',
      now,
      createId(),
      techId,
      'Команды запуска проекта',
      now,
      createId(),
      techId,
      'npm run web\n./scripts/android.sh go\n./scripts/android.sh device\n./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint .',
      now,
      createId(),
      techId,
      'Памятка по SQLite на Web',
      now,
      createId(),
      techId,
      'На Web локальная SQLite (WASM / OPFS) требует безопасный контекст (localhost или HTTPS) и заголовки COOP/COEP — они уже настроены в metro.config.js и app.json.',
      now,
      createId(),
      techId,
      '-- Проверка текущей версии схемы миграций\nPRAGMA user_version;\nSELECT name FROM sqlite_master WHERE type = \'table\';',
      now,
    );

    await db.runAsync(
      `INSERT INTO app_meta (key, value, updated_at)
       VALUES (?, '1', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
      metaKey,
      now,
    );
  });

  await ensureDiaryDemoPage(db, userId);
  return listNotePages(db, userId);
}

async function ensureDiaryDemoPage(db: SQLiteDatabase, userId: string): Promise<void> {
  const diaryMetaKey = `notes_diary_demo_v1_${userId}`;
  const alreadySeeded = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_meta WHERE key = ?;',
    diaryMetaKey,
  );
  if (alreadySeeded) {
    return;
  }

  const now = nowIso();
  const maxRootRow = await db.getFirstAsync<{ max_pos: number | null }>(
    'SELECT MAX(position) AS max_pos FROM note_pages WHERE user_id = ? AND parent_id IS NULL;',
    userId,
  );
  const nextPos = (maxRootRow?.max_pos ?? -1) + 1;
  const diaryId = createId();

  const entries: readonly { heading: string; body: string }[] = [
    {
      heading: '23 ноября — тихий вечер и перезагрузка',
      body: 'Сегодня наконец-то получилось выдохнуть и не хвататься за десять задач одновременно. Утром долго пил кофе у окна, разобрал накопившиеся мелочи и поймал себя на мысли, что половина тревоги исчезает просто в тот момент, когда ты садишься и честно выписываешь всё на экран. Вечером прошёлся пешком без наушников — удивительно, сколько нормальных идей приходит в голову, когда не забиваешь каждый свободный промежуток лентой и уведомлениями.',
    },
    {
      heading: '24 ноября — про личные инструменты и порядок',
      body: 'Весь день возился со своей системой и вдруг чётко понял, почему чужие комбайны рано или поздно начинают раздражать: там всегда слишком много лишних кнопок, вкладок и навязанных сценариев, которыми я не пользуюсь. Когда собираешь пространство под себя с нуля, каждая деталь ощущается лёгкой и понятной. Хочется сохранить этот минимализм и дальше — добавлять только то, что реально экономит время и делает голову чище, а не превращать проект в перегруженный музей фич.',
    },
    {
      heading: '25 ноября — разговор, который заставил задуматься',
      body: 'Днём неожиданно долго проговорили со старым знакомым про ритм жизни и про то, как быстро пролетают месяцы, если не фиксировать, что вообще происходит. Мы часто помним крупные события, но совершенно стираем из памяти обычные дни, из которых на самом деле и складывается жизнь. После этого разговора ещё сильнее захотелось вести короткие, но честные записи хотя бы пару раз в неделю — без попытки писать красиво, просто чтобы через год можно было открыть и увидеть, о чём я тогда думал и что меня волновало.',
    },
    {
      heading: '26 ноября — фокус вместо суеты',
      body: 'Попробовал сегодня работать короткими спокойными блоками без переключения между мессенджерами каждые пять минут, и разница оказалась колоссальной. То, что обычно растягивалось на полдня с ощущением постоянной усталости, закрылось за пару часов, а к вечеру даже остались силы на чтение и нормальный отдых. Забавно, что мы почти всегда ищем сложные методики продуктивности, хотя на практике 80% результата даёт элементарное умение убрать телефон экраном вниз и не дёргаться на каждый звук.',
    },
    {
      heading: '27 ноября — про языки и маленькие шаги',
      body: 'Вечером снова поймал желание системно подтянуть язык, но не через скучные учебники, которые бросаешь через неделю, а через живые слова и реальные предложения из видео, статей и переписок. Когда встречаешь интересное выражение, сразу разбираешь его на части, понимаешь логику правила и сохраняешь к себе в личный словарь — оно запоминается в разы естественнее. Главное не пытаться выучить пятьдесят слов за один вечер, а спокойно возвращаться к этому каждый день минут на пятнадцать.',
    },
    {
      heading: '28 ноября — итоги недели и настрой дальше',
      body: 'Если оглянуться на эту неделю целиком, она получилась неожиданно плотной и продуктивной, причём без привычного ощущения выгорания к пятнице. Многое сдвинулось с мёртвой точки именно потому, что я перестал ждать идеального момента и начал двигаться по шагам — сначала база, потом доска, задачи, заметки, а дальше уже всё остальное. На выходные хочется просто хорошо выспаться, сходить куда-нибудь погулять, не торопиться и с чистой головой войти в новую неделю.',
    },
  ];

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO note_pages
         (id, user_id, parent_id, title, icon, is_favorite, cover_color, full_width, position, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, 1, NULL, 0, ?, ?, ?);`,
      diaryId,
      userId,
      'Личный дневник',
      '📓',
      nextPos,
      now,
      now,
    );

    let position = 0;
    for (const entry of entries) {
      await db.runAsync(
        `INSERT INTO note_blocks
           (id, page_id, type, content, checked, collapsed, toggle_body, indent_level, block_color, linked_page_id, position, updated_at)
         VALUES (?, ?, 'h4', ?, 0, 0, '', 0, 'default', NULL, ?, ?),
                (?, ?, 'paragraph', ?, 0, 0, '', 0, 'default', NULL, ?, ?);`,
        createId(),
        diaryId,
        entry.heading,
        position,
        now,
        createId(),
        diaryId,
        entry.body,
        position + 1,
        now,
      );
      position += 2;
    }

    await db.runAsync(
      `INSERT INTO app_meta (key, value, updated_at)
       VALUES (?, '1', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
      diaryMetaKey,
      now,
    );
  });
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
  input?: {
    parentId?: string | null;
    title?: string;
    icon?: string;
    coverColor?: PageCoverKey | null;
  },
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
  const coverColor = input?.coverColor ?? null;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO note_pages
         (id, user_id, parent_id, title, icon, is_favorite, cover_color, full_width, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?);`,
      id,
      userId,
      parentId,
      title,
      icon,
      coverColor,
      position,
      now,
      now,
    );

    await db.runAsync(
      `INSERT INTO note_blocks
         (id, page_id, type, content, checked, collapsed, toggle_body, indent_level, block_color, linked_page_id, position, updated_at)
       VALUES (?, ?, 'paragraph', '', 0, 0, '', 0, 'default', NULL, 0, ?);`,
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
    coverColor,
    fullWidth: false,
    position,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateNotePage(
  db: SQLiteDatabase,
  pageId: string,
  patch: {
    title?: string;
    icon?: string;
    isFavorite?: boolean;
    coverColor?: PageCoverKey | null;
    fullWidth?: boolean;
  },
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
     SET title = ?, icon = ?, is_favorite = ?, cover_color = ?, full_width = ?, updated_at = ?
     WHERE id = ?;`,
    patch.title !== undefined ? patch.title : existing.title,
    patch.icon !== undefined ? patch.icon : existing.icon,
    patch.isFavorite !== undefined ? (patch.isFavorite ? 1 : 0) : existing.is_favorite,
    patch.coverColor !== undefined ? patch.coverColor : existing.cover_color,
    patch.fullWidth !== undefined ? (patch.fullWidth ? 1 : 0) : existing.full_width,
    nowIso(),
    pageId,
  );
}

export async function duplicateNotePage(
  db: SQLiteDatabase,
  userId: string,
  sourcePageId: string,
): Promise<NotePageRecord | null> {
  const source = await db.getFirstAsync<PageRow>(
    'SELECT * FROM note_pages WHERE id = ? AND user_id = ?;',
    sourcePageId,
    userId,
  );
  if (!source) {
    return null;
  }

  const blocks = await loadPageBlocks(db, sourcePageId);
  const copyTitle = source.title.trim() ? `${source.title.trim()} (копия)` : 'Копия страницы';
  const created = await createNotePage(db, userId, {
    parentId: source.parent_id,
    title: copyTitle,
    icon: source.icon,
    coverColor: normalizeCover(source.cover_color),
  });

  if (source.full_width === 1) {
    await updateNotePage(db, created.id, { fullWidth: true });
  }

  const now = nowIso();
  const clonedBlocks: NoteBlockRecord[] = blocks
    .filter((b) => b.type !== 'page')
    .map((block, index) => ({
      ...block,
      id: createId(),
      pageId: created.id,
      linkedPageId: null,
      position: index,
      updatedAt: now,
    }));

  if (clonedBlocks.length > 0) {
    await savePageBlocks(db, created.id, clonedBlocks);
  }

  return {
    ...created,
    fullWidth: source.full_width === 1,
  };
}

export async function moveNotePage(
  db: SQLiteDatabase,
  userId: string,
  pageId: string,
  targetParentId: string | null,
  targetIndex?: number,
): Promise<boolean> {
  if (pageId === targetParentId) {
    return false;
  }

  const allPages = await listNotePages(db, userId);
  const byId = new Map(allPages.map((p) => [p.id, p]));
  const moving = byId.get(pageId);
  if (!moving) {
    return false;
  }

  // Prevent cycles: targetParentId cannot be a descendant of pageId.
  let cursor = targetParentId;
  while (cursor) {
    if (cursor === pageId) {
      return false;
    }
    cursor = byId.get(cursor)?.parentId ?? null;
  }

  const siblings = allPages
    .filter((p) => p.parentId === targetParentId && p.id !== pageId)
    .sort((a, b) => a.position - b.position);

  const insertAt =
    targetIndex === undefined
      ? siblings.length
      : Math.max(0, Math.min(targetIndex, siblings.length));
  siblings.splice(insertAt, 0, moving);

  const now = nowIso();
  await db.withTransactionAsync(async () => {
    for (let idx = 0; idx < siblings.length; idx += 1) {
      const item = siblings[idx];
      if (item.id === pageId) {
        await db.runAsync(
          'UPDATE note_pages SET parent_id = ?, position = ?, updated_at = ? WHERE id = ?;',
          targetParentId,
          idx,
          now,
          item.id,
        );
      } else {
        await db.runAsync('UPDATE note_pages SET position = ? WHERE id = ?;', idx, item.id);
      }
    }

    if (moving.parentId !== targetParentId) {
      const oldSiblings = allPages
        .filter((p) => p.parentId === moving.parentId && p.id !== pageId)
        .sort((a, b) => a.position - b.position);
      for (let idx = 0; idx < oldSiblings.length; idx += 1) {
        await db.runAsync(
          'UPDATE note_pages SET position = ? WHERE id = ?;',
          idx,
          oldSiblings[idx].id,
        );
      }
    }
  });

  return true;
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

  const now = nowIso();
  const id = createId();
  await db.runAsync(
    `INSERT INTO note_blocks
       (id, page_id, type, content, checked, collapsed, toggle_body, indent_level, block_color, linked_page_id, position, updated_at)
     VALUES (?, ?, 'paragraph', '', 0, 0, '', 0, 'default', NULL, 0, ?);`,
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
      indentLevel: 0,
      blockColor: 'default',
      linkedPageId: null,
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
           (id, page_id, type, content, checked, collapsed, toggle_body, indent_level, block_color, linked_page_id, position, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        block.id,
        pageId,
        block.type,
        block.content,
        block.checked ? 1 : 0,
        block.collapsed ? 1 : 0,
        block.toggleBody,
        Math.max(0, Math.min(MAX_INDENT_LEVEL, block.indentLevel)),
        block.blockColor ?? 'default',
        block.linkedPageId ?? null,
        index,
        now,
      );
    }

    await db.runAsync('UPDATE note_pages SET updated_at = ? WHERE id = ?;', now, pageId);
  });
}
