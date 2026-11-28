import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';

import { nowIso } from '@/db/client';
import { useDatabase } from '@/db/provider';
import { useAuth } from '@/features/auth/auth-context';
import { getFocusStats, saveFocusSession } from '@/features/focus/focus-repository';
import {
  FOCUS_MODE_META,
  type FocusLinkTarget,
  type FocusMode,
  type FocusStats,
} from '@/features/focus/types';

function playCompletionChime() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return;
  }
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      return;
    }
    const ctx = new AudioCtx();
    const notes = [587.33, 880]; // D5 -> A5 gentle bell
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + idx * 0.14;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.11, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.6);
    });
  } catch {
    // Ignore audio context restrictions
  }
}

const EMPTY_STATS: FocusStats = {
  todayMinutes: 0,
  todaySessions: 0,
  weekMinutes: 0,
  weekSessions: 0,
  recentSessions: [],
};

type FocusContextValue = {
  mode: FocusMode;
  focusMinutes: number;
  secondsLeft: number;
  totalSeconds: number;
  isRunning: boolean;
  linkedTarget: FocusLinkTarget | null;
  stats: FocusStats;
  bannerMessage: string | null;
  start: () => void;
  pause: () => void;
  toggle: () => void;
  reset: () => void;
  skip: () => void;
  setMode: (nextMode: FocusMode) => void;
  setFocusMinutes: (minutes: number) => void;
  linkTarget: (target: FocusLinkTarget | null) => void;
  refreshStats: () => Promise<void>;
};

const FocusContext = createContext<FocusContextValue | null>(null);

