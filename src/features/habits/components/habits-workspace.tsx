import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { RipplePressable } from '@/components/ripple-pressable';
import { HistoryToast, UndoRedoButtons } from '@/components/undo-redo-bar';
import { useDatabase } from '@/db/provider';
import { useAuth } from '@/features/auth/auth-context';
import { HabitDialog } from '@/features/habits/components/habit-dialog';
import { HabitTodayList } from '@/features/habits/components/habit-today-list';
import { VoronoiMonth } from '@/features/habits/components/voronoi-month';
import { VoronoiYearMap } from '@/features/habits/components/voronoi-year-map';
import {
  captureHabitsSnapshot,
  computeYearStats,
  createHabit,
  deleteHabit,
  listHabitsWithStats,
  reorderHabits,
  restoreHabitsSnapshot,
  setAllHabitsForDate,
  toggleHabitLog,
  updateHabit,
} from '@/features/habits/habits-repository';
import {
  HABIT_COLORS,
  type HabitRecord,
  type HabitsSnapshot,
  type HabitWithStats,
  MONTH_NAMES_RU,
} from '@/features/habits/types';
import { useUndoRedoHotkeys } from '@/hooks/use-undo-redo';
import { useThemeColors, useViewport } from '@/theme/colors';
import { daysInMonth, formatDateKeyRu, todayKey } from '@/utils/date-key';

