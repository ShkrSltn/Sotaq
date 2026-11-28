import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { DragTrashZone } from '@/components/drag-trash-zone';
import { RipplePressable } from '@/components/ripple-pressable';
import { HistoryToast, UndoRedoButtons } from '@/components/undo-redo-bar';
import type { WebDomDragEvent } from '@/components/web-drag-box';
import { useDatabase } from '@/db/provider';
import { useAuth } from '@/features/auth/auth-context';
import { HabitDialog } from '@/features/habits/components/habit-dialog';
import {
  HABIT_DRAG_MIME,
  HabitDesktopRow,
  HabitMobileCard,
} from '@/features/habits/components/habit-item';
import {
  captureHabitsSnapshot,
  createHabit,
  deleteHabit,
  listHabitsWithStats,
  reorderHabits,
  restoreHabitsSnapshot,
  toggleHabitLog,
  updateHabit,
} from '@/features/habits/habits-repository';
import {
  buildHabitDays,
  HABIT_COLORS,
  type HabitRecord,
  type HabitsSnapshot,
  type HabitWithStats,
} from '@/features/habits/types';
import { useUndoRedoHotkeys } from '@/hooks/use-undo-redo';
import { useThemeColors, useViewport } from '@/theme/colors';

const MAX_HISTORY = 40;

