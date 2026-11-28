import type { IconName } from '@/components/app-icon';

export type NoteBlockType =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'bullet'
  | 'numbered'
  | 'todo'
  | 'quote'
  | 'callout'
  | 'code'
  | 'toggle'
  | 'divider'
  | 'page';

export type NoteBlockColor =
  | 'default'
  | 'gray'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'red'
  | 'purple';

export type PageCoverKey =
  | 'slate'
  | 'ocean'
  | 'forest'
  | 'amber'
  | 'berry'
  | 'violet';

export type NotePageRecord = {
  id: string;
  userId: string;
  parentId: string | null;
  title: string;
  icon: string;
  isFavorite: boolean;
  coverColor: PageCoverKey | null;
  fullWidth: boolean;
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
  indentLevel: number;
  blockColor: NoteBlockColor;
  linkedPageId: string | null;
  position: number;
  updatedAt: string;
};

export type BlockTypeMeta = {
  type: NoteBlockType;
  group: 'basic' | 'accent';
  label: string;
  shortLabel: string;
  description: string;
  icon: IconName;
  shortcut?: string;
  keywords: string[];
};

export const MAX_INDENT_LEVEL = 4;

export const BLOCK_TYPE_CATALOG: readonly BlockTypeMeta[] = [
  {
    type: 'paragraph',
    group: 'basic',
    label: 'Текст',
    shortLabel: 'T',
    description: 'Обычный абзац текста',
    icon: 'text',
    keywords: ['text', 'paragraph', 'текст', 'абзац', 'p'],
  },
  {
    type: 'h1',
    group: 'basic',
    label: 'Заголовок 1',
    shortLabel: 'H1',
    description: 'Крупный заголовок раздела',
    icon: 'h1',
    shortcut: '#',
    keywords: ['h1', 'heading', 'title', 'заголовок', '1'],
  },
  {
    type: 'h2',
    group: 'basic',
    label: 'Заголовок 2',
    shortLabel: 'H2',
    description: 'Средний подзаголовок',
    icon: 'h2',
    shortcut: '##',
    keywords: ['h2', 'heading', 'subtitle', 'заголовок', '2'],
  },
  {
    type: 'h3',
    group: 'basic',
    label: 'Заголовок 3',
    shortLabel: 'H3',
    description: 'Малый подзаголовок',
    icon: 'h3',
    shortcut: '###',
    keywords: ['h3', 'heading', 'заголовок', '3'],
  },
  {
    type: 'h4',
    group: 'basic',
    label: 'Заголовок 4',
    shortLabel: 'H4',
    description: 'Компактный заголовок записи или даты',
    icon: 'h4',
    shortcut: '####',
    keywords: ['h4', 'heading', 'заголовок', '4', 'дата', 'дневник'],
  },
  {
    type: 'page',
    group: 'basic',
    label: 'Страница',
    shortLabel: 'Стр.',
    description: 'Создать вложенную страницу прямо здесь',
    icon: 'filePlus',
    shortcut: '/page',
    keywords: ['page', 'subpage', 'страница', 'подстраница', 'документ'],
  },
  {
    type: 'todo',
    group: 'basic',
    label: 'Чек-лист',
    shortLabel: 'Чек',
    description: 'Пункт с галочкой',
    icon: 'todos',
    shortcut: '[]',
    keywords: ['todo', 'check', 'task', 'чек', 'галочка', 'задача'],
  },
  {
    type: 'bullet',
    group: 'basic',
    label: 'Маркированный список',
    shortLabel: 'Список',
    description: 'Простой список с точками',
    icon: 'list',
    shortcut: '-',
    keywords: ['bullet', 'list', 'ul', 'список', 'маркер'],
  },
  {
    type: 'numbered',
    group: 'basic',
    label: 'Нумерованный список',
    shortLabel: '1.2.',
    description: 'Список с автонумерацией',
    icon: 'listOrdered',
    shortcut: '1.',
    keywords: ['numbered', 'ordered', 'ol', 'список', 'нумер'],
  },
  {
    type: 'toggle',
    group: 'basic',
    label: 'Раскрывающийся блок',
    shortLabel: 'Toggle',
    description: 'Сворачиваемые детали внутри',
    icon: 'chevronRight',
    keywords: ['toggle', 'collapse', 'спойлер', 'раскрыв', 'скрыт'],
  },
  {
    type: 'quote',
    group: 'accent',
    label: 'Цитата',
    shortLabel: 'Цитата',
    description: 'Выделенная мысль или цитата',
    icon: 'quote',
    shortcut: '>',
    keywords: ['quote', 'цитата', 'мысль'],
  },
  {
    type: 'callout',
    group: 'accent',
    label: 'Выноска',
    shortLabel: 'Выноска',
    description: 'Заметный акцентный блок',
    icon: 'callout',
    keywords: ['callout', 'note', 'info', 'выноска', 'важно'],
  },
  {
    type: 'code',
    group: 'accent',
    label: 'Код',
    shortLabel: 'Код',
    description: 'Моноширинный фрагмент кода',
    icon: 'code',
    shortcut: '```',
    keywords: ['code', 'snippet', 'код'],
  },
  {
    type: 'divider',
    group: 'accent',
    label: 'Разделитель',
    shortLabel: 'Линия',
    description: 'Горизонтальная линия',
    icon: 'divider',
    shortcut: '---',
    keywords: ['divider', 'hr', 'line', 'линия', 'разделитель'],
  },
] as const;

