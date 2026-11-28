import {
  FOCUS_RANKS,
  FOCUS_STATE_META,
  type FocusAnalytics,
  type FocusBadge,
  type FocusDailyBucket,
  type FocusDisciplineState,
  type FocusHourBucket,
  type FocusSessionRecord,
  type FocusTaskBreakdown,
  type FocusTrendPoint,
} from '@/features/focus/types';
import { toDateKey } from '@/features/kanban/types';

const SHORT_WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] as const;

function parseDateKey(dateKey: string): Date | null {
  const parts = dateKey.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return null;
  }
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function shiftDateKey(baseDate: Date, offsetDays: number): string {
  const next = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + offsetDays);
  return toDateKey(next);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function resolveDisciplineState(score: number): FocusDisciplineState {
  if (score >= 85) return 'flow';
  if (score >= 65) return 'sharp';
  if (score >= 45) return 'steady';
  if (score >= 25) return 'drifting';
  return 'broken';
}

function diffCalendarDays(earlierKey: string, laterKey: string): number {
  const a = parseDateKey(earlierKey);
  const b = parseDateKey(laterKey);
  if (!a || !b) {
    return 0;
  }
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / msPerDay));
}

function sessionLocalDateKey(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso.slice(0, 10);
  }
  return toDateKey(parsed);
}

function sessionLocalHour(iso: string): number {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return 12;
  }
  return parsed.getHours();
}

