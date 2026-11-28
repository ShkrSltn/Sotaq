import type { IconName } from '@/components/app-icon';

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

export type HabitYearStats = {
  markedDays: number;
  totalDaysInYear: number;
  yearPercent: number;
  currentStreak: number;
  bestStreak: number;
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

export const MONTH_NAMES_RU = [
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
