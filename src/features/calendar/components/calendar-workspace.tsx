import { type ComponentRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
import {
  loadCalendarBundle,
  rescheduleCalendarItem,
} from '@/features/calendar/calendar-repository';
import {
  buildMonthGrid,
  buildWeekGrid,
  CALENDAR_WEEKDAYS,
  type CalendarDataBundle,
  type CalendarItem,
  type CalendarSourceFilter,
  type CalendarViewMode,
} from '@/features/calendar/types';
import { CardDetailModal } from '@/features/kanban/components/card-detail-modal';
import {
  addSubtask,
  deleteCard,
  deleteSubtask,
  moveCard,
  reorderSubtasks,
  toggleSubtask,
  updateCard,
} from '@/features/kanban/kanban-repository';
import { type KanbanPriority, PRIORITY_META } from '@/features/kanban/types';
import { CreateTodoModal } from '@/features/todos/components/create-todo-modal';
import { TodoDetailModal } from '@/features/todos/components/todo-detail-modal';
import {
  createTodo,
  deleteTodo,
  sendTodoToKanban,
  toggleTodoDone,
  unlinkTodoFromKanban,
  updateTodo,
} from '@/features/todos/todos-repository';
import type { TodoPriority } from '@/features/todos/types';
import { useUndoRedoHotkeys } from '@/hooks/use-undo-redo';
import { useThemeColors, useViewport } from '@/theme/colors';

const CALENDAR_DRAG_MIME = 'application/x-sotaq-calendar-item';

type CalendarUndoEntry =
  | {
      type: 'reschedule';
      item: CalendarItem;
      prevDate: string | null;
      nextDate: string | null;
    }
  | {
      type: 'toggle_todo';
      todoId: string;
      prevDone: boolean;
      nextDone: boolean;
    };

const SOURCE_LABELS: Record<CalendarSourceFilter, string> = {
  all: 'Все источники',
  todo: 'Только задачи',
  kanban: 'Только доска',
};

export function CalendarWorkspace() {
  const db = useDatabase();
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const colors = useThemeColors();
  const { isDesktop } = useViewport();

  const [bundle, setBundle] = useState<CalendarDataBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<CalendarViewMode>('week');
  const [offset, setOffset] = useState(0);
  const [sourceFilter, setSourceFilter] = useState<CalendarSourceFilter>('all');
  const [unscheduledOpen, setUnscheduledOpen] = useState(true);

  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [filterAnchor, setFilterAnchor] = useState<AnchorRect | null>(null);
  const filterBtnRef = useRef<ComponentRef<typeof View>>(null);

  // Modals
  const [createTodoState, setCreateTodoState] = useState<{
    open: boolean;
    dueDate: string | null;
  }>({ open: false, dueDate: null });
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);
  const [selectedCardRef, setSelectedCardRef] = useState<{
    boardId: string;
    cardId: string;
  } | null>(null);

  // Drag-and-drop state
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [hoverDateKey, setHoverDateKey] = useState<string | null>(null);
  const [hoverUnscheduled, setHoverUnscheduled] = useState(false);

  // Undo/Redo stack for quick reschedule/toggle actions
  const pastRef = useRef<CalendarUndoEntry[]>([]);
  const futureRef = useRef<CalendarUndoEntry[]>([]);
  const [historyMeta, setHistoryMeta] = useState({ canUndo: false, canRedo: false });
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const syncHistory = useCallback(() => {
    setHistoryMeta({
      canUndo: pastRef.current.length > 0,
      canRedo: futureRef.current.length > 0,
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) {
      return;
    }
    const next = await loadCalendarBundle(db, userId);
    setBundle(next);
  }, [db, userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    let cancelled = false;
    loadCalendarBundle(db, userId).then((next) => {
      if (!cancelled) {
        setBundle(next);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [db, userId]);

  const pushUndo = useCallback(
    (entry: CalendarUndoEntry) => {
      pastRef.current.push(entry);
      if (pastRef.current.length > 40) {
        pastRef.current.shift();
      }
      futureRef.current = [];
      syncHistory();
    },
    [syncHistory],
  );

  const handleUndo = useCallback(async () => {
    const entry = pastRef.current.pop();
    if (!entry) {
      return;
    }
    futureRef.current.push(entry);
    if (entry.type === 'reschedule') {
      await rescheduleCalendarItem(db, entry.item, entry.prevDate);
    } else {
      await toggleTodoDone(db, entry.todoId, entry.prevDone);
    }
    await refresh();
    syncHistory();
    showToast('Отменено');
  }, [db, refresh, syncHistory, showToast]);

  const handleRedo = useCallback(async () => {
    const entry = futureRef.current.pop();
    if (!entry) {
      return;
    }
    pastRef.current.push(entry);
    if (entry.type === 'reschedule') {
      await rescheduleCalendarItem(db, entry.item, entry.nextDate);
    } else {
      await toggleTodoDone(db, entry.todoId, entry.nextDone);
    }
    await refresh();
    syncHistory();
    showToast('Возвращено');
  }, [db, refresh, syncHistory, showToast]);

  useUndoRedoHotkeys({
    enabled: !createTodoState.open && !selectedTodoId && !selectedCardRef,
    ignoreInsideInputs: true,
    onUndo: () => {
      handleUndo();
    },
    onRedo: () => {
      handleRedo();
    },
  });

  const weekData = useMemo(() => buildWeekGrid(offset), [offset]);
  const monthData = useMemo(() => buildMonthGrid(offset), [offset]);
  const periodTitle = viewMode === 'week' ? weekData.title : monthData.title;

  const filteredItems = useMemo(() => {
    if (!bundle) {
      return [];
    }
    if (sourceFilter === 'all') {
      return bundle.items;
    }
    return bundle.items.filter((item) => item.kind === sourceFilter);
  }, [bundle, sourceFilter]);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of filteredItems) {
      if (!item.dueDate) {
        continue;
      }
      const list = map.get(item.dueDate) ?? [];
      list.push(item);
      map.set(item.dueDate, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => Number(a.isDone) - Number(b.isDone));
    }
    return map;
  }, [filteredItems]);

  const unscheduledItems = useMemo(
    () => filteredItems.filter((item) => !item.dueDate && !item.isDone),
    [filteredItems],
  );

  const itemByKey = useMemo(() => {
    const map = new Map<string, CalendarItem>();
    for (const item of bundle?.items ?? []) {
      map.set(item.key, item);
    }
    return map;
  }, [bundle]);

  const selectedTodo = useMemo(() => {
    if (!selectedTodoId || !bundle) {
      return null;
    }
    return bundle.items.find((i) => i.kind === 'todo' && i.id === selectedTodoId)?.todo ?? null;
  }, [selectedTodoId, bundle]);

  const selectedCardContext = useMemo(() => {
    if (!selectedCardRef || !bundle) {
      return null;
    }
    const board = bundle.boardsById[selectedCardRef.boardId];
    if (!board) {
      return null;
    }
    const card = board.cards.find((c) => c.id === selectedCardRef.cardId) ?? null;
    if (!card) {
      return null;
    }
    const colCards = board.cards.filter((c) => c.columnId === card.columnId);
    const cardIndex = colCards.findIndex((c) => c.id === card.id);
    return {
      card,
      columns: board.columns,
      cardIndex: Math.max(0, cardIndex),
      columnCardCount: colCards.length,
    };
  }, [selectedCardRef, bundle]);

  function openItem(item: CalendarItem) {
    if (item.kind === 'todo') {
      setSelectedTodoId(item.id);
    } else if (item.boardId) {
      setSelectedCardRef({ boardId: item.boardId, cardId: item.id });
    }
  }

  async function handleToggleItemDone(item: CalendarItem) {
    if (item.kind !== 'todo') {
      return;
    }
    const nextDone = !item.isDone;
    pushUndo({ type: 'toggle_todo', todoId: item.id, prevDone: item.isDone, nextDone });
    await toggleTodoDone(db, item.id, nextDone);
    await refresh();
  }

  async function handleDropOnDate(event: WebDomDragEvent, targetDateKey: string | null) {
    event.preventDefault();
    event.stopPropagation();
    setHoverDateKey(null);
    setHoverUnscheduled(false);

    const key =
      event.dataTransfer?.getData(CALENDAR_DRAG_MIME) ||
      event.dataTransfer?.getData('text/plain') ||
      draggingKey ||
      '';
    setDraggingKey(null);
    if (!key) {
      return;
    }
    const item = itemByKey.get(key);
    if (!item || item.dueDate === targetDateKey) {
      return;
    }

    pushUndo({
      type: 'reschedule',
      item,
      prevDate: item.dueDate,
      nextDate: targetDateKey,
    });
    await rescheduleCalendarItem(db, item, targetDateKey);
    await refresh();
    showToast(targetDateKey ? `Перенесено на ${targetDateKey}` : 'Срок убран');
  }

  async function handleDropTrash(event: WebDomDragEvent) {
    const key =
      event.dataTransfer?.getData(CALENDAR_DRAG_MIME) ||
      event.dataTransfer?.getData('text/plain') ||
      draggingKey ||
      '';
    setDraggingKey(null);
    setHoverDateKey(null);
    setHoverUnscheduled(false);
    if (!key) {
      return;
    }
    const item = itemByKey.get(key);
    if (!item) {
      return;
    }
    if (item.kind === 'todo') {
      await deleteTodo(db, item.id);
      if (selectedTodoId === item.id) {
        setSelectedTodoId(null);
      }
      showToast('Задача удалена');
    } else {
      await deleteCard(db, item.id);
      if (selectedCardRef?.cardId === item.id) {
        setSelectedCardRef(null);
      }
      showToast('Карточка удалена');
    }
    await refresh();
  }

  function renderItemChip(item: CalendarItem, compact = false) {
    const isDragging = draggingKey === item.key;

    return (
      <WebDragBox
        key={item.key}
        draggable={Platform.OS === 'web'}
        onDragStart={(event) => {
          event.stopPropagation();
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData(CALENDAR_DRAG_MIME, item.key);
            event.dataTransfer.setData('text/plain', item.key);
          }
          setDraggingKey(item.key);
        }}
        onDragEnd={() => {
          setDraggingKey(null);
          setHoverDateKey(null);
          setHoverUnscheduled(false);
        }}
        style={[
          compact ? styles.monthChip : styles.weekChip,
          {
            backgroundColor: colors.surfaceSubtle,
            borderColor: colors.line,
            borderLeftColor: item.accentColor,
          },
          item.isDone ? styles.itemDone : null,
          isDragging ? styles.dragging : null,
          Platform.OS === 'web' ? styles.draggableChip : null,
        ]}>
        <View style={styles.chipRow}>
          {item.kind === 'todo' ? (
            <Pressable
              hitSlop={4}
              onPress={() => handleToggleItemDone(item)}
              style={[
                styles.miniCheck,
                {
                  borderColor: item.isDone ? colors.success : colors.muted,
                  backgroundColor: item.isDone ? colors.success : 'transparent',
                },
              ]}>
              {item.isDone ? <AppIcon name="check" size={9} color="#FFFFFF" strokeWidth={2.8} /> : null}
            </Pressable>
          ) : (
            <AppIcon name="kanban" size={11} color={item.accentColor} />
          )}

          <Pressable onPress={() => openItem(item)} style={styles.chipTitleHit}>
            <Text
              style={[
                compact ? styles.monthChipText : styles.weekChipText,
                { color: colors.text },
                item.isDone ? styles.strike : null,
              ]}
              numberOfLines={compact ? 1 : 2}>
              {item.title}
            </Text>
          </Pressable>
        </View>

        {!compact ? (
          <View style={styles.chipMetaRow}>
            <View
              style={[
                styles.priorityDot,
                { backgroundColor: PRIORITY_META[item.priority].dotColor },
              ]}
            />
            <Text style={[styles.chipBadgeText, { color: colors.muted }]} numberOfLines={1}>
              {item.badgeLabel}
            </Text>
          </View>
        ) : null}
      </WebDragBox>
    );
  }

  if (loading || !bundle) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator size="small" color={colors.text} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, isDesktop ? styles.screenDesktop : styles.screenMobile]}>
      {/* Unified Clean Top Toolbar */}
      <View style={styles.toolbar}>
        <View style={styles.toolbarLeft}>
          <View
            style={[
              styles.navGroup,
              { backgroundColor: colors.surface, borderColor: colors.line },
            ]}>
            <RipplePressable
              accessibilityLabel="Предыдущий период"
              onPress={() => setOffset((v) => v - 1)}
              style={styles.navIconBtn}>
              <AppIcon name="chevronLeft" size="xs" color={colors.muted} />
            </RipplePressable>

            <RipplePressable onPress={() => setOffset(0)} style={styles.periodBtn}>
              <Text style={[styles.periodText, { color: colors.text }]} numberOfLines={1}>
                {periodTitle}
              </Text>
            </RipplePressable>

            <RipplePressable
              accessibilityLabel="Следующий период"
              onPress={() => setOffset((v) => v + 1)}
              style={styles.navIconBtn}>
              <AppIcon name="chevronRight" size="xs" color={colors.muted} />
            </RipplePressable>
          </View>

          {offset !== 0 ? (
            <RipplePressable
              onPress={() => setOffset(0)}
              style={StyleSheet.flatten([
                styles.todayBtn,
                { backgroundColor: colors.surface, borderColor: colors.line },
              ])}>
              <Text style={[styles.todayBtnText, { color: colors.text }]}>Сегодня</Text>
            </RipplePressable>
          ) : null}

          {isDesktop ? (
            <View
              style={[
                styles.segmented,
                { backgroundColor: colors.surface, borderColor: colors.line },
              ]}>
              {(
                [
                  { key: 'week', label: 'Неделя' },
                  { key: 'month', label: 'Месяц' },
                ] as const
              ).map((m) => {
                const active = viewMode === m.key;
                return (
                  <RipplePressable
                    key={m.key}
                    onPress={() => {
                      setViewMode(m.key);
                      setOffset(0);
                    }}
                    style={StyleSheet.flatten([
                      styles.segBtn,
                      active ? { backgroundColor: colors.surfaceActive } : null,
                    ])}>
                    <Text
                      style={[
                        styles.segText,
                        { color: active ? colors.text : colors.muted },
                      ]}>
                      {m.label}
                    </Text>
                  </RipplePressable>
                );
              })}
            </View>
          ) : null}
        </View>

        <View style={styles.toolbarRight}>
          {isDesktop ? (
            <>
              <View ref={filterBtnRef} collapsable={false}>
                <RipplePressable
                  onPress={() => {
                    measureAnchor(filterBtnRef.current, (rect) => {
                      setFilterAnchor(rect);
                      setFilterMenuOpen(true);
                    });
                  }}
                  style={StyleSheet.flatten([
                    styles.filterBtn,
                    {
                      backgroundColor:
                        sourceFilter !== 'all' || filterMenuOpen
                          ? colors.surfaceActive
                          : colors.surface,
                      borderColor:
                        sourceFilter !== 'all' || filterMenuOpen ? colors.text : colors.line,
                    },
                  ])}>
                  <AppIcon name="filter" size="xs" color={colors.muted} />
                  <Text
                    style={[
                      styles.filterBtnText,
                      { color: sourceFilter !== 'all' ? colors.text : colors.muted },
                    ]}>
                    {SOURCE_LABELS[sourceFilter]}
                  </Text>
                  <AppIcon name="chevronDown" size={11} color={colors.muted} />
                </RipplePressable>
              </View>

              <RipplePressable
                onPress={() => setUnscheduledOpen((v) => !v)}
                style={StyleSheet.flatten([
                  styles.filterBtn,
                  {
                    backgroundColor: unscheduledOpen ? colors.surfaceActive : colors.surface,
                    borderColor: unscheduledOpen ? colors.text : colors.line,
                  },
                ])}>
                <Text
                  style={[
                    styles.filterBtnText,
                    { color: unscheduledOpen ? colors.text : colors.muted },
                  ]}>
                  Без срока ({unscheduledItems.length})
                </Text>
              </RipplePressable>

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
                onPress={() => setCreateTodoState({ open: true, dueDate: weekData.days[0]?.dateKey ?? null })}
                style={StyleSheet.flatten([
                  styles.primaryBtn,
                  { backgroundColor: colors.accent },
                ])}>
                <AppIcon name="plus" size="xs" color={colors.accentText} />
                <Text style={[styles.primaryBtnText, { color: colors.accentText }]}>Задача</Text>
              </RipplePressable>
            </>
          ) : (
            <>
              <RipplePressable
                accessibilityLabel="Новая задача"
                onPress={() =>
                  setCreateTodoState({ open: true, dueDate: weekData.days.find((d) => d.isToday)?.dateKey ?? null })
                }
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

      {/* Main Split Body: Calendar Grid + Unscheduled Tray */}
      <View style={[styles.bodySplit, !isDesktop ? styles.bodySplitMobile : null]}>
        <View style={styles.calendarMain}>
          {viewMode === 'week' ? (
            isDesktop ? (
              <View style={styles.weekGridDesktop}>
                {weekData.days.map((day) => {
                  const dayItems = itemsByDate.get(day.dateKey) ?? [];
                  const isHover = hoverDateKey === day.dateKey;
                  return (
                    <WebDragBox
                      key={day.dateKey}
                      onDragOver={(event) => {
                        if (!draggingKey) {
                          return;
                        }
                        event.preventDefault();
                        event.stopPropagation();
                        if (event.dataTransfer) {
                          event.dataTransfer.dropEffect = 'move';
                        }
                        if (hoverDateKey !== day.dateKey) {
                          setHoverDateKey(day.dateKey);
                        }
                      }}
                      onDragLeave={() => {
                        setHoverDateKey((prev) => (prev === day.dateKey ? null : prev));
                      }}
                      onDrop={(event) => handleDropOnDate(event, day.dateKey)}
                      style={[
                        styles.weekCol,
                        {
                          backgroundColor: isHover ? colors.surfaceActive : colors.surface,
                          borderColor: isHover
                            ? colors.accent
                            : day.isToday
                              ? colors.muted
                              : colors.line,
                        },
                      ]}>
                      <View style={[styles.weekColHeader, { borderBottomColor: colors.line }]}>
                        <View style={styles.weekColTitleGroup}>
                          <Text
                            style={[
                              styles.weekdayLabel,
                              { color: day.isToday ? colors.text : colors.muted },
                            ]}>
                            {day.weekdayShort}
                          </Text>
                          <View
                            style={[
                              styles.dayNumCircle,
                              day.isToday ? { backgroundColor: colors.accent } : null,
                            ]}>
                            <Text
                              style={[
                                styles.dayNumLabel,
                                { color: day.isToday ? colors.accentText : colors.text },
                              ]}>
                              {day.dayNum}
                            </Text>
                          </View>
                        </View>

                        <RipplePressable
                          accessibilityLabel={`Добавить задачу на ${day.dateKey}`}
                          onPress={() =>
                            setCreateTodoState({ open: true, dueDate: day.dateKey })
                          }
                          style={styles.colAddBtn}>
                          <AppIcon name="plus" size="xs" color={colors.muted} />
                        </RipplePressable>
                      </View>

                      <ScrollView
                        style={styles.weekColScroll}
                        contentContainerStyle={styles.weekColList}
                        showsVerticalScrollIndicator={false}>
                        {dayItems.length === 0 ? (
                          <Text style={[styles.emptyDayHint, { color: colors.muted }]}>—</Text>
                        ) : (
                          dayItems.map((item) => renderItemChip(item, false))
                        )}
                      </ScrollView>
                    </WebDragBox>
                  );
                })}
              </View>
            ) : (
              <ScrollView
                style={styles.mobileScroll}
                contentContainerStyle={styles.mobileDaysList}>
                {weekData.days.map((day) => {
                  const dayItems = itemsByDate.get(day.dateKey) ?? [];
                  return (
                    <View
                      key={day.dateKey}
                      style={[
                        styles.mobileDayCard,
                        {
                          backgroundColor: colors.surface,
                          borderColor: day.isToday ? colors.muted : colors.line,
                        },
                      ]}>
                      <View style={styles.mobileDayHeader}>
                        <View style={styles.weekColTitleGroup}>
                          <Text style={[styles.weekdayLabel, { color: colors.muted }]}>
                            {day.weekdayShort}
                          </Text>
                          <View
                            style={[
                              styles.dayNumCircle,
                              day.isToday ? { backgroundColor: colors.accent } : null,
                            ]}>
                            <Text
                              style={[
                                styles.dayNumLabel,
                                { color: day.isToday ? colors.accentText : colors.text },
                              ]}>
                              {day.dayNum}
                            </Text>
                          </View>
                        </View>
                        <RipplePressable
                          onPress={() =>
                            setCreateTodoState({ open: true, dueDate: day.dateKey })
                          }
                          style={styles.colAddBtn}>
                          <AppIcon name="plus" size="xs" color={colors.muted} />
                        </RipplePressable>
                      </View>
                      {dayItems.length > 0 ? (
                        <View style={styles.weekColList}>
                          {dayItems.map((item) => renderItemChip(item, false))}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </ScrollView>
            )
          ) : (
            <View
              style={[
                styles.monthWrap,
                { backgroundColor: colors.surface, borderColor: colors.line },
              ]}>
              <View style={[styles.monthWeekdayRow, { borderBottomColor: colors.line }]}>
                {CALENDAR_WEEKDAYS.map((wd) => (
                  <View key={wd} style={styles.monthWeekdayCell}>
                    <Text style={[styles.weekdayLabel, { color: colors.muted }]}>{wd}</Text>
                  </View>
                ))}
              </View>

              <ScrollView style={styles.monthScroll} contentContainerStyle={styles.monthGrid}>
                {monthData.cells.map((cell) => {
                  const dayItems = itemsByDate.get(cell.dateKey) ?? [];
                  const isHover = hoverDateKey === cell.dateKey;
                  return (
                    <WebDragBox
                      key={cell.dateKey}
                      onDragOver={(event) => {
                        if (!draggingKey) {
                          return;
                        }
                        event.preventDefault();
                        event.stopPropagation();
                        if (event.dataTransfer) {
                          event.dataTransfer.dropEffect = 'move';
                        }
                        if (hoverDateKey !== cell.dateKey) {
                          setHoverDateKey(cell.dateKey);
                        }
                      }}
                      onDragLeave={() => {
                        setHoverDateKey((prev) => (prev === cell.dateKey ? null : prev));
                      }}
                      onDrop={(event) => handleDropOnDate(event, cell.dateKey)}
                      style={[
                        styles.monthCell,
                        {
                          borderColor: isHover ? colors.accent : colors.line,
                          backgroundColor: isHover
                            ? colors.surfaceActive
                            : cell.isCurrentMonth
                              ? 'transparent'
                              : colors.surfaceSubtle,
                        },
                      ]}>
                      <View style={styles.monthCellTop}>
                        <View
                          style={[
                            styles.monthDayBadge,
                            cell.isToday ? { backgroundColor: colors.accent } : null,
                          ]}>
                          <Text
                            style={[
                              styles.monthDayNum,
                              {
                                color: cell.isToday
                                  ? colors.accentText
                                  : cell.isCurrentMonth
                                    ? colors.text
                                    : colors.muted,
                              },
                            ]}>
                            {cell.dayNum}
                          </Text>
                        </View>
                        <RipplePressable
                          accessibilityLabel={`Добавить на ${cell.dateKey}`}
                          onPress={() =>
                            setCreateTodoState({ open: true, dueDate: cell.dateKey })
                          }
                          style={styles.monthAddBtn}>
                          <AppIcon name="plus" size={11} color={colors.muted} />
                        </RipplePressable>
                      </View>

                      <View style={styles.monthCellItems}>
                        {dayItems.slice(0, 4).map((item) => renderItemChip(item, true))}
                        {dayItems.length > 4 ? (
                          <Text style={[styles.moreCountText, { color: colors.muted }]}>
                            +{dayItems.length - 4} ещё
                          </Text>
                        ) : null}
                      </View>
                    </WebDragBox>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Unscheduled Tray (Desktop side panel) */}
        {isDesktop && unscheduledOpen ? (
          <WebDragBox
            onDragOver={(event) => {
              if (!draggingKey) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'move';
              }
              if (!hoverUnscheduled) {
                setHoverUnscheduled(true);
              }
            }}
            onDragLeave={() => setHoverUnscheduled(false)}
            onDrop={(event) => handleDropOnDate(event, null)}
            style={[
              styles.unscheduledPane,
              {
                backgroundColor: hoverUnscheduled ? colors.surfaceActive : colors.surface,
                borderColor: hoverUnscheduled ? colors.accent : colors.line,
              },
            ]}>
            <View style={[styles.unscheduledHeader, { borderBottomColor: colors.line }]}>
              <Text style={[styles.unscheduledTitle, { color: colors.text }]}>
                Без срока ({unscheduledItems.length})
              </Text>
              <Text style={[styles.unscheduledHint, { color: colors.muted }]}>
                {hoverUnscheduled ? 'Отпустите, чтобы убрать дату' : 'Перетащите на день'}
              </Text>
            </View>

            <ScrollView
              style={styles.weekColScroll}
              contentContainerStyle={styles.weekColList}
              showsVerticalScrollIndicator={false}>
              {unscheduledItems.length === 0 ? (
                <Text style={[styles.emptyDayHint, { color: colors.muted }]}>
                  Все активные дела распределены по датам
                </Text>
              ) : (
                unscheduledItems.map((item) => renderItemChip(item, false))
              )}
            </ScrollView>
          </WebDragBox>
        ) : null}
      </View>

      {/* Source Filter Popover */}
      <AnchoredPopover
        visible={filterMenuOpen}
        anchor={filterAnchor}
        width={190}
        estimatedHeight={140}
        align="right"
        colors={colors}
        onClose={() => setFilterMenuOpen(false)}>
        <View style={styles.popoverBody}>
          {(['all', 'todo', 'kanban'] as const).map((key) => {
            const active = sourceFilter === key;
            return (
              <RipplePressable
                key={key}
                onPress={() => {
                  setSourceFilter(key);
                  setFilterMenuOpen(false);
                }}
                style={StyleSheet.flatten([
                  styles.menuRow,
                  active ? { backgroundColor: colors.surfaceActive } : null,
                ])}>
                <Text style={[styles.menuRowText, { color: colors.text }]}>
                  {SOURCE_LABELS[key]}
                </Text>
                {active ? <AppIcon name="check" size="xs" color={colors.text} /> : null}
              </RipplePressable>
            );
          })}
        </View>
      </AnchoredPopover>

      {/* Create Todo Modal */}
      <CreateTodoModal
        visible={createTodoState.open}
        lists={bundle.lists}
        initialListId={bundle.lists[0]?.id ?? null}
        initialDueDate={createTodoState.dueDate}
        onClose={() => setCreateTodoState({ open: false, dueDate: null })}
        onCreate={async (input: {
          title: string;
          notes: string;
          listId: string | null;
          priority: TodoPriority;
          dueDate: string | null;
        }) => {
          if (!userId) {
            return;
          }
          await createTodo(db, userId, input);
          await refresh();
        }}
      />

      {/* Todo Detail Modal */}
      <TodoDetailModal
        todo={selectedTodo}
        lists={bundle.lists}
        kanbanTargets={bundle.kanbanTargets}
        onClose={() => setSelectedTodoId(null)}
        onSave={async (todoId, patch) => {
          await updateTodo(db, todoId, patch);
          await refresh();
        }}
        onToggleDone={async (todoId, isDone) => {
          await toggleTodoDone(db, todoId, isDone);
          await refresh();
        }}
        onDelete={async (todoId) => {
          await deleteTodo(db, todoId);
          setSelectedTodoId(null);
          await refresh();
        }}
        onSendToKanban={async (todoId, boardId, columnId) => {
          await sendTodoToKanban(db, todoId, boardId, columnId);
          await refresh();
        }}
        onUnlinkKanban={async (todoId) => {
          await unlinkTodoFromKanban(db, todoId);
          await refresh();
        }}
      />

      {/* Kanban Card Detail Modal */}
      <CardDetailModal
        card={selectedCardContext?.card ?? null}
        columns={selectedCardContext?.columns ?? []}
        cardIndex={selectedCardContext?.cardIndex ?? 0}
        columnCardCount={selectedCardContext?.columnCardCount ?? 0}
        onClose={() => setSelectedCardRef(null)}
        onSave={async (
          cardId,
          patch: {
            title: string;
            description: string;
            priority: KanbanPriority;
            dueDate: string | null;
          },
        ) => {
          await updateCard(db, cardId, patch);
          await refresh();
        }}
        onMoveColumn={async (cardId, targetColumnId) => {
          await moveCard(db, cardId, targetColumnId, 0);
          await refresh();
        }}
        onReorder={async () => {
          // Reorder within column is handled on the Kanban board
        }}
        onDelete={async (cardId) => {
          await deleteCard(db, cardId);
          setSelectedCardRef(null);
          await refresh();
        }}
        onAddSubtask={async (cardId, title) => {
          await addSubtask(db, cardId, title);
          await refresh();
        }}
        onToggleSubtask={async (_cardId, subtaskId, isDone) => {
          await toggleSubtask(db, subtaskId, isDone);
          await refresh();
        }}
        onDeleteSubtask={async (_cardId, subtaskId) => {
          await deleteSubtask(db, subtaskId);
          await refresh();
        }}
        onReorderSubtasks={async (cardId, orderedIds) => {
          await reorderSubtasks(db, cardId, orderedIds);
          await refresh();
        }}
      />

      <DragTrashZone
        visible={draggingKey !== null}
        label="Удалить элемент"
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
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
  },
  screenMobile: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
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
  periodBtn: {
    paddingHorizontal: 8,
    height: 28,
    justifyContent: 'center',
  },
  periodText: {
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
  toolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
  },
  filterBtnText: {
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
  bodySplit: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 0,
  },
  bodySplitMobile: {
    flexDirection: 'column',
  },
  calendarMain: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  weekGridDesktop: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 0,
  },
  weekCol: {
    flex: 1,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    minWidth: 0,
  },
  weekColHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  weekColTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  weekdayLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  dayNumCircle: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumLabel: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  colAddBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekColScroll: {
    flex: 1,
  },
  weekColList: {
    padding: 7,
    gap: 6,
  },
  emptyDayHint: {
    fontSize: 12,
    textAlign: 'center',
    opacity: 0.45,
    paddingVertical: 14,
  },
  weekChip: {
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 4,
  },
  monthChip: {
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 2.5,
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  draggableChip: {
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'grab',
          userSelect: 'none',
        } as object)
      : null),
  },
  dragging: {
    opacity: 0.35,
  },
  itemDone: {
    opacity: 0.55,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniCheck: {
    width: 14,
    height: 14,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  chipTitleHit: {
    flex: 1,
    minWidth: 0,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  weekChipText: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  monthChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  strike: {
    textDecorationLine: 'line-through',
  },
  chipMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 18,
  },
  priorityDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  chipBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    flexShrink: 1,
  },
  unscheduledPane: {
    width: 236,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    flexShrink: 0,
  },
  unscheduledHeader: {
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  unscheduledTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  unscheduledHint: {
    fontSize: 11,
  },
  monthWrap: {
    flex: 1,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  monthWeekdayRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 7,
  },
  monthWeekdayCell: {
    flex: 1,
    alignItems: 'center',
  },
  monthScroll: {
    flex: 1,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  monthCell: {
    width: `${100 / 7}%` as `${number}%`,
    minHeight: 112,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    padding: 5,
    gap: 4,
  },
  monthCellTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthDayBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthDayNum: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  monthAddBtn: {
    width: 20,
    height: 20,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.7,
  },
  monthCellItems: {
    gap: 3,
  },
  moreCountText: {
    fontSize: 10,
    fontWeight: '600',
    paddingLeft: 4,
  },
  mobileScroll: {
    flex: 1,
  },
  mobileDaysList: {
    gap: 10,
    paddingBottom: 24,
  },
  mobileDayCard: {
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 11,
    gap: 8,
  },
  mobileDayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  popoverBody: {
    gap: 2,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
});