export function computeFocusAnalytics(
  allFocusSessions: FocusSessionRecord[],
  dailyGoalMinutes: number,
  now: Date = new Date(),
): FocusAnalytics {
  const safeGoal = Math.max(15, dailyGoalMinutes);
  const todayKey = toDateKey(now);
  const weekStartKey = shiftDateKey(now, -6);

  // Sort chronologically (oldest -> newest) for deterministic score/XP/combo simulation
  const chronological = [...allFocusSessions].sort((a, b) => a.endedAt.localeCompare(b.endedAt));

  let score = 50; // Neutral baseline for a fresh user
  let currentCombo = 0;
  let bestCombo = 0;
  let consecutiveAbandons = 0;
  let totalXp = 0;
  let totalCompletedSessions = 0;
  let totalAbandonedSessions = 0;
  let totalCompletedSeconds = 0;
  let hasDeepSession = false;

  const trendAll: FocusTrendPoint[] = [];

  for (let i = 0; i < chronological.length; i += 1) {
    const s = chronological[i];
    const dateKey = sessionLocalDateKey(s.endedAt);
    const stateBefore = resolveDisciplineState(score);
    const multiplier = FOCUS_STATE_META[stateBefore].xpMultiplier;

    if (s.completed) {
      totalCompletedSessions += 1;
      totalCompletedSeconds += s.elapsedSeconds;
      const mins = Math.max(1, Math.round(s.elapsedSeconds / 60));
      if (mins >= 45) {
        hasDeepSession = true;
      }

      currentCombo += 1;
      if (currentCombo > bestCombo) {
        bestCombo = currentCombo;
      }
      consecutiveAbandons = 0;

      // Longer sessions grant slightly more discipline recovery (+6 for <=15m, +8 for 25m, +10 for 45m+)
      const gain = mins >= 40 ? 10 : mins >= 20 ? 8 : 6;
      const comboBonus = currentCombo >= 3 ? 2 : 0;
      score = clamp(score + gain + comboBonus, 0, 100);

      // XP scales by minutes and current discipline multiplier
      totalXp += Math.round(mins * 1.4 * multiplier);
    } else {
      totalAbandonedSessions += 1;
      currentCombo = 0;
      consecutiveAbandons += 1;

      // Progressive penalty if abandoning multiple sessions in a row
      const penalty = consecutiveAbandons >= 2 ? 18 : 12;
      score = clamp(score - penalty, 0, 100);
    }

    trendAll.push({
      index: i + 1,
      score,
      completed: s.completed,
      dateKey,
    });
  }

  // Gentle idle decay if user has history and went 3+ days without completing a single session
  let idleDecayDays = 0;
  const lastCompleted = [...chronological].reverse().find((s) => s.completed);
  if (lastCompleted) {
    const lastCompletedKey = sessionLocalDateKey(lastCompleted.endedAt);
    const gap = diffCalendarDays(lastCompletedKey, todayKey);
    if (gap >= 3) {
      idleDecayDays = gap - 2;
      score = clamp(score - idleDecayDays * 5, 10, 100);
    }
  }

  const state = resolveDisciplineState(score);
  const stateMeta = FOCUS_STATE_META[state];

  // How many clean sessions needed to recover back to Steady (>= 45)
  const recoverySessionsNeeded =
    score < 45 ? Math.max(1, Math.ceil((45 - score) / 8)) : 0;

  // Resolve Rank & progress
  let rank = FOCUS_RANKS[0];
  let nextRank: (typeof FOCUS_RANKS)[number] | null = FOCUS_RANKS[1] ?? null;
  for (let i = 0; i < FOCUS_RANKS.length; i += 1) {
    if (totalXp >= FOCUS_RANKS[i].minXp) {
      rank = FOCUS_RANKS[i];
      nextRank = FOCUS_RANKS[i + 1] ?? null;
    }
  }
  const rankProgress = nextRank
    ? clamp(
        Math.round(((totalXp - rank.minXp) / Math.max(1, nextRank.minXp - rank.minXp)) * 100),
        0,
        100,
      )
    : 100;

  // Build daily map for all sessions
  const dayStatsMap = new Map<
    string,
    { completedSec: number; abandonedSec: number; completedCount: number; abandonedCount: number }
  >();

  let todayCompletedSec = 0;
  let todayCompletedSessions = 0;
  let todayAbandonedSessions = 0;
  let weekCompletedSec = 0;
  let weekCompletedSessions = 0;
  let weekAbandonedSessions = 0;

  const hourBuckets: FocusHourBucket[] = [
    { key: 'morning', label: 'Утро', range: '06–12', minutes: 0, sessions: 0 },
    { key: 'afternoon', label: 'День', range: '12–18', minutes: 0, sessions: 0 },
    { key: 'evening', label: 'Вечер', range: '18–24', minutes: 0, sessions: 0 },
    { key: 'night', label: 'Ночь', range: '00–06', minutes: 0, sessions: 0 },
  ];

  const taskMap = new Map<
    string,
    { title: string; type: 'todo' | 'kanban_card' | null; seconds: number; sessions: number }
  >();

  for (const s of chronological) {
    const dk = sessionLocalDateKey(s.endedAt);
    const bucket = dayStatsMap.get(dk) ?? {
      completedSec: 0,
      abandonedSec: 0,
      completedCount: 0,
      abandonedCount: 0,
    };

    if (s.completed) {
      bucket.completedSec += s.elapsedSeconds;
      bucket.completedCount += 1;

      if (dk === todayKey) {
        todayCompletedSec += s.elapsedSeconds;
        todayCompletedSessions += 1;
      }
      if (dk >= weekStartKey) {
        weekCompletedSec += s.elapsedSeconds;
        weekCompletedSessions += 1;
      }

      const hour = sessionLocalHour(s.startedAt);
      const hb =
        hour >= 6 && hour < 12
          ? hourBuckets[0]
          : hour >= 12 && hour < 18
            ? hourBuckets[1]
            : hour >= 18
              ? hourBuckets[2]
              : hourBuckets[3];
      hb.minutes += Math.round(s.elapsedSeconds / 60);
      hb.sessions += 1;

      const taskTitle = s.linkedTitle.trim();
      if (taskTitle.length > 0) {
        const key = `${s.linkedType ?? 'custom'}:${s.linkedId ?? taskTitle.toLowerCase()}`;
        const existing = taskMap.get(key) ?? {
          title: taskTitle,
          type: s.linkedType,
          seconds: 0,
          sessions: 0,
        };
        existing.seconds += s.elapsedSeconds;
        existing.sessions += 1;
        taskMap.set(key, existing);
      }
    } else {
      bucket.abandonedSec += s.elapsedSeconds;
      bucket.abandonedCount += 1;
      if (dk === todayKey) {
        todayAbandonedSessions += 1;
      }
      if (dk >= weekStartKey) {
        weekAbandonedSessions += 1;
      }
    }

    dayStatsMap.set(dk, bucket);
  }

  // Daily buckets (last 30 days, oldest -> newest)
  const dailyBuckets: FocusDailyBucket[] = [];
  for (let offset = -29; offset <= 0; offset += 1) {
    const dk = shiftDateKey(now, offset);
    const parsed = parseDateKey(dk) ?? now;
    const raw = dayStatsMap.get(dk);
    const completedMinutes = raw ? Math.round(raw.completedSec / 60) : 0;
    const abandonedMinutes = raw ? Math.round(raw.abandonedSec / 60) : 0;
    dailyBuckets.push({
      dateKey: dk,
      label: SHORT_WEEKDAYS[parsed.getDay()],
      shortDate: `${String(parsed.getDate()).padStart(2, '0')}.${String(parsed.getMonth() + 1).padStart(2, '0')}`,
      completedMinutes,
      abandonedMinutes,
      completedSessions: raw?.completedCount ?? 0,
      abandonedSessions: raw?.abandonedCount ?? 0,
      goalReached: completedMinutes >= safeGoal,
    });
  }

  // Day Streaks (consecutive days with >= 1 completed session)
  let currentDayStreak = 0;
  const completedToday = (dayStatsMap.get(todayKey)?.completedCount ?? 0) > 0;
  let cursorOffset = completedToday ? 0 : -1;
  while (cursorOffset >= -365) {
    const dk = shiftDateKey(now, cursorOffset);
    if ((dayStatsMap.get(dk)?.completedCount ?? 0) > 0) {
      currentDayStreak += 1;
      cursorOffset -= 1;
    } else {
      break;
    }
  }

  // Best day streak from all completed days
  const completedDaysSorted = [...dayStatsMap.entries()]
    .filter(([, val]) => val.completedCount > 0)
    .map(([dk]) => dk)
    .sort();

  let bestDayStreak = 0;
  let runningStreak = 0;
  for (let i = 0; i < completedDaysSorted.length; i += 1) {
    if (i === 0) {
      runningStreak = 1;
    } else {
      const gap = diffCalendarDays(completedDaysSorted[i - 1], completedDaysSorted[i]);
      runningStreak = gap === 1 ? runningStreak + 1 : 1;
    }
    if (runningStreak > bestDayStreak) {
      bestDayStreak = runningStreak;
    }
  }
  bestDayStreak = Math.max(bestDayStreak, currentDayStreak);

  const todayCompletedMinutes = Math.round(todayCompletedSec / 60);
  const weekCompletedMinutes = Math.round(weekCompletedSec / 60);
  const totalCompletedMinutes = Math.round(totalCompletedSeconds / 60);
  const totalAttempts = totalCompletedSessions + totalAbandonedSessions;
  const completionRate =
    totalAttempts > 0 ? Math.round((totalCompletedSessions / totalAttempts) * 100) : 100;
  const todayGoalProgress = clamp(Math.round((todayCompletedMinutes / safeGoal) * 100), 0, 100);

  const topTasks: FocusTaskBreakdown[] = [...taskMap.entries()]
    .map(([key, item]) => ({
      key,
      title: item.title,
      type: item.type,
      minutes: Math.max(1, Math.round(item.seconds / 60)),
      sessions: item.sessions,
    }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5);

  // Badges
  const hasCleanDay = [...dayStatsMap.values()].some(
    (d) => d.completedCount >= 3 && d.abandonedCount === 0,
  );
  const hasGoalDay = [...dayStatsMap.values()].some(
    (d) => Math.round(d.completedSec / 60) >= safeGoal,
  );

  const badges: FocusBadge[] = [
    {
      id: 'clean_day',
      title: 'Чистый день',
      description: '3+ сессии за день без единого срыва',
      unlocked: hasCleanDay,
      tone: 'success',
    },
    {
      id: 'goal_day',
      title: 'Цель дня',
      description: `Набрать ${safeGoal} мин фокуса за день`,
      unlocked: hasGoalDay,
      tone: 'accent',
    },
    {
      id: 'iron_will',
      title: 'Железная воля',
      description: '5 полных сессий подряд без бросаний',
      unlocked: bestCombo >= 5,
      tone: 'warning',
    },
    {
      id: 'week_rhythm',
      title: 'Ритм недели',
      description: '5 дней фокуса подряд',
      unlocked: bestDayStreak >= 5,
      tone: 'success',
    },
    {
      id: 'deep_dive',
      title: 'Глубокий фокус',
      description: 'Завершить сессию на 45+ минут',
      unlocked: hasDeepSession,
      tone: 'accent',
    },
  ];

  // Discipline trend (last 16 points, or baseline point if empty)
  const disciplineTrend =
    trendAll.length > 0
      ? trendAll.slice(-16)
      : [{ index: 0, score: 50, completed: true, dateKey: todayKey }];

  return {
    disciplineScore: score,
    state,
    stateMeta,
    xpMultiplier: stateMeta.xpMultiplier,
    totalXp,
    rank,
    nextRank,
    rankProgress,
    currentCombo,
    bestCombo,
    consecutiveAbandons,
    recoverySessionsNeeded,
    idleDecayDays,
    currentDayStreak,
    bestDayStreak,
    todayCompletedMinutes,
    todayCompletedSessions,
    todayAbandonedSessions,
    weekCompletedMinutes,
    weekCompletedSessions,
    weekAbandonedSessions,
    totalCompletedSessions,
    totalAbandonedSessions,
    totalCompletedMinutes,
    completionRate,
    dailyGoalMinutes: safeGoal,
    todayGoalProgress,
    dailyBuckets,
    heatmapDays: dailyBuckets.slice(-28),
    disciplineTrend,
    hourBuckets,
    topTasks,
    badges,
    recentSessions: [...chronological].reverse().slice(0, 40),
  };
}

export function createEmptyFocusAnalytics(dailyGoalMinutes = 100): FocusAnalytics {
  return computeFocusAnalytics([], dailyGoalMinutes);
}
