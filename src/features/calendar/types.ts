import {
  type KanbanBoardData,
  type KanbanCardRecord,
  type KanbanPriority,
  toDateKey,
} from '@/features/kanban/types';
import type { BoardColumnOption } from '@/features/todos/todos-repository';
import type { TodoItemRecord, TodoListRecord } from '@/features/todos/types';

export type CalendarViewMode = 'week' | 'month';
export type CalendarSourceFilter = 'all' | 'todo' | 'kanban';

export type CalendarItem = {
  key: string;
  kind: 'todo' | 'kanban';
  id: string;
  title: string;
  dueDate: string | null;
  priority: KanbanPriority;
  isDone: boolean;
  badgeLabel: string;
  accentColor: string;
  todo?: TodoItemRecord;
  card?: KanbanCardRecord;
  boardId?: string;
};

export type CalendarDataBundle = {
  items: CalendarItem[];
  lists: TodoListRecord[];
  kanbanTargets: BoardColumnOption[];
  boardsById: Record<string, KanbanBoardData>;
};

export type CalendarDayCell = {
  dateKey: string;
  dayNum: number;
  weekdayShort: string;
  isToday: boolean;
  isCurrentMonth: boolean;
  isWeekend: boolean;
};

const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;
const MONTHS_SHORT = [
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
] as const;
const MONTHS_FULL = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
] as const;

export const CALENDAR_WEEKDAYS = WEEKDAYS_SHORT;

export function buildWeekGrid(weekOffset: number): {
  days: CalendarDayCell[];
  title: string;
} {
  const today = new Date();
  const todayKey = toDateKey(today);
  const jsDay = today.getDay();
  const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay;
  const monday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + diffToMonday + weekOffset * 7,
  );

  const days: CalendarDayCell[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const key = toDateKey(d);
    days.push({
      dateKey: key,
      dayNum: d.getDate(),
      weekdayShort: WEEKDAYS_SHORT[i],
      isToday: key === todayKey,
      isCurrentMonth: d.getMonth() === monday.getMonth(),
      isWeekend: i >= 5,
    });
  }

  const end = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const title =
    monday.getMonth() === end.getMonth()
      ? `${monday.getDate()}–${end.getDate()} ${MONTHS_SHORT[end.getMonth()]} ${end.getFullYear()}`
      : `${monday.getDate()} ${MONTHS_SHORT[monday.getMonth()]} – ${end.getDate()} ${MONTHS_SHORT[end.getMonth()]}`;

  return { days, title };
}

export function buildMonthGrid(monthOffset: number): {
  cells: CalendarDayCell[];
  title: string;
} {
  const today = new Date();
  const todayKey = toDateKey(today);
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const year = firstOfMonth.getFullYear();
  const month = firstOfMonth.getMonth();

  const firstJsDay = firstOfMonth.getDay();
  const leadingOffset = firstJsDay === 0 ? 6 : firstJsDay - 1;
  const gridStart = new Date(year, month, 1 - leadingOffset);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = leadingOffset + daysInMonth > 35 ? 42 : 35;

  const cells: CalendarDayCell[] = [];
  for (let i = 0; i < totalCells; i += 1) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const key = toDateKey(d);
    const weekdayIdx = i % 7;
    cells.push({
      dateKey: key,
      dayNum: d.getDate(),
      weekdayShort: WEEKDAYS_SHORT[weekdayIdx],
      isToday: key === todayKey,
      isCurrentMonth: d.getMonth() === month,
      isWeekend: weekdayIdx >= 5,
    });
  }

  return {
    cells,
    title: `${MONTHS_FULL[month]} ${year}`,
  };
}
