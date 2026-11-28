export type FocusMode = 'focus' | 'short_break' | 'long_break';

export type FocusLinkTarget = {
  type: 'todo' | 'kanban_card';
  id: string;
  title: string;
  subtitle: string;
};

export type FocusSessionRecord = {
  id: string;
  userId: string;
  mode: FocusMode;
  durationSeconds: number;
  elapsedSeconds: number;
  completed: boolean;
  linkedType: 'todo' | 'kanban_card' | null;
  linkedId: string | null;
  linkedTitle: string;
  startedAt: string;
  endedAt: string;
};

export type FocusSettings = {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  dailyGoalMinutes: number;
  soundEnabled: boolean;
  autoStartBreaks: boolean;
};

export const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  dailyGoalMinutes: 100,
  soundEnabled: true,
  autoStartBreaks: false,
};

export type FocusDisciplineState = 'flow' | 'sharp' | 'steady' | 'drifting' | 'broken';

export type FocusStateMeta = {
  state: FocusDisciplineState;
  label: string;
  shortLabel: string;
  emoji: string;
  xpMultiplier: number;
  tone: 'success' | 'accent' | 'neutral' | 'warning' | 'danger';
  description: string;
};

export const FOCUS_STATE_META: Record<FocusDisciplineState, FocusStateMeta> = {
  flow: {
    state: 'flow',
    label: 'В потоке',
    shortLabel: 'Поток',
    emoji: '🔥',
    xpMultiplier: 1.5,
    tone: 'success',
    description: 'Отличный ритм без срывов — прогресс идёт максимально быстро.',
  },
  sharp: {
    state: 'sharp',
    label: 'Собранность',
    shortLabel: 'Собран',
    emoji: '⚡',
    xpMultiplier: 1.25,
    tone: 'accent',
    description: 'Уверенная серия завершённых сессий — прогресс ускорен.',
  },
  steady: {
    state: 'steady',
    label: 'Стабильность',
    shortLabel: 'Норма',
    emoji: '●',
    xpMultiplier: 1.0,
    tone: 'neutral',
    description: 'Ровный темп. Завершай сессии подряд, чтобы войти в Поток.',
  },
  drifting: {
    state: 'drifting',
    label: 'Рассеянность',
    shortLabel: 'Спад',
    emoji: '⚠',
    xpMultiplier: 0.75,
    tone: 'warning',
    description: 'Много прерванных сессий или простой — прогресс замедлился.',
  },
  broken: {
    state: 'broken',
    label: 'Срыв фокуса',
    shortLabel: 'Срыв',
    emoji: '🔻',
    xpMultiplier: 0.5,
    tone: 'danger',
    description: 'Серия брошенных сессий сбила ритм. Закрой пару полных сессий подряд.',
  },
};

export type FocusRank = {
  level: number;
  title: string;
  minXp: number;
};

export const FOCUS_RANKS: readonly FocusRank[] = [
  { level: 1, title: 'Наблюдатель', minXp: 0 },
  { level: 2, title: 'Практик', minXp: 150 },
  { level: 3, title: 'Собранный', minXp: 450 },
  { level: 4, title: 'Мастер потока', minXp: 1000 },
  { level: 5, title: 'Архитектор времени', minXp: 2000 },
  { level: 6, title: 'Монах глубокой работы', minXp: 3800 },
];

export type FocusBadge = {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  tone: 'success' | 'warning' | 'accent';
};

export type FocusDailyBucket = {
  dateKey: string;
  label: string;
  shortDate: string;
  completedMinutes: number;
  abandonedMinutes: number;
  completedSessions: number;
  abandonedSessions: number;
  goalReached: boolean;
};

export type FocusHourBucket = {
  key: 'morning' | 'afternoon' | 'evening' | 'night';
  label: string;
  range: string;
  minutes: number;
  sessions: number;
};

export type FocusTaskBreakdown = {
  key: string;
  title: string;
  type: 'todo' | 'kanban_card' | null;
  minutes: number;
  sessions: number;
};

export type FocusTrendPoint = {
  index: number;
  score: number;
  completed: boolean;
  dateKey: string;
};

export type FocusAnalytics = {
  disciplineScore: number;
  state: FocusDisciplineState;
  stateMeta: FocusStateMeta;
  xpMultiplier: number;
  totalXp: number;
  rank: FocusRank;
  nextRank: FocusRank | null;
  rankProgress: number;
  currentCombo: number;
  bestCombo: number;
  consecutiveAbandons: number;
  recoverySessionsNeeded: number;
  idleDecayDays: number;
  currentDayStreak: number;
  bestDayStreak: number;
  todayCompletedMinutes: number;
  todayCompletedSessions: number;
  todayAbandonedSessions: number;
  weekCompletedMinutes: number;
  weekCompletedSessions: number;
  weekAbandonedSessions: number;
  totalCompletedSessions: number;
  totalAbandonedSessions: number;
  totalCompletedMinutes: number;
  completionRate: number;
  dailyGoalMinutes: number;
  todayGoalProgress: number;
  dailyBuckets: FocusDailyBucket[];
  heatmapDays: FocusDailyBucket[];
  disciplineTrend: FocusTrendPoint[];
  hourBuckets: FocusHourBucket[];
  topTasks: FocusTaskBreakdown[];
  badges: FocusBadge[];
  recentSessions: FocusSessionRecord[];
};

export type FocusStats = {
  todayMinutes: number;
  todaySessions: number;
  todayAbandoned: number;
  weekMinutes: number;
  weekSessions: number;
  recentSessions: FocusSessionRecord[];
};

export const FOCUS_MODE_META: Record<
  FocusMode,
  { label: string; shortLabel: string; defaultMinutes: number }
> = {
  focus: { label: 'Фокус', shortLabel: 'Фокус', defaultMinutes: 25 },
  short_break: { label: 'Короткий перерыв', shortLabel: 'Перерыв', defaultMinutes: 5 },
  long_break: { label: 'Длинный перерыв', shortLabel: 'Отдых', defaultMinutes: 15 },
};

export const FOCUS_DURATION_PRESETS = [15, 25, 45, 50] as const;
export const FOCUS_GOAL_PRESETS = [50, 75, 100, 150, 200] as const;
export const ABANDON_GRACE_SECONDS = 60;

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatDurationCompact(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}м`;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}ч ${m}м` : `${h}ч`;
}