export function HabitsWorkspace() {
  const db = useDatabase();
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const colors = useThemeColors();
  const { isDesktop } = useViewport();

  const [habits, setHabits] = useState<HabitWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [daysCount, setDaysCount] = useState<7 | 14>(7);
  const [weekOffset, setWeekOffset] = useState(0);
  const [onlyRemainingToday, setOnlyRemainingToday] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');

  const [dialog, setDialog] = useState<{
    open: boolean;
    mode: 'create' | 'edit';
    habit: HabitWithStats | null;
  }>({ open: false, mode: 'create', habit: null });

  // Drag-and-drop state (Desktop Web)
  const [draggingHabitId, setDraggingHabitId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    position: 'before' | 'after';
  } | null>(null);

  // Undo / Redo
  const pastRef = useRef<HabitsSnapshot[]>([]);
  const futureRef = useRef<HabitsSnapshot[]>([]);
  const [historyMeta, setHistoryMeta] = useState({ canUndo: false, canRedo: false });
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyBusyRef = useRef(false);

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

  useUndoRedoHotkeys({
    enabled: !dialog.open,
    ignoreInsideInputs: true,
    onUndo: () => {
      handleUndo();
    },
    onRedo: () => {
      handleRedo();
    },
  });

  // Web keyboard shortcuts: Left/Right week, T = current week
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || dialog.open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setWeekOffset((v) => v - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setWeekOffset((v) => Math.min(0, v + 1));
      } else if (event.code === 'KeyT') {
        event.preventDefault();
        setWeekOffset(0);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialog.open]);

  const resolvedDaysCount: 7 | 14 = isDesktop ? daysCount : 7;
  const { days, rangeLabel } = useMemo(
    () => buildHabitDays(resolvedDaysCount, weekOffset),
    [resolvedDaysCount, weekOffset],
  );

  const summary = useMemo(() => {
    const total = habits.length;
    const doneToday = habits.filter((h) => h.completedToday).length;
    const remainingToday = Math.max(0, total - doneToday);
    const todayPct = total > 0 ? Math.round((doneToday / total) * 100) : 0;
    const topStreak = habits.reduce((max, h) => Math.max(max, h.currentStreak), 0);

    const periodMultiplier = resolvedDaysCount === 14 ? 2 : 1;
    let totalGoal = 0;
    let totalAchieved = 0;
    for (const h of habits) {
      const target = h.targetPerWeek * periodMultiplier;
      const done = days.reduce((acc, d) => acc + (h.completedDates.has(d.dateKey) ? 1 : 0), 0);
      totalGoal += target;
      totalAchieved += Math.min(done, target);
    }
    const periodPct = totalGoal > 0 ? Math.round((totalAchieved / totalGoal) * 100) : 0;

    return { total, doneToday, remainingToday, todayPct, topStreak, periodPct };
  }, [habits, days, resolvedDaysCount]);

  const visibleHabits = useMemo(
    () => (onlyRemainingToday ? habits.filter((h) => !h.completedToday) : habits),
    [habits, onlyRemainingToday],
  );

  async function handleToggleCell(habitId: string, dateKey: string) {
    if (!userId) {
      return;
    }
    await pushSnapshot();
    await toggleHabitLog(db, userId, habitId, dateKey);
    await refresh();
  }

  async function handleQuickCreate() {
    const clean = quickTitle.trim();
    if (!clean || !userId) {
      return;
    }
    await pushSnapshot();
    const color = HABIT_COLORS[habits.length % HABIT_COLORS.length];
    await createHabit(db, userId, { title: clean, color, icon: 'flame', targetPerWeek: 7 });
    setQuickTitle('');
    await refresh();
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
    if (dialog.mode === 'edit' && dialog.habit) {
      await updateHabit(db, dialog.habit.id, input);
    } else {
      await createHabit(db, userId, input);
    }
    await refresh();
  }

  async function handleDeleteHabit(habitId: string) {
    if (!userId) {
      return;
    }
    await pushSnapshot();
    await deleteHabit(db, habitId);
    await refresh();
    showToast('Привычка удалена');
  }

  async function handleMoveByOffset(habitId: string, delta: -1 | 1) {
    if (!userId) {
      return;
    }
    const ids = habits.map((h) => h.id);
    const idx = ids.indexOf(habitId);
    const nextIdx = idx + delta;
    if (idx < 0 || nextIdx < 0 || nextIdx >= ids.length) {
      return;
    }
    const next = [...ids];
    const [moved] = next.splice(idx, 1);
    next.splice(nextIdx, 0, moved);
    await pushSnapshot();
    await reorderHabits(db, userId, next);
    await refresh();
  }

  async function handleDropHabit(
    draggedId: string,
    targetId: string,
    position: 'before' | 'after',
  ) {
    setDraggingHabitId(null);
    setDropTarget(null);
    if (!userId || !draggedId || draggedId === targetId) {
      return;
    }
    const ids = habits.map((h) => h.id).filter((id) => id !== draggedId);
    const targetIdx = ids.indexOf(targetId);
    if (targetIdx < 0) {
      return;
    }
    ids.splice(position === 'before' ? targetIdx : targetIdx + 1, 0, draggedId);
    await pushSnapshot();
    await reorderHabits(db, userId, ids);
    await refresh();
  }

  async function handleDropTrash(event: WebDomDragEvent) {
    const id = event.dataTransfer?.getData(HABIT_DRAG_MIME) || draggingHabitId;
    setDraggingHabitId(null);
    setDropTarget(null);
    if (id && habits.some((h) => h.id === id)) {
      await handleDeleteHabit(id);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator size="small" color={colors.text} />
      </View>
    );
  }

  const periodMultiplier = resolvedDaysCount === 14 ? 2 : 1;

  return (
    <View style={[styles.screen, isDesktop ? styles.screenDesktop : styles.screenMobile]}>
      {/* Clean Top Toolbar */}
      <View style={styles.toolbar}>
        <View style={styles.toolbarLeft}>
          <View
            style={[
              styles.navGroup,
              { backgroundColor: colors.surface, borderColor: colors.line },
            ]}>
            <RipplePressable
              accessibilityLabel="Предыдущая неделя"
              onPress={() => setWeekOffset((v) => v - 1)}
              style={styles.navIconBtn}>
              <AppIcon name="chevronLeft" size="xs" color={colors.muted} />
            </RipplePressable>

            <RipplePressable onPress={() => setWeekOffset(0)} style={styles.rangeBtn}>
              <Text style={[styles.rangeText, { color: colors.text }]} numberOfLines={1}>
                {rangeLabel}
              </Text>
            </RipplePressable>

            <RipplePressable
              accessibilityLabel="Следующая неделя"
              disabled={weekOffset >= 0}
              onPress={() => setWeekOffset((v) => Math.min(0, v + 1))}
              style={StyleSheet.flatten([
                styles.navIconBtn,
                weekOffset >= 0 ? styles.disabled : null,
              ])}>
              <AppIcon name="chevronRight" size="xs" color={colors.muted} />
            </RipplePressable>
          </View>

          {weekOffset !== 0 ? (
            <RipplePressable
              onPress={() => setWeekOffset(0)}
              style={StyleSheet.flatten([
                styles.todayBtn,
                { backgroundColor: colors.surface, borderColor: colors.line },
              ])}>
              <Text style={[styles.todayBtnText, { color: colors.text }]}>Сегодня</Text>
            </RipplePressable>
          ) : null}
        </View>

        <View style={styles.toolbarRight}>
          {isDesktop ? (
            <>
              <View
                style={[
                  styles.segmented,
                  { backgroundColor: colors.surface, borderColor: colors.line },
                ]}>
                {([7, 14] as const).map((cnt) => {
                  const active = daysCount === cnt;
                  return (
                    <RipplePressable
                      key={cnt}
                      onPress={() => setDaysCount(cnt)}
                      style={StyleSheet.flatten([
                        styles.segBtn,
                        active ? { backgroundColor: colors.surfaceActive } : null,
                      ])}>
                      <Text
                        style={[
                          styles.segText,
                          { color: active ? colors.text : colors.muted },
                        ]}>
                        {cnt === 7 ? 'Неделя' : '14 дней'}
                      </Text>
                    </RipplePressable>
                  );
                })}
              </View>

              <View style={[styles.divider, { backgroundColor: colors.line }]} />

              <UndoRedoButtons
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

              <View style={[styles.divider, { backgroundColor: colors.line }]} />

              <RipplePressable
                onPress={() => setDialog({ open: true, mode: 'create', habit: null })}
                style={StyleSheet.flatten([
                  styles.primaryBtn,
                  { backgroundColor: colors.accent },
                ])}>
                <AppIcon name="plus" size="xs" color={colors.accentText} />
                <Text style={[styles.primaryBtnText, { color: colors.accentText }]}>Привычка</Text>
              </RipplePressable>
            </>
          ) : (
            <>
              {historyMeta.canUndo || historyMeta.canRedo ? (
                <UndoRedoButtons
                  compact
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
                  styles.iconPill,
                  { backgroundColor: colors.accent, borderColor: colors.accent },
                ])}>
                <AppIcon name="plus" size="sm" color={colors.accentText} />
              </RipplePressable>
            </>
          )}
        </View>
      </View>

      {/* Main Content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>
          {/* Compact Momentum Summary Bar */}
          {summary.total > 0 ? (
            <View
              style={[
                styles.summaryCard,
                { backgroundColor: colors.surface, borderColor: colors.line },
              ]}>
              <View style={styles.summaryTopRow}>
                <View style={styles.summaryMetrics}>
                  <View style={styles.summaryTodayGroup}>
                    <Text
                      style={[
                        styles.summaryPrimary,
                        {
                          color:
                            summary.remainingToday === 0 ? colors.success : colors.text,
                        },
                      ]}>
                      {summary.remainingToday === 0
                        ? `Все выполнены (${summary.total}/${summary.total})`
                        : `Сегодня ${summary.doneToday} из ${summary.total}`}
                    </Text>
                    <View style={styles.summarySecondaryRow}>
                      <View style={styles.metricPill}>
                        <AppIcon
                          name="flame"
                          size={11}
                          color={summary.topStreak > 0 ? colors.warning : colors.muted}
                        />
                        <Text style={[styles.metricText, { color: colors.muted }]}>
                          Серия: {summary.topStreak}д
                        </Text>
                      </View>
                      <Text style={[styles.metricDot, { color: colors.muted }]}>·</Text>
                      <Text style={[styles.metricText, { color: colors.muted }]}>
                        Период: {summary.periodPct}%
                      </Text>
                    </View>
                  </View>
                </View>

                {summary.remainingToday > 0 || onlyRemainingToday ? (
                  <RipplePressable
                    onPress={() => setOnlyRemainingToday((v) => !v)}
                    style={StyleSheet.flatten([
                      styles.remainingChip,
                      {
                        backgroundColor: onlyRemainingToday
                          ? colors.surfaceActive
                          : colors.surfaceSubtle,
                        borderColor: onlyRemainingToday ? colors.text : colors.line,
                      },
                    ])}>
                    <Text
                      style={[
                        styles.remainingChipText,
                        { color: onlyRemainingToday ? colors.text : colors.muted },
                      ]}>
                      {onlyRemainingToday
                        ? 'Показать все'
                        : `Осталось (${summary.remainingToday})`}
                    </Text>
                  </RipplePressable>
                ) : null}
              </View>

              <View style={[styles.summaryBarTrack, { backgroundColor: colors.surfaceSubtle }]}>
                <View
                  style={[
                    styles.summaryBarFill,
                    {
                      width: `${summary.todayPct}%`,
                      backgroundColor:
                        summary.remainingToday === 0 ? colors.success : colors.accent,
                    },
                  ]}
                />
              </View>
            </View>
          ) : null}

          {/* Empty State / Habit List */}
          {habits.length === 0 ? (
            <View
              style={[
                styles.emptyCard,
                { backgroundColor: colors.surface, borderColor: colors.line },
              ]}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceSubtle }]}>
                <AppIcon name="flame" size="lg" color={colors.muted} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Привычек пока нет</Text>
              <Text style={[styles.emptySub, { color: colors.muted }]}>
                Добавьте первую привычку ниже — на телефоне и десктопе её можно отмечать в одно
                касание и следить за серией.
              </Text>
            </View>
          ) : visibleHabits.length === 0 ? (
            <View
              style={[
                styles.emptyCard,
                { backgroundColor: colors.surface, borderColor: colors.line },
              ]}>
              <AppIcon name="checkCircle" size="lg" color={colors.success} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                На сегодня всё выполнено!
              </Text>
              <RipplePressable
                onPress={() => setOnlyRemainingToday(false)}
                style={StyleSheet.flatten([
                  styles.showAllBtn,
                  { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                ])}>
                <Text style={[styles.showAllText, { color: colors.text }]}>Показать все</Text>
              </RipplePressable>
            </View>
          ) : isDesktop ? (
            <View
              style={[
                styles.gridCard,
                { backgroundColor: colors.surface, borderColor: colors.line },
              ]}>
              {/* Desktop Column Headers */}
              <View style={[styles.gridHeader, { borderBottomColor: colors.line }]}>
                <View style={styles.desktopHeaderNameCol}>
                  <Text style={[styles.colCaption, { color: colors.muted }]}>Привычка</Text>
                </View>

                <View style={styles.daysRow}>
                  {days.map((day) => (
                    <View key={day.dateKey} style={styles.dayHeaderCell}>
                      <Text
                        style={[
                          styles.weekdayText,
                          { color: day.isToday ? colors.text : colors.muted },
                        ]}>
                        {day.weekdayLabel}
                      </Text>
                      <View
                        style={[
                          styles.dayNumBadge,
                          day.isToday ? { backgroundColor: colors.accent } : null,
                        ]}>
                        <Text
                          style={[
                            styles.dayNumText,
                            { color: day.isToday ? colors.accentText : colors.muted },
                          ]}>
                          {day.dayNum}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>

                <View style={styles.desktopHeaderStatsCol}>
                  <Text style={[styles.colCaption, { color: colors.muted }]}>Серия</Text>
                </View>
                <View style={styles.menuSpacer} />
              </View>

              {visibleHabits.map((habit, idx) => (
                <HabitDesktopRow
                  key={habit.id}
                  habit={habit}
                  days={days}
                  targetForPeriod={habit.targetPerWeek * periodMultiplier}
                  colors={colors}
                  isLast={idx === visibleHabits.length - 1}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < visibleHabits.length - 1}
                  isDragging={draggingHabitId === habit.id}
                  dropPosition={dropTarget?.id === habit.id ? dropTarget.position : null}
                  onToggleCell={handleToggleCell}
                  onEdit={(item) => setDialog({ open: true, mode: 'edit', habit: item })}
                  onMoveByOffset={handleMoveByOffset}
                  onDelete={handleDeleteHabit}
                  onDragStart={(id) => setDraggingHabitId(id)}
                  onDragEnd={() => {
                    setDraggingHabitId(null);
                    setDropTarget(null);
                  }}
                  onDragOver={(id, pos) => {
                    setDropTarget((prev) =>
                      prev?.id === id && prev.position === pos ? prev : { id, position: pos },
                    );
                  }}
                  onDragLeave={(id) => {
                    setDropTarget((prev) => (prev?.id === id ? null : prev));
                  }}
                  onDropHabit={handleDropHabit}
                />
              ))}
            </View>
          ) : (
            /* Mobile-First Spacious Habit Cards */
            <View style={styles.mobileCardsList}>
              {visibleHabits.map((habit, idx) => (
                <HabitMobileCard
                  key={habit.id}
                  habit={habit}
                  days={days}
                  targetForPeriod={habit.targetPerWeek}
                  colors={colors}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < visibleHabits.length - 1}
                  onToggleCell={handleToggleCell}
                  onEdit={(item) => setDialog({ open: true, mode: 'edit', habit: item })}
                  onMoveByOffset={handleMoveByOffset}
                  onDelete={handleDeleteHabit}
                />
              ))}
            </View>
          )}

          {/* Minimalist Bottom Quick-Add Bar */}
          <View
            style={[
              styles.quickAddBar,
              { backgroundColor: colors.surface, borderColor: colors.line },
            ]}>
            <TextInput
              value={quickTitle}
              onChangeText={setQuickTitle}
              onSubmitEditing={handleQuickCreate}
              placeholder="Новая привычка…"
              placeholderTextColor={colors.muted}
              style={[styles.quickAddInput, { color: colors.text }]}
            />
            <RipplePressable
              accessibilityLabel="Добавить привычку"
              disabled={quickTitle.trim().length === 0}
              onPress={handleQuickCreate}
              style={StyleSheet.flatten([
                styles.quickAddBtn,
                { backgroundColor: colors.accent },
                quickTitle.trim().length === 0 ? styles.disabled : null,
              ])}>
              <AppIcon name="plus" size="sm" color={colors.accentText} />
            </RipplePressable>
          </View>
        </View>
      </ScrollView>

      <HabitDialog
        visible={dialog.open}
        mode={dialog.mode}
        habit={dialog.habit}
        onClose={() => setDialog({ open: false, mode: 'create', habit: null })}
        onSave={handleDialogSave}
        onDelete={handleDeleteHabit}
      />

      <DragTrashZone
        visible={draggingHabitId !== null}
        label="Удалить привычку"
        colors={colors}
        onDropDelete={handleDropTrash}
      />

      <HistoryToast message={toast} colors={colors} />
    </View>
  );
}

