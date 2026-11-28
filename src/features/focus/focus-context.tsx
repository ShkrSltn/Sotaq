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
import { createEmptyFocusAnalytics } from '@/features/focus/focus-analytics';
import {
  deleteFocusSession,
  deriveFocusStats,
  getFocusAnalytics,
  getFocusSettings,
  saveFocusSession,
  upsertFocusSettings,
} from '@/features/focus/focus-repository';
import {
  ABANDON_GRACE_SECONDS,
  DEFAULT_FOCUS_SETTINGS,
  type FocusAnalytics,
  type FocusLinkTarget,
  type FocusMode,
  type FocusSettings,
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

export type PendingAbandonAction = {
  kind: 'reset' | 'skip' | 'mode';
  nextMode?: FocusMode;
  elapsedSeconds: number;
};

type FocusBanner = {
  text: string;
  tone: 'success' | 'danger' | 'neutral';
};

const EMPTY_ANALYTICS = createEmptyFocusAnalytics(DEFAULT_FOCUS_SETTINGS.dailyGoalMinutes);

type FocusContextValue = {
  mode: FocusMode;
  focusMinutes: number;
  settings: FocusSettings;
  secondsLeft: number;
  totalSeconds: number;
  isRunning: boolean;
  sessionStarted: boolean;
  completedInCycle: number;
  linkedTarget: FocusLinkTarget | null;
  analytics: FocusAnalytics;
  stats: FocusStats;
  bannerMessage: string | null;
  bannerTone: 'success' | 'danger' | 'neutral';
  pendingAbandon: PendingAbandonAction | null;
  start: () => void;
  pause: () => void;
  toggle: () => void;
  reset: () => void;
  skip: () => void;
  setMode: (nextMode: FocusMode) => void;
  setFocusMinutes: (minutes: number) => void;
  updateSettings: (patch: Partial<FocusSettings>) => Promise<void>;
  linkTarget: (target: FocusLinkTarget | null) => void;
  confirmAbandon: () => Promise<void>;
  cancelAbandon: () => void;
  removeSession: (sessionId: string) => Promise<void>;
  refreshStats: () => Promise<void>;
};

const FocusContext = createContext<FocusContextValue | null>(null);

export function FocusProvider({ children }: { children: ReactNode }) {
  const db = useDatabase();
  const { user, status } = useAuth();
  const userId = status === 'authenticated' ? (user?.id ?? '') : '';

  const [settings, setSettings] = useState<FocusSettings>(DEFAULT_FOCUS_SETTINGS);
  const [mode, setModeState] = useState<FocusMode>('focus');
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_FOCUS_SETTINGS.focusMinutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [completedInCycle, setCompletedInCycle] = useState(0);
  const [linkedTarget, setLinkedTarget] = useState<FocusLinkTarget | null>(null);
  const [analytics, setAnalytics] = useState<FocusAnalytics>(EMPTY_ANALYTICS);
  const [banner, setBanner] = useState<FocusBanner | null>(null);
  const [pendingAbandon, setPendingAbandon] = useState<PendingAbandonAction | null>(null);

  const endTsRef = useRef<number | null>(null);
  const startedAtRef = useRef<string | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsRef = useRef<FocusSettings>(DEFAULT_FOCUS_SETTINGS);
  const isRunningRef = useRef(false);
  const sessionStartedRef = useRef(false);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    sessionStartedRef.current = sessionStarted;
  }, [sessionStarted]);

  const durationForMode = useCallback((targetMode: FocusMode, cfg: FocusSettings = settings) => {
    if (targetMode === 'focus') {
      return cfg.focusMinutes * 60;
    }
    if (targetMode === 'short_break') {
      return cfg.shortBreakMinutes * 60;
    }
    return cfg.longBreakMinutes * 60;
  }, [settings]);

  const totalSeconds = durationForMode(mode);

  const showBanner = useCallback(
    (text: string, tone: 'success' | 'danger' | 'neutral' = 'success') => {
      setBanner({ text, tone });
      if (bannerTimerRef.current) {
        clearTimeout(bannerTimerRef.current);
      }
      bannerTimerRef.current = setTimeout(() => {
        setBanner(null);
      }, 3600);
    },
    [],
  );

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
    const next = await getFocusAnalytics(db, userId, settingsRef.current.dailyGoalMinutes);
    setAnalytics(next);
  }, [db, userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    let cancelled = false;
    async function loadInitial() {
      const loadedSettings = await getFocusSettings(db, userId);
      if (cancelled) return;
      settingsRef.current = loadedSettings;
      setSettings(loadedSettings);
      if (!isRunningRef.current && !sessionStartedRef.current) {
        setSecondsLeft(loadedSettings.focusMinutes * 60);
      }
      const nextAnalytics = await getFocusAnalytics(db, userId, loadedSettings.dailyGoalMinutes);
      if (!cancelled) {
        setAnalytics(nextAnalytics);
      }
    }
    loadInitial();
    return () => {
      cancelled = true;
    };
  }, [db, userId]);

  const finishCurrentSession = useCallback(
    async (completed: boolean) => {
      const cfg = settingsRef.current;
      const dur = durationForMode(mode, cfg);
      const elapsed = completed ? dur : Math.max(0, dur - secondsLeft);
      const startedAt = startedAtRef.current ?? nowIso();

      endTsRef.current = null;
      startedAtRef.current = null;
      setIsRunning(false);
      setSessionStarted(false);

      if (userId && mode === 'focus' && (completed || elapsed >= ABANDON_GRACE_SECONDS)) {
        await saveFocusSession(db, userId, {
          mode,
          durationSeconds: dur,
          elapsedSeconds: elapsed,
          completed,
          linkedTarget,
          startedAt,
        });
        const nextAnalytics = await getFocusAnalytics(db, userId, cfg.dailyGoalMinutes);
        setAnalytics(nextAnalytics);
      }

      if (completed) {
        if (cfg.soundEnabled) {
          playCompletionChime();
        }
        if (mode === 'focus') {
          const nextCycleCount = completedInCycle + 1;
          const nextMode: FocusMode = nextCycleCount % 4 === 0 ? 'long_break' : 'short_break';
          setCompletedInCycle(nextCycleCount % 4);
          setModeState(nextMode);
          const nextDur = durationForMode(nextMode, cfg);
          setSecondsLeft(nextDur);
          if (cfg.autoStartBreaks) {
            startedAtRef.current = nowIso();
            endTsRef.current = Date.now() + nextDur * 1000;
            setSessionStarted(true);
            setIsRunning(true);
          }
          showBanner('Фокус завершён! +дисциплина и комбо', 'success');
        } else {
          setModeState('focus');
          setSecondsLeft(durationForMode('focus', cfg));
          showBanner('Перерыв окончен — пора в фокус', 'neutral');
        }
      }
    },
    [
      completedInCycle,
      db,
      durationForMode,
      linkedTarget,
      mode,
      secondsLeft,
      showBanner,
      userId,
    ],
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
    setSessionStarted(true);
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

  const getActiveFocusElapsed = useCallback(() => {
    if (mode !== 'focus' || !sessionStarted) {
      return 0;
    }
    const dur = durationForMode('focus', settingsRef.current);
    const liveSecondsLeft =
      isRunning && endTsRef.current
        ? Math.max(0, Math.ceil((endTsRef.current - Date.now()) / 1000))
        : secondsLeft;
    return Math.max(0, dur - liveSecondsLeft);
  }, [durationForMode, isRunning, mode, secondsLeft, sessionStarted]);

  const executeCleanTransition = useCallback(
    (action: PendingAbandonAction) => {
      const cfg = settingsRef.current;
      endTsRef.current = null;
      startedAtRef.current = null;
      setIsRunning(false);
      setSessionStarted(false);

      if (action.kind === 'reset') {
        setSecondsLeft(durationForMode(mode, cfg));
      } else if (action.kind === 'skip') {
        const nextMode: FocusMode = mode === 'focus' ? 'short_break' : 'focus';
        setModeState(nextMode);
        setSecondsLeft(durationForMode(nextMode, cfg));
      } else if (action.kind === 'mode' && action.nextMode) {
        setModeState(action.nextMode);
        setSecondsLeft(durationForMode(action.nextMode, cfg));
      }
    },
    [durationForMode, mode],
  );

  const requestOrRunAction = useCallback(
    (kind: 'reset' | 'skip' | 'mode', nextMode?: FocusMode) => {
      if (kind === 'mode' && nextMode === mode) {
        return;
      }
      const elapsed = getActiveFocusElapsed();
      if (userId && mode === 'focus' && sessionStarted && elapsed >= ABANDON_GRACE_SECONDS) {
        setPendingAbandon({ kind, nextMode, elapsedSeconds: elapsed });
        return;
      }
      executeCleanTransition({ kind, nextMode, elapsedSeconds: elapsed });
    },
    [executeCleanTransition, getActiveFocusElapsed, mode, sessionStarted, userId],
  );

  const reset = useCallback(() => {
    requestOrRunAction('reset');
  }, [requestOrRunAction]);

  const skip = useCallback(() => {
    requestOrRunAction('skip');
  }, [requestOrRunAction]);

  const setMode = useCallback(
    (nextMode: FocusMode) => {
      requestOrRunAction('mode', nextMode);
    },
    [requestOrRunAction],
  );

  const confirmAbandon = useCallback(async () => {
    const action = pendingAbandon;
    setPendingAbandon(null);
    if (!action) {
      return;
    }

    const cfg = settingsRef.current;
    const dur = durationForMode('focus', cfg);
    const liveElapsed = Math.max(action.elapsedSeconds, getActiveFocusElapsed());
    const startedAt = startedAtRef.current ?? nowIso();

    executeCleanTransition(action);

    if (userId && liveElapsed >= ABANDON_GRACE_SECONDS) {
      await saveFocusSession(db, userId, {
        mode: 'focus',
        durationSeconds: dur,
        elapsedSeconds: Math.min(dur, liveElapsed),
        completed: false,
        linkedTarget,
        startedAt,
      });
      const nextAnalytics = await getFocusAnalytics(db, userId, cfg.dailyGoalMinutes);
      setAnalytics(nextAnalytics);
      showBanner('Сессия брошена · комбо сброшено, дисциплина снижена', 'danger');
    }
  }, [
    db,
    durationForMode,
    executeCleanTransition,
    getActiveFocusElapsed,
    linkedTarget,
    pendingAbandon,
    showBanner,
    userId,
  ]);

  const cancelAbandon = useCallback(() => {
    setPendingAbandon(null);
  }, []);

  const updateSettings = useCallback(
    async (patch: Partial<FocusSettings>) => {
      const merged: FocusSettings = { ...settingsRef.current, ...patch };
      settingsRef.current = merged;
      setSettings(merged);

      if (!isRunningRef.current && !sessionStartedRef.current) {
        if (mode === 'focus' && patch.focusMinutes !== undefined) {
          setSecondsLeft(merged.focusMinutes * 60);
        } else if (mode === 'short_break' && patch.shortBreakMinutes !== undefined) {
          setSecondsLeft(merged.shortBreakMinutes * 60);
        } else if (mode === 'long_break' && patch.longBreakMinutes !== undefined) {
          setSecondsLeft(merged.longBreakMinutes * 60);
        }
      }

      if (userId) {
        const saved = await upsertFocusSettings(db, userId, merged);
        settingsRef.current = saved;
        setSettings(saved);
        if (patch.dailyGoalMinutes !== undefined) {
          const nextAnalytics = await getFocusAnalytics(db, userId, saved.dailyGoalMinutes);
          setAnalytics(nextAnalytics);
        }
      }
    },
    [db, mode, userId],
  );

  const setFocusMinutes = useCallback(
    (minutes: number) => {
      if (mode === 'focus' && !isRunning && !sessionStarted) {
        setSecondsLeft(minutes * 60);
      }
      updateSettings({ focusMinutes: minutes });
    },
    [isRunning, mode, sessionStarted, updateSettings],
  );

  const removeSession = useCallback(
    async (sessionId: string) => {
      if (!userId) {
        return;
      }
      await deleteFocusSession(db, userId, sessionId);
      const nextAnalytics = await getFocusAnalytics(
        db,
        userId,
        settingsRef.current.dailyGoalMinutes,
      );
      setAnalytics(nextAnalytics);
    },
    [db, userId],
  );

  const activeAnalytics = userId ? analytics : EMPTY_ANALYTICS;
  const stats = useMemo(() => deriveFocusStats(activeAnalytics), [activeAnalytics]);

  const value = useMemo<FocusContextValue>(
    () => ({
      mode,
      focusMinutes: settings.focusMinutes,
      settings,
      secondsLeft,
      totalSeconds,
      isRunning,
      sessionStarted,
      completedInCycle,
      linkedTarget,
      analytics: activeAnalytics,
      stats,
      bannerMessage: banner?.text ?? null,
      bannerTone: banner?.tone ?? 'neutral',
      pendingAbandon,
      start,
      pause,
      toggle,
      reset,
      skip,
      setMode,
      setFocusMinutes,
      updateSettings,
      linkTarget: setLinkedTarget,
      confirmAbandon,
      cancelAbandon,
      removeSession,
      refreshStats,
    }),
    [
      mode,
      settings,
      secondsLeft,
      totalSeconds,
      isRunning,
      sessionStarted,
      completedInCycle,
      linkedTarget,
      activeAnalytics,
      stats,
      banner,
      pendingAbandon,
      start,
      pause,
      toggle,
      reset,
      skip,
      setMode,
      setFocusMinutes,
      updateSettings,
      confirmAbandon,
      cancelAbandon,
      removeSession,
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