export function FocusProvider({ children }: { children: ReactNode }) {
  const db = useDatabase();
  const { user, status } = useAuth();
  const userId = status === 'authenticated' ? (user?.id ?? '') : '';

  const [mode, setModeState] = useState<FocusMode>('focus');
  const [focusMinutes, setFocusMinutesState] = useState(25);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [linkedTarget, setLinkedTarget] = useState<FocusLinkTarget | null>(null);
  const [stats, setStats] = useState<FocusStats>(EMPTY_STATS);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  const endTsRef = useRef<number | null>(null);
  const startedAtRef = useRef<string | null>(null);
  const completedFocusStreakRef = useRef(0);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const durationForMode = useCallback(
    (targetMode: FocusMode, customFocusMin = focusMinutes) => {
      if (targetMode === 'focus') {
        return customFocusMin * 60;
      }
      return FOCUS_MODE_META[targetMode].defaultMinutes * 60;
    },
    [focusMinutes],
  );

  const totalSeconds = durationForMode(mode);

  const showBanner = useCallback((msg: string) => {
    setBannerMessage(msg);
    if (bannerTimerRef.current) {
      clearTimeout(bannerTimerRef.current);
    }
    bannerTimerRef.current = setTimeout(() => {
      setBannerMessage(null);
    }, 3200);
  }, []);

  useEffect(() => {
    return () => {
      if (bannerTimerRef.current) {
        clearTimeout(bannerTimerRef.current);
      }
    };
  }, []);

  const refreshStats = useCallback(async () => {
    if (!userId) {
      return;
    }
    const next = await getFocusStats(db, userId);
    setStats(next);
  }, [db, userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    let cancelled = false;
    getFocusStats(db, userId).then((next) => {
      if (!cancelled) {
        setStats(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [db, userId]);

  const finishCurrentSession = useCallback(
    async (completed: boolean) => {
      const dur = durationForMode(mode);
      const elapsed = completed ? dur : Math.max(0, dur - secondsLeft);
      const startedAt = startedAtRef.current ?? nowIso();

      endTsRef.current = null;
      startedAtRef.current = null;
      setIsRunning(false);

      if (userId && (completed || elapsed >= 60)) {
        await saveFocusSession(db, userId, {
          mode,
          durationSeconds: dur,
          elapsedSeconds: elapsed,
          completed,
          linkedTarget,
          startedAt,
        });
        await refreshStats();
      }

      if (completed) {
        playCompletionChime();
        if (mode === 'focus') {
          completedFocusStreakRef.current += 1;
          const nextMode: FocusMode =
            completedFocusStreakRef.current % 4 === 0 ? 'long_break' : 'short_break';
          setModeState(nextMode);
          setSecondsLeft(durationForMode(nextMode));
          showBanner('Фокус-сессия завершена! Время перерыва');
        } else {
          setModeState('focus');
          setSecondsLeft(durationForMode('focus'));
          showBanner('Перерыв окончен — можно в фокус');
        }
      }
    },
    [db, durationForMode, linkedTarget, mode, refreshStats, secondsLeft, showBanner, userId],
  );

  useEffect(() => {
    if (!isRunning) {
      return;
    }
    if (!endTsRef.current) {
      endTsRef.current = Date.now() + secondsLeft * 1000;
    }
    const interval = setInterval(() => {
      if (!endTsRef.current) {
        return;
      }
      const remaining = Math.ceil((endTsRef.current - Date.now()) / 1000);
      if (remaining <= 0) {
        setSecondsLeft(0);
        finishCurrentSession(true);
      } else {
        setSecondsLeft(remaining);
      }
    }, 400);

    return () => clearInterval(interval);
  }, [isRunning, finishCurrentSession, secondsLeft]);

  const start = useCallback(() => {
    if (isRunning) {
      return;
    }
    if (!startedAtRef.current) {
      startedAtRef.current = nowIso();
    }
    endTsRef.current = Date.now() + secondsLeft * 1000;
    setIsRunning(true);
  }, [isRunning, secondsLeft]);

  const pause = useCallback(() => {
    if (!isRunning) {
      return;
    }
    if (endTsRef.current) {
      setSecondsLeft(Math.max(0, Math.ceil((endTsRef.current - Date.now()) / 1000)));
    }
    endTsRef.current = null;
    setIsRunning(false);
  }, [isRunning]);

  const toggle = useCallback(() => {
    if (isRunning) {
      pause();
    } else {
      start();
    }
  }, [isRunning, pause, start]);

  const reset = useCallback(() => {
    const dur = durationForMode(mode);
    const elapsed = dur - secondsLeft;
    if (mode === 'focus' && elapsed >= 60 && startedAtRef.current && userId) {
      finishCurrentSession(false);
    } else {
      endTsRef.current = null;
      startedAtRef.current = null;
      setIsRunning(false);
    }
    setSecondsLeft(dur);
  }, [durationForMode, finishCurrentSession, mode, secondsLeft, userId]);

  const skip = useCallback(() => {
    endTsRef.current = null;
    startedAtRef.current = null;
    setIsRunning(false);
    const nextMode: FocusMode = mode === 'focus' ? 'short_break' : 'focus';
    setModeState(nextMode);
    setSecondsLeft(durationForMode(nextMode));
  }, [durationForMode, mode]);

  const setMode = useCallback(
    (nextMode: FocusMode) => {
      endTsRef.current = null;
      startedAtRef.current = null;
      setIsRunning(false);
      setModeState(nextMode);
      setSecondsLeft(durationForMode(nextMode));
    },
    [durationForMode],
  );

  const setFocusMinutes = useCallback(
    (minutes: number) => {
      setFocusMinutesState(minutes);
      if (mode === 'focus') {
        endTsRef.current = null;
        startedAtRef.current = null;
        setIsRunning(false);
        setSecondsLeft(minutes * 60);
      }
    },
    [mode],
  );

  const value = useMemo<FocusContextValue>(
    () => ({
      mode,
      focusMinutes,
      secondsLeft,
      totalSeconds,
      isRunning,
      linkedTarget,
      stats: userId ? stats : EMPTY_STATS,
      bannerMessage,
      start,
      pause,
      toggle,
      reset,
      skip,
      setMode,
      setFocusMinutes,
      linkTarget: setLinkedTarget,
      refreshStats,
    }),
    [
      mode,
      focusMinutes,
      secondsLeft,
      totalSeconds,
      isRunning,
      linkedTarget,
      userId,
      stats,
      bannerMessage,
      start,
      pause,
      toggle,
      reset,
      skip,
      setMode,
      setFocusMinutes,
      refreshStats,
    ],
  );

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

export function useFocus(): FocusContextValue {
  const ctx = useContext(FocusContext);
  if (!ctx) {
    throw new Error('useFocus must be used within FocusProvider');
  }
  return ctx;
}