const styles = StyleSheet.create({
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screen: {
    flex: 1,
  },
  screenDesktop: {
    paddingHorizontal: 24,
    paddingTop: 14,
  },
  screenMobile: {
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 40,
    marginBottom: 12,
  },
  toolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
    minWidth: 0,
  },
  navGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 2,
  },
  navIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeBtn: {
    paddingHorizontal: 8,
    height: 28,
    justifyContent: 'center',
  },
  rangeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  todayBtn: {
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  todayBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  toolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  segmented: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    height: 34,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  segBtn: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 7,
    justifyContent: 'center',
  },
  segText: {
    fontSize: 12,
    fontWeight: '600',
  },
  divider: {
    width: 1,
    height: 20,
    opacity: 0.7,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    height: 34,
    borderRadius: 9,
  },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  iconPill: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingBottom: 64,
  },
  inner: {
    width: '100%',
    maxWidth: 960,
    gap: 12,
  },
  summaryCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  summaryMetrics: {
    flex: 1,
    minWidth: 160,
  },
  summaryTodayGroup: {
    gap: 3,
  },
  summaryPrimary: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  summarySecondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metricText: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  metricDot: {
    fontSize: 12,
  },
  remainingChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  remainingChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  summaryBarTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  summaryBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  emptyCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 28,
    alignItems: 'center',
    gap: 8,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 360,
    lineHeight: 19,
  },
  showAllBtn: {
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
  },
  showAllText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  gridCard: {
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  gridHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  colCaption: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.45,
  },
  desktopHeaderNameCol: {
    width: 232,
    flexShrink: 0,
  },
  desktopHeaderStatsCol: {
    width: 76,
    alignItems: 'flex-end',
  },
  menuSpacer: {
    width: 28,
  },
  daysRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  dayHeaderCell: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  weekdayText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  dayNumBadge: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumText: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  mobileCardsList: {
    gap: 10,
  },
  quickAddBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
  },
  quickAddInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 6,
    minWidth: 0,
  },
  quickAddBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.35,
  },
});
