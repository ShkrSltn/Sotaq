import { type ComponentRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AnchoredPopover,
  type AnchorRect,
  measureAnchor,
} from '@/components/anchored-popover';
import { AppIcon } from '@/components/app-icon';
import { FadeIn as ContentFade, ScreenLoader } from '@/components/screen-loader';
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
  CALENDAR_DRAG_MIME,
  CalendarItemChip,
} from '@/features/calendar/components/calendar-item-chip';
import {
  buildDayView,
  buildMonthGrid,
  buildWeekGrid,
  CALENDAR_WEEKDAYS,
  type CalendarDataBundle,
  type CalendarItem,
  type CalendarSourceFilter,
  type CalendarViewMode,
  formatShortDateRu,
  getDayOffsetForDateKey,
  getTodayDateKey,
} from '@/features/calendar/types';
import { useFocus } from '@/features/focus/focus-context';
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
import type { KanbanPriority } from '@/features/kanban/types';
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

type CalendarUndoEntry =
  | {
      type: 'reschedule_batch';
      moves: { item: CalendarItem; prevDate: string | null; nextDate: string | null }[];
    }
  | {
      type: 'toggle_todo';
      todoId: string;
      prevDone: boolean;
      nextDone: boolean;
    };

const SOURCE_LABELS: Record<CalendarSourceFilter, string> = {
  all: 'Все',
  todo: 'Задачи',
  kanban: 'Доска',
};

