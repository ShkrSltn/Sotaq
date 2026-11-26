export type KanbanPriority = 'low' | 'medium' | 'high';

export type KanbanBoardRecord = {
  id: string;
  userId: string | null;
  title: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type KanbanColumnRecord = {
  id: string;
  boardId: string;
  title: string;
  accent: string;
  position: number;
  isDoneColumn: boolean;
  createdAt: string;
};

export type KanbanSubtaskRecord = {
  id: string;
  cardId: string;
  title: string;
  isDone: boolean;
  position: number;
};

export type KanbanCardRecord = {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  description: string;
  priority: KanbanPriority;
  dueDate: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  subtasks: KanbanSubtaskRecord[];
};

export type KanbanBoardData = {
  board: KanbanBoardRecord;
  columns: KanbanColumnRecord[];
  cards: KanbanCardRecord[];
};

export const PRIORITY_META: Record<
  KanbanPriority,
  { label: string; shortLabel: string; dotColor: string }
> = {
  high: { label: 'Высокий', shortLabel: 'Высокий', dotColor: '#D9483B' },
  medium: { label: 'Обычный', shortLabel: 'Обычный', dotColor: '#8B909A' },
  low: { label: 'Низкий', shortLabel: 'Низкий', dotColor: '#2E8B57' },
};

export const COLUMN_ACCENTS = [
  '#6B7280',
  '#3B82F6',
  '#E69F00',
  '#1E8E5A',
  '#8B5CF6',
  '#D9483B',
] as const;

export function formatDueDateLabel(dueDate: string | null): {
  text: string;
  isOverdue: boolean;
  isToday: boolean;
} | null {
  if (!dueDate) {
    return null;
  }

  const today = new Date();
  const todayKey = toDateKey(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowKey = toDateKey(tomorrow);

  if (dueDate === todayKey) {
    return { text: 'Сегодня', isOverdue: false, isToday: true };
  }
  if (dueDate === tomorrowKey) {
    return { text: 'Завтра', isOverdue: false, isToday: false };
  }

  const parts = dueDate.split('-');
  if (parts.length !== 3) {
    return { text: dueDate, isOverdue: false, isToday: false };
  }

  const monthNames = [
    'янв',
    'фев',
    'мар',
    'апр',
    'май',
    'июн',
    'июл',
    'авг',
    'сен',
    'окт',
    'ноя',
    'дек',
  ];
  const monthIdx = Number(parts[1]) - 1;
  const dayNum = Number(parts[2]);
  const text =
    monthIdx >= 0 && monthIdx < 12 && !Number.isNaN(dayNum)
      ? `${dayNum} ${monthNames[monthIdx]}`
      : dueDate;

  return {
    text,
    isOverdue: dueDate < todayKey,
    isToday: false,
  };
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysDateKey(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}
