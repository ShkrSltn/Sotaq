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

export type FocusStats = {
  todayMinutes: number;
  todaySessions: number;
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

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