const MAX_HISTORY = 40;
type HabitsViewMode = 'month' | 'year';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function HabitsWorkspace() {
  const db = useDatabase();
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const colors = useThemeColors();
  const { isDesktop } = useViewport();
  const insets = useSafeAreaInsets();

  const [habits, setHabits] = useState<HabitWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<HabitsViewMode>('month');
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [monthIndex, setMonthIndex] = useState(() => new Date().getMonth());
  const [selectedHabitId, setSelectedHabitId] = useState<string | 'all'>('all');
  const [dayModalDateKey, setDayModalDateKey] = useState<string | null>(null);
  const [mobileMonthWidth, setMobileMonthWidth] = useState(340);
  const [monthHoverInfo, setMonthHoverInfo] = useState<{
    dateKey: string;
    doneCount: number;
    totalCount: number;
  } | null>(null);

  const [dialog, setDialog] = useState<{
    open: boolean;
    mode: 'create' | 'edit';
    habit: HabitWithStats | null;
  }>({ open: false, mode: 'create', habit: null });

  // Undo / Redo
  const pastRef = useRef<HabitsSnapshot[]>([]);
  const futureRef = useRef<HabitsSnapshot[]>([]);
  const [historyMeta, setHistoryMeta] = useState({ canUndo: false, canRedo: false });
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyBusyRef = useRef(false);

  const currentTodayKey = todayKey();

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => setToast(null), 1800);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const syncHistoryMeta = useCallback(() => {
    setHistoryMeta({
      canUndo: pastRef.current.length > 0,
      canRedo: futureRef.current.length > 0,
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) {
      return;
    }
    const items = await listHabitsWithStats(db, userId);
    setHabits(items);
  }, [db, userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    let cancelled = false;
    listHabitsWithStats(db, userId).then((items) => {
      if (!cancelled) {
        setHabits(items);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [db, userId]);

  const pushSnapshot = useCallback(async () => {
    if (!userId) {
      return;
    }
    const snap = await captureHabitsSnapshot(db, userId);
    pastRef.current.push(snap);
    if (pastRef.current.length > MAX_HISTORY) {
      pastRef.current.shift();
    }
    futureRef.current = [];
    syncHistoryMeta();
  }, [db, userId, syncHistoryMeta]);

  const handleUndo = useCallback(async () => {
    if (!userId || historyBusyRef.current || pastRef.current.length === 0) {
      return;
    }
    historyBusyRef.current = true;
    try {
      const current = await captureHabitsSnapshot(db, userId);
      const prev = pastRef.current.pop();
      if (!prev) {
        return;
      }
      futureRef.current.push(current);
      await restoreHabitsSnapshot(db, userId, prev);
      await refresh();
      syncHistoryMeta();
      showToast('Отменено');
    } finally {
      historyBusyRef.current = false;
    }
  }, [db, userId, refresh, syncHistoryMeta, showToast]);

  const handleRedo = useCallback(async () => {
    if (!userId || historyBusyRef.current || futureRef.current.length === 0) {
      return;
    }
    historyBusyRef.current = true;
    try {
      const current = await captureHabitsSnapshot(db, userId);
      const next = futureRef.current.pop();
      if (!next) {
        return;
      }
      pastRef.current.push(current);
      await restoreHabitsSnapshot(db, userId, next);
      await refresh();
      syncHistoryMeta();
      showToast('Возвращено');
    } finally {
      historyBusyRef.current = false;
    }
  }, [db, userId, refresh, syncHistoryMeta, showToast]);

  const stepPeriod = useCallback(
    (delta: -1 | 1) => {
      if (viewMode === 'year') {
        setYear((y) => y + delta);
        return;
      }
      setMonthIndex((prevMonth) => {
        const next = prevMonth + delta;
        if (next < 0) {
          setYear((y) => y - 1);
          return 11;
        }
        if (next > 11) {
          setYear((y) => y + 1);
          return 0;
        }
        return next;
      });
    },
    [viewMode],
  );

  const jumpToCurrentPeriod = useCallback(() => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonthIndex(now.getMonth());
  }, []);

  useUndoRedoHotkeys({
    enabled: !dialog.open && dayModalDateKey === null,
    ignoreInsideInputs: true,
    onUndo: () => {
      handleUndo();
    },
    onRedo: () => {
      handleRedo();
    },
  });

  // Web keyboard shortcuts: Left/Right period, T = today, M = month, Y = year
  useEffect(() => {
    if (
      Platform.OS !== 'web' ||
      typeof window === 'undefined' ||
      dialog.open ||
      dayModalDateKey !== null
    ) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const key = event.key.toLowerCase();
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        stepPeriod(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        stepPeriod(1);
      } else if (key === 't') {
        event.preventDefault();
        jumpToCurrentPeriod();
      } else if (key === 'm') {
        event.preventDefault();
        setViewMode('month');
      } else if (key === 'y') {
        event.preventDefault();
        setViewMode('year');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialog.open, dayModalDateKey, stepPeriod, jumpToCurrentPeriod]);

  const activeSelectedHabitId = useMemo(() => {
    if (selectedHabitId === 'all') return 'all';
    return habits.some((h) => h.id === selectedHabitId) ? selectedHabitId : 'all';
  }, [habits, selectedHabitId]);

  const selectedHabit = useMemo(
    () =>
      activeSelectedHabitId === 'all'
        ? null
        : habits.find((h) => h.id === activeSelectedHabitId) ?? null,
    [habits, activeSelectedHabitId],
  );

  const yearStats = useMemo(
    () => computeYearStats(habits, year, activeSelectedHabitId),
    [habits, year, activeSelectedHabitId],
  );

  // Compute active month breakdown
  const monthBreakdown = useMemo(() => {
    const totalDays = daysInMonth(year, monthIndex);
    const prefix = `${year}-${pad2(monthIndex + 1)}-`;

    let activeDays = 0;
    for (let d = 1; d <= totalDays; d += 1) {
      const key = `${prefix}${pad2(d)}`;
      if (selectedHabit) {
        if (selectedHabit.completedDates.has(key)) activeDays += 1;
      } else if (habits.some((h) => h.completedDates.has(key))) {
        activeDays += 1;
      }
    }

    const perHabit = habits.map((h) => {
      let count = 0;
      for (let d = 1; d <= totalDays; d += 1) {
        if (h.completedDates.has(`${prefix}${pad2(d)}`)) {
          count += 1;
        }
      }
      return {
        habit: h,
        count,
        pct: Math.round((count / totalDays) * 100),
      };
    });

    return {
      totalDays,
      activeDays,
      monthPct: Math.round((activeDays / totalDays) * 100),
      perHabit,
    };
  }, [habits, year, monthIndex, selectedHabit]);

  async function handleToggleCell(habitId: string, dateKey: string) {
    if (!userId) {
      return;
    }
    await pushSnapshot();
    await toggleHabitLog(db, userId, habitId, dateKey);
    await refresh();
  }

  async function handleSetAllForDay(dateKey: string, markDone: boolean) {
    if (!userId || habits.length === 0) {
      return;
    }
    await pushSnapshot();
    await setAllHabitsForDate(
      db,
      userId,
      habits.map((h) => h.id),
      dateKey,
      markDone,
    );
    await refresh();
  }

  async function handleMoveHabitOrder(habitId: string, delta: -1 | 1) {
    if (!userId) {
      return;
    }
    const idx = habits.findIndex((h) => h.id === habitId);
    const targetIdx = idx + delta;
    if (idx < 0 || targetIdx < 0 || targetIdx >= habits.length) {
      return;
    }
    await pushSnapshot();
    const ids = habits.map((h) => h.id);
    const tmp = ids[idx];
    ids[idx] = ids[targetIdx];
    ids[targetIdx] = tmp;
    await reorderHabits(db, userId, ids);
    await refresh();
  }

  function handlePressMapDay(dateKey: string) {
    if (selectedHabit) {
      handleToggleCell(selectedHabit.id, dateKey);
    } else if (habits.length === 1) {
      handleToggleCell(habits[0].id, dateKey);
    } else if (habits.length > 1) {
      setDayModalDateKey(dateKey);
    }
  }

  async function handleDialogSave(input: {
    title: string;
    color: string;
    icon: HabitRecord['icon'];
    targetPerWeek: number;
  }) {
    if (!userId) {
      return;
    }
    await pushSnapshot();
    if (dialog.mode === 'create') {
      const created = await createHabit(db, userId, input);
      setSelectedHabitId(created.id);
    } else if (dialog.habit) {
      await updateHabit(db, dialog.habit.id, input);
    }
    await refresh();
  }

  async function handleDeleteHabit(habitId: string) {
    await pushSnapshot();
    await deleteHabit(db, habitId);
    if (selectedHabitId === habitId) {
      setSelectedHabitId('all');
    }
    await refresh();
  }

  if (loading) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator size="small" color={colors.text} />
      </View>
    );
  }

  const now = new Date();
  const desktopMonthSize = 412;

  return (
    <View style={styles.screen}>
      {/* Top Toolbar */}
      <View
        style={[
          styles.toolbar,
          isDesktop ? styles.toolbarDesktop : styles.toolbarMobile,
          { borderBottomColor: colors.line },
        ]}>
        <View style={styles.toolbarLeft}>
          {isDesktop ? (
            <View style={styles.titleBlock}>
              <Text style={[styles.title, { color: colors.text }]}>Привычки</Text>
              <Text style={[styles.subtitle, { color: colors.muted }]}>
                Карта ритма по дням
              </Text>
            </View>
          ) : null}

          {/* Period Navigator */}
          <View
            style={[
              styles.periodNav,
              { backgroundColor: colors.surface, borderColor: colors.line },
            ]}>
            <RipplePressable
              accessibilityLabel={viewMode === 'month' ? 'Предыдущий месяц' : 'Предыдущий год'}
              onPress={() => stepPeriod(-1)}
              style={styles.periodArrowBtn}>
              <AppIcon name="chevronLeft" size="xs" color={colors.muted} />
            </RipplePressable>

            <RipplePressable
              accessibilityLabel="Вернуться к текущему периоду"
              onPress={jumpToCurrentPeriod}
              style={styles.periodLabelBtn}>
              <Text style={[styles.periodLabelText, { color: colors.text }]} numberOfLines={1}>
                {viewMode === 'month' ? `${MONTH_NAMES_RU[monthIndex]} ${year}` : `${year}`}
              </Text>
            </RipplePressable>

            <RipplePressable
              accessibilityLabel={viewMode === 'month' ? 'Следующий месяц' : 'Следующий год'}
              onPress={() => stepPeriod(1)}
              style={styles.periodArrowBtn}>
              <AppIcon name="chevronRight" size="xs" color={colors.muted} />
            </RipplePressable>
          </View>

          {/* View Mode Switcher: Month (default) | Year */}
          <View
            style={[
              styles.modeSwitch,
              { backgroundColor: colors.surface, borderColor: colors.line },
            ]}>
            {(
              [
                { key: 'month', label: 'Месяц' },
                { key: 'year', label: 'Год' },
              ] as const
            ).map((item) => {
              const active = viewMode === item.key;
              return (
                <RipplePressable
                  key={item.key}
                  onPress={() => setViewMode(item.key)}
                  style={StyleSheet.flatten([
                    styles.modeSwitchBtn,
                    active ? { backgroundColor: colors.surfaceActive } : null,
                  ])}>
                  <Text
                    style={[
                      styles.modeSwitchText,
                      { color: active ? colors.text : colors.muted },
                    ]}>
                    {item.label}
                  </Text>
                </RipplePressable>
              );
            })}
          </View>
        </View>

        <View style={styles.toolbarRight}>
          {isDesktop || historyMeta.canUndo || historyMeta.canRedo ? (
            <UndoRedoButtons
              compact={!isDesktop}
              canUndo={historyMeta.canUndo}
              canRedo={historyMeta.canRedo}
              colors={colors}
              onUndo={() => {
                handleUndo();
              }}
              onRedo={() => {
                handleRedo();
              }}
            />
          ) : null}

          <RipplePressable
            accessibilityLabel="Новая привычка"
            onPress={() => setDialog({ open: true, mode: 'create', habit: null })}
            style={StyleSheet.flatten([
              isDesktop ? styles.addBtnDesktop : styles.addBtnMobile,
              { backgroundColor: colors.accent },
            ])}>
            <AppIcon name="plus" size="xs" color={colors.accentText} />
            {isDesktop ? (
              <Text style={[styles.addBtnText, { color: colors.accentText }]}>Привычка</Text>
            ) : null}
          </RipplePressable>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          isDesktop ? styles.contentDesktop : styles.contentMobile,
        ]}>
        <View style={styles.inner}>
          {habits.length === 0 ? (
            <View
              style={[
                styles.emptyCard,
                { backgroundColor: colors.surface, borderColor: colors.line },
              ]}>
              <View style={[styles.emptyIconBox, { backgroundColor: colors.surfaceSubtle }]}>
                <AppIcon name="flame" size="lg" color={colors.muted} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                Пока нет ни одной привычки
              </Text>
              <Text style={[styles.emptyDesc, { color: colors.muted }]}>
                Создай первую привычку — каждый выполненный день зажжёт ячейку на карте Вороного.
              </Text>
              <RipplePressable
                onPress={() => setDialog({ open: true, mode: 'create', habit: null })}
                style={StyleSheet.flatten([
                  styles.emptyCta,
                  { backgroundColor: colors.accent },
                ])}>
                <AppIcon name="plus" size="xs" color={colors.accentText} />
                <Text style={[styles.emptyCtaText, { color: colors.accentText }]}>
                  Создать привычку
                </Text>
              </RipplePressable>
            </View>
          ) : (
            <>
              {/* Habit Filter Pills */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pillsRow}>
                <RipplePressable
                  onPress={() => setSelectedHabitId('all')}
                  style={StyleSheet.flatten([
                    styles.habitPill,
                    {
                      backgroundColor:
                        activeSelectedHabitId === 'all' ? colors.accent : colors.surface,
                      borderColor:
                        activeSelectedHabitId === 'all' ? colors.accent : colors.line,
                    },
                  ])}>
                  <Text
                    style={[
                      styles.habitPillText,
                      {
                        color:
                          activeSelectedHabitId === 'all' ? colors.accentText : colors.text,
                      },
                    ]}>
                    Все ({habits.length})
                  </Text>
                </RipplePressable>

                {habits.map((habit) => {
                  const active = activeSelectedHabitId === habit.id;
                  return (
                    <View key={habit.id} style={styles.habitPillWrap}>
                      <RipplePressable
                        onPress={() => setSelectedHabitId(habit.id)}
                        style={StyleSheet.flatten([
                          styles.habitPill,
                          {
                            backgroundColor: active ? `${habit.color}22` : colors.surface,
                            borderColor: active ? habit.color : colors.line,
                          },
                        ])}>
                        <View style={[styles.habitDot, { backgroundColor: habit.color }]} />
                        <Text
                          style={[styles.habitPillText, { color: colors.text }]}
                          numberOfLines={1}>
                          {habit.title}
                        </Text>
                        {habit.currentStreak > 0 ? (
                          <Text style={[styles.pillStreak, { color: colors.muted }]}>
                            {habit.currentStreak}
                          </Text>
                        ) : null}
                      </RipplePressable>

                      {active ? (
                        <RipplePressable
                          accessibilityLabel={`Редактировать ${habit.title}`}
                          onPress={() => setDialog({ open: true, mode: 'edit', habit })}
                          style={StyleSheet.flatten([
                            styles.pillEditBtn,
                            { backgroundColor: colors.surface, borderColor: colors.line },
                          ])}>
                          <AppIcon name="edit" size={11} color={colors.muted} />
                        </RipplePressable>
                      ) : null}
                    </View>
                  );
                })}
              </ScrollView>

              {/* Today Quick Checklist */}
              <HabitTodayList
                habits={habits}
                todayKey={currentTodayKey}
                isDesktop={isDesktop}
                colors={colors}
                onToggleToday={handleToggleCell}
                onEditHabit={(habit) => setDialog({ open: true, mode: 'edit', habit })}
              />

              {/* Main View: Default Active Month OR Full 12-Month Year Poster */}
              {viewMode === 'month' ? (
                isDesktop ? (
                  <View style={styles.monthHeroRow}>
                    <VoronoiMonth
                      year={year}
                      monthIndex={monthIndex}
                      size={desktopMonthSize}
                      todayKey={currentTodayKey}
                      currentMonthIndex={now.getMonth()}
                      currentYear={now.getFullYear()}
                      habits={habits}
                      selectedHabit={selectedHabit}
                      colors={colors}
                      large
                      onPressDay={handlePressMapDay}
                      onHoverDayChange={setMonthHoverInfo}
                    />

                    <View
                      style={[
                        styles.monthSideCard,
                        { backgroundColor: colors.surface, borderColor: colors.line },
                      ]}>
                      <View style={styles.monthSideTop}>
                        <View style={styles.monthSideHeader}>
                          <View>
                            <Text style={[styles.monthSideTitle, { color: colors.text }]}>
                              {MONTH_NAMES_RU[monthIndex]} {year}
                            </Text>
                            <Text style={[styles.monthSideSub, { color: colors.muted }]}>
                              {monthHoverInfo
                                ? `${formatDateKeyRu(monthHoverInfo.dateKey)} · ${
                                    selectedHabit
                                      ? monthHoverInfo.doneCount > 0
                                        ? 'Выполнено ✓'
                                        : 'Не отмечено'
                                      : `Выполнено ${monthHoverInfo.doneCount} из ${monthHoverInfo.totalCount}`
                                  }`
                                : selectedHabit
                                  ? `Клик по ячейке отмечает «${selectedHabit.title}»`
                                  : 'Наведи или нажми на любую ячейку дня'}
                            </Text>
                          </View>

                          <RipplePressable
                            onPress={() => setViewMode('year')}
                            style={StyleSheet.flatten([
                              styles.toYearBtn,
                              { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                            ])}>
                            <Text style={[styles.toYearBtnText, { color: colors.text }]}>
                              Весь {year}
                            </Text>
                            <AppIcon name="arrowRight" size={11} color={colors.muted} />
                          </RipplePressable>
                        </View>

                        {/* Month KPI Tiles */}
                        <View style={styles.footerStatsRow}>
                          <View
                            style={[
                              styles.footerStatTile,
                              { backgroundColor: colors.surfaceSubtle },
                            ]}>
                            <Text style={[styles.footerStatVal, { color: colors.text }]}>
                              {monthBreakdown.activeDays}/{monthBreakdown.totalDays}
                            </Text>
                            <Text style={[styles.footerStatLbl, { color: colors.muted }]}>
                              дней ({monthBreakdown.monthPct}%)
                            </Text>
                          </View>

                          <View
                            style={[
                              styles.footerStatTile,
                              { backgroundColor: colors.surfaceSubtle },
                            ]}>
                            <Text style={[styles.footerStatVal, { color: colors.warning }]}>
                              {yearStats.currentStreak} дн.
                            </Text>
                            <Text style={[styles.footerStatLbl, { color: colors.muted }]}>
                              текущая серия
                            </Text>
                          </View>

                          <View
                            style={[
                              styles.footerStatTile,
                              { backgroundColor: colors.surfaceSubtle },
                            ]}>
                            <Text style={[styles.footerStatVal, { color: colors.success }]}>
                              {yearStats.bestStreak} дн.
                            </Text>
                            <Text style={[styles.footerStatLbl, { color: colors.muted }]}>
                              лучшая серия
                            </Text>
                          </View>
                        </View>

                        {/* Per-habit breakdown for this month */}
                        <View style={styles.perHabitSection}>
                          <Text style={[styles.perHabitHeading, { color: colors.muted }]}>
                            ПРИВЫЧКИ В ЭТОМ МЕСЯЦЕ
                          </Text>
                          <View style={styles.perHabitList}>
                            {monthBreakdown.perHabit.map(({ habit, count, pct }) => {
                              const isSelected = activeSelectedHabitId === habit.id;
                              return (
                                <RipplePressable
                                  key={habit.id}
                                  onPress={() =>
                                    setSelectedHabitId(isSelected ? 'all' : habit.id)
                                  }
                                  style={StyleSheet.flatten([
                                    styles.perHabitRow,
                                    {
                                      backgroundColor: isSelected
                                        ? `${habit.color}18`
                                        : colors.surfaceSubtle,
                                      borderColor: isSelected ? habit.color : 'transparent',
                                    },
                                  ])}>
                                  <View style={styles.perHabitRowTop}>
                                    <View style={styles.perHabitNameWrap}>
                                      <View
                                        style={[
                                          styles.habitDot,
                                          { backgroundColor: habit.color },
                                        ]}
                                      />
                                      <Text
                                        style={[styles.perHabitName, { color: colors.text }]}
                                        numberOfLines={1}>
                                        {habit.title}
                                      </Text>
                                    </View>
                                    <Text style={[styles.perHabitCount, { color: colors.muted }]}>
                                      {count}/{monthBreakdown.totalDays}
                                    </Text>
                                  </View>
                                  <View
                                    style={[
                                      styles.perHabitBarTrack,
                                      { backgroundColor: colors.line },
                                    ]}>
                                    <View
                                      style={[
                                        styles.perHabitBarFill,
                                        { width: `${pct}%`, backgroundColor: habit.color },
                                      ]}
                                    />
                                  </View>
                                </RipplePressable>
                              );
                            })}
                          </View>
                        </View>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View
                    style={styles.mobileMonthStack}
                    onLayout={(e) => {
                      const w = Math.floor(e.nativeEvent.layout.width);
                      if (w > 160 && Math.abs(w - mobileMonthWidth) > 2) {
                        setMobileMonthWidth(w);
                      }
                    }}>
                    <VoronoiMonth
                      year={year}
                      monthIndex={monthIndex}
                      size={mobileMonthWidth}
                      todayKey={currentTodayKey}
                      currentMonthIndex={now.getMonth()}
                      currentYear={now.getFullYear()}
                      habits={habits}
                      selectedHabit={selectedHabit}
                      colors={colors}
                      large
                      onPressDay={handlePressMapDay}
                    />

                    <View
                      style={[
                        styles.footerCard,
                        { backgroundColor: colors.surface, borderColor: colors.line },
                      ]}>
                      <View style={styles.footerStatsRow}>
                        <View
                          style={[
                            styles.footerStatTile,
                            { backgroundColor: colors.surfaceSubtle },
                          ]}>
                          <Text style={[styles.footerStatVal, { color: colors.text }]}>
                            {monthBreakdown.activeDays}/{monthBreakdown.totalDays}
                          </Text>
                          <Text style={[styles.footerStatLbl, { color: colors.muted }]}>
                            за месяц ({monthBreakdown.monthPct}%)
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.footerStatTile,
                            { backgroundColor: colors.surfaceSubtle },
                          ]}>
                          <Text style={[styles.footerStatVal, { color: colors.warning }]}>
                            {yearStats.currentStreak} дн.
                          </Text>
                          <Text style={[styles.footerStatLbl, { color: colors.muted }]}>
                            серия
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.footerStatTile,
                            { backgroundColor: colors.surfaceSubtle },
                          ]}>
                          <Text style={[styles.footerStatVal, { color: colors.success }]}>
                            {yearStats.bestStreak} дн.
                          </Text>
                          <Text style={[styles.footerStatLbl, { color: colors.muted }]}>
                            рекорд
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                )
              ) : (
                <>
                  {/* Full 12-Month Voronoi Year Map */}
                  <VoronoiYearMap
                    year={year}
                    todayKey={currentTodayKey}
                    isDesktop={isDesktop}
                    habits={habits}
                    selectedHabit={selectedHabit}
                    colors={colors}
                    onPressDay={handlePressMapDay}
                    onOpenMonthZoom={(mIdx) => {
                      setMonthIndex(mIdx);
                      setViewMode('month');
                    }}
                  />

                  {/* Footer: Motto + Year Stats */}
                  <View
                    style={[
                      styles.footerCard,
                      { backgroundColor: colors.surface, borderColor: colors.line },
                    ]}>
                    <View style={styles.footerMottoCol}>
                      <Text style={[styles.footerMottoTitle, { color: colors.text }]}>
                        НЕ РАЗРЫВАЙ ЦЕПЬ · {year}
                      </Text>
                      <Text style={[styles.footerMottoSub, { color: colors.muted }]}>
                        {selectedHabit
                          ? `Привычка «${selectedHabit.title}» — тап по любой ячейке отмечает день`
                          : 'Общая карта года — нажми на заголовок любого месяца, чтобы открыть его крупно'}
                      </Text>
                    </View>

                    <View style={styles.footerStatsRow}>
                      <View
                        style={[styles.footerStatTile, { backgroundColor: colors.surfaceSubtle }]}>
                        <Text style={[styles.footerStatVal, { color: colors.text }]}>
                          {yearStats.markedDays}{' '}
                          <Text style={[styles.footerStatPct, { color: colors.muted }]}>
                            ({yearStats.yearPercent}%)
                          </Text>
                        </Text>
                        <Text style={[styles.footerStatLbl, { color: colors.muted }]}>
                          дней в {year}
                        </Text>
                      </View>

                      <View
                        style={[styles.footerStatTile, { backgroundColor: colors.surfaceSubtle }]}>
                        <Text style={[styles.footerStatVal, { color: colors.warning }]}>
                          {yearStats.currentStreak} дн.
                        </Text>
                        <Text style={[styles.footerStatLbl, { color: colors.muted }]}>
                          текущая серия
                        </Text>
                      </View>

                      <View
                        style={[styles.footerStatTile, { backgroundColor: colors.surfaceSubtle }]}>
                        <Text style={[styles.footerStatVal, { color: colors.success }]}>
                          {yearStats.bestStreak} дн.
                        </Text>
                        <Text style={[styles.footerStatLbl, { color: colors.muted }]}>
                          лучшая серия
                        </Text>
                      </View>
                    </View>
                  </View>
                </>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* Day Picker Modal / Mobile Sheet for 'All' Mode */}
      <Modal
        visible={dayModalDateKey !== null}
        transparent
        animationType="none"
        onRequestClose={() => setDayModalDateKey(null)}>
        <View
          style={[
            styles.modalRoot,
            isDesktop ? styles.modalRootDesktop : styles.modalRootMobile,
          ]}>
          <Pressable style={styles.modalBackdrop} onPress={() => setDayModalDateKey(null)} />
          <Animated.View
            entering={
              isDesktop ? FadeIn.duration(130) : SlideInDown.springify().damping(24).stiffness(260)
            }
            style={[
              styles.dayModalCard,
              isDesktop ? styles.dayModalDesktop : styles.dayModalMobile,
              {
                backgroundColor: colors.surface,
                borderColor: colors.line,
                paddingBottom: isDesktop ? 4 : Math.max(insets.bottom, 14),
              },
            ]}>
            {(() => {
              const doneForDay = dayModalDateKey
                ? habits.filter((h) => h.completedDates.has(dayModalDateKey)).length
                : 0;
              const remainingForDay = Math.max(0, habits.length - doneForDay);
              const allMarked = habits.length > 0 && remainingForDay === 0;

              return (
                <>
                  <View style={[styles.dayModalHeader, { borderBottomColor: colors.line }]}>
                    <View style={styles.dayModalTitleWrap}>
                      <Text style={[styles.dayModalTitle, { color: colors.text }]}>
                        {dayModalDateKey ? formatDateKeyRu(dayModalDateKey) : ''}
                      </Text>
                      <Text
                        style={[
                          styles.dayModalSubtitle,
                          { color: allMarked ? colors.success : colors.muted },
                        ]}>
                        {allMarked
                          ? `Все ${habits.length} выполнены ✓`
                          : `Выполнено ${doneForDay} из ${habits.length}`}
                      </Text>
                    </View>

                    <RipplePressable
                      accessibilityLabel="Закрыть"
                      onPress={() => setDayModalDateKey(null)}
                      style={StyleSheet.flatten([
                        styles.dayModalClose,
                        { backgroundColor: colors.surfaceSubtle },
                      ])}>
                      <AppIcon name="close" size="xs" color={colors.muted} />
                    </RipplePressable>
                  </View>

                  <View style={styles.dayModalList}>
                    {dayModalDateKey
                      ? habits.map((habit) => {
                          const done = habit.completedDates.has(dayModalDateKey);
                          return (
                            <RipplePressable
                              key={habit.id}
                              onPress={() => handleToggleCell(habit.id, dayModalDateKey)}
                              style={StyleSheet.flatten([
                                styles.dayModalRow,
                                done
                                  ? {
                                      backgroundColor: `${habit.color}1F`,
                                      borderColor: `${habit.color}66`,
                                    }
                                  : {
                                      backgroundColor: colors.surfaceSubtle,
                                      borderColor: 'transparent',
                                    },
                              ])}>
                              <View
                                style={[
                                  styles.dayModalCheck,
                                  {
                                    backgroundColor: done ? habit.color : 'transparent',
                                    borderColor: done ? habit.color : colors.muted,
                                  },
                                ]}>
                                {done ? (
                                  <AppIcon
                                    name="check"
                                    size={11}
                                    color="#FFFFFF"
                                    strokeWidth={2.6}
                                  />
                                ) : null}
                              </View>
                              <View style={styles.dayModalRowBody}>
                                <Text
                                  style={[styles.dayModalRowTitle, { color: colors.text }]}
                                  numberOfLines={1}>
                                  {habit.title}
                                </Text>
                              </View>
                              <View
                                style={[
                                  styles.dayModalStatusPill,
                                  done
                                    ? { backgroundColor: `${habit.color}2A` }
                                    : { backgroundColor: colors.surface },
                                ]}>
                                <Text
                                  style={[
                                    styles.dayModalStatusText,
                                    { color: done ? habit.color : colors.muted },
                                  ]}>
                                  {done ? 'Готово' : '+ Добавить'}
                                </Text>
                              </View>
                            </RipplePressable>
                          );
                        })
                      : null}
                  </View>

                  {dayModalDateKey && habits.length > 1 ? (
                    <View style={[styles.dayModalFooter, { borderTopColor: colors.line }]}>
                      <RipplePressable
                        onPress={() => handleSetAllForDay(dayModalDateKey, !allMarked)}
                        style={StyleSheet.flatten([
                          styles.dayModalBulkBtn,
                          allMarked
                            ? {
                                backgroundColor: colors.surfaceSubtle,
                                borderColor: colors.line,
                              }
                            : {
                                backgroundColor: colors.accent,
                                borderColor: colors.accent,
                              },
                        ])}>
                        <AppIcon
                          name={allMarked ? 'close' : 'check'}
                          size="xs"
                          color={allMarked ? colors.text : colors.accentText}
                        />
                        <Text
                          style={[
                            styles.dayModalBulkText,
                            { color: allMarked ? colors.text : colors.accentText },
                          ]}>
                          {allMarked
                            ? `Снять все (${habits.length})`
                            : `Отметить все (+${remainingForDay})`}
                        </Text>
                      </RipplePressable>

                      <RipplePressable
                        onPress={() => setDayModalDateKey(null)}
                        style={StyleSheet.flatten([
                          styles.dayModalDoneBtn,
                          { backgroundColor: colors.surfaceSubtle },
                        ])}>
                        <Text style={[styles.dayModalDoneText, { color: colors.text }]}>
                          Готово
                        </Text>
                      </RipplePressable>
                    </View>
                  ) : null}
                </>
              );
            })()}
          </Animated.View>
        </View>
      </Modal>

      <HabitDialog
        visible={dialog.open}
        mode={dialog.mode}
        habit={dialog.habit}
        defaultColor={HABIT_COLORS[habits.length % HABIT_COLORS.length]}
        canMovePrev={
          dialog.mode === 'edit' &&
          dialog.habit !== null &&
          habits.findIndex((h) => h.id === dialog.habit?.id) > 0
        }
        canMoveNext={
          dialog.mode === 'edit' &&
          dialog.habit !== null &&
          habits.findIndex((h) => h.id === dialog.habit?.id) < habits.length - 1
        }
        onMoveOrder={
          dialog.habit
            ? async (delta) => {
                if (dialog.habit) {
                  await handleMoveHabitOrder(dialog.habit.id, delta);
                }
              }
            : undefined
        }
        onClose={() => setDialog((prev) => ({ ...prev, open: false }))}
        onSave={handleDialogSave}
        onDelete={handleDeleteHabit}
      />

      <HistoryToast message={toast} colors={colors} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toolbarDesktop: {
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  toolbarMobile: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  toolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
    minWidth: 0,
  },
  titleBlock: {
    gap: 1,
    marginRight: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
  },
  periodNav: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    overflow: 'hidden',
    flexShrink: 1,
  },
  periodArrowBtn: {
    width: 28,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodLabelBtn: {
    paddingHorizontal: 8,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
  },
  periodLabelText: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  modeSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    gap: 2,
    flexShrink: 0,
  },
  modeSwitchBtn: {
    paddingHorizontal: 10,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeSwitchText: {
    fontSize: 12,
    fontWeight: '600',
  },
  toolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  addBtnDesktop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 13,
    borderRadius: 9,
  },
  addBtnMobile: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 36,
  },
  contentDesktop: {
    paddingHorizontal: 28,
    paddingTop: 18,
  },
  contentMobile: {
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  inner: {
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
    gap: 16,
  },
  emptyCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 32,
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
  },
  emptyIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptyDesc: {
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 340,
    lineHeight: 19,
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    height: 38,
    borderRadius: 10,
    marginTop: 6,
  },
  emptyCtaText: {
    fontSize: 13,
    fontWeight: '700',
  },
  pillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  habitPillWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  habitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 200,
  },
  habitDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  habitPillText: {
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  pillStreak: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  pillEditBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthHeroRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 16,
  },
  monthSideCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    justifyContent: 'space-between',
  },
  monthSideTop: {
    gap: 16,
  },
  monthSideHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  monthSideTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  monthSideSub: {
    fontSize: 12,
    marginTop: 2,
  },
  toYearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  toYearBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  perHabitSection: {
    gap: 8,
  },
  perHabitHeading: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  perHabitList: {
    gap: 7,
  },
  perHabitRow: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 11,
    paddingVertical: 8,
    gap: 6,
  },
  perHabitRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  perHabitNameWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minWidth: 0,
  },
  perHabitName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  perHabitCount: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  perHabitBarTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  perHabitBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  mobileMonthStack: {
    gap: 12,
  },
  footerCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 14,
  },
  footerMottoCol: {
    gap: 3,
  },
  footerMottoTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  footerMottoSub: {
    fontSize: 12,
  },
  footerStatsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  footerStatTile: {
    flex: 1,
    borderRadius: 11,
    padding: 11,
    gap: 2,
  },
  footerStatVal: {
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  footerStatPct: {
    fontSize: 12,
    fontWeight: '600',
  },
  footerStatLbl: {
    fontSize: 11,
    fontWeight: '500',
  },
  modalRoot: {
    flex: 1,
  },
  modalRootDesktop: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalRootMobile: {
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 12, 16, 0.5)',
  },
  dayModalCard: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  dayModalDesktop: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
  },
  dayModalMobile: {
    width: '100%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  dayModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  dayModalTitleWrap: {
    flex: 1,
    gap: 2,
  },
  dayModalTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  dayModalSubtitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  dayModalClose: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayModalList: {
    padding: 12,
    gap: 8,
  },
  dayModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dayModalRowBody: {
    flex: 1,
    minWidth: 0,
  },
  dayModalCheck: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayModalRowTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  dayModalStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
  },
  dayModalStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  dayModalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dayModalBulkBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dayModalBulkText: {
    fontSize: 13,
    fontWeight: '700',
  },
  dayModalDoneBtn: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayModalDoneText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
