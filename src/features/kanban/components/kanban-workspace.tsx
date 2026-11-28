import { type ComponentRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ScrollView as GestureScrollView } from 'react-native-gesture-handler';

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
import { BoardDialog, ColumnDialog } from '@/features/kanban/components/board-dialogs';
import { CardDetailModal } from '@/features/kanban/components/card-detail-modal';
import { CreateCardModal } from '@/features/kanban/components/create-card-modal';
import {
  type CardDropPosition,
  KanbanCardItem,
} from '@/features/kanban/components/kanban-card-item';
import {
  addSubtask,
  createBoard,
  createCard,
  createColumn,
  deleteBoard,
  deleteCard,
  deleteColumn,
  deleteSubtask,
  ensureDefaultBoard,
  listBoards,
  loadBoardData,
  moveCard,
  renameBoard,
  reorderColumns,
  reorderSubtasks,
  restoreBoardSnapshot,
  toggleSubtask,
  updateCard,
  updateColumn,
} from '@/features/kanban/kanban-repository';
import {
  COLUMN_ACCENTS,
  type KanbanBoardData,
  type KanbanBoardRecord,
  type KanbanCardRecord,
  type KanbanColumnRecord,
  type KanbanPriority,
  PRIORITY_META,
} from '@/features/kanban/types';
import { useUndoRedoHotkeys } from '@/hooks/use-undo-redo';
import { type ThemeColors, useThemeColors, useViewport } from '@/theme/colors';

type PriorityFilter = 'all' | KanbanPriority;

const PRIORITY_FILTERS: readonly { key: PriorityFilter; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'high', label: 'Высокий' },
  { key: 'medium', label: 'Обычный' },
  { key: 'low', label: 'Низкий' },
];

type CardDropTarget = {
  columnId: string;
  cardId: string | null;
  position: CardDropPosition | 'end';
};

type ColumnDropTarget = {
  columnId: string;
  position: 'before' | 'after';
};

type BoardHistoryEntry = {
  label: string;
  columns: KanbanColumnRecord[];
  cards: KanbanCardRecord[];
};

function cloneBoardState(
  data: KanbanBoardData,
  label: string,
): BoardHistoryEntry {
  return {
    label,
    columns: data.columns.map((col) => ({ ...col })),
    cards: data.cards.map((card) => ({
      ...card,
      subtasks: card.subtasks.map((sub) => ({ ...sub })),
    })),
  };
}

const DROP_BLUE = '#2383E2';

