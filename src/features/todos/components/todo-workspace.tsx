import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { RipplePressable } from '@/components/ripple-pressable';
import { useDatabase } from '@/db/provider';
import { useAuth } from '@/features/auth/auth-context';
import { addDaysDateKey, PRIORITY_META } from '@/features/kanban/types';
import { TodoDetailModal } from '@/features/todos/components/todo-detail-modal';
import { TodoListDialog } from '@/features/todos/components/todo-list-dialog';
import { TodoRowItem } from '@/features/todos/components/todo-row-item';
import {
  type BoardColumnOption,
  clearCompletedTodos,
  createTodo,
  createTodoList,
  deleteTodo,
  deleteTodoList,
  ensureInitialTodoData,
  listKanbanTargets,
  loadTodoWorkspace,
  renameTodoList,
  sendTodoToKanban,
  toggleTodoDone,
  unlinkTodoFromKanban,
  updateTodo,
} from '@/features/todos/todos-repository';
import type {
  TodoItemRecord,
  TodoListRecord,
  TodoPriority,
  TodoSmartFilter,
  TodoViewSelection,
} from '@/features/todos/types';
import { useThemeColors, useViewport } from '@/theme/colors';

const SMART_FILTERS: readonly {
  key: TodoSmartFilter;
  label: string;
  badge: string;
}[] = [
  { key: 'all', label: 'Все', badge: '◎' },
  { key: 'today', label: 'Сегодня', badge: '☀' },
  { key: 'upcoming', label: 'Предстоящие', badge: '◷' },
  { key: 'board', label: 'На доске', badge: '▦' },
  { key: 'done', label: 'Выполненные', badge: '✓' },
];

const PRIORITY_CYCLE: readonly TodoPriority[] = ['medium', 'high', 'low'];

