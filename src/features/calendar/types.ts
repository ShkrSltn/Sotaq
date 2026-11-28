import {
  type KanbanBoardData,
  type KanbanCardRecord,
  type KanbanPriority,
  toDateKey,
} from '@/features/kanban/types';
import type { BoardColumnOption } from '@/features/todos/todos-repository';
import type { TodoItemRecord, TodoListRecord } from '@/features/todos/types';

export type CalendarViewMode = 'day' | 'week' | 'month';
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
const WEEKDAYS_FULL = [
  'Воскресенье',
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
] as const;
const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const;
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

export function getTodayDateKey(): string {
  return toDateKey(new Date());
}

export function getTomorrowDateKey(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toDateKey(d);
}

export function formatShortDateRu(dateKey: string | null): string {
  if (!dateKey) {
    return '';
  }
  const todayKey = getTodayDateKey();
  const tomorrowKey = getTomorrowDateKey();
  if (dateKey === todayKey) {
    return 'сегодня';
  }
  if (dateKey === tomorrowKey) {
    return 'завтра';
  }
  const parts = dateKey.split('-');
  if (parts.length !== 3) {
    return dateKey;
  }
  const monthIdx = Number(parts[1]) - 1;
  const dayNum = Number(parts[2]);
  if (monthIdx < 0 || monthIdx > 11 || Number.isNaN(dayNum)) {
    return dateKey;
  }
  return `${dayNum} ${MONTHS_SHORT[monthIdx]}`;
}

export function getDayOffsetForDateKey(dateKey: string): number {
  const parts = dateKey.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return 0;
  }
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const targetUtc = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  return Math.round((targetUtc - todayUtc) / 86400000);
}

export function buildDayView(dayOffset: number): {
  day: CalendarDayCell;
  weekStrip: CalendarDayCell[];
  title: string;
  fullHeading: string;
  weekdayFull: string;
} {
  const today = new Date();
  const todayKey = toDateKey(today);
  const target = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + dayOffset,
  );
  const targetKey = toDateKey(target);
  const targetJsDay = target.getDay();
  const targetWeekdayIdx = targetJsDay === 0 ? 6 : targetJsDay - 1;

  const day: CalendarDayCell = {
    dateKey: targetKey,
    dayNum: target.getDate(),
    weekdayShort: WEEKDAYS_SHORT[targetWeekdayIdx],
    isToday: targetKey === todayKey,
    isCurrentMonth: true,
    isWeekend: targetWeekdayIdx >= 5,
  };

  // Build Monday..Sunday strip for the week containing target day
  const diffToMonday = targetJsDay === 0 ? -6 : 1 - targetJsDay;
  const monday = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate() + diffToMonday,
  );
  const weekStrip: CalendarDayCell[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const key = toDateKey(d);
    weekStrip.push({
      dateKey: key,
      dayNum: d.getDate(),
      weekdayShort: WEEKDAYS_SHORT[i],
      isToday: key === todayKey,
      isCurrentMonth: d.getMonth() === target.getMonth(),
      isWeekend: i >= 5,
    });
  }

  const title = `${target.getDate()} ${MONTHS_SHORT[target.getMonth()]} ${target.getFullYear()}`;
  const fullHeading = `${target.getDate()} ${MONTHS_GENITIVE[target.getMonth()]}`;
  const weekdayFull = WEEKDAYS_FULL[targetJsDay];

  return { day, weekStrip, title, fullHeading, weekdayFull };
}

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