export function KanbanWorkspace() {
  const db = useDatabase();
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const colors = useThemeColors();
  const { width, isDesktop } = useViewport();

  const [boards, setBoards] = useState<KanbanBoardRecord[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [boardData, setBoardData] = useState<KanbanBoardData | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const [boardMenuAnchor, setBoardMenuAnchor] = useState<AnchorRect | null>(null);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [filterMenuAnchor, setFilterMenuAnchor] = useState<AnchorRect | null>(null);

  const boardMenuBtnRef = useRef<ComponentRef<typeof View>>(null);
  const filterMenuBtnRef = useRef<ComponentRef<typeof View>>(null);

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [createCardModal, setCreateCardModal] = useState<{
    open: boolean;
    columnId: string | null;
  }>({ open: false, columnId: null });
  const [boardDialog, setBoardDialog] = useState<{ open: boolean; mode: 'create' | 'edit' }>({
    open: false,
    mode: 'create',
  });
  const [columnDialog, setColumnDialog] = useState<{
    open: boolean;
    mode: 'create' | 'edit';
    column: KanbanColumnRecord | null;
  }>({
    open: false,
    mode: 'create',
    column: null,
  });

  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [cardDropTarget, setCardDropTarget] = useState<CardDropTarget | null>(null);
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null);
  const [columnDropTarget, setColumnDropTarget] = useState<ColumnDropTarget | null>(null);

  const [activeColumnIndex, setActiveColumnIndex] = useState(0);
  const [trackHeight, setTrackHeight] = useState(0);
  const mobilePagerRef = useRef<ComponentRef<typeof ScrollView>>(null);

  const [historyMeta, setHistoryMeta] = useState({ canUndo: false, canRedo: false });
  const [historyToast, setHistoryToast] = useState<string | null>(null);
  const historyByBoardRef = useRef<
    Map<string, { past: BoardHistoryEntry[]; future: BoardHistoryEntry[] }>
  >(new Map());
  const boardDataRef = useRef<KanbanBoardData | null>(null);
  const restoringRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    boardDataRef.current = boardData;
  }, [boardData]);

  const showHistoryToast = useCallback((message: string) => {
    setHistoryToast(message);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setHistoryToast(null);
      toastTimerRef.current = null;
    }, 1800);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const syncHistoryMeta = useCallback((boardId: string | null) => {
    if (!boardId) {
      setHistoryMeta({ canUndo: false, canRedo: false });
      return;
    }
    const entry = historyByBoardRef.current.get(boardId);
    setHistoryMeta({
      canUndo: Boolean(entry && entry.past.length > 0),
      canRedo: Boolean(entry && entry.future.length > 0),
    });
  }, []);

  const pushBoardHistory = useCallback((label: string) => {
    const current = boardDataRef.current;
    if (!current) {
      return;
    }
    const boardId = current.board.id;
    let entry = historyByBoardRef.current.get(boardId);
    if (!entry) {
      entry = { past: [], future: [] };
      historyByBoardRef.current.set(boardId, entry);
    }
    entry.past.push(cloneBoardState(current, label));
    if (entry.past.length > 40) {
      entry.past.shift();
    }
    entry.future = [];
    setHistoryMeta({ canUndo: entry.past.length > 0, canRedo: false });
  }, []);

  const refreshBoard = useCallback(
    async (targetBoardId: string) => {
      if (!userId) {
        return;
      }
      const [nextBoards, nextData] = await Promise.all([
        listBoards(db, userId),
        loadBoardData(db, targetBoardId),
      ]);
      setBoards(nextBoards);
      if (nextData) {
        setBoardData(nextData);
        setActiveBoardId(nextData.board.id);
      } else if (nextBoards[0]) {
        const fallback = await loadBoardData(db, nextBoards[0].id);
        setBoardData(fallback);
        setActiveBoardId(nextBoards[0].id);
      }
    },
    [db, userId],
  );

  useEffect(() => {
    if (!userId) {
      return;
    }
    let cancelled = false;

    async function init() {
      const initialBoards = await ensureDefaultBoard(db, userId);
      if (cancelled) {
        return;
      }
      setBoards(initialBoards);
      const firstId = initialBoards[0]?.id ?? null;
      if (firstId) {
        const data = await loadBoardData(db, firstId);
        if (!cancelled) {
          setActiveBoardId(firstId);
          setBoardData(data);
        }
      }
      if (!cancelled) {
        setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [db, userId]);

  const handleUndoBoard = useCallback(async () => {
    if (!activeBoardId || restoringRef.current) {
      return;
    }
    const current = boardDataRef.current;
    const entry = historyByBoardRef.current.get(activeBoardId);
    if (!current || !entry || entry.past.length === 0) {
      return;
    }
    restoringRef.current = true;
    try {
      const previous = entry.past.pop()!;
      entry.future.push(cloneBoardState(current, previous.label));
      await restoreBoardSnapshot(db, activeBoardId, previous);
      await refreshBoard(activeBoardId);
      setHistoryMeta({ canUndo: entry.past.length > 0, canRedo: entry.future.length > 0 });
      showHistoryToast(`Отменено: ${previous.label}`);
    } finally {
      restoringRef.current = false;
    }
  }, [activeBoardId, db, refreshBoard, showHistoryToast]);

  const handleRedoBoard = useCallback(async () => {
    if (!activeBoardId || restoringRef.current) {
      return;
    }
    const current = boardDataRef.current;
    const entry = historyByBoardRef.current.get(activeBoardId);
    if (!current || !entry || entry.future.length === 0) {
      return;
    }
    restoringRef.current = true;
    try {
      const next = entry.future.pop()!;
      entry.past.push(cloneBoardState(current, next.label));
      await restoreBoardSnapshot(db, activeBoardId, next);
      await refreshBoard(activeBoardId);
      setHistoryMeta({ canUndo: entry.past.length > 0, canRedo: entry.future.length > 0 });
      showHistoryToast(`Возвращено: ${next.label}`);
    } finally {
      restoringRef.current = false;
    }
  }, [activeBoardId, db, refreshBoard, showHistoryToast]);

  useUndoRedoHotkeys({
    enabled:
      Boolean(activeBoardId) &&
      !createCardModal.open &&
      !boardDialog.open &&
      !columnDialog.open,
    ignoreInsideInputs: true,
    onUndo: () => {
      handleUndoBoard();
    },
    onRedo: () => {
      handleRedoBoard();
    },
  });

  async function selectBoard(boardId: string) {
    if (boardId === activeBoardId) {
      return;
    }
    setActiveBoardId(boardId);
    setActiveColumnIndex(0);
    syncHistoryMeta(boardId);
    mobilePagerRef.current?.scrollTo({ x: 0, animated: false });
    const data = await loadBoardData(db, boardId);
    setBoardData(data);
  }

  const columns = useMemo(() => boardData?.columns ?? [], [boardData?.columns]);
  const allCards = useMemo(() => boardData?.cards ?? [], [boardData?.cards]);

  const normalizedSearch = search.trim().toLowerCase();
  const hasActiveFilters = normalizedSearch.length > 0 || priorityFilter !== 'all';

  const filteredCards = useMemo(() => {
    return allCards.filter((card) => {
      if (priorityFilter !== 'all' && card.priority !== priorityFilter) {
        return false;
      }
      if (normalizedSearch.length > 0) {
        const hay = `${card.title} ${card.description}`.toLowerCase();
        if (!hay.includes(normalizedSearch)) {
          return false;
        }
      }
      return true;
    });
  }, [allCards, normalizedSearch, priorityFilter]);

  const selectedCard = useMemo(
    () => allCards.find((card) => card.id === selectedCardId) ?? null,
    [allCards, selectedCardId],
  );

  const selectedCardColumnCards = useMemo(() => {
    if (!selectedCard) {
      return [];
    }
    return allCards.filter((card) => card.columnId === selectedCard.columnId);
  }, [allCards, selectedCard]);

  const selectedCardIndex = selectedCard
    ? selectedCardColumnCards.findIndex((card) => card.id === selectedCard.id)
    : -1;

  async function handleQuickAddCard(columnId: string, title: string) {
    if (!activeBoardId) {
      return;
    }
    const trimmed = title.trim();
    if (!trimmed) {
      return;
    }
    pushBoardHistory('Добавление карточки');
    await createCard(db, {
      boardId: activeBoardId,
      columnId,
      title: trimmed,
      priority: priorityFilter === 'all' ? 'medium' : priorityFilter,
    });
    await refreshBoard(activeBoardId);
  }

  async function handleCreateDetailedCard(input: {
    columnId: string;
    title: string;
    description: string;
    priority: KanbanPriority;
    dueDate: string | null;
    subtasks: string[];
  }) {
    if (!activeBoardId) {
      return;
    }
    pushBoardHistory('Создание карточки');
    await createCard(db, {
      boardId: activeBoardId,
      columnId: input.columnId,
      title: input.title,
      description: input.description,
      priority: input.priority,
      dueDate: input.dueDate,
      subtasks: input.subtasks,
    });
    await refreshBoard(activeBoardId);
  }

  async function handleQuickUpdateCard(
    cardId: string,
    patch: { priority?: KanbanPriority; dueDate?: string | null },
  ) {
    if (!activeBoardId) {
      return;
    }
    pushBoardHistory(patch.priority !== undefined ? 'Смена приоритета' : 'Изменение срока');
    await updateCard(db, cardId, patch);
    await refreshBoard(activeBoardId);
  }

  async function handleMoveCardByStep(cardId: string, direction: -1 | 1) {
    if (!activeBoardId) {
      return;
    }
    const card = allCards.find((item) => item.id === cardId);
    if (!card) {
      return;
    }
    const currentIndex = columns.findIndex((col) => col.id === card.columnId);
    const targetColumn = columns[currentIndex + direction];
    if (!targetColumn) {
      return;
    }
    pushBoardHistory('Перенос карточки');
    await moveCard(db, cardId, targetColumn.id);
    await refreshBoard(activeBoardId);
  }

  async function handleMoveCardToColumn(cardId: string, targetColumnId: string) {
    if (!activeBoardId) {
      return;
    }
    pushBoardHistory('Перенос карточки');
    await moveCard(db, cardId, targetColumnId);
    await refreshBoard(activeBoardId);
  }

  async function handleDropCardAt(
    draggedCardId: string,
    targetColumnId: string,
    targetCardId: string | null,
    position: CardDropPosition | 'end',
  ) {
    setDraggingCardId(null);
    setCardDropTarget(null);
    if (!activeBoardId || !draggedCardId) {
      return;
    }
    if (targetCardId === draggedCardId) {
      return;
    }

    const siblingsWithoutDragged = allCards.filter(
      (item) => item.columnId === targetColumnId && item.id !== draggedCardId,
    );

    let targetIndex = siblingsWithoutDragged.length;
    if (targetCardId && position !== 'end') {
      const idx = siblingsWithoutDragged.findIndex((item) => item.id === targetCardId);
      if (idx !== -1) {
        targetIndex = position === 'before' ? idx : idx + 1;
      }
    }

    pushBoardHistory('Перемещение карточки');
    await moveCard(db, draggedCardId, targetColumnId, targetIndex);
    await refreshBoard(activeBoardId);
  }

  async function handleDropColumnAt(
    draggedColId: string,
    targetColId: string,
    position: 'before' | 'after',
  ) {
    setDraggingColumnId(null);
    setColumnDropTarget(null);
    if (!activeBoardId || !draggedColId || draggedColId === targetColId) {
      return;
    }

    const remaining = columns.filter((col) => col.id !== draggedColId);
    const targetIdx = remaining.findIndex((col) => col.id === targetColId);
    if (targetIdx === -1) {
      return;
    }
    const insertAt = position === 'before' ? targetIdx : targetIdx + 1;
    const orderedIds = remaining.map((col) => col.id);
    orderedIds.splice(insertAt, 0, draggedColId);

    pushBoardHistory('Порядок колонок');
    await reorderColumns(db, activeBoardId, orderedIds);
    await refreshBoard(activeBoardId);
  }

  async function handleReorderCard(cardId: string, direction: -1 | 1) {
    if (!activeBoardId) {
      return;
    }
    const card = allCards.find((item) => item.id === cardId);
    if (!card) {
      return;
    }
    const siblings = allCards.filter((item) => item.columnId === card.columnId);
    const currentIdx = siblings.findIndex((item) => item.id === cardId);
    const nextIdx = currentIdx + direction;
    if (nextIdx < 0 || nextIdx >= siblings.length) {
      return;
    }
    pushBoardHistory('Порядок карточек');
    await moveCard(db, cardId, card.columnId, nextIdx);
    await refreshBoard(activeBoardId);
  }

  async function handleSaveCard(
    cardId: string,
    patch: {
      title: string;
      description: string;
      priority: KanbanPriority;
      dueDate: string | null;
    },
  ) {
    if (!activeBoardId) {
      return;
    }
    pushBoardHistory('Редактирование карточки');
    await updateCard(db, cardId, patch);
    await refreshBoard(activeBoardId);
  }

  async function handleDeleteCard(cardId: string) {
    if (!activeBoardId) {
      return;
    }
    pushBoardHistory('Удаление карточки');
    await deleteCard(db, cardId);
    await refreshBoard(activeBoardId);
  }

  async function handleAddSubtask(cardId: string, title: string) {
    if (!activeBoardId) {
      return;
    }
    pushBoardHistory('Добавление подзадачи');
    await addSubtask(db, cardId, title);
    await refreshBoard(activeBoardId);
  }

  async function handleToggleSubtask(cardId: string, subtaskId: string, isDone: boolean) {
    if (!activeBoardId) {
      return;
    }
    pushBoardHistory('Статус подзадачи');
    await toggleSubtask(db, subtaskId, isDone);
    await refreshBoard(activeBoardId);
  }

  async function handleDeleteSubtask(cardId: string, subtaskId: string) {
    if (!activeBoardId) {
      return;
    }
    pushBoardHistory('Удаление подзадачи');
    await deleteSubtask(db, subtaskId);
    await refreshBoard(activeBoardId);
  }

  async function handleReorderSubtasks(cardId: string, orderedSubtaskIds: string[]) {
    if (!activeBoardId) {
      return;
    }
    pushBoardHistory('Порядок подзадач');
    await reorderSubtasks(db, cardId, orderedSubtaskIds);
    await refreshBoard(activeBoardId);
  }

  async function handleBoardSubmit(title: string) {
    if (boardDialog.mode === 'create') {
      if (!userId) {
        return;
      }
      const created = await createBoard(db, userId, title);
      await refreshBoard(created.id);
    } else if (activeBoardId) {
      await renameBoard(db, activeBoardId, title);
      await refreshBoard(activeBoardId);
    }
  }

  async function handleBoardDelete() {
    if (!activeBoardId || boards.length <= 1) {
      return;
    }
    const fallback = boards.find((item) => item.id !== activeBoardId);
    await deleteBoard(db, activeBoardId);
    if (fallback) {
      await refreshBoard(fallback.id);
    }
  }

  async function handleColumnSubmit(title: string, accent: string) {
    if (!activeBoardId) {
      return;
    }
    pushBoardHistory(columnDialog.mode === 'create' ? 'Создание колонки' : 'Изменение колонки');
    if (columnDialog.mode === 'create') {
      await createColumn(db, activeBoardId, title, accent);
    } else if (columnDialog.column) {
      await updateColumn(db, columnDialog.column.id, { title, accent });
    }
    await refreshBoard(activeBoardId);
  }

  async function handleColumnDelete() {
    if (!activeBoardId || !columnDialog.column || columns.length <= 1) {
      return;
    }
    pushBoardHistory('Удаление колонки');
    await deleteColumn(db, columnDialog.column.id);
    setActiveColumnIndex((prev) => Math.max(0, Math.min(prev, columns.length - 2)));
    await refreshBoard(activeBoardId);
  }

  const mobileColumnWidth = Math.max(260, Math.min(420, width - 32));
  const mobileSnapInterval = mobileColumnWidth + 12;

  function jumpToMobileColumn(index: number) {
    setActiveColumnIndex(index);
    mobilePagerRef.current?.scrollTo({
      x: index * mobileSnapInterval,
      animated: true,
    });
  }

  function handleMobilePagerScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const x = event.nativeEvent.contentOffset.x;
    const nextIndex = Math.round(x / mobileSnapInterval);
    if (nextIndex >= 0 && nextIndex < columns.length && nextIndex !== activeColumnIndex) {
      setActiveColumnIndex(nextIndex);
    }
  }

  if (loading || !boardData) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator size="small" color={colors.text} />
      </View>
    );
  }

  const useDesktopHorizontalScroll = isDesktop && columns.length > 4;

  const renderedColumns = columns.map((column, colIndex) => {
    const columnCards = filteredCards.filter((card) => card.columnId === column.id);
    const totalInColumn = allCards.filter((card) => card.columnId === column.id).length;

    return (
      <KanbanColumnView
        key={column.id}
        column={column}
        allColumns={columns}
        columnIndex={colIndex}
        totalColumns={columns.length}
        cards={columnCards}
        totalCardCount={totalInColumn}
        hasActiveFilters={hasActiveFilters}
        colors={colors}
        width={isDesktop ? (useDesktopHorizontalScroll ? 300 : undefined) : mobileColumnWidth}
        height={isDesktop ? undefined : trackHeight || undefined}
        isDesktop={isDesktop}
        draggingCardId={draggingCardId}
        draggingColumnId={draggingColumnId}
        cardDropTarget={cardDropTarget?.columnId === column.id ? cardDropTarget : null}
        columnDropIndicator={
          columnDropTarget?.columnId === column.id ? columnDropTarget.position : null
        }
        onQuickAddCard={handleQuickAddCard}
        onOpenCreateModal={() => setCreateCardModal({ open: true, columnId: column.id })}
        onOpenCard={(cardId) => setSelectedCardId(cardId)}
        onMoveCardStep={handleMoveCardByStep}
        onMoveCardToColumn={handleMoveCardToColumn}
        onReorderCard={handleReorderCard}
        onQuickUpdateCard={handleQuickUpdateCard}
        onDeleteCard={handleDeleteCard}
        onEditColumn={() => setColumnDialog({ open: true, mode: 'edit', column })}
        onCardDragStart={(cardId) => {
          setDraggingColumnId(null);
          setColumnDropTarget(null);
          setDraggingCardId(cardId);
        }}
        onCardDragEnd={() => {
          setDraggingCardId(null);
          setCardDropTarget(null);
        }}
        onCardDragOver={(cardId, position) => {
          setCardDropTarget((prev) =>
            prev?.columnId === column.id &&
            prev.cardId === cardId &&
            prev.position === position
              ? prev
              : { columnId: column.id, cardId, position },
          );
        }}
        onColumnCardDragOverEnd={() => {
          setCardDropTarget((prev) =>
            prev?.columnId === column.id && prev.cardId === null && prev.position === 'end'
              ? prev
              : { columnId: column.id, cardId: null, position: 'end' },
          );
        }}
        onColumnDragLeave={() => {
          setCardDropTarget((prev) => (prev?.columnId === column.id ? null : prev));
          setColumnDropTarget((prev) => (prev?.columnId === column.id ? null : prev));
        }}
        onDropCardAt={(draggedId, targetCardId, position) => {
          handleDropCardAt(draggedId, column.id, targetCardId, position);
        }}
        onColumnDragStart={() => {
          setDraggingCardId(null);
          setCardDropTarget(null);
          setDraggingColumnId(column.id);
        }}
        onColumnDragEnd={() => {
          setDraggingColumnId(null);
          setColumnDropTarget(null);
        }}
        onColumnDragOver={(position) => {
          setColumnDropTarget((prev) =>
            prev?.columnId === column.id && prev.position === position
              ? prev
              : { columnId: column.id, position },
          );
        }}
        onDropColumn={(draggedColId, position) => {
          handleDropColumnAt(draggedColId, column.id, position);
        }}
      />
    );
  });

  return (
    <View style={[styles.screen, isDesktop ? styles.screenDesktop : styles.screenMobile]}>
      {/* Top Toolbar: Clean Linear-style Board Selector + Grouped Controls */}
      <View style={styles.toolbar}>
        <View style={styles.toolbarLeft}>
          <View ref={boardMenuBtnRef} collapsable={false}>
            <RipplePressable
              accessibilityLabel="Выбрать или настроить доску"
              onPress={() => {
                if (boardMenuOpen) {
                  setBoardMenuOpen(false);
                  return;
                }
                measureAnchor(boardMenuBtnRef.current, (rect) => {
                  setBoardMenuAnchor(rect);
                  setBoardMenuOpen(true);
                });
              }}
              style={StyleSheet.flatten([
                styles.boardSwitcherBtn,
                {
                  backgroundColor: boardMenuOpen ? colors.surfaceActive : colors.surface,
                  borderColor: boardMenuOpen ? colors.text : colors.line,
                },
              ])}>
              <AppIcon name="kanban" size="sm" color={colors.muted} />
              <Text style={[styles.boardSwitcherTitle, { color: colors.text }]} numberOfLines={1}>
                {boardData.board.title}
              </Text>
              <AppIcon name="chevronDown" size="xs" color={colors.muted} />
            </RipplePressable>
          </View>

          {isDesktop ? (
            <Text style={[styles.boardCountMeta, { color: colors.muted }]}>
              {hasActiveFilters
                ? `${filteredCards.length} из ${allCards.length}`
                : `${allCards.length} ${allCards.length === 1 ? 'задача' : allCards.length >= 2 && allCards.length <= 4 ? 'задачи' : 'задач'}`}
            </Text>
          ) : null}
        </View>

        <View style={styles.toolbarRight}>
          {isDesktop ? (
            <>
              {/* Group 1: Search & Filter */}
              <View style={styles.toolbarGroup}>
                <View
                  style={[
                    styles.searchBox,
                    { backgroundColor: colors.surface, borderColor: colors.line },
                  ]}>
                  <AppIcon name="search" size="xs" color={colors.muted} />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Поиск…"
                    placeholderTextColor={colors.muted}
                    style={[styles.searchInput, { color: colors.text }]}
                  />
                  {search.length > 0 ? (
                    <RipplePressable onPress={() => setSearch('')} style={styles.clearBtn}>
                      <AppIcon name="close" size="xs" color={colors.muted} />
                    </RipplePressable>
                  ) : null}
                </View>

                <View ref={filterMenuBtnRef} collapsable={false}>
                  <RipplePressable
                    accessibilityLabel="Фильтр по приоритету"
                    onPress={() => {
                      if (filterMenuOpen) {
                        setFilterMenuOpen(false);
                        return;
                      }
                      measureAnchor(filterMenuBtnRef.current, (rect) => {
                        setFilterMenuAnchor(rect);
                        setFilterMenuOpen(true);
                      });
                    }}
                    style={StyleSheet.flatten([
                      styles.filterTriggerBtn,
                      {
                        backgroundColor:
                          priorityFilter !== 'all' || filterMenuOpen
                            ? colors.surfaceActive
                            : colors.surface,
                        borderColor:
                          priorityFilter !== 'all' || filterMenuOpen ? colors.text : colors.line,
                      },
                    ])}>
                    {priorityFilter !== 'all' ? (
                      <View
                        style={[
                          styles.filterDot,
                          { backgroundColor: PRIORITY_META[priorityFilter].dotColor },
                        ]}
                      />
                    ) : (
                      <AppIcon name="filter" size="xs" color={colors.muted} />
                    )}
                    <Text
                      style={[
                        styles.filterTriggerText,
                        { color: priorityFilter !== 'all' ? colors.text : colors.muted },
                      ]}>
                      {priorityFilter === 'all'
                        ? 'Приоритет'
                        : PRIORITY_META[priorityFilter].label}
                    </Text>
                    {priorityFilter !== 'all' ? (
                      <Pressable
                        accessibilityLabel="Сбросить фильтр"
                        hitSlop={6}
                        onPress={(event) => {
                          event.stopPropagation?.();
                          setPriorityFilter('all');
                        }}
                        style={styles.filterResetHit}>
                        <AppIcon name="close" size={11} color={colors.muted} />
                      </Pressable>
                    ) : (
                      <AppIcon name="chevronDown" size={11} color={colors.muted} />
                    )}
                  </RipplePressable>
                </View>
              </View>

              <View style={[styles.toolbarDivider, { backgroundColor: colors.line }]} />

              {/* Group 2: History */}
              <UndoRedoButtons
                canUndo={historyMeta.canUndo}
                canRedo={historyMeta.canRedo}
                colors={colors}
                onUndo={() => {
                  handleUndoBoard();
                }}
                onRedo={() => {
                  handleRedoBoard();
                }}
              />

              <View style={[styles.toolbarDivider, { backgroundColor: colors.line }]} />

              {/* Group 3: Add Column */}
              <RipplePressable
                onPress={() => setColumnDialog({ open: true, mode: 'create', column: null })}
                style={StyleSheet.flatten([
                  styles.addColBtn,
                  { backgroundColor: colors.surface, borderColor: colors.line },
                ])}>
                <AppIcon name="plus" size="xs" color={colors.muted} />
                <Text style={[styles.addColLabel, { color: colors.text }]}>Колонка</Text>
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
                    handleUndoBoard();
                  }}
                  onRedo={() => {
                    handleRedoBoard();
                  }}
                />
              ) : null}

              <RipplePressable
                accessibilityLabel="Поиск и фильтр"
                onPress={() => setMobileFiltersOpen((value) => !value)}
                style={StyleSheet.flatten([
                  styles.iconPill,
                  {
                    backgroundColor:
                      mobileFiltersOpen || hasActiveFilters ? colors.surfaceActive : colors.surface,
                    borderColor:
                      mobileFiltersOpen || hasActiveFilters ? colors.text : colors.line,
                  },
                ])}>
                <AppIcon
                  name={hasActiveFilters ? 'filter' : 'search'}
                  size="sm"
                  color={mobileFiltersOpen || hasActiveFilters ? colors.text : colors.muted}
                />
              </RipplePressable>
            </>
          )}
        </View>
      </View>

      {/* Mobile collapsible search & priority bar */}
      {!isDesktop && mobileFiltersOpen ? (
        <View style={[styles.mobileFilterPanel, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View
            style={[
              styles.searchBox,
              styles.searchBoxFull,
              { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
            ]}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Поиск карточек…"
              placeholderTextColor={colors.muted}
              style={[styles.searchInput, { color: colors.text }]}
            />
            {search.length > 0 ? (
              <RipplePressable onPress={() => setSearch('')} style={styles.clearBtn}>
                <AppIcon name="close" size="xs" color={colors.muted} />
              </RipplePressable>
            ) : null}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterGroup}>
            {PRIORITY_FILTERS.map((filter) => {
              const active = priorityFilter === filter.key;
              return (
                <RipplePressable
                  key={filter.key}
                  onPress={() => setPriorityFilter(filter.key)}
                  style={StyleSheet.flatten([
                    styles.filterChip,
                    {
                      backgroundColor: active ? colors.surfaceActive : colors.surfaceSubtle,
                      borderColor: active ? colors.line : 'transparent',
                    },
                  ])}>
                  {filter.key !== 'all' ? (
                    <View
                      style={[
                        styles.filterDot,
                        { backgroundColor: PRIORITY_META[filter.key].dotColor },
                      ]}
                    />
                  ) : null}
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: active ? colors.text : colors.muted },
                    ]}>
                    {filter.label}
                  </Text>
                </RipplePressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {/* Mobile Column Quick-Switcher Tabs */}
      {!isDesktop ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.mobileTabsScroll}
          contentContainerStyle={styles.mobileTabsRow}>
          {columns.map((column, index) => {
            const active = index === activeColumnIndex;
            const count = filteredCards.filter((card) => card.columnId === column.id).length;
            return (
              <RipplePressable
                key={column.id}
                onPress={() => jumpToMobileColumn(index)}
                style={StyleSheet.flatten([
                  styles.mobileColTab,
                  {
                    backgroundColor: active ? colors.surface : 'transparent',
                    borderColor: active ? colors.line : 'transparent',
                  },
                ])}>
                <View style={[styles.colAccentDot, { backgroundColor: column.accent }]} />
                <Text
                  style={[
                    styles.mobileColTabTitle,
                    { color: active ? colors.text : colors.muted },
                  ]}>
                  {column.title}
                </Text>
                <Text style={[styles.mobileColTabCount, { color: colors.muted }]}>{count}</Text>
              </RipplePressable>
            );
          })}
        </ScrollView>
      ) : null}

      {/* Columns Area */}
      <View style={styles.boardBody}>
        {isDesktop ? (
          useDesktopHorizontalScroll ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.desktopScrollRow}>
              {renderedColumns}
            </ScrollView>
          ) : (
            <View style={styles.desktopRow}>{renderedColumns}</View>
          )
        ) : (
          <GestureScrollView
            ref={mobilePagerRef}
            horizontal
            nestedScrollEnabled
            directionalLockEnabled
            decelerationRate="fast"
            snapToInterval={mobileSnapInterval}
            snapToAlignment="start"
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleMobilePagerScroll}
            onScrollEndDrag={handleMobilePagerScroll}
            style={styles.mobilePager}
            contentContainerStyle={styles.mobilePagerRow}
            onLayout={(event) => {
              const nextHeight = event.nativeEvent.layout.height;
              setTrackHeight((current) => (current === nextHeight ? current : nextHeight));
            }}>
            {renderedColumns}
          </GestureScrollView>
        )}
      </View>

      {/* Floating Board Switcher Popover */}
      <AnchoredPopover
        visible={boardMenuOpen}
        anchor={boardMenuAnchor}
        width={236}
        estimatedHeight={240}
        align="left"
        colors={colors}
        onClose={() => setBoardMenuOpen(false)}>
        <View style={styles.popoverBody}>
          <Text style={[styles.popoverCaption, { color: colors.muted }]}>Доски</Text>
          <View style={styles.popoverList}>
            {boards.map((board) => {
              const active = board.id === activeBoardId;
              return (
                <Pressable
                  key={board.id}
                  onPress={() => {
                    setBoardMenuOpen(false);
                    selectBoard(board.id);
                  }}
                  style={({ hovered }: { hovered?: boolean }) => [
                    styles.popoverRow,
                    active
                      ? { backgroundColor: colors.surfaceActive }
                      : hovered
                        ? { backgroundColor: colors.surfaceSubtle }
                        : null,
                  ]}>
                  <AppIcon
                    name="kanban"
                    size="xs"
                    color={active ? colors.text : colors.muted}
                  />
                  <Text
                    style={[styles.popoverLabel, { color: colors.text }]}
                    numberOfLines={1}>
                    {board.title}
                  </Text>
                  {active ? <AppIcon name="check" size="xs" color={colors.text} /> : null}
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.popoverDivider, { backgroundColor: colors.line }]} />

          <View style={styles.popoverList}>
            <Pressable
              onPress={() => {
                setBoardMenuOpen(false);
                setBoardDialog({ open: true, mode: 'create' });
              }}
              style={({ hovered }: { hovered?: boolean }) => [
                styles.popoverRow,
                hovered ? { backgroundColor: colors.surfaceSubtle } : null,
              ]}>
              <AppIcon name="plus" size="xs" color={colors.muted} />
              <Text style={[styles.popoverLabel, { color: colors.text }]}>Новая доска</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setBoardMenuOpen(false);
                setBoardDialog({ open: true, mode: 'edit' });
              }}
              style={({ hovered }: { hovered?: boolean }) => [
                styles.popoverRow,
                hovered ? { backgroundColor: colors.surfaceSubtle } : null,
              ]}>
              <AppIcon name="edit" size="xs" color={colors.muted} />
              <Text style={[styles.popoverLabel, { color: colors.text }]}>Настроить доску</Text>
            </Pressable>

            {!isDesktop ? (
              <Pressable
                onPress={() => {
                  setBoardMenuOpen(false);
                  setColumnDialog({ open: true, mode: 'create', column: null });
                }}
                style={({ hovered }: { hovered?: boolean }) => [
                  styles.popoverRow,
                  hovered ? { backgroundColor: colors.surfaceSubtle } : null,
                ]}>
                <AppIcon name="plus" size="xs" color={colors.muted} />
                <Text style={[styles.popoverLabel, { color: colors.text }]}>
                  Добавить колонку
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </AnchoredPopover>

      {/* Floating Priority Filter Popover */}
      <AnchoredPopover
        visible={filterMenuOpen}
        anchor={filterMenuAnchor}
        width={190}
        estimatedHeight={164}
        align="right"
        colors={colors}
        onClose={() => setFilterMenuOpen(false)}>
        <View style={styles.popoverBody}>
          <Text style={[styles.popoverCaption, { color: colors.muted }]}>Приоритет</Text>
          <View style={styles.popoverList}>
            {PRIORITY_FILTERS.map((filter) => {
              const active = priorityFilter === filter.key;
              return (
                <Pressable
                  key={filter.key}
                  onPress={() => {
                    setPriorityFilter(filter.key);
                    setFilterMenuOpen(false);
                  }}
                  style={({ hovered }: { hovered?: boolean }) => [
                    styles.popoverRow,
                    active
                      ? { backgroundColor: colors.surfaceActive }
                      : hovered
                        ? { backgroundColor: colors.surfaceSubtle }
                        : null,
                  ]}>
                  {filter.key !== 'all' ? (
                    <View
                      style={[
                        styles.filterDot,
                        { backgroundColor: PRIORITY_META[filter.key].dotColor },
                      ]}
                    />
                  ) : (
                    <AppIcon name="circle" size={11} color={colors.muted} />
                  )}
                  <Text style={[styles.popoverLabel, { color: colors.text }]}>
                    {filter.label}
                  </Text>
                  {active ? <AppIcon name="check" size="xs" color={colors.text} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </AnchoredPopover>

      {/* Modals */}
      <CreateCardModal
        visible={createCardModal.open}
        columns={columns}
        initialColumnId={createCardModal.columnId}
        initialPriority={priorityFilter === 'all' ? 'medium' : priorityFilter}
        onClose={() => setCreateCardModal((prev) => ({ ...prev, open: false }))}
        onCreate={handleCreateDetailedCard}
      />

      <CardDetailModal
        card={selectedCard}
        columns={columns}
        cardIndex={selectedCardIndex}
        columnCardCount={selectedCardColumnCards.length}
        onClose={() => setSelectedCardId(null)}
        onSave={handleSaveCard}
        onMoveColumn={handleMoveCardToColumn}
        onReorder={handleReorderCard}
        onDelete={handleDeleteCard}
        onAddSubtask={handleAddSubtask}
        onToggleSubtask={handleToggleSubtask}
        onDeleteSubtask={handleDeleteSubtask}
        onReorderSubtasks={handleReorderSubtasks}
      />

      <BoardDialog
        visible={boardDialog.open}
        mode={boardDialog.mode}
        initialTitle={boardDialog.mode === 'edit' ? boardData.board.title : ''}
        canDelete={boards.length > 1}
        onClose={() => setBoardDialog((prev) => ({ ...prev, open: false }))}
        onSubmit={handleBoardSubmit}
        onDelete={handleBoardDelete}
      />

      <ColumnDialog
        visible={columnDialog.open}
        mode={columnDialog.mode}
        initialTitle={columnDialog.column?.title ?? ''}
        initialAccent={
          columnDialog.column?.accent ?? COLUMN_ACCENTS[columns.length % COLUMN_ACCENTS.length]
        }
        canDelete={columns.length > 1}
        onClose={() => setColumnDialog((prev) => ({ ...prev, open: false }))}
        onSubmit={handleColumnSubmit}
        onDelete={handleColumnDelete}
      />

      <DragTrashZone
        visible={
          draggingCardId !== null || (draggingColumnId !== null && columns.length > 1)
        }
        label={draggingColumnId ? 'Удалить колонку' : 'Удалить карточку'}
        colors={colors}
        onDropDelete={async (event) => {
          if (draggingColumnId && columns.length > 1 && activeBoardId) {
            const colId =
              event.dataTransfer?.getData('text/sotaq-kanban-column') || draggingColumnId;
            setDraggingColumnId(null);
            setColumnDropTarget(null);
            pushBoardHistory('Удаление колонки');
            await deleteColumn(db, colId);
            setActiveColumnIndex((prev) => Math.max(0, Math.min(prev, columns.length - 2)));
            await refreshBoard(activeBoardId);
            return;
          }
          if (draggingCardId) {
            const cardId =
              event.dataTransfer?.getData('text/sotaq-kanban-card') ||
              event.dataTransfer?.getData('text/plain') ||
              draggingCardId;
            setDraggingCardId(null);
            setCardDropTarget(null);
            await handleDeleteCard(cardId);
          }
        }}
      />

      <HistoryToast message={historyToast} colors={colors} />
    </View>
  );
}

function KanbanColumnView({
  column,
  allColumns,
  columnIndex,
  totalColumns,
  cards,
  totalCardCount,
  hasActiveFilters,
  colors,
  width,
  height,
  isDesktop,
  draggingCardId,
  draggingColumnId,
  cardDropTarget,
  columnDropIndicator,
  onQuickAddCard,
  onOpenCreateModal,
  onOpenCard,
  onMoveCardStep,
  onMoveCardToColumn,
  onReorderCard,
  onQuickUpdateCard,
  onDeleteCard,
  onEditColumn,
  onCardDragStart,
  onCardDragEnd,
  onCardDragOver,
  onColumnCardDragOverEnd,
  onColumnDragLeave,
  onDropCardAt,
  onColumnDragStart,
  onColumnDragEnd,
  onColumnDragOver,
  onDropColumn,
}: {
  column: KanbanColumnRecord;
  allColumns: KanbanColumnRecord[];
  columnIndex: number;
  totalColumns: number;
  cards: KanbanCardRecord[];
  totalCardCount: number;
  hasActiveFilters: boolean;
  colors: ThemeColors;
  width: number | undefined;
  height: number | undefined;
  isDesktop: boolean;
  draggingCardId: string | null;
  draggingColumnId: string | null;
  cardDropTarget: CardDropTarget | null;
  columnDropIndicator: 'before' | 'after' | null;
  onQuickAddCard: (columnId: string, title: string) => Promise<void>;
  onOpenCreateModal: () => void;
  onOpenCard: (cardId: string) => void;
  onMoveCardStep: (cardId: string, direction: -1 | 1) => void;
  onMoveCardToColumn: (cardId: string, targetColumnId: string) => void;
  onReorderCard: (cardId: string, direction: -1 | 1) => void;
  onQuickUpdateCard: (
    cardId: string,
    patch: { priority?: KanbanPriority; dueDate?: string | null },
  ) => void;
  onDeleteCard: (cardId: string) => void;
  onEditColumn: () => void;
  onCardDragStart: (cardId: string) => void;
  onCardDragEnd: () => void;
  onCardDragOver: (cardId: string, position: CardDropPosition) => void;
  onColumnCardDragOverEnd: () => void;
  onColumnDragLeave: () => void;
  onDropCardAt: (
    draggedId: string,
    targetCardId: string | null,
    position: CardDropPosition | 'end',
  ) => void;
  onColumnDragStart: () => void;
  onColumnDragEnd: () => void;
  onColumnDragOver: (position: 'before' | 'after') => void;
  onDropColumn: (draggedColId: string, position: 'before' | 'after') => void;
}) {
  const [draft, setDraft] = useState('');

  async function submitQuickAdd() {
    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }
    setDraft('');
    await onQuickAddCard(column.id, trimmed);
  }

  const isCardDropHere = cardDropTarget !== null;
  const isEndDropHere = cardDropTarget?.cardId === null && cardDropTarget.position === 'end';
  const isDraggingSelfColumn = draggingColumnId === column.id;

  function resolveColumnSide(event: WebDomDragEvent): 'before' | 'after' {
    const target = event.currentTarget as HTMLElement | null;
    const rect = target?.getBoundingClientRect?.();
    if (!rect || rect.width <= 0) {
      return 'after';
    }
    return event.clientX - rect.left < rect.width * 0.5 ? 'before' : 'after';
  }

  return (
    <WebDragBox
      onDragOver={(event) => {
        if (draggingColumnId && draggingColumnId !== column.id) {
          event.preventDefault();
          if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
          }
          onColumnDragOver(resolveColumnSide(event));
          return;
        }
        if (draggingCardId) {
          event.preventDefault();
          if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
          }
          onColumnCardDragOverEnd();
        }
      }}
      onDragLeave={() => {
        onColumnDragLeave();
      }}
      onDrop={(event) => {
        if (draggingColumnId) {
          event.preventDefault();
          const draggedCol =
            event.dataTransfer?.getData('text/sotaq-kanban-column') || draggingColumnId;
          if (draggedCol && draggedCol !== column.id) {
            onDropColumn(draggedCol, columnDropIndicator ?? resolveColumnSide(event));
          } else {
            onColumnDragEnd();
          }
          return;
        }
        if (draggingCardId) {
          event.preventDefault();
          const droppedId =
            event.dataTransfer?.getData('text/sotaq-kanban-card') ||
            event.dataTransfer?.getData('text/plain') ||
            draggingCardId;
          if (droppedId) {
            onDropCardAt(
              droppedId,
              cardDropTarget?.cardId ?? null,
              cardDropTarget?.position ?? 'end',
            );
          } else {
            onCardDragEnd();
          }
        }
      }}
      style={[
        styles.columnWrap,
        width === undefined ? styles.columnFlex : styles.columnFixed,
        { width, height },
        isDraggingSelfColumn ? styles.columnDragging : null,
      ]}>
      {columnDropIndicator === 'before' ? (
        <View pointerEvents="none" style={[styles.colDropBar, styles.colDropBarLeft]} />
      ) : null}

      <View
        style={[
          styles.column,
          {
            backgroundColor: colors.surface,
            borderColor: isCardDropHere ? DROP_BLUE : colors.line,
          },
          isCardDropHere ? styles.columnDropActive : null,
        ]}>
        <View style={styles.columnHeader}>
          <WebDragBox
            draggable={Platform.OS === 'web' && isDesktop}
            onDragStart={(event) => {
              event.stopPropagation();
              if (event.dataTransfer) {
                event.dataTransfer.setData('text/sotaq-kanban-column', column.id);
                event.dataTransfer.effectAllowed = 'move';
              }
              onColumnDragStart();
            }}
            onDragEnd={() => {
              onColumnDragEnd();
            }}
            style={[styles.columnTitleRow, Platform.OS === 'web' && isDesktop ? styles.columnDragHandle : null]}>
            {Platform.OS === 'web' && isDesktop ? (
              <AppIcon name="grip" size="xs" color={colors.muted} />
            ) : null}
            <View style={[styles.colAccentDot, { backgroundColor: column.accent }]} />
            <Text style={[styles.columnTitle, { color: colors.text }]} numberOfLines={1}>
              {column.title}
            </Text>
            <View style={[styles.countPill, { backgroundColor: colors.surfaceSubtle }]}>
              <Text style={[styles.countText, { color: colors.muted }]}>
                {hasActiveFilters ? `${cards.length}/${totalCardCount}` : cards.length}
              </Text>
            </View>
          </WebDragBox>

          <View style={styles.colHeaderActions}>
            <RipplePressable
              accessibilityLabel={`Создать карточку в «${column.title}»`}
              hitSlop={4}
              onPress={onOpenCreateModal}
              style={styles.colMenuBtn}>
              <AppIcon name="plus" size="sm" color={colors.muted} />
            </RipplePressable>
            <RipplePressable
              accessibilityLabel={`Настроить колонку «${column.title}»`}
              hitSlop={4}
              onPress={onEditColumn}
              style={styles.colMenuBtn}>
              <AppIcon name="more" size="sm" color={colors.muted} />
            </RipplePressable>
          </View>
        </View>

        <ScrollView
          nestedScrollEnabled
          style={styles.cardList}
          contentContainerStyle={styles.cardListContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          {cards.length === 0 ? (
            <View
              style={[
                styles.emptyBox,
                isEndDropHere
                  ? [
                      styles.emptyDropActive,
                      { borderColor: DROP_BLUE, backgroundColor: 'rgba(35, 131, 226, 0.08)' },
                    ]
                  : null,
              ]}>
              <Text style={[styles.emptyText, { color: isEndDropHere ? colors.text : colors.muted }]}>
                {isEndDropHere
                  ? 'Отпустите карточку сюда'
                  : hasActiveFilters
                    ? 'Нет совпадений'
                    : 'Пока пусто'}
              </Text>
            </View>
          ) : (
            <>
              {cards.map((card, cardIdx) => (
                <KanbanCardItem
                  key={card.id}
                  card={card}
                  columns={allColumns}
                  colors={colors}
                  isDesktop={isDesktop}
                  canMoveLeft={columnIndex > 0}
                  canMoveRight={columnIndex < totalColumns - 1}
                  canMoveUp={!hasActiveFilters && cardIdx > 0}
                  canMoveDown={!hasActiveFilters && cardIdx < cards.length - 1}
                  isDragging={draggingCardId === card.id}
                  isCardDragActive={draggingCardId !== null}
                  dropIndicator={
                    cardDropTarget?.cardId === card.id && cardDropTarget.position !== 'end'
                      ? cardDropTarget.position
                      : null
                  }
                  onPress={() => onOpenCard(card.id)}
                  onMoveColumnStep={(direction) => onMoveCardStep(card.id, direction)}
                  onMoveToColumn={(colId) => onMoveCardToColumn(card.id, colId)}
                  onReorderStep={(direction) => onReorderCard(card.id, direction)}
                  onQuickUpdate={(patch) => onQuickUpdateCard(card.id, patch)}
                  onDelete={() => onDeleteCard(card.id)}
                  onDragStart={onCardDragStart}
                  onDragEnd={onCardDragEnd}
                  onDragOverCard={onCardDragOver}
                  onDropOnCard={(draggedId, targetId, position) =>
                    onDropCardAt(draggedId, targetId, position)
                  }
                />
              ))}

              {isEndDropHere ? (
                <View pointerEvents="none" style={styles.endDropLineWrap}>
                  <View style={styles.endDropDot} />
                  <View style={styles.endDropLine} />
                </View>
              ) : null}
            </>
          )}
        </ScrollView>

        {/* Version 1: Instant Quick-Add Bar (type + Enter or '+' right away) */}
        <View style={[styles.composer, { borderTopColor: colors.line }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={submitQuickAdd}
            placeholder="Быстрая карточка…"
            placeholderTextColor={colors.muted}
            returnKeyType="done"
            style={[styles.composerInput, { color: colors.text }]}
          />
          <RipplePressable
            accessibilityLabel={`Быстро добавить в «${column.title}»`}
            disabled={draft.trim().length === 0}
            onPress={submitQuickAdd}
            style={StyleSheet.flatten([
              styles.addButton,
              { backgroundColor: colors.surfaceSubtle },
              draft.trim().length === 0 ? styles.addButtonDisabled : null,
            ])}>
            <AppIcon name="plus" size="sm" color={colors.text} />
          </RipplePressable>
        </View>
      </View>

      {columnDropIndicator === 'after' ? (
        <View pointerEvents="none" style={[styles.colDropBar, styles.colDropBarRight]} />
      ) : null}
    </WebDragBox>
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
    gap: 12,
  },
  screenDesktop: {
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 20,
  },
  screenMobile: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 36,
  },
  toolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
    minWidth: 0,
  },
  boardSwitcherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 34,
    paddingHorizontal: 11,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 240,
  },
  boardSwitcherTitle: {
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  boardCountMeta: {
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  iconPill: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  toolbarGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toolbarDivider: {
    width: 1,
    height: 18,
    opacity: 0.9,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 176,
    height: 34,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 10,
    paddingRight: 4,
  },
  searchBoxFull: {
    width: '100%',
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 4,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  clearBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
  },
  filterTriggerText: {
    fontSize: 12,
    fontWeight: '600',
  },
  filterResetHit: {
    marginLeft: 2,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  filterGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
  },
  filterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  addColBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    height: 34,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  popoverBody: {
    gap: 4,
  },
  popoverCaption: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 2,
  },
  popoverList: {
    gap: 2,
  },
  popoverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 7,
    ...(Platform.OS === 'web'
      ? ({ cursor: 'pointer', transition: 'background-color 110ms ease' } as object)
      : null),
  },
  popoverLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  popoverDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
    marginHorizontal: 4,
  },
  addColLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  mobileFilterPanel: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    gap: 8,
  },
  mobileTabsScroll: {
    flexGrow: 0,
  },
  mobileTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mobileColTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  mobileColTabTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  mobileColTabCount: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  boardBody: {
    flex: 1,
    minHeight: 0,
  },
  desktopRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 14,
  },
  desktopScrollRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 14,
    paddingRight: 8,
  },
  mobilePager: {
    flex: 1,
  },
  mobilePagerRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  columnWrap: {
    position: 'relative',
  },
  columnDragging: {
    opacity: 0.4,
  },
  colDropBar: {
    position: 'absolute',
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
    backgroundColor: DROP_BLUE,
    zIndex: 25,
  },
  colDropBarLeft: {
    left: -8,
  },
  colDropBarRight: {
    right: -8,
  },
  column: {
    flex: 1,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    overflow: 'hidden',
  },
  columnDropActive: {
    borderWidth: 1.5,
  },
  columnFlex: {
    flex: 1,
    minWidth: 0,
  },
  columnFixed: {
    flexGrow: 0,
    flexShrink: 0,
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    marginBottom: 10,
    gap: 8,
  },
  columnTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  columnDragHandle: {
    paddingVertical: 2,
    ...(Platform.OS === 'web' ? ({ cursor: 'grab', userSelect: 'none' } as object) : null),
  },
  colAccentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  columnTitle: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  countPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  countText: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  colHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  colMenuBtn: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colMenuGlyph: {
    fontSize: 16,
  },
  cardList: {
    flex: 1,
  },
  cardListContent: {
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 14,
    gap: 8,
  },
  emptyBox: {
    paddingVertical: 22,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  emptyDropActive: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '500',
  },
  endDropLineWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 6,
    marginTop: 2,
    paddingHorizontal: 2,
  },
  endDropDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: DROP_BLUE,
    marginRight: -1,
  },
  endDropLine: {
    flex: 1,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: DROP_BLUE,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 10,
  },
  composerInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 7,
    paddingHorizontal: 8,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: {
    opacity: 0.35,
  },
});
