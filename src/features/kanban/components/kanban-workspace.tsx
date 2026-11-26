import { type ComponentRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ScrollView as GestureScrollView } from 'react-native-gesture-handler';

import { RipplePressable } from '@/components/ripple-pressable';
import { useDatabase } from '@/db/provider';
import { useAuth } from '@/features/auth/auth-context';
import { BoardDialog, ColumnDialog } from '@/features/kanban/components/board-dialogs';
import { CardDetailModal } from '@/features/kanban/components/card-detail-modal';
import { KanbanCardItem } from '@/features/kanban/components/kanban-card-item';
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
import { type ThemeColors, useThemeColors, useViewport } from '@/theme/colors';

type PriorityFilter = 'all' | KanbanPriority;

const PRIORITY_FILTERS: readonly { key: PriorityFilter; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'high', label: 'Высокий' },
  { key: 'medium', label: 'Обычный' },
  { key: 'low', label: 'Низкий' },
];

type WebDropProps = {
  onDragOver?: (event: { preventDefault: () => void; dataTransfer?: { dropEffect: string } }) => void;
  onDragLeave?: () => void;
  onDrop?: (event: { preventDefault: () => void; dataTransfer?: { getData: (k: string) => string } }) => void;
};

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

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
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
  const [dropColumnId, setDropColumnId] = useState<string | null>(null);

  const [activeColumnIndex, setActiveColumnIndex] = useState(0);
  const [trackHeight, setTrackHeight] = useState(0);
  const mobilePagerRef = useRef<ComponentRef<typeof ScrollView>>(null);

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

  async function selectBoard(boardId: string) {
    if (boardId === activeBoardId) {
      return;
    }
    setActiveBoardId(boardId);
    setActiveColumnIndex(0);
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

  async function handleAddCard(columnId: string, title: string) {
    if (!activeBoardId) {
      return;
    }
    const trimmed = title.trim();
    if (!trimmed) {
      return;
    }
    await createCard(db, {
      boardId: activeBoardId,
      columnId,
      title: trimmed,
      priority: priorityFilter === 'all' ? 'medium' : priorityFilter,
    });
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
    await moveCard(db, cardId, targetColumn.id);
    await refreshBoard(activeBoardId);
  }

  async function handleMoveCardToColumn(cardId: string, targetColumnId: string) {
    if (!activeBoardId) {
      return;
    }
    await moveCard(db, cardId, targetColumnId);
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
    await updateCard(db, cardId, patch);
    await refreshBoard(activeBoardId);
  }

  async function handleDeleteCard(cardId: string) {
    if (!activeBoardId) {
      return;
    }
    await deleteCard(db, cardId);
    await refreshBoard(activeBoardId);
  }

  async function handleAddSubtask(cardId: string, title: string) {
    if (!activeBoardId) {
      return;
    }
    await addSubtask(db, cardId, title);
    await refreshBoard(activeBoardId);
  }

  async function handleToggleSubtask(cardId: string, subtaskId: string, isDone: boolean) {
    if (!activeBoardId) {
      return;
    }
    await toggleSubtask(db, subtaskId, isDone);
    await refreshBoard(activeBoardId);
  }

  async function handleDeleteSubtask(cardId: string, subtaskId: string) {
    if (!activeBoardId) {
      return;
    }
    await deleteSubtask(db, subtaskId);
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
        columnIndex={colIndex}
        totalColumns={columns.length}
        cards={columnCards}
        totalCardCount={totalInColumn}
        hasActiveFilters={hasActiveFilters}
        colors={colors}
        width={isDesktop ? (useDesktopHorizontalScroll ? 300 : undefined) : mobileColumnWidth}
        height={isDesktop ? undefined : trackHeight || undefined}
        draggingCardId={draggingCardId}
        isDropTarget={dropColumnId === column.id}
        onAddCard={handleAddCard}
        onOpenCard={(cardId) => setSelectedCardId(cardId)}
        onMoveCard={handleMoveCardByStep}
        onEditColumn={() => setColumnDialog({ open: true, mode: 'edit', column })}
        onDragStart={(cardId) => setDraggingCardId(cardId)}
        onDragEnd={() => {
          setDraggingCardId(null);
          setDropColumnId(null);
        }}
        onDragEnterColumn={() => setDropColumnId(column.id)}
        onDragLeaveColumn={() =>
          setDropColumnId((current) => (current === column.id ? null : current))
        }
        onDropCard={(cardId) => {
          setDraggingCardId(null);
          setDropColumnId(null);
          handleMoveCardToColumn(cardId, column.id);
        }}
      />
    );
  });

  return (
    <View style={[styles.screen, isDesktop ? styles.screenDesktop : styles.screenMobile]}>
      {/* Top Toolbar: Boards + Actions */}
      <View style={styles.toolbar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.boardPills}>
          {boards.map((board) => {
            const active = board.id === activeBoardId;
            return (
              <RipplePressable
                key={board.id}
                onPress={() => selectBoard(board.id)}
                style={StyleSheet.flatten([
                  styles.boardPill,
                  {
                    backgroundColor: active ? colors.accent : colors.surface,
                    borderColor: active ? colors.accent : colors.line,
                  },
                ])}>
                <Text
                  style={[
                    styles.boardPillText,
                    { color: active ? colors.accentText : colors.text },
                  ]}>
                  {board.title}
                </Text>
              </RipplePressable>
            );
          })}

          <RipplePressable
            accessibilityLabel="Новая доска"
            onPress={() => setBoardDialog({ open: true, mode: 'create' })}
            style={StyleSheet.flatten([
              styles.iconPill,
              { backgroundColor: colors.surface, borderColor: colors.line },
            ])}>
            <Text style={[styles.iconPillText, { color: colors.text }]}>+</Text>
          </RipplePressable>

          <RipplePressable
            accessibilityLabel="Настройки доски"
            onPress={() => setBoardDialog({ open: true, mode: 'edit' })}
            style={StyleSheet.flatten([
              styles.iconPill,
              { backgroundColor: colors.surface, borderColor: colors.line },
            ])}>
            <Text style={[styles.iconPillText, { color: colors.muted }]}>⋯</Text>
          </RipplePressable>
        </ScrollView>

        <View style={styles.toolbarRight}>
          {isDesktop ? (
            <>
              <View
                style={[
                  styles.searchBox,
                  { backgroundColor: colors.surface, borderColor: colors.line },
                ]}>
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Поиск…"
                  placeholderTextColor={colors.muted}
                  style={[styles.searchInput, { color: colors.text }]}
                />
                {search.length > 0 ? (
                  <RipplePressable onPress={() => setSearch('')} style={styles.clearBtn}>
                    <Text style={[styles.clearLabel, { color: colors.muted }]}>×</Text>
                  </RipplePressable>
                ) : null}
              </View>

              <View style={styles.filterGroup}>
                {PRIORITY_FILTERS.map((filter) => {
                  const active = priorityFilter === filter.key;
                  return (
                    <RipplePressable
                      key={filter.key}
                      onPress={() => setPriorityFilter(filter.key)}
                      style={StyleSheet.flatten([
                        styles.filterChip,
                        {
                          backgroundColor: active ? colors.surfaceActive : 'transparent',
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
              </View>

              <RipplePressable
                onPress={() => setColumnDialog({ open: true, mode: 'create', column: null })}
                style={StyleSheet.flatten([
                  styles.addColBtn,
                  { backgroundColor: colors.surface, borderColor: colors.line },
                ])}>
                <Text style={[styles.addColLabel, { color: colors.text }]}>+ Колонка</Text>
              </RipplePressable>
            </>
          ) : (
            <>
              <RipplePressable
                accessibilityLabel="Поиск и фильтр"
                onPress={() => setMobileFiltersOpen((value) => !value)}
                style={StyleSheet.flatten([
                  styles.iconPill,
                  {
                    backgroundColor:
                      mobileFiltersOpen || hasActiveFilters ? colors.accent : colors.surface,
                    borderColor:
                      mobileFiltersOpen || hasActiveFilters ? colors.accent : colors.line,
                  },
                ])}>
                <Text
                  style={[
                    styles.iconPillText,
                    {
                      color:
                        mobileFiltersOpen || hasActiveFilters ? colors.accentText : colors.text,
                    },
                  ]}>
                  ⌕
                </Text>
              </RipplePressable>

              <RipplePressable
                accessibilityLabel="Добавить колонку"
                onPress={() => setColumnDialog({ open: true, mode: 'create', column: null })}
                style={StyleSheet.flatten([
                  styles.addColBtn,
                  { backgroundColor: colors.surface, borderColor: colors.line },
                ])}>
                <Text style={[styles.addColLabel, { color: colors.text }]}>+ Колонка</Text>
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
                <Text style={[styles.clearLabel, { color: colors.muted }]}>×</Text>
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

      {/* Modals */}
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
    </View>
  );
}

function KanbanColumnView({
  column,
  columnIndex,
  totalColumns,
  cards,
  totalCardCount,
  hasActiveFilters,
  colors,
  width,
  height,
  draggingCardId,
  isDropTarget,
  onAddCard,
  onOpenCard,
  onMoveCard,
  onEditColumn,
  onDragStart,
  onDragEnd,
  onDragEnterColumn,
  onDragLeaveColumn,
  onDropCard,
}: {
  column: KanbanColumnRecord;
  columnIndex: number;
  totalColumns: number;
  cards: KanbanCardRecord[];
  totalCardCount: number;
  hasActiveFilters: boolean;
  colors: ThemeColors;
  width: number | undefined;
  height: number | undefined;
  draggingCardId: string | null;
  isDropTarget: boolean;
  onAddCard: (columnId: string, title: string) => Promise<void>;
  onOpenCard: (cardId: string) => void;
  onMoveCard: (cardId: string, direction: -1 | 1) => void;
  onEditColumn: () => void;
  onDragStart: (cardId: string) => void;
  onDragEnd: () => void;
  onDragEnterColumn: () => void;
  onDragLeaveColumn: () => void;
  onDropCard: (cardId: string) => void;
}) {
  const [draft, setDraft] = useState('');

  async function submit() {
    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }
    setDraft('');
    await onAddCard(column.id, trimmed);
  }

  const webDropProps: WebDropProps =
    Platform.OS === 'web'
      ? {
          onDragOver: (event) => {
            event.preventDefault();
            if (event.dataTransfer) {
              event.dataTransfer.dropEffect = 'move';
            }
            if (!isDropTarget) {
              onDragEnterColumn();
            }
          },
          onDragLeave: () => {
            onDragLeaveColumn();
          },
          onDrop: (event) => {
            event.preventDefault();
            const droppedId = event.dataTransfer?.getData('text/plain') || draggingCardId;
            if (droppedId) {
              onDropCard(droppedId);
            }
          },
        }
      : {};

  return (
    <View
      {...(webDropProps as object)}
      style={[
        styles.column,
        {
          backgroundColor: colors.surface,
          borderColor: isDropTarget ? colors.accent : colors.line,
          width,
          height,
        },
        isDropTarget ? styles.columnDropActive : null,
        width === undefined ? styles.columnFlex : styles.columnFixed,
      ]}>
      <View style={styles.columnHeader}>
        <View style={styles.columnTitleRow}>
          <View style={[styles.colAccentDot, { backgroundColor: column.accent }]} />
          <Text style={[styles.columnTitle, { color: colors.text }]} numberOfLines={1}>
            {column.title}
          </Text>
          <View style={[styles.countPill, { backgroundColor: colors.surfaceSubtle }]}>
            <Text style={[styles.countText, { color: colors.muted }]}>
              {hasActiveFilters ? `${cards.length}/${totalCardCount}` : cards.length}
            </Text>
          </View>
        </View>

        <RipplePressable
          accessibilityLabel={`Настроить колонку «${column.title}»`}
          hitSlop={6}
          onPress={onEditColumn}
          style={styles.colMenuBtn}>
          <Text style={[styles.colMenuGlyph, { color: colors.muted }]}>⋯</Text>
        </RipplePressable>
      </View>

      {isDropTarget ? (
        <View
          style={[
            styles.dropBanner,
            { backgroundColor: colors.surfaceSubtle, borderColor: colors.accent },
          ]}>
          <Text style={[styles.dropBannerText, { color: colors.text }]}>
            Отпустите, чтобы перенести сюда
          </Text>
        </View>
      ) : null}

      <ScrollView
        nestedScrollEnabled
        style={styles.cardList}
        contentContainerStyle={styles.cardListContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {cards.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              {hasActiveFilters ? 'Нет совпадений' : 'Пока пусто'}
            </Text>
          </View>
        ) : (
          cards.map((card) => (
            <KanbanCardItem
              key={card.id}
              card={card}
              colors={colors}
              canMoveLeft={columnIndex > 0}
              canMoveRight={columnIndex < totalColumns - 1}
              isDragging={draggingCardId === card.id}
              onPress={() => onOpenCard(card.id)}
              onMove={(direction) => onMoveCard(card.id, direction)}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))
        )}
      </ScrollView>

      <View style={[styles.composer, { borderTopColor: colors.line }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submit}
          placeholder="Новая карточка…"
          placeholderTextColor={colors.muted}
          returnKeyType="done"
          style={[styles.composerInput, { color: colors.text }]}
        />
        <RipplePressable
          accessibilityLabel={`Добавить в «${column.title}»`}
          disabled={draft.trim().length === 0}
          onPress={submit}
          style={StyleSheet.flatten([
            styles.addButton,
            { backgroundColor: colors.surfaceSubtle },
            draft.trim().length === 0 ? styles.addButtonDisabled : null,
          ])}>
          <Text style={[styles.addLabel, { color: colors.text }]}>+</Text>
        </RipplePressable>
      </View>
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
    gap: 10,
    flexWrap: 'wrap',
  },
  boardPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  boardPill: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  boardPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  iconPill: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillText: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 18,
  },
  toolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 180,
    height: 34,
    borderRadius: 10,
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
  },
  clearBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearLabel: {
    fontSize: 16,
    lineHeight: 18,
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
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
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
  column: {
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
  colMenuBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colMenuGlyph: {
    fontSize: 16,
  },
  dropBanner: {
    marginHorizontal: 10,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  dropBannerText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardList: {
    flex: 1,
  },
  cardListContent: {
    paddingHorizontal: 10,
    paddingBottom: 12,
    gap: 8,
  },
  emptyBox: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
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
  addLabel: {
    fontSize: 19,
    lineHeight: 21,
  },
});
