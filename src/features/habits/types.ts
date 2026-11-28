import type { IconName } from '@/components/app-icon';
import { toDateKey } from '@/features/kanban/types';

export type HabitRecord = {
  id: string;
  userId: string;
  title: string;
  color: string;
  icon: IconName;
  targetPerWeek: number;
  position: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type HabitWithStats = HabitRecord & {
  completedDates: Set<string>;
  currentStreak: number;
  bestStreak: number;
  completedToday: boolean;
};

export type HabitLogEntry = {
  id: string;
  habitId: string;
  dateKey: string;
  createdAt: string;
};

export type HabitsSnapshot = {
  habits: HabitRecord[];
  logs: HabitLogEntry[];
};

export const HABIT_COLORS = [
  '#3B82F6',
  '#34C759',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
] as const;

export const HABIT_ICONS: readonly IconName[] = [
  'flame',
  'checkCircle',
  'star',
  'sun',
  'study',
  'language',
  'timer',
  'sparkles',
];

const SHORT_WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] as const;
const SHORT_MONTHS = [
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

export type HabitDayColumn = {
  dateKey: string;
  dayNum: number;
  weekdayLabel: string;
  isToday: boolean;
  isFuture: boolean;
};

export function buildHabitDays(daysCount: 7 | 14, weekOffset: number): {
  days: HabitDayColumn[];
  rangeLabel: string;
} {
  const today = new Date();
  const todayKey = toDateKey(today);

  // Align 7-day view to Monday..Sunday of target week; 14-day view to 2 full weeks ending Sunday
  const jsDay = today.getDay(); // 0=Sun..6=Sat
  const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay;
  const currentMonday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diffToMonday);
  const start = new Date(currentMonday);
  start.setDate(currentMonday.getDate() + weekOffset * 7 - (daysCount === 14 ? 7 : 0));

  const days: HabitDayColumn[] = [];
  for (let i = 0; i < daysCount; i += 1) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = toDateKey(d);
    days.push({
      dateKey: key,
      dayNum: d.getDate(),
      weekdayLabel: SHORT_WEEKDAYS[d.getDay()],
      isToday: key === todayKey,
      isFuture: key > todayKey,
    });
  }

  const first = new Date(start);
  const last = new Date(start.getFullYear(), start.getMonth(), start.getDate() + daysCount - 1);
  const rangeLabel =
    first.getMonth() === last.getMonth()
      ? `${first.getDate()}–${last.getDate()} ${SHORT_MONTHS[last.getMonth()]}`
      : `${first.getDate()} ${SHORT_MONTHS[first.getMonth()]} – ${last.getDate()} ${SHORT_MONTHS[last.getMonth()]}`;

  return { days, rangeLabel };
}