export function TodoWorkspace() {
  const db = useDatabase();
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const colors = useThemeColors();
  const { isDesktop } = useViewport();

  const [lists, setLists] = useState<TodoListRecord[]>([]);
  const [todos, setTodos] = useState<TodoItemRecord[]>([]);
  const [kanbanTargets, setKanbanTargets] = useState<BoardColumnOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<TodoViewSelection>({ kind: 'smart', filter: 'all' });
  const [search, setSearch] = useState('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const [draft, setDraft] = useState('');
  const [draftPriority, setDraftPriority] = useState<TodoPriority>('medium');
  const [draftDueDate, setDraftDueDate] = useState<string | null>(null);

  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);
  const [confirmClearDone, setConfirmClearDone] = useState(false);
  const [listDialog, setListDialog] = useState<{
    open: boolean;
    mode: 'create' | 'edit';
    list: TodoListRecord | null;
  }>({ open: false, mode: 'create', list: null });

  const todayKey = addDaysDateKey(0);
  const tomorrowKey = addDaysDateKey(1);

  const refreshAll = useCallback(async () => {
    if (!userId) {
      return;
    }
    const [workspace, targets] = await Promise.all([
      loadTodoWorkspace(db, userId),
      listKanbanTargets(db, userId),
    ]);
    setLists(workspace.lists);
    setTodos(workspace.todos);
    setKanbanTargets(targets);
  }, [db, userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    let cancelled = false;

    async function init() {
      await ensureInitialTodoData(db, userId);
      const [workspace, targets] = await Promise.all([
        loadTodoWorkspace(db, userId),
        listKanbanTargets(db, userId),
      ]);
      if (cancelled) {
        return;
      }
      setLists(workspace.lists);
      setTodos(workspace.todos);
      setKanbanTargets(targets);
      setLoading(false);
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [db, userId]);

  const listTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const list of lists) {
      map.set(list.id, list.title);
    }
    return map;
  }, [lists]);

  const counts = useMemo(() => {
    const open = todos.filter((item) => !item.isDone);
    const done = todos.filter((item) => item.isDone);
    const today = open.filter((item) => item.dueDate !== null && item.dueDate <= todayKey);
    const upcoming = open.filter((item) => item.dueDate !== null);
    const board = todos.filter((item) => item.linkedCard !== null);

    const byList = new Map<string, number>();
    for (const item of open) {
      if (item.listId) {
        byList.set(item.listId, (byList.get(item.listId) ?? 0) + 1);
      }
    }

    return {
      all: open.length,
      today: today.length,
      upcoming: upcoming.length,
      board: board.length,
      done: done.length,
      byList,
    };
  }, [todos, todayKey]);

  const normalizedSearch = search.trim().toLowerCase();

  const visibleTodos = useMemo(() => {
    return todos.filter((item) => {
      if (view.kind === 'smart') {
        if (view.filter === 'all' && item.isDone) {
          return false;
        }
        if (view.filter === 'today' && (item.isDone || !item.dueDate || item.dueDate > todayKey)) {
          return false;
        }
        if (view.filter === 'upcoming' && (item.isDone || !item.dueDate)) {
          return false;
        }
        if (view.filter === 'board' && !item.linkedCard) {
          return false;
        }
        if (view.filter === 'done' && !item.isDone) {
          return false;
        }
      } else if (item.listId !== view.listId) {
        return false;
      }

      if (normalizedSearch.length > 0) {
        const hay = `${item.title} ${item.notes}`.toLowerCase();
        if (!hay.includes(normalizedSearch)) {
          return false;
        }
      }

      return true;
    });
  }, [todos, view, todayKey, normalizedSearch]);

  const selectedTodo = useMemo(
    () => todos.find((item) => item.id === selectedTodoId) ?? null,
    [todos, selectedTodoId],
  );

  const activeList =
    view.kind === 'list' ? lists.find((list) => list.id === view.listId) ?? null : null;

  const activeTitle =
    view.kind === 'list'
      ? activeList?.title ?? 'Список'
      : SMART_FILTERS.find((item) => item.key === view.filter)?.label ?? 'Задачи';

  function cycleDraftPriority() {
    const idx = PRIORITY_CYCLE.indexOf(draftPriority);
    setDraftPriority(PRIORITY_CYCLE[(idx + 1) % PRIORITY_CYCLE.length]);
  }

  async function handleAddTodo() {
    const title = draft.trim();
    if (!title) {
      return;
    }

    const resolvedListId =
      view.kind === 'list' ? view.listId : lists[0]?.id ?? null;
    const resolvedDueDate =
      draftDueDate ?? (view.kind === 'smart' && view.filter === 'today' ? todayKey : null);

    setDraft('');
    setDraftPriority('medium');
    setDraftDueDate(null);

    await createTodo(db, userId, {
      title,
      listId: resolvedListId,
      priority: draftPriority,
      dueDate: resolvedDueDate,
    });
    await refreshAll();
  }

  async function handleToggleDone(todoId: string, isDone: boolean) {
    await toggleTodoDone(db, todoId, isDone);
    await refreshAll();
  }

  async function handleSaveTodo(
    todoId: string,
    patch: {
      title: string;
      notes: string;
      listId: string | null;
      priority: TodoPriority;
      dueDate: string | null;
    },
  ) {
    await updateTodo(db, todoId, patch);
    await refreshAll();
  }

  async function handleDeleteTodo(todoId: string) {
    await deleteTodo(db, todoId);
    await refreshAll();
  }

  async function handleSendToKanban(todoId: string, boardId: string, columnId: string) {
    await sendTodoToKanban(db, todoId, boardId, columnId);
    await refreshAll();
  }

  async function handleUnlinkKanban(todoId: string) {
    await unlinkTodoFromKanban(db, todoId);
    await refreshAll();
  }

  async function handleClearDone() {
    if (!confirmClearDone) {
      setConfirmClearDone(true);
      return;
    }
    setConfirmClearDone(false);
    await clearCompletedTodos(db, userId);
    await refreshAll();
  }

  async function handleListSubmit(title: string) {
    if (listDialog.mode === 'create') {
      const created = await createTodoList(db, userId, title);
      await refreshAll();
      setView({ kind: 'list', listId: created.id });
    } else if (listDialog.list) {
      await renameTodoList(db, listDialog.list.id, title);
      await refreshAll();
    }
  }

  async function handleListDelete() {
    if (!listDialog.list || lists.length <= 1) {
      return;
    }
    const deletedId = listDialog.list.id;
    await deleteTodoList(db, deletedId);
    if (view.kind === 'list' && view.listId === deletedId) {
      setView({ kind: 'smart', filter: 'all' });
    }
    await refreshAll();
  }

  function getEmptyMessage(): string {
    if (normalizedSearch.length > 0) {
      return 'Ничего не найдено по запросу';
    }
    if (view.kind === 'list') {
      return 'В этом списке пока нет задач';
    }
    switch (view.filter) {
      case 'today':
        return 'На сегодня задач нет — можно выдохнуть';
      case 'upcoming':
        return 'Задач со сроком пока нет';
      case 'board':
        return 'Нет задач, связанных с Канбаном. Откройте любую задачу и нажмите «Отправить на доску».';
      case 'done':
        return 'Выполненных задач пока нет';
      default:
        return 'Пока пусто — добавьте первую задачу выше';
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator size="small" color={colors.text} />
      </View>
    );
  }

  const showComposer = !(view.kind === 'smart' && (view.filter === 'done' || view.filter === 'board'));
  const showListBadges = view.kind === 'smart';

  return (
    <View style={[styles.screen, isDesktop ? styles.screenDesktop : styles.screenMobile]}>
      <View style={[styles.layout, isDesktop ? styles.layoutDesktop : styles.layoutMobile]}>
        {/* Left Navigation Rail (Desktop) OR Compact Strips (Mobile) */}
        {isDesktop ? (
          <View
            style={[
              styles.rail,
              { backgroundColor: colors.surface, borderColor: colors.line },
            ]}>
            <View style={styles.railSection}>
              <Text style={[styles.railCaption, { color: colors.muted }]}>Фильтры</Text>
              {SMART_FILTERS.map((item) => {
                const active = view.kind === 'smart' && view.filter === item.key;
                const count = counts[item.key];
                return (
                  <RipplePressable
                    key={item.key}
                    onPress={() => {
                      setConfirmClearDone(false);
                      setView({ kind: 'smart', filter: item.key });
                    }}
                    style={StyleSheet.flatten([
                      styles.railItem,
                      active ? { backgroundColor: colors.surfaceActive } : null,
                    ])}>
                    <Text
                      style={[
                        styles.railBadge,
                        { color: active ? colors.text : colors.muted },
                      ]}>
                      {item.badge}
                    </Text>
                    <Text
                      style={[
                        styles.railLabel,
                        { color: active ? colors.text : colors.muted },
                      ]}>
                      {item.label}
                    </Text>
                    <Text style={[styles.railCount, { color: colors.muted }]}>{count}</Text>
                  </RipplePressable>
                );
              })}
            </View>

            <View style={[styles.railDivider, { backgroundColor: colors.line }]} />

            <View style={styles.railSection}>
              <View style={styles.railHeaderRow}>
                <Text style={[styles.railCaption, { color: colors.muted }]}>Списки</Text>
                <RipplePressable
                  accessibilityLabel="Новый список"
                  onPress={() => setListDialog({ open: true, mode: 'create', list: null })}
                  style={styles.railAddBtn}>
                  <Text style={[styles.railAddGlyph, { color: colors.muted }]}>+</Text>
                </RipplePressable>
              </View>

              {lists.map((list) => {
                const active = view.kind === 'list' && view.listId === list.id;
                const count = counts.byList.get(list.id) ?? 0;
                return (
                  <RipplePressable
                    key={list.id}
                    onPress={() => {
                      setConfirmClearDone(false);
                      setView({ kind: 'list', listId: list.id });
                    }}
                    style={StyleSheet.flatten([
                      styles.railItem,
                      active ? { backgroundColor: colors.surfaceActive } : null,
                    ])}>
                    <Text
                      style={[
                        styles.railBadge,
                        { color: active ? colors.text : colors.muted },
                      ]}>
                      •
                    </Text>
                    <Text
                      style={[
                        styles.railLabel,
                        { color: active ? colors.text : colors.muted },
                      ]}
                      numberOfLines={1}>
                      {list.title}
                    </Text>
                    <Text style={[styles.railCount, { color: colors.muted }]}>{count}</Text>
                  </RipplePressable>
                );
              })}
            </View>
          </View>
        ) : (
          <View style={styles.mobileFiltersWrap}>
            <View style={styles.mobileTopBar}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.mobilePillRow}>
                {SMART_FILTERS.map((item) => {
                  const active = view.kind === 'smart' && view.filter === item.key;
                  const count = counts[item.key];
                  return (
                    <RipplePressable
                      key={item.key}
                      onPress={() => {
                        setConfirmClearDone(false);
                        setView({ kind: 'smart', filter: item.key });
                      }}
                      style={StyleSheet.flatten([
                        styles.mobilePill,
                        {
                          backgroundColor: active ? colors.accent : colors.surface,
                          borderColor: active ? colors.accent : colors.line,
                        },
                      ])}>
                      <Text
                        style={[
                          styles.mobilePillText,
                          { color: active ? colors.accentText : colors.text },
                        ]}>
                        {item.label}
                      </Text>
                      <Text
                        style={[
                          styles.mobilePillCount,
                          { color: active ? colors.accentText : colors.muted },
                        ]}>
                        {count}
                      </Text>
                    </RipplePressable>
                  );
                })}
              </ScrollView>

              <RipplePressable
                accessibilityLabel="Поиск"
                onPress={() => setMobileSearchOpen((value) => !value)}
                style={StyleSheet.flatten([
                  styles.mobileIconBtn,
                  {
                    backgroundColor:
                      mobileSearchOpen || search.length > 0 ? colors.accent : colors.surface,
                    borderColor:
                      mobileSearchOpen || search.length > 0 ? colors.accent : colors.line,
                  },
                ])}>
                <Text
                  style={[
                    styles.mobileIconGlyph,
                    {
                      color:
                        mobileSearchOpen || search.length > 0 ? colors.accentText : colors.text,
                    },
                  ]}>
                  ⌕
                </Text>
              </RipplePressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.mobilePillRow}>
              {lists.map((list) => {
                const active = view.kind === 'list' && view.listId === list.id;
                const count = counts.byList.get(list.id) ?? 0;
                return (
                  <RipplePressable
                    key={list.id}
                    onPress={() => {
                      setConfirmClearDone(false);
                      setView({ kind: 'list', listId: list.id });
                    }}
                    style={StyleSheet.flatten([
                      styles.mobileListPill,
                      {
                        backgroundColor: active ? colors.surfaceActive : colors.surface,
                        borderColor: active ? colors.text : colors.line,
                      },
                    ])}>
                    <Text
                      style={[
                        styles.mobileListPillText,
                        { color: active ? colors.text : colors.muted },
                      ]}>
                      {list.title}
                    </Text>
                    <Text style={[styles.mobilePillCount, { color: colors.muted }]}>{count}</Text>
                  </RipplePressable>
                );
              })}

              <RipplePressable
                accessibilityLabel="Новый список"
                onPress={() => setListDialog({ open: true, mode: 'create', list: null })}
                style={StyleSheet.flatten([
                  styles.mobileListPill,
                  { backgroundColor: colors.surface, borderColor: colors.line },
                ])}>
                <Text style={[styles.mobileListPillText, { color: colors.text }]}>+ Список</Text>
              </RipplePressable>
            </ScrollView>

            {mobileSearchOpen ? (
              <View
                style={[
                  styles.searchBox,
                  styles.searchBoxFull,
                  { backgroundColor: colors.surface, borderColor: colors.line },
                ]}>
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Поиск задач…"
                  placeholderTextColor={colors.muted}
                  style={[styles.searchInput, { color: colors.text }]}
                />
                {search.length > 0 ? (
                  <RipplePressable onPress={() => setSearch('')} style={styles.clearBtn}>
                    <Text style={[styles.clearGlyph, { color: colors.muted }]}>×</Text>
                  </RipplePressable>
                ) : null}
              </View>
            ) : null}
          </View>
        )}

        {/* Main Panel */}
        <View
          style={[
            styles.panel,
            { backgroundColor: colors.surface, borderColor: colors.line },
          ]}>
          {/* Panel Header */}
          <View style={[styles.panelHeader, { borderBottomColor: colors.line }]}>
            <View style={styles.panelTitleRow}>
              <Text style={[styles.panelTitle, { color: colors.text }]} numberOfLines={1}>
                {activeTitle}
              </Text>
              <View style={[styles.countPill, { backgroundColor: colors.surfaceSubtle }]}>
                <Text style={[styles.countPillText, { color: colors.muted }]}>
                  {visibleTodos.length}
                </Text>
              </View>
              {activeList ? (
                <RipplePressable
                  accessibilityLabel="Настройки списка"
                  onPress={() =>
                    setListDialog({ open: true, mode: 'edit', list: activeList })
                  }
                  style={styles.listEditBtn}>
                  <Text style={[styles.listEditGlyph, { color: colors.muted }]}>⋯</Text>
                </RipplePressable>
              ) : null}
            </View>

            <View style={styles.panelHeaderActions}>
              {view.kind === 'smart' && view.filter === 'done' && counts.done > 0 ? (
                <RipplePressable
                  onPress={handleClearDone}
                  style={StyleSheet.flatten([
                    styles.clearDoneBtn,
                    {
                      backgroundColor: confirmClearDone ? colors.danger : colors.dangerBg,
                    },
                  ])}>
                  <Text
                    style={[
                      styles.clearDoneLabel,
                      { color: confirmClearDone ? '#FFFFFF' : colors.danger },
                    ]}>
                    {confirmClearDone ? 'Точно очистить?' : 'Очистить'}
                  </Text>
                </RipplePressable>
              ) : null}

              {isDesktop ? (
                <View
                  style={[
                    styles.searchBox,
                    { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
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
                      <Text style={[styles.clearGlyph, { color: colors.muted }]}>×</Text>
                    </RipplePressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>

          {/* Fast Composer */}
          {showComposer ? (
            <View style={[styles.composerWrap, { borderBottomColor: colors.line }]}>
              <View style={styles.composerRow}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  onSubmitEditing={handleAddTodo}
                  placeholder="Новая задача…"
                  placeholderTextColor={colors.muted}
                  returnKeyType="done"
                  style={[styles.composerInput, { color: colors.text }]}
                />
                <RipplePressable
                  accessibilityLabel="Добавить задачу"
                  disabled={draft.trim().length === 0}
                  onPress={handleAddTodo}
                  style={StyleSheet.flatten([
                    styles.addBtn,
                    { backgroundColor: colors.accent },
                    draft.trim().length === 0 ? styles.addBtnDisabled : null,
                  ])}>
                  <Text style={[styles.addBtnLabel, { color: colors.accentText }]}>+</Text>
                </RipplePressable>
              </View>

              <View style={styles.composerQuickRow}>
                <RipplePressable
                  onPress={cycleDraftPriority}
                  style={StyleSheet.flatten([
                    styles.quickChip,
                    { backgroundColor: colors.surfaceSubtle },
                  ])}>
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: PRIORITY_META[draftPriority].dotColor },
                    ]}
                  />
                  <Text style={[styles.quickChipText, { color: colors.muted }]}>
                    {PRIORITY_META[draftPriority].shortLabel}
                  </Text>
                </RipplePressable>

                {[
                  { label: 'Сегодня', value: todayKey },
                  { label: 'Завтра', value: tomorrowKey },
                ].map((preset) => {
                  const selected = draftDueDate === preset.value;
                  return (
                    <RipplePressable
                      key={preset.label}
                      onPress={() =>
                        setDraftDueDate((current) =>
                          current === preset.value ? null : preset.value,
                        )
                      }
                      style={StyleSheet.flatten([
                        styles.quickChip,
                        {
                          backgroundColor: selected
                            ? colors.accent
                            : colors.surfaceSubtle,
                        },
                      ])}>
                      <Text
                        style={[
                          styles.quickChipText,
                          { color: selected ? colors.accentText : colors.muted },
                        ]}>
                        {preset.label}
                      </Text>
                    </RipplePressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* Task List */}
          <ScrollView
            style={styles.listScroll}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled">
            {visibleTodos.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={[styles.emptyText, { color: colors.muted }]}>
                  {getEmptyMessage()}
                </Text>
              </View>
            ) : (
              visibleTodos.map((todo) => (
                <TodoRowItem
                  key={todo.id}
                  todo={todo}
                  listTitle={showListBadges && todo.listId ? listTitleById.get(todo.listId) : null}
                  colors={colors}
                  onToggle={() => handleToggleDone(todo.id, !todo.isDone)}
                  onPress={() => setSelectedTodoId(todo.id)}
                  onDelete={() => handleDeleteTodo(todo.id)}
                />
              ))
            )}
          </ScrollView>
        </View>
      </View>

      {/* Modals */}
      <TodoDetailModal
        todo={selectedTodo}
        lists={lists}
        kanbanTargets={kanbanTargets}
        onClose={() => setSelectedTodoId(null)}
        onSave={handleSaveTodo}
        onToggleDone={handleToggleDone}
        onDelete={handleDeleteTodo}
        onSendToKanban={handleSendToKanban}
        onUnlinkKanban={handleUnlinkKanban}
      />

      <TodoListDialog
        visible={listDialog.open}
        mode={listDialog.mode}
        initialTitle={listDialog.list?.title ?? ''}
        canDelete={lists.length > 1}
        onClose={() => setListDialog((prev) => ({ ...prev, open: false }))}
        onSubmit={handleListSubmit}
        onDelete={handleListDelete}
      />
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
    alignItems: 'center',
  },
  screenDesktop: {
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  screenMobile: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  layout: {
    width: '100%',
    maxWidth: 1040,
    flex: 1,
    minHeight: 0,
  },
  layoutDesktop: {
    flexDirection: 'row',
    gap: 16,
  },
  layoutMobile: {
    flexDirection: 'column',
    gap: 10,
  },
  rail: {
    width: 228,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 10,
  },
  railSection: {
    gap: 3,
  },
  railHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 4,
  },
  railCaption: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  railAddBtn: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railAddGlyph: {
    fontSize: 18,
    lineHeight: 20,
  },
  railDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 2,
  },
  railItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  railBadge: {
    width: 18,
    textAlign: 'center',
    fontSize: 13,
  },
  railLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  railCount: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  mobileFiltersWrap: {
    gap: 8,
  },
  mobileTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mobilePillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mobilePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  mobilePillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  mobilePillCount: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  mobileIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileIconGlyph: {
    fontSize: 16,
    lineHeight: 18,
  },
  mobileListPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
  },
  mobileListPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  panel: {
    flex: 1,
    minHeight: 0,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  panelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  panelTitle: {
    fontSize: 17,
    fontWeight: '700',
    flexShrink: 1,
  },
  countPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  countPillText: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  listEditBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listEditGlyph: {
    fontSize: 16,
  },
  panelHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearDoneBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  clearDoneLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 190,
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
  clearGlyph: {
    fontSize: 16,
    lineHeight: 18,
  },
  composerWrap: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  composerInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 7,
    paddingHorizontal: 6,
  },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: {
    opacity: 0.35,
  },
  addBtnLabel: {
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '600',
  },
  composerQuickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingLeft: 4,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  quickChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  listScroll: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 16,
  },
  emptyBox: {
    paddingHorizontal: 20,
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
