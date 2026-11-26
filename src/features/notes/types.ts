export type NoteBlockType =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bullet'
  | 'numbered'
  | 'todo'
  | 'quote'
  | 'callout'
  | 'code'
  | 'toggle'
  | 'divider';

export type NotePageRecord = {
  id: string;
  userId: string;
  parentId: string | null;
  title: string;
  icon: string;
  isFavorite: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type NoteBlockRecord = {
  id: string;
  pageId: string;
  type: NoteBlockType;
  content: string;
  checked: boolean;
  collapsed: boolean;
  toggleBody: string;
  position: number;
  updatedAt: string;
};

export type BlockTypeMeta = {
  type: NoteBlockType;
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
  shortcut?: string;
  keywords: string[];
};

export const BLOCK_TYPE_CATALOG: readonly BlockTypeMeta[] = [
  {
    type: 'paragraph',
    label: 'Текст',
    shortLabel: 'T',
    description: 'Обычный абзац текста',
    icon: '¶',
    keywords: ['text', 'paragraph', 'текст', 'абзац', 'p'],
  },
  {
    type: 'h1',
    label: 'Заголовок 1',
    shortLabel: 'H1',
    description: 'Крупный заголовок раздела',
    icon: 'H1',
    shortcut: '#',
    keywords: ['h1', 'heading', 'title', 'заголовок', '1'],
  },
  {
    type: 'h2',
    label: 'Заголовок 2',
    shortLabel: 'H2',
    description: 'Средний подзаголовок',
    icon: 'H2',
    shortcut: '##',
    keywords: ['h2', 'heading', 'subtitle', 'заголовок', '2'],
  },
  {
    type: 'h3',
    label: 'Заголовок 3',
    shortLabel: 'H3',
    description: 'Малый подзаголовок',
    icon: 'H3',
    shortcut: '###',
    keywords: ['h3', 'heading', 'заголовок', '3'],
  },
  {
    type: 'bullet',
    label: 'Маркированный список',
    shortLabel: '•',
    description: 'Простой список с точками',
    icon: '•',
    shortcut: '-',
    keywords: ['bullet', 'list', 'ul', 'список', 'маркер'],
  },
  {
    type: 'numbered',
    label: 'Нумерованный список',
    shortLabel: '1.',
    description: 'Список с автонумерацией',
    icon: '1.',
    shortcut: '1.',
    keywords: ['numbered', 'ordered', 'ol', 'список', 'нумер'],
  },
  {
    type: 'todo',
    label: 'Чек-лист',
    shortLabel: '☑',
    description: 'Пункт с галочкой',
    icon: '☑',
    shortcut: '[]',
    keywords: ['todo', 'check', 'task', 'чек', 'галочка', 'задача'],
  },
  {
    type: 'toggle',
    label: 'Раскрывающийся блок',
    shortLabel: '▸',
    description: 'Сворачиваемые детали внутри',
    icon: '▸',
    keywords: ['toggle', 'collapse', 'спойлер', 'раскрыв', 'скрыт'],
  },
  {
    type: 'quote',
    label: 'Цитата',
    shortLabel: '❝',
    description: 'Выделенная мысль или цитата',
    icon: '❝',
    shortcut: '>',
    keywords: ['quote', 'цитата', 'мысль'],
  },
  {
    type: 'callout',
    label: 'Выноска',
    shortLabel: '💡',
    description: 'Заметный акцентный блок',
    icon: '💡',
    keywords: ['callout', 'note', 'info', 'выноска', 'важно'],
  },
  {
    type: 'code',
    label: 'Код',
    shortLabel: '</>',
    description: 'Моноширинный фрагмент кода',
    icon: '</>',
    shortcut: '```',
    keywords: ['code', 'snippet', 'код'],
  },
  {
    type: 'divider',
    label: 'Разделитель',
    shortLabel: '—',
    description: 'Горизонтальная линия',
    icon: '—',
    shortcut: '---',
    keywords: ['divider', 'hr', 'line', 'линия', 'разделитель'],
  },
] as const;

export const PAGE_ICONS = [
  '📄',
  '📝',
  '💡',
  '🧠',
  '📌',
  '✅',
  '🗂',
  '🔖',
  '🧭',
  '🛠',
  '⚡',
  '🎯',
  '📚',
  '🌿',
  '☕',
  '🔥',
] as const;

export function detectMarkdownShortcut(
  rawText: string,
): { type: NoteBlockType; rest: string } | null {
  if (rawText === '---') {
    return { type: 'divider', rest: '' };
  }
  if (rawText === '```') {
    return { type: 'code', rest: '' };
  }
  if (rawText.startsWith('### ')) {
    return { type: 'h3', rest: rawText.slice(4) };
  }
  if (rawText.startsWith('## ')) {
    return { type: 'h2', rest: rawText.slice(3) };
  }
  if (rawText.startsWith('# ')) {
    return { type: 'h1', rest: rawText.slice(2) };
  }
  if (rawText.startsWith('- ') || rawText.startsWith('* ')) {
    return { type: 'bullet', rest: rawText.slice(2) };
  }
  if (rawText.startsWith('1. ')) {
    return { type: 'numbered', rest: rawText.slice(3) };
  }
  if (rawText.startsWith('[] ')) {
    return { type: 'todo', rest: rawText.slice(3) };
  }
  if (rawText.startsWith('[ ] ')) {
    return { type: 'todo', rest: rawText.slice(4) };
  }
  if (rawText.startsWith('> ')) {
    return { type: 'quote', rest: rawText.slice(2) };
  }
  return null;
}