export function getBlockTypeIcon(type: NoteBlockType): IconName {
  return BLOCK_TYPE_CATALOG.find((item) => item.type === type)?.icon ?? 'text';
}

export const TURN_INTO_TYPES: readonly NoteBlockType[] = [
  'paragraph',
  'h1',
  'h2',
  'h3',
  'h4',
  'bullet',
  'numbered',
  'todo',
  'toggle',
  'quote',
  'callout',
  'code',
] as const;

export const BLOCK_COLORS: Record<
  NoteBlockColor,
  { label: string; dot: string; lightBg: string; darkBg: string }
> = {
  default: {
    label: 'Без цвета',
    dot: '#7B818C',
    lightBg: 'transparent',
    darkBg: 'transparent',
  },
  gray: {
    label: 'Серый',
    dot: '#9AA0A8',
    lightBg: 'rgba(123, 129, 140, 0.11)',
    darkBg: 'rgba(154, 160, 168, 0.12)',
  },
  blue: {
    label: 'Синий',
    dot: '#3B82F6',
    lightBg: 'rgba(59, 130, 246, 0.11)',
    darkBg: 'rgba(59, 130, 246, 0.16)',
  },
  green: {
    label: 'Зелёный',
    dot: '#22A06B',
    lightBg: 'rgba(34, 160, 107, 0.11)',
    darkBg: 'rgba(76, 195, 138, 0.14)',
  },
  yellow: {
    label: 'Жёлтый',
    dot: '#D99B26',
    lightBg: 'rgba(217, 155, 38, 0.13)',
    darkBg: 'rgba(230, 162, 60, 0.15)',
  },
  red: {
    label: 'Красный',
    dot: '#E05246',
    lightBg: 'rgba(224, 82, 70, 0.11)',
    darkBg: 'rgba(240, 106, 96, 0.15)',
  },
  purple: {
    label: 'Фиолетовый',
    dot: '#8B5CF6',
    lightBg: 'rgba(139, 92, 246, 0.11)',
    darkBg: 'rgba(139, 92, 246, 0.17)',
  },
};

export const PAGE_COVERS: Record<
  PageCoverKey,
  { label: string; light: string; dark: string; accent: string }
> = {
  slate: { label: 'Графит', light: '#DDE2EA', dark: '#23262E', accent: '#6B7280' },
  ocean: { label: 'Океан', light: '#CFE3FA', dark: '#17283D', accent: '#3B82F6' },
  forest: { label: 'Лес', light: '#CBEAD9', dark: '#162D23', accent: '#22A06B' },
  amber: { label: 'Песок', light: '#F5E2BE', dark: '#342715', accent: '#D99B26' },
  berry: { label: 'Рубин', light: '#F6D3D1', dark: '#361B1D', accent: '#E05246' },
  violet: { label: 'Индиго', light: '#DFD6FA', dark: '#261D3B', accent: '#8B5CF6' },
};

export const PAGE_ICONS: readonly IconName[] = [
  'notes',
  'edit',
  'callout',
  'brain',
  'pin',
  'todos',
  'folder',
  'bookmark',
  'compass',
  'wrench',
  'zap',
  'target',
  'bookOpen',
  'leaf',
  'coffee',
  'flame',
  'rocket',
  'sparkles',
] as const;

const LEGACY_EMOJI_TO_ICON: Record<string, IconName> = {
  '📄': 'notes',
  '📝': 'edit',
  '💡': 'callout',
  '🧠': 'brain',
  '📌': 'pin',
  '✅': 'todos',
  '🗂': 'folder',
  '🗂️': 'folder',
  '📁': 'folder',
  '🔖': 'bookmark',
  '🧭': 'compass',
  '🛠': 'wrench',
  '🛠️': 'wrench',
  '⚡': 'zap',
  '🎯': 'target',
  '📚': 'bookOpen',
  '🌿': 'leaf',
  '☕': 'coffee',
  '🔥': 'flame',
  '🚀': 'rocket',
  '✨': 'sparkles',
  '⭐': 'star',
  '📋': 'todos',
};

const VALID_PAGE_ICON_SET = new Set<string>(PAGE_ICONS);

export function resolveNotePageIcon(raw: string | null | undefined): IconName {
  if (!raw) {
    return 'notes';
  }
  if (VALID_PAGE_ICON_SET.has(raw)) {
    return raw as IconName;
  }
  return LEGACY_EMOJI_TO_ICON[raw] ?? 'notes';
}

export const NOTION_DROP_BLUE = '#2383E2';

export function detectMarkdownShortcut(
  rawText: string,
): { type: NoteBlockType; rest: string } | null {
  if (rawText === '---') {
    return { type: 'divider', rest: '' };
  }
  if (rawText === '```') {
    return { type: 'code', rest: '' };
  }
  if (rawText.startsWith('#### ')) {
    return { type: 'h4', rest: rawText.slice(5) };
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