export function CalendarWorkspace() {
  const db = useDatabase();
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const colors = useThemeColors();
  const { isDesktop } = useViewport();
  const insets = useSafeAreaInsets();
  const focus = useFocus();

  const [bundle, setBundle] = useState<CalendarDataBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<CalendarViewMode>('week');
  const [offset, setOffset] = useState(0);
  const [sourceFilter, setSourceFilter] = useState<CalendarSourceFilter>('all');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(true);
  const [mobileInboxOpen, setMobileInboxOpen] = useState(false);
  const [mobileMonthDateKey, setMobileMonthDateKey] = useState<string>(() => getTodayDateKey());

  // Inline quick-add inside a day column, day view, or unscheduled tray
  const [inlineAddDateKey, setInlineAddDateKey] = useState<string | null>(null);
  const [inlineAddDraft, setInlineAddDraft] = useState('');
  const [dayQuickDraft, setDayQuickDraft] = useState('');
  const [dayDoneExpanded, setDayDoneExpanded] = useState(true);
  const [unscheduledDraft, setUnscheduledDraft] = useState('');

  // Popovers
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [filterAnchor, setFilterAnchor] = useState<AnchorRect | null>(null);
  const filterBtnRef = useRef<ComponentRef<typeof View>>(null);

  const [dayPopover, setDayPopover] = useState<{
    dateKey: string;
    anchor: AnchorRect;
  } | null>(null);
  const monthCellRefs = useRef<Record<string, ComponentRef<typeof View> | null>>({});

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

  // Undo/Redo stack
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
    toastTimerRef.current = setTimeout(() => setToast(null), 1900);
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
    if (entry.type === 'reschedule_batch') {
      for (const move of entry.moves) {
        await rescheduleCalendarItem(db, move.item, move.prevDate);
      }
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
    if (entry.type === 'reschedule_batch') {
      for (const move of entry.moves) {
        await rescheduleCalendarItem(db, move.item, move.nextDate);
      }
    } else {
      await toggleTodoDone(db, entry.todoId, entry.nextDone);
    }
    await refresh();
    syncHistory();
    showToast('Возвращено');
  }, [db, refresh, syncHistory, showToast]);

  const anyModalOpen = Boolean(
    createTodoState.open || selectedTodoId || selectedCardRef || dayPopover,
  );

  useUndoRedoHotkeys({
    enabled: !anyModalOpen,
    ignoreInsideInputs: true,
    onUndo: () => {
      handleUndo();
    },
    onRedo: () => {
      handleRedo();
    },
  });

  // Web keyboard navigation: Left/Right period, T = Today, W = Week, M = Month
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || anyModalOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
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
        setOffset((v) => v - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setOffset((v) => v + 1);
      } else if (event.code === 'KeyT') {
        event.preventDefault();
        setOffset(0);
      } else if (event.code === 'KeyD') {
        event.preventDefault();
        setViewMode('day');
        setOffset(0);
      } else if (event.code === 'KeyW') {
        event.preventDefault();
        setViewMode('week');
        setOffset(0);
      } else if (event.code === 'KeyM') {
        event.preventDefault();
        setViewMode('month');
        setOffset(0);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [anyModalOpen]);

  const todayKey = getTodayDateKey();
  const dayData = useMemo(() => buildDayView(offset), [offset]);
  const weekData = useMemo(() => buildWeekGrid(offset), [offset]);
  const monthData = useMemo(() => buildMonthGrid(offset), [offset]);
  const periodTitle =
    viewMode === 'day' ? dayData.title : viewMode === 'week' ? weekData.title : monthData.title;
  const defaultNewTodoDate = viewMode === 'day' ? dayData.day.dateKey : todayKey;

  function openDayView(dateKey: string) {
    setDayPopover(null);
    setViewMode('day');
    setOffset(getDayOffsetForDateKey(dateKey));
  }

  const filteredItems = useMemo(() => {
    if (!bundle) {
      return [];
    }
    return bundle.items.filter((item) => {
      if (sourceFilter !== 'all' && item.kind !== sourceFilter) {
        return false;
      }
      if (hideCompleted && item.isDone) {
        return false;
      }
      return true;
    });
  }, [bundle, sourceFilter, hideCompleted]);

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

  const overdueItems = useMemo(
    () =>
      filteredItems
        .filter((item) => !item.isDone && Boolean(item.dueDate) && (item.dueDate ?? '') < todayKey)
        .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')),
    [filteredItems, todayKey],
  );

  const unscheduledItems = useMemo(
    () => filteredItems.filter((item) => !item.dueDate && !item.isDone),
    [filteredItems],
  );

  const inboxCount = overdueItems.length + unscheduledItems.length;

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
    setDayPopover(null);
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

  async function handleRescheduleItem(item: CalendarItem, nextDate: string | null) {
    if (item.dueDate === nextDate) {
      return;
    }
    pushUndo({
      type: 'reschedule_batch',
      moves: [{ item, prevDate: item.dueDate, nextDate }],
    });
    await rescheduleCalendarItem(db, item, nextDate);
    await refresh();
    showToast(nextDate ? `Перенесено на ${formatShortDateRu(nextDate)}` : 'Срок убран');
  }

  async function handleMoveAllOverdueToToday() {
    if (overdueItems.length === 0) {
      return;
    }
    const moves = overdueItems.map((item) => ({
      item,
      prevDate: item.dueDate,
      nextDate: todayKey,
    }));
    pushUndo({ type: 'reschedule_batch', moves });
    for (const move of moves) {
      await rescheduleCalendarItem(db, move.item, todayKey);
    }
    await refresh();
    showToast(`Перенесено на сегодня: ${moves.length}`);
  }

  function handleSendToFocus(item: CalendarItem) {
    focus.linkTarget({
      type: item.kind === 'todo' ? 'todo' : 'kanban_card',
      id: item.id,
      title: item.title,
      subtitle: item.badgeLabel,
    });
    if (!focus.isRunning) {
      focus.start();
    }
    showToast(`В фокусе: ${item.title}`);
  }

  async function handleDeleteItem(item: CalendarItem) {
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

  async function handleInlineAddSubmit(dateKey: string) {
    const clean = inlineAddDraft.trim();
    if (!clean || !userId) {
      setInlineAddDateKey(null);
      setInlineAddDraft('');
      return;
    }
    await createTodo(db, userId, {
      title: clean,
      listId: bundle?.lists[0]?.id ?? null,
      dueDate: dateKey,
      priority: 'medium',
    });
    setInlineAddDraft('');
    setInlineAddDateKey(null);
    await refresh();
  }

  async function handleDayQuickAdd() {
    const clean = dayQuickDraft.trim();
    if (!clean || !userId) {
      return;
    }
    await createTodo(db, userId, {
      title: clean,
      listId: bundle?.lists[0]?.id ?? null,
      dueDate: dayData.day.dateKey,
      priority: 'medium',
    });
    setDayQuickDraft('');
    await refresh();
  }

  async function handleUnscheduledQuickAdd() {
    const clean = unscheduledDraft.trim();
    if (!clean || !userId) {
      return;
    }
    await createTodo(db, userId, {
      title: clean,
      listId: bundle?.lists[0]?.id ?? null,
      dueDate: null,
      priority: 'medium',
    });
    setUnscheduledDraft('');
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
    if (!item) {
      return;
    }
    await handleRescheduleItem(item, targetDateKey);
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
    if (item) {
      await handleDeleteItem(item);
    }
  }

  function renderChip(
    item: CalendarItem,
    options?: { compact?: boolean; showOverdueDate?: boolean },
  ) {
    return (
      <CalendarItemChip
        key={item.key}
        item={item}
        colors={colors}
        compact={options?.compact}
        showOverdueDate={options?.showOverdueDate}
        isDragging={draggingKey === item.key}
        onOpen={openItem}
        onToggleDone={handleToggleItemDone}
        onReschedule={handleRescheduleItem}
        onSendToFocus={handleSendToFocus}
        onDelete={handleDeleteItem}
        onDragStart={(key) => setDraggingKey(key)}
        onDragEnd={() => {
          setDraggingKey(null);
          setHoverDateKey(null);
          setHoverUnscheduled(false);
        }}
      />
    );
  }

  function renderInboxContent() {
    return (
      <>
        {overdueItems.length > 0 ? (
          <View style={[styles.overdueBlock, { borderBottomColor: colors.line }]}>
            <View style={styles.overdueHeader}>
              <View style={styles.overdueTitleRow}>
                <View style={[styles.overdueDot, { backgroundColor: colors.danger }]} />
                <Text style={[styles.overdueTitle, { color: colors.danger }]}>
                  Просрочено ({overdueItems.length})
                </Text>
              </View>

              <RipplePressable
                onPress={handleMoveAllOverdueToToday}
                style={StyleSheet.flatten([
                  styles.moveTodayBtn,
                  { backgroundColor: colors.dangerBg },
                ])}>
                <Text style={[styles.moveTodayText, { color: colors.danger }]}>На сегодня</Text>
              </RipplePressable>
            </View>

            <View style={styles.inboxList}>
              {overdueItems.map((item) => renderChip(item, { showOverdueDate: true }))}
            </View>
          </View>
        ) : null}

        <View style={styles.unscheduledSection}>
          <View style={styles.unscheduledHeader}>
            <Text style={[styles.unscheduledTitle, { color: colors.text }]}>
              Без срока ({unscheduledItems.length})
            </Text>
            <Text style={[styles.unscheduledHint, { color: colors.muted }]}>
              {hoverUnscheduled ? 'Отпустите, чтобы убрать дату' : 'Перетащите на нужный день'}
            </Text>
          </View>

          <View style={styles.inboxList}>
            {unscheduledItems.length === 0 ? (
              <Text style={[styles.emptyInboxText, { color: colors.muted }]}>
                Все активные дела запланированы
              </Text>
            ) : (
              unscheduledItems.map((item) => renderChip(item))
            )}
          </View>
        </View>
      </>
    );
  }

  if (loading || !bundle) {
    return <ScreenLoader />;
  }

  const hasActiveFilter = sourceFilter !== 'all' || hideCompleted;
  const dayPopoverItems = dayPopover ? itemsByDate.get(dayPopover.dateKey) ?? [] : [];
  const currentDayItems = itemsByDate.get(dayData.day.dateKey) ?? [];
  const activeDayItems = currentDayItems.filter((item) => !item.isDone);
  const doneDayItems = currentDayItems.filter((item) => item.isDone);
  const isDayDropHover = hoverDateKey === dayData.day.dateKey;
  const donePct =
    currentDayItems.length > 0
      ? Math.round((doneDayItems.length / currentDayItems.length) * 100)
      : 0;

  return (
    <ContentFade>
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
                  { key: 'day', label: 'День' },
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
                        hasActiveFilter || filterMenuOpen ? colors.surfaceActive : colors.surface,
                      borderColor:
                        hasActiveFilter || filterMenuOpen ? colors.text : colors.line,
                    },
                  ])}>
                  <AppIcon name="filter" size="xs" color={colors.muted} />
                  <Text
                    style={[
                      styles.filterBtnText,
                      { color: hasActiveFilter ? colors.text : colors.muted },
                    ]}>
                    {sourceFilter === 'all' ? 'Фильтр' : SOURCE_LABELS[sourceFilter]}
                    {hideCompleted ? ' · активные' : ''}
                  </Text>
                  <AppIcon name="chevronDown" size={11} color={colors.muted} />
                </RipplePressable>
              </View>

              <RipplePressable
                onPress={() => setInboxOpen((v) => !v)}
                style={StyleSheet.flatten([
                  styles.filterBtn,
                  {
                    backgroundColor: inboxOpen ? colors.surfaceActive : colors.surface,
                    borderColor: inboxOpen ? colors.text : colors.line,
                  },
                ])}>
                {overdueItems.length > 0 ? (
                  <View style={[styles.overdueDot, { backgroundColor: colors.danger }]} />
                ) : null}
                <Text
                  style={[
                    styles.filterBtnText,
                    { color: inboxOpen ? colors.text : colors.muted },
                  ]}>
                  Входящие ({inboxCount})
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
                onPress={() => setCreateTodoState({ open: true, dueDate: defaultNewTodoDate })}
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
                accessibilityLabel="Новая задача"
                onPress={() => setCreateTodoState({ open: true, dueDate: defaultNewTodoDate })}
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

      {/* Mobile Compact Sub-bar */}
      {!isDesktop ? (
        <View style={styles.mobileSubBar}>
          <View
            style={[
              styles.segmented,
              styles.mobileSegmented,
              { backgroundColor: colors.surface, borderColor: colors.line },
            ]}>
            {(
              [
                { key: 'day', label: 'День' },
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
                    styles.mobileSegBtn,
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

          <RipplePressable
            onPress={() => setMobileInboxOpen(true)}
            style={StyleSheet.flatten([
              styles.filterBtn,
              {
                backgroundColor: colors.surface,
                borderColor: overdueItems.length > 0 ? colors.danger : colors.line,
              },
            ])}>
            {overdueItems.length > 0 ? (
              <View style={[styles.overdueDot, { backgroundColor: colors.danger }]} />
            ) : null}
            <Text style={[styles.filterBtnText, { color: colors.text }]}>
              {inboxCount}
            </Text>
          </RipplePressable>
        </View>
      ) : null}

      {/* Main Split Body: Calendar Grid + Desktop Inbox Tray */}
      <View style={[styles.bodySplit, !isDesktop ? styles.bodySplitMobile : null]}>
        <View style={styles.calendarMain}>
          {viewMode === 'day' ? (
            <View style={styles.dayViewWrap}>
                  {/* Interactive 7-day Week Strip (click to switch day OR drag tasks onto any day) */}
                  <View
                    style={[
                      styles.dayStripCard,
                      { backgroundColor: colors.surface, borderColor: colors.line },
                    ]}>
                    {dayData.weekStrip.map((stripDay) => {
                      const selected = stripDay.dateKey === dayData.day.dateKey;
                      const stripHover = hoverDateKey === stripDay.dateKey;
                      const count = (itemsByDate.get(stripDay.dateKey) ?? []).filter(
                        (i) => !i.isDone,
                      ).length;

                      return (
                        <WebDragBox
                          key={stripDay.dateKey}
                          onDragOver={(event) => {
                            if (!draggingKey) {
                              return;
                            }
                            event.preventDefault();
                            event.stopPropagation();
                            if (event.dataTransfer) {
                              event.dataTransfer.dropEffect = 'move';
                            }
                            if (hoverDateKey !== stripDay.dateKey) {
                              setHoverDateKey(stripDay.dateKey);
                            }
                          }}
                          onDragLeave={() => {
                            setHoverDateKey((prev) =>
                              prev === stripDay.dateKey ? null : prev,
                            );
                          }}
                          onDrop={(event) => handleDropOnDate(event, stripDay.dateKey)}
                          style={styles.dayStripCellWrap}>
                          <RipplePressable
                            onPress={() => openDayView(stripDay.dateKey)}
                            style={StyleSheet.flatten([
                              styles.dayStripBtn,
                              {
                                backgroundColor: stripHover
                                  ? colors.accent
                                  : selected
                                    ? colors.surfaceActive
                                    : 'transparent',
                                borderColor: stripHover
                                  ? colors.accent
                                  : selected
                                    ? colors.text
                                    : 'transparent',
                              },
                            ])}>
                            <Text
                              style={[
                                styles.dayStripWeekday,
                                {
                                  color: stripHover
                                    ? colors.accentText
                                    : selected || stripDay.isToday
                                      ? colors.text
                                      : colors.muted,
                                },
                              ]}>
                              {stripDay.weekdayShort}
                            </Text>
                            <View
                              style={[
                                styles.dayStripNumWrap,
                                stripDay.isToday && !stripHover
                                  ? { backgroundColor: colors.accent }
                                  : null,
                              ]}>
                              <Text
                                style={[
                                  styles.dayStripNum,
                                  {
                                    color: stripHover
                                      ? colors.accentText
                                      : stripDay.isToday
                                        ? colors.accentText
                                        : colors.text,
                                  },
                                ]}>
                                {stripDay.dayNum}
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.dayStripDot,
                                {
                                  backgroundColor:
                                    count > 0
                                      ? stripHover
                                        ? colors.accentText
                                        : colors.muted
                                      : 'transparent',
                                },
                              ]}
                            />
                          </RipplePressable>
                        </WebDragBox>
                      );
                    })}
                  </View>

                  {/* Focused Single-Day Sheet */}
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
                      if (hoverDateKey !== dayData.day.dateKey) {
                        setHoverDateKey(dayData.day.dateKey);
                      }
                    }}
                    onDragLeave={() => {
                      setHoverDateKey((prev) =>
                        prev === dayData.day.dateKey ? null : prev,
                      );
                    }}
                    onDrop={(event) => handleDropOnDate(event, dayData.day.dateKey)}
                    style={[
                      styles.dayFocusCard,
                      {
                        backgroundColor: isDayDropHover ? colors.surfaceActive : colors.surface,
                        borderColor: isDayDropHover ? colors.accent : colors.line,
                      },
                    ]}>
                    {/* Day Header */}
                    <View style={[styles.dayFocusHeader, { borderBottomColor: colors.line }]}>
                      <View style={styles.dayFocusTitleCol}>
                        <View style={styles.dayFocusHeadingRow}>
                          <Text style={[styles.dayFocusTitle, { color: colors.text }]}>
                            {dayData.weekdayFull}, {dayData.fullHeading}
                          </Text>
                          {dayData.day.isToday ? (
                            <View
                              style={[
                                styles.todayPillBadge,
                                { backgroundColor: colors.accent },
                              ]}>
                              <Text
                                style={[
                                  styles.todayPillText,
                                  { color: colors.accentText },
                                ]}>
                                Сегодня
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        {currentDayItems.length > 0 ? (
                          <View style={styles.dayProgressRow}>
                            <Text style={[styles.dayProgressText, { color: colors.muted }]}>
                              Выполнено {doneDayItems.length} из {currentDayItems.length}
                            </Text>
                            <View
                              style={[
                                styles.dayProgressTrack,
                                { backgroundColor: colors.surfaceSubtle },
                              ]}>
                              <View
                                style={[
                                  styles.dayProgressFill,
                                  { width: `${donePct}%`, backgroundColor: colors.success },
                                ]}
                              />
                            </View>
                          </View>
                        ) : null}
                      </View>
                    </View>

                    {/* Day Body */}
                    <ScrollView
                      style={styles.weekColScroll}
                      contentContainerStyle={styles.dayFocusBody}
                      keyboardShouldPersistTaps="handled">
                      {activeDayItems.length === 0 ? (
                        <Text style={[styles.dayEmptyHint, { color: colors.muted }]}>
                          {isDayDropHover
                            ? 'Отпустите, чтобы перенести на этот день'
                            : doneDayItems.length > 0
                              ? 'Все задачи на этот день выполнены'
                              : 'На этот день ничего не запланировано'}
                        </Text>
                      ) : (
                        <View style={styles.dayItemsList}>
                          {activeDayItems.map((item) => renderChip(item))}
                        </View>
                      )}

                      {/* Minimalist Quick-Add directly inside the day */}
                      <View
                        style={[
                          styles.dayQuickAddBar,
                          { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                        ]}>
                        <TextInput
                          value={dayQuickDraft}
                          onChangeText={setDayQuickDraft}
                          onSubmitEditing={handleDayQuickAdd}
                          placeholder={`Добавить задачу на ${formatShortDateRu(dayData.day.dateKey)}…`}
                          placeholderTextColor={colors.muted}
                          style={[styles.dayQuickAddInput, { color: colors.text }]}
                        />
                        <RipplePressable
                          accessibilityLabel="Открыть подробную форму"
                          onPress={() =>
                            setCreateTodoState({ open: true, dueDate: dayData.day.dateKey })
                          }
                          style={styles.dayQuickExpandBtn}>
                          <AppIcon name="maximize" size="xs" color={colors.muted} />
                        </RipplePressable>
                        <RipplePressable
                          accessibilityLabel="Добавить задачу"
                          disabled={dayQuickDraft.trim().length === 0}
                          onPress={handleDayQuickAdd}
                          style={StyleSheet.flatten([
                            styles.dayQuickSubmitBtn,
                            { backgroundColor: colors.accent },
                            dayQuickDraft.trim().length === 0 ? styles.disabled : null,
                          ])}>
                          <AppIcon name="plus" size="xs" color={colors.accentText} />
                        </RipplePressable>
                      </View>

                      {/* Completed section for the day */}
                      {doneDayItems.length > 0 ? (
                        <View style={styles.dayDoneSection}>
                          <RipplePressable
                            onPress={() => setDayDoneExpanded((v) => !v)}
                            style={styles.dayDoneToggle}>
                            <AppIcon
                              name={dayDoneExpanded ? 'chevronDown' : 'chevronRight'}
                              size="xs"
                              color={colors.muted}
                            />
                            <Text style={[styles.dayDoneTitle, { color: colors.muted }]}>
                              Выполнено ({doneDayItems.length})
                            </Text>
                          </RipplePressable>

                          {dayDoneExpanded ? (
                            <View style={styles.dayItemsList}>
                              {doneDayItems.map((item) => renderChip(item))}
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                    </ScrollView>
                  </WebDragBox>
                </View>
          ) : viewMode === 'week' ? (
            isDesktop ? (
              <View style={styles.weekGridDesktop}>
                {weekData.days.map((day) => {
                  const dayItems = itemsByDate.get(day.dateKey) ?? [];
                  const isHover = hoverDateKey === day.dateKey;
                  const isAddingHere = inlineAddDateKey === day.dateKey;

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
                          backgroundColor: isHover
                            ? colors.surfaceActive
                            : day.isToday
                              ? colors.surface
                              : colors.surface,
                          borderColor: isHover
                            ? colors.accent
                            : day.isToday
                              ? colors.muted
                              : colors.line,
                        },
                      ]}>
                      <View
                        style={[
                          styles.weekColHeader,
                          {
                            borderBottomColor: colors.line,
                            backgroundColor: day.isToday ? colors.surfaceSubtle : 'transparent',
                          },
                        ]}>
                        <Pressable
                          accessibilityLabel={`Открыть день ${day.dateKey}`}
                          onPress={() => openDayView(day.dateKey)}
                          style={styles.weekColTitleGroup}>
                          <Text
                            style={[
                              styles.weekdayLabel,
                              {
                                color: day.isToday
                                  ? colors.text
                                  : day.isWeekend
                                    ? colors.muted
                                    : colors.muted,
                                opacity: day.isWeekend && !day.isToday ? 0.65 : 1,
                              },
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
                          {dayItems.length > 0 ? (
                            <Text style={[styles.colCountMeta, { color: colors.muted }]}>
                              {dayItems.length}
                            </Text>
                          ) : null}
                        </Pressable>

                        <RipplePressable
                          accessibilityLabel={`Быстро добавить на ${day.dateKey}`}
                          onPress={() => {
                            if (isAddingHere) {
                              setInlineAddDateKey(null);
                              setInlineAddDraft('');
                            } else {
                              setInlineAddDateKey(day.dateKey);
                              setInlineAddDraft('');
                            }
                          }}
                          style={styles.colAddBtn}>
                          <AppIcon
                            name={isAddingHere ? 'close' : 'plus'}
                            size="xs"
                            color={colors.muted}
                          />
                        </RipplePressable>
                      </View>

                      <ScrollView
                        style={styles.weekColScroll}
                        contentContainerStyle={styles.weekColList}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled">
                        {dayItems.map((item) => renderChip(item))}

                        {isAddingHere ? (
                          <View
                            style={[
                              styles.inlineAddBox,
                              {
                                backgroundColor: colors.surfaceSubtle,
                                borderColor: colors.text,
                              },
                            ]}>
                            <TextInput
                              autoFocus
                              value={inlineAddDraft}
                              onChangeText={setInlineAddDraft}
                              onSubmitEditing={() => handleInlineAddSubmit(day.dateKey)}
                              onKeyPress={(event) => {
                                if (
                                  Platform.OS === 'web' &&
                                  (event.nativeEvent as unknown as { key?: string }).key ===
                                    'Escape'
                                ) {
                                  setInlineAddDateKey(null);
                                  setInlineAddDraft('');
                                }
                              }}
                              placeholder="Новая задача…"
                              placeholderTextColor={colors.muted}
                              style={[styles.inlineAddInput, { color: colors.text }]}
                            />
                            <View style={styles.inlineAddActions}>
                              <RipplePressable
                                accessibilityLabel="Открыть подробно"
                                onPress={() => {
                                  setInlineAddDateKey(null);
                                  setInlineAddDraft('');
                                  setCreateTodoState({ open: true, dueDate: day.dateKey });
                                }}
                                style={styles.inlineSmallBtn}>
                                <AppIcon name="maximize" size={11} color={colors.muted} />
                              </RipplePressable>
                              <RipplePressable
                                accessibilityLabel="Добавить"
                                disabled={inlineAddDraft.trim().length === 0}
                                onPress={() => handleInlineAddSubmit(day.dateKey)}
                                style={StyleSheet.flatten([
                                  styles.inlineSubmitBtn,
                                  { backgroundColor: colors.accent },
                                  inlineAddDraft.trim().length === 0 ? styles.disabled : null,
                                ])}>
                                <AppIcon name="plus" size={11} color={colors.accentText} />
                              </RipplePressable>
                            </View>
                          </View>
                        ) : null}

                        {dayItems.length === 0 && !isAddingHere && draggingKey ? (
                          <Text style={[styles.dropHereHint, { color: colors.muted }]}>
                            Перетащите сюда
                          </Text>
                        ) : null}
                      </ScrollView>
                    </WebDragBox>
                  );
                })}
              </View>
            ) : (
              <ScrollView
                style={styles.mobileScroll}
                contentContainerStyle={styles.mobileDaysList}
                keyboardShouldPersistTaps="handled">
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
                        <Pressable
                          onPress={() => openDayView(day.dateKey)}
                          style={styles.weekColTitleGroup}>
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
                          {dayItems.length > 0 ? (
                            <Text style={[styles.colCountMeta, { color: colors.muted }]}>
                              {dayItems.length}
                            </Text>
                          ) : null}
                        </Pressable>
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
                          {dayItems.map((item) => renderChip(item))}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </ScrollView>
            )
          ) : isDesktop ? (
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
                  const maxVisible = 3;
                  const overflowCount = Math.max(0, dayItems.length - maxVisible);

                  return (
                    <WebDragBox
                      key={cell.dateKey}
                      ref={(node) => {
                        monthCellRefs.current[cell.dateKey] = node;
                      }}
                      collapsable={false}
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
                        <Pressable
                          onPress={() => {
                            measureAnchor(monthCellRefs.current[cell.dateKey], (rect) => {
                              setDayPopover({ dateKey: cell.dateKey, anchor: rect });
                            });
                          }}
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
                        </Pressable>

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
                        {dayItems
                          .slice(0, maxVisible)
                          .map((item) => renderChip(item, { compact: true }))}

                        {overflowCount > 0 ? (
                          <RipplePressable
                            onPress={() => {
                              measureAnchor(monthCellRefs.current[cell.dateKey], (rect) => {
                                setDayPopover({ dateKey: cell.dateKey, anchor: rect });
                              });
                            }}
                            style={styles.moreBtn}>
                            <Text style={[styles.moreCountText, { color: colors.muted }]}>
                              +{overflowCount} ещё
                            </Text>
                          </RipplePressable>
                        ) : null}
                      </View>
                    </WebDragBox>
                  );
                })}
              </ScrollView>
            </View>
          ) : (
            /* Mobile Apple-Calendar Month View: Clean Dots Grid + Selected Day Agenda */
            <ScrollView
              style={styles.mobileScroll}
              contentContainerStyle={styles.mobileMonthWrap}
              keyboardShouldPersistTaps="handled">
              <View
                style={[
                  styles.mobileMonthCard,
                  { backgroundColor: colors.surface, borderColor: colors.line },
                ]}>
                <View style={[styles.monthWeekdayRow, { borderBottomColor: colors.line }]}>
                  {CALENDAR_WEEKDAYS.map((wd) => (
                    <View key={wd} style={styles.monthWeekdayCell}>
                      <Text style={[styles.weekdayLabel, { color: colors.muted }]}>{wd}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.monthGrid}>
                  {monthData.cells.map((cell) => {
                    const dayItems = itemsByDate.get(cell.dateKey) ?? [];
                    const selected = mobileMonthDateKey === cell.dateKey;
                    return (
                      <Pressable
                        key={cell.dateKey}
                        onPress={() => setMobileMonthDateKey(cell.dateKey)}
                        style={[
                          styles.mobileDotCell,
                          selected ? { backgroundColor: colors.surfaceActive } : null,
                        ]}>
                        <View
                          style={[
                            styles.mobileDotDayNumWrap,
                            cell.isToday
                              ? { backgroundColor: colors.accent }
                              : selected
                                ? { borderColor: colors.text, borderWidth: StyleSheet.hairlineWidth }
                                : null,
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
                                opacity: cell.isCurrentMonth || cell.isToday ? 1 : 0.45,
                              },
                            ]}>
                            {cell.dayNum}
                          </Text>
                        </View>
                        <View style={styles.mobileDotsRow}>
                          {dayItems.slice(0, 3).map((item) => (
                            <View
                              key={item.key}
                              style={[
                                styles.mobileEventDot,
                                {
                                  backgroundColor: item.isDone
                                    ? colors.success
                                    : item.accentColor,
                                },
                              ]}
                            />
                          ))}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Selected Day Agenda */}
              <View
                style={[
                  styles.mobileAgendaCard,
                  { backgroundColor: colors.surface, borderColor: colors.line },
                ]}>
                <View style={[styles.mobileAgendaHeader, { borderBottomColor: colors.line }]}>
                  <Text style={[styles.mobileAgendaTitle, { color: colors.text }]}>
                    {formatShortDateRu(mobileMonthDateKey)}
                  </Text>
                  <View style={styles.dayPopoverActions}>
                    <RipplePressable
                      onPress={() => openDayView(mobileMonthDateKey)}
                      style={StyleSheet.flatten([
                        styles.dayPopoverOpenBtn,
                        { backgroundColor: colors.surfaceSubtle },
                      ])}>
                      <Text style={[styles.dayPopoverOpenText, { color: colors.text }]}>
                        Открыть день
                      </Text>
                    </RipplePressable>
                    <RipplePressable
                      accessibilityLabel="Добавить на выбранный день"
                      onPress={() =>
                        setCreateTodoState({ open: true, dueDate: mobileMonthDateKey })
                      }
                      style={StyleSheet.flatten([
                        styles.dayPopoverAddBtn,
                        { backgroundColor: colors.accent },
                      ])}>
                      <AppIcon name="plus" size="xs" color={colors.accentText} />
                    </RipplePressable>
                  </View>
                </View>

                <View style={styles.mobileAgendaBody}>
                  {(itemsByDate.get(mobileMonthDateKey) ?? []).length === 0 ? (
                    <Text style={[styles.emptyInboxText, { color: colors.muted }]}>
                      На этот день задач нет
                    </Text>
                  ) : (
                    (itemsByDate.get(mobileMonthDateKey) ?? []).map((item) => renderChip(item))
                  )}
                </View>
              </View>
            </ScrollView>
          )}
        </View>

        {/* Desktop Right Panel: Overdue + Unscheduled */}
        {isDesktop && inboxOpen ? (
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
              styles.inboxPane,
              {
                backgroundColor: hoverUnscheduled ? colors.surfaceActive : colors.surface,
                borderColor: hoverUnscheduled ? colors.accent : colors.line,
              },
            ]}>
            <ScrollView
              style={styles.weekColScroll}
              contentContainerStyle={styles.inboxScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled">
              {renderInboxContent()}
            </ScrollView>

            {/* Minimalist Quick-Add into Unscheduled */}
            <View style={[styles.inboxQuickAdd, { borderTopColor: colors.line }]}>
              <TextInput
                value={unscheduledDraft}
                onChangeText={setUnscheduledDraft}
                onSubmitEditing={handleUnscheduledQuickAdd}
                placeholder="Без срока…"
                placeholderTextColor={colors.muted}
                style={[styles.inboxQuickInput, { color: colors.text }]}
              />
              <RipplePressable
                accessibilityLabel="Добавить задачу без срока"
                disabled={unscheduledDraft.trim().length === 0}
                onPress={handleUnscheduledQuickAdd}
                style={StyleSheet.flatten([
                  styles.inboxQuickBtn,
                  { backgroundColor: colors.surfaceSubtle },
                  unscheduledDraft.trim().length === 0 ? styles.disabled : null,
                ])}>
                <AppIcon name="plus" size="xs" color={colors.text} />
              </RipplePressable>
            </View>
          </WebDragBox>
        ) : null}
      </View>

      {/* Filter Popover (Source + Hide Completed) */}
      <AnchoredPopover
        visible={filterMenuOpen}
        anchor={filterAnchor}
        width={210}
        estimatedHeight={200}
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
                }}
                style={StyleSheet.flatten([
                  styles.menuRow,
                  active ? { backgroundColor: colors.surfaceActive } : null,
                ])}>
                <Text style={[styles.menuRowText, { color: colors.text }]}>
                  {key === 'all' ? 'Все источники' : key === 'todo' ? 'Только задачи' : 'Только доска'}
                </Text>
                {active ? <AppIcon name="check" size="xs" color={colors.text} /> : null}
              </RipplePressable>
            );
          })}

          <View style={[styles.popoverDivider, { backgroundColor: colors.line }]} />

          <RipplePressable
            onPress={() => setHideCompleted((v) => !v)}
            style={styles.menuRow}>
            <Text style={[styles.menuRowText, { color: colors.text }]}>Скрывать выполненные</Text>
            {hideCompleted ? <AppIcon name="check" size="xs" color={colors.text} /> : null}
          </RipplePressable>
        </View>
      </AnchoredPopover>

      {/* Month Day Overflow Popover */}
      <AnchoredPopover
        visible={Boolean(dayPopover)}
        anchor={dayPopover?.anchor ?? null}
        width={260}
        estimatedHeight={300}
        align="left"
        colors={colors}
        onClose={() => setDayPopover(null)}>
        {dayPopover ? (
          <View style={styles.dayPopoverBody}>
            <View style={[styles.dayPopoverHeader, { borderBottomColor: colors.line }]}>
              <Text style={[styles.dayPopoverTitle, { color: colors.text }]}>
                {formatShortDateRu(dayPopover.dateKey)}
              </Text>
              <View style={styles.dayPopoverActions}>
                <RipplePressable
                  onPress={() => openDayView(dayPopover.dateKey)}
                  style={StyleSheet.flatten([
                    styles.dayPopoverOpenBtn,
                    { backgroundColor: colors.surfaceSubtle },
                  ])}>
                  <Text style={[styles.dayPopoverOpenText, { color: colors.text }]}>
                    Открыть день
                  </Text>
                </RipplePressable>
                <RipplePressable
                  onPress={() => {
                    const targetDate = dayPopover.dateKey;
                    setDayPopover(null);
                    setCreateTodoState({ open: true, dueDate: targetDate });
                  }}
                  style={StyleSheet.flatten([
                    styles.dayPopoverAddBtn,
                    { backgroundColor: colors.surfaceSubtle },
                  ])}>
                  <AppIcon name="plus" size="xs" color={colors.text} />
                </RipplePressable>
              </View>
            </View>

            <ScrollView style={styles.dayPopoverList} contentContainerStyle={styles.inboxList}>
              {dayPopoverItems.length === 0 ? (
                <Text style={[styles.emptyInboxText, { color: colors.muted }]}>
                  На этот день пока пусто
                </Text>
              ) : (
                dayPopoverItems.map((item) => renderChip(item))
              )}
            </ScrollView>
          </View>
        ) : null}
      </AnchoredPopover>

      {/* Mobile Bottom Sheet for Overdue + Unscheduled Inbox */}
      <Modal
        visible={!isDesktop && mobileInboxOpen}
        transparent
        animationType="none"
        onRequestClose={() => setMobileInboxOpen(false)}>
        <View style={styles.mobileSheetRoot}>
          <Pressable
            style={styles.mobileSheetBackdrop}
            onPress={() => setMobileInboxOpen(false)}
          />
          <Animated.View
            entering={FadeIn.duration(110)}
            style={[
              styles.mobileSheetBody,
              {
                backgroundColor: colors.surface,
                borderColor: colors.line,
                paddingBottom: Math.max(insets.bottom, 12),
              },
            ]}>
            <View style={styles.mobileSheetGrabberRow}>
              <View style={[styles.mobileSheetGrabber, { backgroundColor: colors.line }]} />
            </View>
            <View style={[styles.mobileSheetHeader, { borderBottomColor: colors.line }]}>
              <Text style={[styles.mobileSheetTitle, { color: colors.text }]}>
                Входящие ({inboxCount})
              </Text>
              <RipplePressable
                onPress={() => setMobileInboxOpen(false)}
                style={StyleSheet.flatten([
                  styles.dayPopoverAddBtn,
                  { backgroundColor: colors.surfaceSubtle },
                ])}>
                <AppIcon name="close" size="xs" color={colors.muted} />
              </RipplePressable>
            </View>
            <ScrollView
              style={styles.mobileSheetScroll}
              keyboardShouldPersistTaps="handled">
              {renderInboxContent()}
            </ScrollView>
            <View style={[styles.inboxQuickAdd, { borderTopColor: colors.line }]}>
              <TextInput
                value={unscheduledDraft}
                onChangeText={setUnscheduledDraft}
                onSubmitEditing={handleUnscheduledQuickAdd}
                placeholder="Добавить без срока…"
                placeholderTextColor={colors.muted}
                style={[styles.inboxQuickInput, { color: colors.text }]}
              />
              <RipplePressable
                disabled={unscheduledDraft.trim().length === 0}
                onPress={handleUnscheduledQuickAdd}
                style={StyleSheet.flatten([
                  styles.inboxQuickBtn,
                  { backgroundColor: colors.accent },
                  unscheduledDraft.trim().length === 0 ? styles.disabled : null,
                ])}>
                <AppIcon name="plus" size="xs" color={colors.accentText} />
              </RipplePressable>
            </View>
          </Animated.View>
        </View>
      </Modal>

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
          // Column ordering is managed on the Kanban board
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
    </ContentFade>
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
  mobileSegmented: {
    flex: 1,
  },
  segBtn: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mobileSegBtn: {
    flex: 1,
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
  mobileSubBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  mobileInboxCard: {
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
    maxHeight: 240,
    overflow: 'hidden',
  },
  mobileInboxScroll: {
    maxHeight: 240,
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
  colCountMeta: {
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.7,
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
  inlineAddBox: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 8,
    gap: 6,
  },
  inlineAddInput: {
    fontSize: 12.5,
    paddingVertical: 2,
  },
  inlineAddActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
  },
  inlineSmallBtn: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineSubmitBtn: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropHereHint: {
    fontSize: 11,
    textAlign: 'center',
    opacity: 0.6,
    paddingVertical: 14,
  },
  inboxPane: {
    width: 256,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    flexShrink: 0,
  },
  inboxScrollContent: {
    paddingBottom: 8,
  },
  overdueBlock: {
    padding: 9,
    gap: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  overdueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  overdueTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  overdueDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  overdueTitle: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  moveTodayBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
  },
  moveTodayText: {
    fontSize: 11,
    fontWeight: '700',
  },
  unscheduledSection: {
    padding: 9,
    gap: 8,
  },
  unscheduledHeader: {
    gap: 2,
  },
  unscheduledTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  unscheduledHint: {
    fontSize: 11,
  },
  inboxList: {
    gap: 6,
  },
  emptyInboxText: {
    fontSize: 12,
    textAlign: 'center',
    opacity: 0.6,
    paddingVertical: 14,
  },
  inboxQuickAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inboxQuickInput: {
    flex: 1,
    fontSize: 12.5,
    paddingVertical: 4,
    minWidth: 0,
  },
  inboxQuickBtn: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
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
    minHeight: 118,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    padding: 5,
    gap: 4,
  },
  monthCellMobile: {
    minHeight: 84,
  },
  monthCellTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthDayBadge: {
    minWidth: 22,
    height: 22,
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
  moreBtn: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
    alignSelf: 'flex-start',
  },
  moreCountText: {
    fontSize: 10.5,
    fontWeight: '600',
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
  popoverDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
    marginHorizontal: 6,
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
  dayPopoverBody: {
    gap: 6,
    padding: 4,
  },
  dayPopoverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dayPopoverTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  dayPopoverAddBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPopoverActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dayPopoverOpenBtn: {
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPopoverOpenText: {
    fontSize: 11,
    fontWeight: '600',
  },
  dayPopoverList: {
    maxHeight: 240,
  },
  dayViewWrap: {
    flex: 1,
    gap: 10,
    minHeight: 0,
  },
  dayStripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 5,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  dayStripCellWrap: {
    flex: 1,
  },
  dayStripBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 3,
  },
  dayStripWeekday: {
    fontSize: 10.5,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  dayStripNumWrap: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 5,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayStripNum: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  dayStripDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  dayFocusCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    minHeight: 0,
  },
  dayFocusHeader: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dayFocusTitleCol: {
    gap: 6,
  },
  dayFocusHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  dayFocusTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  todayPillBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  todayPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  dayProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dayProgressText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dayProgressTrack: {
    width: 84,
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  dayProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  dayFocusBody: {
    padding: 14,
    gap: 12,
  },
  dayEmptyHint: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 24,
    opacity: 0.7,
  },
  dayItemsList: {
    gap: 8,
  },
  dayQuickAddBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 12,
    paddingRight: 5,
    paddingVertical: 5,
  },
  dayQuickAddInput: {
    flex: 1,
    fontSize: 13.5,
    paddingVertical: 5,
    minWidth: 0,
  },
  dayQuickExpandBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayQuickSubmitBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDoneSection: {
    gap: 8,
    marginTop: 4,
  },
  dayDoneToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  dayDoneTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  mobileMonthWrap: {
    gap: 12,
    paddingBottom: 24,
  },
  mobileMonthCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  mobileDotCell: {
    width: `${100 / 7}%` as `${number}%`,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 8,
  },
  mobileDotDayNumWrap: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: 5,
  },
  mobileEventDot: {
    width: 4.5,
    height: 4.5,
    borderRadius: 3,
  },
  mobileAgendaCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  mobileAgendaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mobileAgendaTitle: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  mobileAgendaBody: {
    padding: 10,
    gap: 7,
  },
  mobileSheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  mobileSheetBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 12, 16, 0.5)',
  },
  mobileSheetBody: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  mobileSheetGrabberRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  mobileSheetGrabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  mobileSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mobileSheetTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  mobileSheetScroll: {
    maxHeight: 400,
  },
  disabled: {
    opacity: 0.35,
  },
});
