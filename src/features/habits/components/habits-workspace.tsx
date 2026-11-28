import { type ComponentRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  AnchoredPopover,
  type AnchorRect,
  measureAnchor,
} from '@/components/anchored-popover';
import { AppIcon } from '@/components/app-icon';
import { DragTrashZone } from '@/components/drag-trash-zone';
import { RipplePressable } from '@/components/ripple-pressable';
import { HistoryToast, UndoRedoButtons } from '@/components/undo-redo-bar';
import { WebDragBox, type WebDomDragEvent } from '@/components/web-drag-box';
import { useDatabase } from '@/db/provider';
import { useAuth } from '@/features/auth/auth-context';
import { HabitDialog } from '@/features/habits/components/habit-dialog';
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

const HABIT_DRAG_MIME = 'application/x-sotaq-habit';
const DROP_BLUE = '#3B82F6';
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
  const [quickTitle, setQuickTitle] = useState('');

  const [dialog, setDialog] = useState<{
    open: boolean;
    mode: 'create' | 'edit';
    habit: HabitRecord | null;
  }>({ open: false, mode: 'create', habit: null });

  const [menuHabitId, setMenuHabitId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<AnchorRect | null>(null);
  const menuRefs = useRef<Record<string, ComponentRef<typeof View> | null>>({});

  // Drag-and-drop state
  const [draggingHabitId, setDraggingHabitId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    position: 'before' | 'after';
  } | null>(null);

  // Undo/Redo
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

  const resolvedDaysCount: 7 | 14 = isDesktop ? daysCount : 7;
  const { days, rangeLabel } = useMemo(
    () => buildHabitDays(resolvedDaysCount, weekOffset),
    [resolvedDaysCount, weekOffset],
  );

  const todaySummary = useMemo(() => {
    const done = habits.filter((h) => h.completedToday).length;
    const total = habits.length;
    const bestActiveStreak = habits.reduce((max, h) => Math.max(max, h.currentStreak), 0);
    return { done, total, bestActiveStreak };
  }, [habits]);

  const activeMenuHabit = useMemo(
    () => habits.find((h) => h.id === menuHabitId) ?? null,
    [habits, menuHabitId],
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

  function resolveDropPos(event: WebDomDragEvent): 'before' | 'after' {
    const el = event.currentTarget as HTMLElement | null;
    if (!el || typeof el.getBoundingClientRect !== 'function') {
      return 'after';
    }
    const rect = el.getBoundingClientRect();
    return event.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
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

            <RipplePressable
              onPress={() => setWeekOffset(0)}
              style={styles.rangeBtn}>
              <Text style={[styles.rangeText, { color: colors.text }]}>{rangeLabel}</Text>
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

          {isDesktop && todaySummary.total > 0 ? (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryMeta, { color: colors.muted }]}>
                Сегодня: {todaySummary.done}/{todaySummary.total}
              </Text>
              {todaySummary.bestActiveStreak > 0 ? (
                <View style={[styles.streakChip, { backgroundColor: colors.warningBg }]}>
                  <AppIcon name="flame" size={11} color={colors.warning} />
                  <Text style={[styles.streakChipText, { color: colors.warning }]}>
                    {todaySummary.bestActiveStreak}д
                  </Text>
                </View>
              ) : null}
            </View>
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
          {habits.length === 0 ? (
            <View
              style={[
                styles.emptyCard,
                { backgroundColor: colors.surface, borderColor: colors.line },
              ]}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceSubtle }]}>
                <AppIcon name="flame" size="lg" color={colors.muted} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                Привычек пока нет
              </Text>
              <Text style={[styles.emptySub, { color: colors.muted }]}>
                Добавьте первую привычку ниже, чтобы отмечать прогресс каждый день и собирать серии.
              </Text>
            </View>
          ) : (
            <View
              style={[
                styles.gridCard,
                { backgroundColor: colors.surface, borderColor: colors.line },
              ]}>
              {/* Column Headers */}
              <View style={[styles.gridHeader, { borderBottomColor: colors.line }]}>
                <View style={isDesktop ? styles.nameColDesktop : styles.nameColMobile}>
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

                {isDesktop ? (
                  <View style={styles.statsCol}>
                    <Text style={[styles.colCaption, { color: colors.muted }]}>Серия</Text>
                  </View>
                ) : null}
                <View style={styles.menuSpacer} />
              </View>

              {/* Habit Rows */}
              {habits.map((habit, rowIdx) => {
                const weekDone = days.reduce(
                  (acc, d) => acc + (habit.completedDates.has(d.dateKey) ? 1 : 0),
                  0,
                );
                const dropPos = dropTarget?.id === habit.id ? dropTarget.position : null;
                const isLast = rowIdx === habits.length - 1;

                return (
                  <View
                    key={habit.id}
                    style={[
                      styles.rowWrap,
                      draggingHabitId === habit.id ? styles.dragging : null,
                    ]}>
                    {dropPos === 'before' ? (
                      <View pointerEvents="none" style={[styles.dropLine, styles.dropBefore]} />
                    ) : null}

                    <WebDragBox
                      draggable={Platform.OS === 'web'}
                      onDragStart={(event) => {
                        event.stopPropagation();
                        if (event.dataTransfer) {
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData(HABIT_DRAG_MIME, habit.id);
                          event.dataTransfer.setData('text/plain', habit.id);
                        }
                        setDraggingHabitId(habit.id);
                      }}
                      onDragEnd={() => {
                        setDraggingHabitId(null);
                        setDropTarget(null);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (event.dataTransfer) {
                          event.dataTransfer.dropEffect = 'move';
                        }
                        const pos = resolveDropPos(event);
                        setDropTarget((prev) =>
                          prev?.id === habit.id && prev.position === pos
                            ? prev
                            : { id: habit.id, position: pos },
                        );
                      }}
                      onDragLeave={() => {
                        setDropTarget((prev) => (prev?.id === habit.id ? null : prev));
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        const draggedId =
                          event.dataTransfer?.getData(HABIT_DRAG_MIME) ||
                          event.dataTransfer?.getData('text/plain') ||
                          '';
                        handleDropHabit(draggedId, habit.id, resolveDropPos(event));
                      }}
                      style={[
                        styles.habitRow,
                        !isLast ? { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth } : null,
                        Platform.OS === 'web' ? styles.rowWebDrag : null,
                      ]}>
                      {/* Name & Icon */}
                      <View style={isDesktop ? styles.nameColDesktop : styles.nameColMobile}>
                        <View style={styles.habitIdentity}>
                          {Platform.OS === 'web' ? (
                            <View style={styles.gripIcon}>
                              <AppIcon name="grip" size="xs" color={colors.muted} />
                            </View>
                          ) : null}
                          <View
                            style={[
                              styles.habitIconBox,
                              { backgroundColor: `${habit.color}20` },
                            ]}>
                            <AppIcon name={habit.icon} size="xs" color={habit.color} />
                          </View>
                          <View style={styles.habitTexts}>
                            <Text style={[styles.habitTitle, { color: colors.text }]} numberOfLines={1}>
                              {habit.title}
                            </Text>
                            {!isDesktop ? (
                              <Text style={[styles.mobileStreakSub, { color: colors.muted }]}>
                                {habit.currentStreak > 0 ? `🔥 ${habit.currentStreak}д · ` : ''}
                                {weekDone}/{habit.targetPerWeek}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      </View>

                      {/* Day Check Cells */}
                      <View style={styles.daysRow}>
                        {days.map((day) => {
                          const done = habit.completedDates.has(day.dateKey);
                          return (
                            <View key={day.dateKey} style={styles.dayCellWrap}>
                              <RipplePressable
                                accessibilityLabel={`${habit.title} — ${day.dateKey}`}
                                disabled={day.isFuture}
                                onPress={() => handleToggleCell(habit.id, day.dateKey)}
                                style={StyleSheet.flatten([
                                  styles.checkCell,
                                  {
                                    backgroundColor: done
                                      ? habit.color
                                      : day.isToday
                                        ? colors.surfaceActive
                                        : colors.surfaceSubtle,
                                    borderColor: done
                                      ? habit.color
                                      : day.isToday
                                        ? colors.muted
                                        : colors.line,
                                  },
                                  day.isFuture ? styles.futureCell : null,
                                ])}>
                                {done ? (
                                  <AppIcon name="check" size={13} color="#FFFFFF" strokeWidth={2.6} />
                                ) : null}
                              </RipplePressable>
                            </View>
                          );
                        })}
                      </View>

                      {/* Desktop Streak + Weekly Progress */}
                      {isDesktop ? (
                        <View style={styles.statsCol}>
                          <View style={styles.streakInline}>
                            <AppIcon
                              name="flame"
                              size={12}
                              color={habit.currentStreak > 0 ? colors.warning : colors.muted}
                            />
                            <Text
                              style={[
                                styles.streakNum,
                                {
                                  color: habit.currentStreak > 0 ? colors.text : colors.muted,
                                },
                              ]}>
                              {habit.currentStreak}
                            </Text>
                          </View>
                          <Text style={[styles.goalRatio, { color: colors.muted }]}>
                            {weekDone}/{resolvedDaysCount === 14 ? habit.targetPerWeek * 2 : habit.targetPerWeek}
                          </Text>
                        </View>
                      ) : null}

                      {/* More Menu */}
                      <View
                        ref={(node) => {
                          menuRefs.current[habit.id] = node;
                        }}
                        collapsable={false}
                        style={styles.menuSpacer}>
                        <RipplePressable
                          accessibilityLabel="Настройки привычки"
                          onPress={() => {
                            measureAnchor(menuRefs.current[habit.id], (rect) => {
                              setMenuAnchor(rect);
                              setMenuHabitId(habit.id);
                            });
                          }}
                          style={styles.moreBtn}>
                          <AppIcon name="more" size="xs" color={colors.muted} />
                        </RipplePressable>
                      </View>
                    </WebDragBox>

                    {dropPos === 'after' ? (
                      <View pointerEvents="none" style={[styles.dropLine, styles.dropAfter]} />
                    ) : null}
                  </View>
                );
              })}
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

      {/* Row Actions Popover */}
      <AnchoredPopover
        visible={Boolean(activeMenuHabit)}
        anchor={menuAnchor}
        width={196}
        estimatedHeight={190}
        align="right"
        colors={colors}
        onClose={() => setMenuHabitId(null)}>
        {activeMenuHabit ? (
          <View style={styles.popoverBody}>
            <RipplePressable
              onPress={() => {
                const target = activeMenuHabit;
                setMenuHabitId(null);
                setDialog({ open: true, mode: 'edit', habit: target });
              }}
              style={styles.menuRow}>
              <AppIcon name="edit" size="xs" color={colors.muted} />
              <Text style={[styles.menuRowText, { color: colors.text }]}>Редактировать</Text>
            </RipplePressable>

            {habits.findIndex((h) => h.id === activeMenuHabit.id) > 0 ? (
              <RipplePressable
                onPress={() => {
                  const id = activeMenuHabit.id;
                  setMenuHabitId(null);
                  handleMoveByOffset(id, -1);
                }}
                style={styles.menuRow}>
                <AppIcon name="arrowUp" size="xs" color={colors.muted} />
                <Text style={[styles.menuRowText, { color: colors.text }]}>Поднять выше</Text>
              </RipplePressable>
            ) : null}

            {habits.findIndex((h) => h.id === activeMenuHabit.id) < habits.length - 1 ? (
              <RipplePressable
                onPress={() => {
                  const id = activeMenuHabit.id;
                  setMenuHabitId(null);
                  handleMoveByOffset(id, 1);
                }}
                style={styles.menuRow}>
                <AppIcon name="arrowDown" size="xs" color={colors.muted} />
                <Text style={[styles.menuRowText, { color: colors.text }]}>Опустить ниже</Text>
              </RipplePressable>
            ) : null}

            <View style={[styles.menuDivider, { backgroundColor: colors.line }]} />

            <RipplePressable
              onPress={() => {
                const id = activeMenuHabit.id;
                setMenuHabitId(null);
                handleDeleteHabit(id);
              }}
              style={styles.menuRow}>
              <AppIcon name="trash" size="xs" color={colors.danger} />
              <Text style={[styles.menuRowText, { color: colors.danger }]}>Удалить</Text>
            </RipplePressable>
          </View>
        ) : null}
      </AnchoredPopover>

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
    marginBottom: 14,
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
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 4,
  },
  summaryMeta: {
    fontSize: 12,
    fontWeight: '600',
  },
  streakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  streakChipText: {
    fontSize: 11,
    fontWeight: '700',
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
  nameColDesktop: {
    width: 220,
    flexShrink: 0,
  },
  nameColMobile: {
    width: 112,
    flexShrink: 0,
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
    fontWeight: '600',
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
  statsCol: {
    width: 74,
    alignItems: 'flex-end',
    gap: 1,
  },
  menuSpacer: {
    width: 28,
    alignItems: 'flex-end',
  },
  rowWrap: {
    position: 'relative',
  },
  dragging: {
    opacity: 0.35,
  },
  dropLine: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: DROP_BLUE,
    zIndex: 10,
  },
  dropBefore: {
    top: -1,
  },
  dropAfter: {
    bottom: -1,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 8,
  },
  rowWebDrag: {
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'grab',
          userSelect: 'none',
        } as object)
      : null),
  },
  habitIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  gripIcon: {
    opacity: 0.35,
    marginLeft: -4,
  },
  habitIconBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  habitTexts: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  habitTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  mobileStreakSub: {
    fontSize: 10,
    fontWeight: '600',
  },
  dayCellWrap: {
    flex: 1,
    alignItems: 'center',
  },
  checkCell: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  futureCell: {
    opacity: 0.28,
  },
  streakInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  streakNum: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  goalRatio: {
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  moreBtn: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
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
  popoverBody: {
    gap: 2,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderRadius: 8,
  },
  menuRowText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 3,
    marginHorizontal: 6,
  },
  disabled: {
    opacity: 0.35,
  },
});
