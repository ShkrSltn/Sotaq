import { type ComponentRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { AppIcon, type IconName } from '@/components/app-icon';
import { DragTrashZone } from '@/components/drag-trash-zone';
import { MobileSearchBar } from '@/components/mobile-search-bar';
import { RipplePressable } from '@/components/ripple-pressable';
import { HistoryToast, UndoRedoButtons } from '@/components/undo-redo-bar';
import { WebDragBox } from '@/components/web-drag-box';
import { useDatabase } from '@/db/provider';
import { useAuth } from '@/features/auth/auth-context';
import { addDaysDateKey, PRIORITY_META } from '@/features/kanban/types';
import { CreateTodoModal } from '@/features/todos/components/create-todo-modal';
import { TodoDetailModal } from '@/features/todos/components/todo-detail-modal';
import { TodoListDialog } from '@/features/todos/components/todo-list-dialog';
import {
  type TodoDropPosition,
  TodoRowItem,
} from '@/features/todos/components/todo-row-item';
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
  reorderTodoLists,
  reorderTodos,
  restoreTodoSnapshot,
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
import { useUndoRedoHotkeys } from '@/hooks/use-undo-redo';
import { useThemeColors, useViewport } from '@/theme/colors';

type PriorityFilter = 'all' | TodoPriority;

const SMART_FILTERS: readonly {
  key: TodoSmartFilter;
  label: string;
  subtitle: string;
  icon: IconName;
  accent?: string;
}[] = [
  {
    key: 'today',
    label: 'Сегодня',
    subtitle: 'Задачи на сегодня и просроченные',
    icon: 'sun',
    accent: '#E6A23C',
  },
  {
    key: 'all',
    label: 'Все задачи',
    subtitle: 'Все задачи из всех ваших списков',
    icon: 'circle',
  },
  {
    key: 'upcoming',
    label: 'Предстоящие',
    subtitle: 'Все задачи с назначенным сроком',
    icon: 'clock',
    accent: '#4E86F0',
  },
  {
    key: 'board',
    label: 'На доске',
    subtitle: 'Задачи, синхронизированные с Kanban',
    icon: 'kanban',
    accent: '#9B6AF5',
  },
  {
    key: 'done',
    label: 'Выполненные',
    subtitle: 'Завершённые задачи — можно вернуть или очистить',
    icon: 'checkCircle',
    accent: '#4CC38A',
  },
];

const PRIORITY_FILTERS: readonly { key: PriorityFilter; label: string; fullLabel: string }[] = [
  { key: 'all', label: 'Все', fullLabel: 'Все приоритеты' },
  { key: 'high', label: 'Высок.', fullLabel: 'Высокий' },
  { key: 'medium', label: 'Обыч.', fullLabel: 'Обычный' },
  { key: 'low', label: 'Низк.', fullLabel: 'Низкий' },
];

type TodoHistoryEntry = {
  label: string;
  lists: TodoListRecord[];
  todos: TodoItemRecord[];
};

const DROP_BLUE = '#2383E2';

export function TodoWorkspace() {
  const db = useDatabase();
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const colors = useThemeColors();
  const { isDesktop } = useViewport();
  const insets = useSafeAreaInsets();

  const [lists, setLists] = useState<TodoListRecord[]>([]);
  const [todos, setTodos] = useState<TodoItemRecord[]>([]);
  const [kanbanTargets, setKanbanTargets] = useState<BoardColumnOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<TodoViewSelection>({ kind: 'smart', filter: 'all' });
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [search, setSearch] = useState('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobilePriorityOpen, setMobilePriorityOpen] = useState(false);
  const [mobilePriorityAnchor, setMobilePriorityAnchor] = useState<AnchorRect | null>(null);
  const mobilePriorityBtnRef = useRef<ComponentRef<typeof View>>(null);
  const [showCompletedInView, setShowCompletedInView] = useState(false);

  const [quickDraft, setQuickDraft] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);
  const [confirmClearDone, setConfirmClearDone] = useState(false);
  const [hoveredListId, setHoveredListId] = useState<string | null>(null);

  const [draggingTodoId, setDraggingTodoId] = useState<string | null>(null);
  const [todoDropTarget, setTodoDropTarget] = useState<{
    todoId: string;
    position: TodoDropPosition;
  } | null>(null);
  const [dropSmartFilter, setDropSmartFilter] = useState<TodoSmartFilter | null>(null);
  const [dropListId, setDropListId] = useState<string | null>(null);
  const [draggingListId, setDraggingListId] = useState<string | null>(null);
  const [listDropTarget, setListDropTarget] = useState<{
    listId: string;
    position: TodoDropPosition;
  } | null>(null);

  const [listDialog, setListDialog] = useState<{
    open: boolean;
    mode: 'create' | 'edit';
    list: TodoListRecord | null;
  }>({ open: false, mode: 'create', list: null });

  const [historyMeta, setHistoryMeta] = useState({ canUndo: false, canRedo: false });
  const [historyToast, setHistoryToast] = useState<string | null>(null);
  const historyRef = useRef<{ past: TodoHistoryEntry[]; future: TodoHistoryEntry[] }>({
    past: [],
    future: [],
  });
  const stateRef = useRef<{ lists: TodoListRecord[]; todos: TodoItemRecord[] }>({
    lists: [],
    todos: [],
  });
  const restoringRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    stateRef.current = { lists, todos };
  }, [lists, todos]);

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

  const pushTodoHistory = useCallback((label: string) => {
    const { lists: curLists, todos: curTodos } = stateRef.current;
    historyRef.current.past.push({
      label,
      lists: curLists.map((l) => ({ ...l })),
      todos: curTodos.map((t) => ({ ...t })),
    });
    if (historyRef.current.past.length > 40) {
      historyRef.current.past.shift();
    }
    historyRef.current.future = [];
    setHistoryMeta({ canUndo: historyRef.current.past.length > 0, canRedo: false });
  }, []);

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
      if (!cancelled) {
        setLists(workspace.lists);
        setTodos(workspace.todos);
        setKanbanTargets(targets);
        setLoading(false);
      }
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
    let allActive = 0;
    let today = 0;
    let upcoming = 0;
    let board = 0;
    let done = 0;
    const byList = new Map<string, number>();

    for (const item of todos) {
      if (item.isDone) {
        done += 1;
        continue;
      }
      allActive += 1;
      if (item.dueDate && item.dueDate <= todayKey) {
        today += 1;
      }
      if (item.dueDate) {
        upcoming += 1;
      }
      if (item.linkedCardId) {
        board += 1;
      }
      if (item.listId) {
        byList.set(item.listId, (byList.get(item.listId) ?? 0) + 1);
      }
    }

    return { all: allActive, today, upcoming, board, done, byList };
  }, [todos, todayKey]);

  const normalizedSearch = search.trim().toLowerCase();

  // Separate active & completed items clearly for the active view
  const { activeTodos, completedTodos } = useMemo(() => {
    const active: TodoItemRecord[] = [];
    const completed: TodoItemRecord[] = [];

    for (const item of todos) {
      if (normalizedSearch.length > 0) {
        const hay = `${item.title} ${item.notes}`.toLowerCase();
        if (!hay.includes(normalizedSearch)) {
          continue;
        }
      }

      if (priorityFilter !== 'all' && !item.isDone && item.priority !== priorityFilter) {
        continue;
      }

      if (view.kind === 'list') {
        if (item.listId !== view.listId) {
          continue;
        }
        if (item.isDone) {
          completed.push(item);
        } else {
          active.push(item);
        }
        continue;
      }

      switch (view.filter) {
        case 'all':
          if (item.isDone) {
            completed.push(item);
          } else {
            active.push(item);
          }
          break;
        case 'today':
          if (!item.isDone && item.dueDate !== null && item.dueDate <= todayKey) {
            active.push(item);
          }
          break;
        case 'upcoming':
          if (!item.isDone && item.dueDate !== null) {
            active.push(item);
          }
          break;
        case 'board':
          if (item.linkedCardId !== null) {
            if (item.isDone) {
              completed.push(item);
            } else {
              active.push(item);
            }
          }
          break;
        case 'done':
          if (item.isDone) {
            completed.push(item);
          }
          break;
      }
    }

    return { activeTodos: active, completedTodos: completed };
  }, [todos, view, normalizedSearch, priorityFilter, todayKey]);

  const selectedTodo = useMemo(
    () => todos.find((item) => item.id === selectedTodoId) ?? null,
    [todos, selectedTodoId],
  );

  const activeList = useMemo(
    () => (view.kind === 'list' ? lists.find((l) => l.id === view.listId) ?? null : null),
    [lists, view],
  );

  const activeSmartMeta = useMemo(
    () =>
      view.kind === 'smart'
        ? SMART_FILTERS.find((item) => item.key === view.filter) ?? SMART_FILTERS[0]
        : null,
    [view],
  );

  const targetListForNewTask = activeList ?? lists[0] ?? null;
  const isDoneOnlyView = view.kind === 'smart' && view.filter === 'done';
  const showQuickAdd = !(view.kind === 'smart' && (view.filter === 'done' || view.filter === 'board'));
  const showListBadges = view.kind === 'smart';

  const headerTitle = activeList ? activeList.title : activeSmartMeta?.label ?? 'Задачи';
  const headerSubtitle = activeList
    ? `Список · ${activeTodos.length} активных${completedTodos.length > 0 ? `, ${completedTodos.length} выполнено` : ''}`
    : activeSmartMeta?.subtitle ?? '';

  const handleUndoTodo = useCallback(async () => {
    if (!userId || restoringRef.current || historyRef.current.past.length === 0) {
      return;
    }
    restoringRef.current = true;
    try {
      const previous = historyRef.current.past.pop()!;
      const { lists: curLists, todos: curTodos } = stateRef.current;
      historyRef.current.future.push({
        label: previous.label,
        lists: curLists.map((l) => ({ ...l })),
        todos: curTodos.map((t) => ({ ...t })),
      });
      await restoreTodoSnapshot(db, userId, previous);
      await refreshAll();
      setHistoryMeta({
        canUndo: historyRef.current.past.length > 0,
        canRedo: historyRef.current.future.length > 0,
      });
      showHistoryToast(`Отменено: ${previous.label}`);
    } finally {
      restoringRef.current = false;
    }
  }, [db, refreshAll, showHistoryToast, userId]);

  const handleRedoTodo = useCallback(async () => {
    if (!userId || restoringRef.current || historyRef.current.future.length === 0) {
      return;
    }
    restoringRef.current = true;
    try {
      const next = historyRef.current.future.pop()!;
      const { lists: curLists, todos: curTodos } = stateRef.current;
      historyRef.current.past.push({
        label: next.label,
        lists: curLists.map((l) => ({ ...l })),
        todos: curTodos.map((t) => ({ ...t })),
      });
      await restoreTodoSnapshot(db, userId, next);
      await refreshAll();
      setHistoryMeta({
        canUndo: historyRef.current.past.length > 0,
        canRedo: historyRef.current.future.length > 0,
      });
      showHistoryToast(`Возвращено: ${next.label}`);
    } finally {
      restoringRef.current = false;
    }
  }, [db, refreshAll, showHistoryToast, userId]);

  useUndoRedoHotkeys({
    enabled: Boolean(userId) && !listDialog.open && !createModalOpen,
    ignoreInsideInputs: true,
    onUndo: () => {
      handleUndoTodo();
    },
    onRedo: () => {
      handleRedoTodo();
    },
  });

  async function handleQuickAddTodo() {
    const title = quickDraft.trim();
    if (!title) {
      return;
    }

    const resolvedListId = targetListForNewTask?.id ?? null;
    const resolvedDueDate =
      view.kind === 'smart' && view.filter === 'today'
        ? todayKey
        : view.kind === 'smart' && view.filter === 'upcoming'
          ? tomorrowKey
          : null;

    setQuickDraft('');
    pushTodoHistory('Добавление задачи');
    await createTodo(db, userId, {
      title,
      listId: resolvedListId,
      priority: priorityFilter === 'all' ? 'medium' : priorityFilter,
      dueDate: resolvedDueDate,
    });
    await refreshAll();
  }

  async function handleCreateDetailedTodo(input: {
    title: string;
    notes: string;
    listId: string | null;
    priority: TodoPriority;
    dueDate: string | null;
  }) {
    pushTodoHistory('Создание задачи');
    await createTodo(db, userId, input);
    await refreshAll();
  }

  async function handleToggleDone(todoId: string, isDone: boolean) {
    pushTodoHistory(isDone ? 'Выполнение задачи' : 'Возврат задачи');
    await toggleTodoDone(db, todoId, isDone);
    await refreshAll();
  }

  async function handleQuickUpdateTodo(
    todoId: string,
    patch: { priority?: TodoPriority; listId?: string | null; dueDate?: string | null },
  ) {
    pushTodoHistory(
      patch.priority !== undefined
        ? 'Смена приоритета'
        : patch.listId !== undefined
          ? 'Перенос в список'
          : 'Изменение срока',
    );
    await updateTodo(db, todoId, patch);
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
    pushTodoHistory('Редактирование задачи');
    await updateTodo(db, todoId, patch);
    await refreshAll();
  }

  async function handleDeleteTodo(todoId: string) {
    pushTodoHistory('Удаление задачи');
    await deleteTodo(db, todoId);
    await refreshAll();
  }

  async function handleDropTodoOnTodo(
    draggedId: string,
    targetId: string,
    position: TodoDropPosition,
  ) {
    setDraggingTodoId(null);
    setTodoDropTarget(null);
    if (!userId || draggedId === targetId) {
      return;
    }

    const dragged = todos.find((item) => item.id === draggedId);
    const target = todos.find((item) => item.id === targetId);
    if (!dragged || !target) {
      return;
    }

    const remaining = todos.filter((item) => item.id !== draggedId);
    const targetIdx = remaining.findIndex((item) => item.id === targetId);
    if (targetIdx === -1) {
      return;
    }
    const insertAt = position === 'before' ? targetIdx : targetIdx + 1;
    const orderedIds = remaining.map((item) => item.id);
    orderedIds.splice(insertAt, 0, draggedId);

    pushTodoHistory('Порядок задач');
    if (dragged.isDone !== target.isDone) {
      await toggleTodoDone(db, draggedId, target.isDone);
    }
    await reorderTodos(db, userId, orderedIds);
    await refreshAll();
  }

  async function handleDropTodoOnSmartFilter(todoId: string, filter: TodoSmartFilter) {
    setDraggingTodoId(null);
    setDropSmartFilter(null);
    const todo = todos.find((item) => item.id === todoId);
    if (!todo) {
      return;
    }

    pushTodoHistory('Перенос задачи');
    if (filter === 'today') {
      if (todo.isDone) {
        await toggleTodoDone(db, todoId, false);
      }
      await updateTodo(db, todoId, { dueDate: todayKey });
    } else if (filter === 'upcoming') {
      if (todo.isDone) {
        await toggleTodoDone(db, todoId, false);
      }
      if (!todo.dueDate) {
        await updateTodo(db, todoId, { dueDate: tomorrowKey });
      }
    } else if (filter === 'done') {
      if (!todo.isDone) {
        await toggleTodoDone(db, todoId, true);
      }
    } else if (filter === 'all') {
      if (todo.isDone) {
        await toggleTodoDone(db, todoId, false);
      }
    } else {
      return;
    }
    await refreshAll();
  }

  async function handleDropTodoOnList(todoId: string, targetListId: string) {
    setDraggingTodoId(null);
    setDropListId(null);
    pushTodoHistory('Перенос в список');
    await updateTodo(db, todoId, { listId: targetListId });
    await refreshAll();
  }

  async function handleDropListOnList(
    draggedId: string,
    targetId: string,
    position: TodoDropPosition,
  ) {
    setDraggingListId(null);
    setListDropTarget(null);
    if (!userId || draggedId === targetId) {
      return;
    }
    const remaining = lists.filter((item) => item.id !== draggedId);
    const targetIdx = remaining.findIndex((item) => item.id === targetId);
    if (targetIdx === -1) {
      return;
    }
    const insertAt = position === 'before' ? targetIdx : targetIdx + 1;
    const orderedIds = remaining.map((item) => item.id);
    orderedIds.splice(insertAt, 0, draggedId);
    pushTodoHistory('Порядок списков');
    await reorderTodoLists(db, userId, orderedIds);
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
    pushTodoHistory('Очистка выполненных');
    await clearCompletedTodos(db, userId);
    await refreshAll();
  }

  async function handleListSubmit(title: string) {
    pushTodoHistory(listDialog.mode === 'create' ? 'Создание списка' : 'Переименование списка');
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
    pushTodoHistory('Удаление списка');
    await deleteTodoList(db, deletedId);
    if (view.kind === 'list' && view.listId === deletedId) {
      setView({ kind: 'smart', filter: 'all' });
    }
    await refreshAll();
  }

  function getEmptyMessage(): string {
    if (normalizedSearch.length > 0 || priorityFilter !== 'all') {
      return 'По выбранным фильтрам задач не найдено';
    }
    if (view.kind === 'list') {
      return `В списке «${activeList?.title ?? ''}» пока нет активных задач`;
    }
    switch (view.filter) {
      case 'today':
        return 'На сегодня всё чисто — можно выдохнуть';
      case 'upcoming':
        return 'Задач со сроком пока нет';
      case 'board':
        return 'Нет задач, связанных с Kanban. Откройте задачу и нажмите «Отправить на доску».';
      case 'done':
        return 'Выполненных задач пока нет';
      default:
        return 'Нет активных задач — добавьте первую выше';
    }
  }

  function renderTodoRow(todo: TodoItemRecord) {
    return (
      <TodoRowItem
        key={todo.id}
        todo={todo}
        lists={lists}
        listTitle={showListBadges && todo.listId ? listTitleById.get(todo.listId) : null}
        colors={colors}
        isDesktop={isDesktop}
        isDragging={draggingTodoId === todo.id}
        isTodoDragActive={draggingTodoId !== null}
        dropIndicator={todoDropTarget?.todoId === todo.id ? todoDropTarget.position : null}
        onToggle={() => handleToggleDone(todo.id, !todo.isDone)}
        onPress={() => setSelectedTodoId(todo.id)}
        onQuickUpdate={(patch) => handleQuickUpdateTodo(todo.id, patch)}
        onDelete={() => handleDeleteTodo(todo.id)}
        onDragStart={(id) => {
          setDraggingListId(null);
          setListDropTarget(null);
          setDraggingTodoId(id);
        }}
        onDragEnd={() => {
          setDraggingTodoId(null);
          setTodoDropTarget(null);
          setDropSmartFilter(null);
          setDropListId(null);
        }}
        onDragOverTodo={(targetId, pos) => {
          setTodoDropTarget((prev) =>
            prev?.todoId === targetId && prev.position === pos
              ? prev
              : { todoId: targetId, position: pos },
          );
        }}
        onDropOnTodo={handleDropTodoOnTodo}
      />
    );
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
      <View style={[styles.layout, isDesktop ? styles.layoutDesktop : styles.layoutMobile]}>
        {/* Left Navigation Rail (Desktop) OR Clear 2-Tier Strips (Mobile) */}
        {isDesktop ? (
          <View
            style={[
              styles.rail,
              { backgroundColor: colors.surface, borderColor: colors.line },
            ]}>
            {/* Primary Detailed Add Trigger */}
            <RipplePressable
              onPress={() => setCreateModalOpen(true)}
              style={StyleSheet.flatten([
                styles.railPrimaryBtn,
                { backgroundColor: colors.accent },
              ])}>
              <AppIcon name="plus" size="sm" color={colors.accentText} />
              <Text style={[styles.railPrimaryLabel, { color: colors.accentText }]}>
                Новая задача
              </Text>
            </RipplePressable>

            {/* Section 1: Smart Overview */}
            <View style={styles.railSection}>
              <Text style={[styles.railCaption, { color: colors.muted }]}>Обзор</Text>
              {SMART_FILTERS.map((item) => {
                const active = view.kind === 'smart' && view.filter === item.key;
                const count = counts[item.key];
                const canDropTodo = draggingTodoId !== null && item.key !== 'board';
                const isDropHere = dropSmartFilter === item.key && canDropTodo;
                const iconColor = active
                  ? item.accent ?? colors.text
                  : item.accent ?? colors.muted;
                return (
                  <WebDragBox
                    key={item.key}
                    onDragOver={(event) => {
                      if (!canDropTodo) return;
                      event.preventDefault();
                      if (event.dataTransfer) {
                        event.dataTransfer.dropEffect = 'move';
                      }
                      if (dropSmartFilter !== item.key) {
                        setDropSmartFilter(item.key);
                      }
                    }}
                    onDragLeave={() => {
                      setDropSmartFilter((prev) => (prev === item.key ? null : prev));
                    }}
                    onDrop={(event) => {
                      if (!canDropTodo) return;
                      event.preventDefault();
                      const draggedId =
                        event.dataTransfer?.getData('text/sotaq-todo') || draggingTodoId;
                      if (draggedId) {
                        handleDropTodoOnSmartFilter(draggedId, item.key);
                      }
                    }}>
                    <RipplePressable
                      onPress={() => {
                        setConfirmClearDone(false);
                        setView({ kind: 'smart', filter: item.key });
                      }}
                      style={StyleSheet.flatten([
                        styles.railItem,
                        active ? { backgroundColor: colors.surfaceActive } : null,
                        isDropHere ? styles.railDropTarget : null,
                      ])}>
                      <AppIcon name={item.icon} size="sm" color={iconColor} />
                      <Text
                        style={[
                          styles.railLabel,
                          { color: active || isDropHere ? colors.text : colors.muted },
                        ]}
                        numberOfLines={1}>
                        {item.label}
                      </Text>
                      {count > 0 ? (
                        <View
                          style={[
                            styles.railCountPill,
                            {
                              backgroundColor: active
                                ? colors.surface
                                : colors.surfaceSubtle,
                            },
                          ]}>
                          <Text
                            style={[
                              styles.railCount,
                              { color: active ? colors.text : colors.muted },
                            ]}>
                            {count}
                          </Text>
                        </View>
                      ) : null}
                    </RipplePressable>
                  </WebDragBox>
                );
              })}
            </View>

            <View style={[styles.railDivider, { backgroundColor: colors.line }]} />

            {/* Section 2: User Custom Lists */}
            <View style={[styles.railSection, styles.railListsFlex]}>
              <View style={styles.railHeaderRow}>
                <Text style={[styles.railCaption, { color: colors.muted }]}>Мои списки</Text>
                <RipplePressable
                  accessibilityLabel="Новый список"
                  onPress={() => setListDialog({ open: true, mode: 'create', list: null })}
                  style={styles.railAddBtn}>
                  <AppIcon name="plus" size="sm" color={colors.muted} />
                </RipplePressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.railListsScroll}>
                {lists.map((list) => {
                  const active = view.kind === 'list' && view.listId === list.id;
                  const count = counts.byList.get(list.id) ?? 0;
                  const isHovered = hoveredListId === list.id;
                  const isTodoDropHere = dropListId === list.id && draggingTodoId !== null;
                  const listDropPos =
                    listDropTarget?.listId === list.id && draggingListId !== null
                      ? listDropTarget.position
                      : null;
                  return (
                    <View key={list.id} style={styles.railListItemWrap}>
                      {listDropPos === 'before' ? <View style={styles.railDropLine} /> : null}
                      <WebDragBox
                        draggable={Platform.OS === 'web'}
                        onPointerEnter={() => setHoveredListId(list.id)}
                        onPointerLeave={() =>
                          setHoveredListId((prev) => (prev === list.id ? null : prev))
                        }
                        onDragStart={(event) => {
                          event.stopPropagation();
                          if (event.dataTransfer) {
                            event.dataTransfer.setData('text/sotaq-todo-list', list.id);
                            event.dataTransfer.effectAllowed = 'move';
                          }
                          setDraggingTodoId(null);
                          setDraggingListId(list.id);
                        }}
                        onDragEnd={() => {
                          setDraggingListId(null);
                          setListDropTarget(null);
                        }}
                        onDragOver={(event) => {
                          if (draggingTodoId) {
                            event.preventDefault();
                            if (event.dataTransfer) {
                              event.dataTransfer.dropEffect = 'move';
                            }
                            if (dropListId !== list.id) {
                              setDropListId(list.id);
                            }
                            return;
                          }
                          if (draggingListId && draggingListId !== list.id) {
                            event.preventDefault();
                            if (event.dataTransfer) {
                              event.dataTransfer.dropEffect = 'move';
                            }
                            const target = event.currentTarget as HTMLElement | null;
                            const rect = target?.getBoundingClientRect?.();
                            const pos: TodoDropPosition =
                              rect && event.clientY - rect.top < rect.height * 0.5
                                ? 'before'
                                : 'after';
                            setListDropTarget((prev) =>
                              prev?.listId === list.id && prev.position === pos
                                ? prev
                                : { listId: list.id, position: pos },
                            );
                          }
                        }}
                        onDragLeave={() => {
                          setDropListId((prev) => (prev === list.id ? null : prev));
                          setListDropTarget((prev) => (prev?.listId === list.id ? null : prev));
                        }}
                        onDrop={(event) => {
                          if (draggingTodoId) {
                            event.preventDefault();
                            const draggedId =
                              event.dataTransfer?.getData('text/sotaq-todo') || draggingTodoId;
                            if (draggedId) {
                              handleDropTodoOnList(draggedId, list.id);
                            }
                            return;
                          }
                          if (draggingListId) {
                            event.preventDefault();
                            const draggedId =
                              event.dataTransfer?.getData('text/sotaq-todo-list') || draggingListId;
                            if (draggedId && draggedId !== list.id) {
                              handleDropListOnList(draggedId, list.id, listDropPos ?? 'after');
                            } else {
                              setDraggingListId(null);
                              setListDropTarget(null);
                            }
                          }
                        }}
                        style={[
                          styles.railListRow,
                          active ? { backgroundColor: colors.surfaceActive } : null,
                          isHovered && !active ? { backgroundColor: colors.surfaceSubtle } : null,
                          isTodoDropHere ? styles.railDropTarget : null,
                          draggingListId === list.id ? styles.draggingList : null,
                        ]}>
                        <Pressable
                          onPress={() => {
                            setConfirmClearDone(false);
                            setView({ kind: 'list', listId: list.id });
                          }}
                          style={styles.railListMain}>
                          <AppIcon
                            name="list"
                            size="sm"
                            color={active || isTodoDropHere ? colors.text : colors.muted}
                          />
                          <Text
                            style={[
                              styles.railLabel,
                              { color: active || isTodoDropHere || isHovered ? colors.text : colors.muted },
                            ]}
                            numberOfLines={1}>
                            {list.title}
                          </Text>
                        </Pressable>

                        {isHovered ? (
                          <RipplePressable
                            accessibilityLabel={`Настроить список «${list.title}»`}
                            hitSlop={4}
                            onPress={() => setListDialog({ open: true, mode: 'edit', list })}
                            style={styles.railListEditBtn}>
                            <AppIcon name="more" size="xs" color={colors.muted} />
                          </RipplePressable>
                        ) : count > 0 ? (
                          <View
                            style={[
                              styles.railCountPill,
                              {
                                backgroundColor: active
                                  ? colors.surface
                                  : colors.surfaceSubtle,
                              },
                            ]}>
                            <Text
                              style={[
                                styles.railCount,
                                { color: active ? colors.text : colors.muted },
                              ]}>
                              {count}
                            </Text>
                          </View>
                        ) : null}
                      </WebDragBox>
                      {listDropPos === 'after' ? <View style={styles.railDropLine} /> : null}
                    </View>
                  );
                })}
              </ScrollView>
            </View>

            {draggingTodoId ? (
              <View
                style={[
                  styles.railDragHint,
                  { backgroundColor: 'rgba(35, 131, 226, 0.1)', borderColor: DROP_BLUE },
                ]}>
                <Text style={[styles.railDragHintText, { color: colors.text }]}>
                  Бросьте на список или фильтр
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          /* Clean Single-Row Mobile Header Bar (Things 3 / Linear style) */
          <View style={[styles.mobileCleanBarWrap, { borderBottomColor: colors.line }]}>
            {mobileSearchOpen ? (
              <MobileSearchBar
                value={search}
                onChangeText={setSearch}
                onCancel={() => {
                  setSearch('');
                  setMobileSearchOpen(false);
                }}
                placeholder="Поиск задач…"
                colors={colors}
                matchCount={
                  isDoneOnlyView
                    ? completedTodos.length
                    : activeTodos.length + completedTodos.length
                }
              />
            ) : (
              <View style={styles.mobileCleanBar}>
                <RipplePressable
                  accessibilityLabel="Выбрать список или фильтр"
                  onPress={() => setMobileNavOpen(true)}
                  style={StyleSheet.flatten([
                    styles.mobileViewTrigger,
                    { backgroundColor: colors.surface, borderColor: colors.line },
                  ])}>
                  <AppIcon
                    name={activeList ? 'list' : activeSmartMeta?.icon ?? 'circle'}
                    size="sm"
                    color={activeList ? colors.text : activeSmartMeta?.accent ?? colors.text}
                  />
                  <Text
                    style={[styles.mobileViewTriggerText, { color: colors.text }]}
                    numberOfLines={1}>
                    {headerTitle}
                  </Text>
                  <Text style={[styles.mobileViewTriggerCount, { color: colors.muted }]}>
                    {isDoneOnlyView ? completedTodos.length : activeTodos.length}
                  </Text>
                  <AppIcon name="chevronDown" size="xs" color={colors.muted} />
                </RipplePressable>

                <View style={styles.mobileCleanActions}>
                  {historyMeta.canUndo || historyMeta.canRedo ? (
                    <UndoRedoButtons
                      compact
                      canUndo={historyMeta.canUndo}
                      canRedo={historyMeta.canRedo}
                      colors={colors}
                      onUndo={() => {
                        handleUndoTodo();
                      }}
                      onRedo={() => {
                        handleRedoTodo();
                      }}
                    />
                  ) : null}

                  {!isDoneOnlyView ? (
                    <View ref={mobilePriorityBtnRef} collapsable={false}>
                      <RipplePressable
                        accessibilityLabel="Фильтр по приоритету"
                        onPress={() => {
                          measureAnchor(mobilePriorityBtnRef.current, (rect) => {
                            setMobilePriorityAnchor(rect);
                            setMobilePriorityOpen(true);
                          });
                        }}
                        style={StyleSheet.flatten([
                          styles.mobileIconBtn,
                          {
                            backgroundColor:
                              priorityFilter !== 'all' ? colors.surfaceActive : colors.surface,
                            borderColor: priorityFilter !== 'all' ? colors.text : colors.line,
                          },
                        ])}>
                        {priorityFilter !== 'all' ? (
                          <View
                            style={[
                              styles.dot,
                              { backgroundColor: PRIORITY_META[priorityFilter].dotColor },
                            ]}
                          />
                        ) : (
                          <AppIcon name="filter" size="sm" color={colors.muted} />
                        )}
                      </RipplePressable>
                    </View>
                  ) : null}

                  <RipplePressable
                    accessibilityLabel="Поиск задач"
                    onPress={() => setMobileSearchOpen(true)}
                    style={StyleSheet.flatten([
                      styles.mobileIconBtn,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.line,
                      },
                    ])}>
                    <AppIcon name="search" size="sm" color={colors.muted} />
                  </RipplePressable>

                  <RipplePressable
                    accessibilityLabel="Создать задачу с деталями"
                    onPress={() => setCreateModalOpen(true)}
                    style={StyleSheet.flatten([
                      styles.mobileIconBtn,
                      { backgroundColor: colors.accent, borderColor: colors.accent },
                    ])}>
                    <AppIcon name="plus" size="sm" color={colors.accentText} />
                  </RipplePressable>
                </View>
              </View>
            )}

            {/* Active priority dismissible chip or Done clear button */}
            {priorityFilter !== 'all' && !isDoneOnlyView ? (
              <View style={styles.mobileActiveFilterRow}>
                <RipplePressable
                  onPress={() => setPriorityFilter('all')}
                  style={StyleSheet.flatten([
                    styles.mobileActiveChip,
                    { backgroundColor: colors.surface, borderColor: colors.line },
                  ])}>
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: PRIORITY_META[priorityFilter].dotColor },
                    ]}
                  />
                  <Text style={[styles.mobileActiveChipText, { color: colors.text }]}>
                    Приоритет: {PRIORITY_META[priorityFilter].label}
                  </Text>
                  <AppIcon name="close" size={11} color={colors.muted} />
                </RipplePressable>
              </View>
            ) : null}

            {isDoneOnlyView && completedTodos.length > 0 ? (
              <View style={styles.mobileActiveFilterRow}>
                <RipplePressable
                  onPress={handleClearDone}
                  style={StyleSheet.flatten([
                    styles.clearDoneBtn,
                    { backgroundColor: confirmClearDone ? colors.danger : colors.dangerBg },
                  ])}>
                  <AppIcon
                    name="trash"
                    size="xs"
                    color={confirmClearDone ? '#FFFFFF' : colors.danger}
                  />
                  <Text
                    style={[
                      styles.clearDoneLabel,
                      { color: confirmClearDone ? '#FFFFFF' : colors.danger },
                    ]}>
                    {confirmClearDone ? 'Точно очистить?' : 'Очистить выполненные'}
                  </Text>
                </RipplePressable>
              </View>
            ) : null}
          </View>
        )}

        {/* Main Task Panel (Card on Desktop, Edge-to-Edge on Mobile) */}
        <View
          style={[
            styles.panel,
            isDesktop
              ? { backgroundColor: colors.surface, borderColor: colors.line }
              : styles.panelMobile,
          ]}>
          {/* Desktop Panel Header & Priority Filter Strip (Mobile uses single clean bar above) */}
          {isDesktop ? (
            <>
              <View style={[styles.panelHeader, { borderBottomColor: colors.line }]}>
                <View style={styles.panelHeadingCol}>
                  <View style={styles.panelTitleRow}>
                    <AppIcon
                      name={activeList ? 'list' : activeSmartMeta?.icon ?? 'circle'}
                      size="md"
                      color={activeList ? colors.text : activeSmartMeta?.accent ?? colors.text}
                    />
                    <Text style={[styles.panelTitle, { color: colors.text }]} numberOfLines={1}>
                      {headerTitle}
                    </Text>
                    {activeList ? (
                      <RipplePressable
                        accessibilityLabel="Настройки списка"
                        onPress={() =>
                          setListDialog({ open: true, mode: 'edit', list: activeList })
                        }
                        style={styles.listEditBtn}>
                        <AppIcon name="more" size="sm" color={colors.muted} />
                      </RipplePressable>
                    ) : null}
                  </View>
                  <Text style={[styles.panelSubtitle, { color: colors.muted }]} numberOfLines={1}>
                    {headerSubtitle}
                  </Text>
                </View>

                <View style={styles.panelHeaderActions}>
                  <UndoRedoButtons
                    compact
                    canUndo={historyMeta.canUndo}
                    canRedo={historyMeta.canRedo}
                    colors={colors}
                    onUndo={() => {
                      handleUndoTodo();
                    }}
                    onRedo={() => {
                      handleRedoTodo();
                    }}
                  />

                  <View style={[styles.headerDivider, { backgroundColor: colors.line }]} />

                  <View
                    style={[
                      styles.searchBox,
                      { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
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

                  <RipplePressable
                    accessibilityLabel="Создать задачу с деталями"
                    onPress={() => setCreateModalOpen(true)}
                    style={StyleSheet.flatten([
                      styles.headerAddBtn,
                      { backgroundColor: colors.accent },
                    ])}>
                    <AppIcon name="plus" size="xs" color={colors.accentText} />
                    <Text style={[styles.headerAddLabel, { color: colors.accentText }]}>
                      Задача
                    </Text>
                  </RipplePressable>
                </View>
              </View>

              {!isDoneOnlyView ? (
                <View style={[styles.sectionToolbar, { borderBottomColor: colors.line }]}>
                  <Text style={[styles.sectionHeading, { color: colors.muted }]}>
                    Активные · {activeTodos.length}
                  </Text>
                  <View style={styles.priorityFilterRow}>
                    {PRIORITY_FILTERS.map((filter) => {
                      const active = priorityFilter === filter.key;
                      return (
                        <RipplePressable
                          key={filter.key}
                          onPress={() => setPriorityFilter(filter.key)}
                          style={StyleSheet.flatten([
                            styles.priorityFilterChip,
                            {
                              backgroundColor: active ? colors.surfaceActive : 'transparent',
                              borderColor: active ? colors.line : 'transparent',
                            },
                          ])}>
                          {filter.key !== 'all' ? (
                            <View
                              style={[
                                styles.dot,
                                { backgroundColor: PRIORITY_META[filter.key].dotColor },
                              ]}
                            />
                          ) : null}
                          <Text
                            style={[
                              styles.priorityFilterText,
                              { color: active ? colors.text : colors.muted },
                            ]}>
                            {filter.label}
                          </Text>
                        </RipplePressable>
                      );
                    })}
                  </View>
                </View>
              ) : completedTodos.length > 0 ? (
                <View style={[styles.sectionToolbar, { borderBottomColor: colors.line }]}>
                  <Text style={[styles.sectionHeading, { color: colors.muted }]}>
                    Выполненные · {completedTodos.length}
                  </Text>
                  <RipplePressable
                    onPress={handleClearDone}
                    style={StyleSheet.flatten([
                      styles.clearDoneBtn,
                      { backgroundColor: confirmClearDone ? colors.danger : colors.dangerBg },
                    ])}>
                    <AppIcon
                      name="trash"
                      size="xs"
                      color={confirmClearDone ? '#FFFFFF' : colors.danger}
                    />
                    <Text
                      style={[
                        styles.clearDoneLabel,
                        { color: confirmClearDone ? '#FFFFFF' : colors.danger },
                      ]}>
                      {confirmClearDone ? 'Точно очистить все?' : 'Очистить всё'}
                    </Text>
                  </RipplePressable>
                </View>
              ) : null}
            </>
          ) : null}

          {/* Task Stream: Active Section + Collapsible Completed Section */}
          <ScrollView
            style={styles.listScroll}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled">
            {isDoneOnlyView ? (
              completedTodos.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={[styles.emptyText, { color: colors.muted }]}>
                    {getEmptyMessage()}
                  </Text>
                </View>
              ) : (
                completedTodos.map(renderTodoRow)
              )
            ) : (
              <>
                {activeTodos.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <Text style={[styles.emptyText, { color: colors.muted }]}>
                      {getEmptyMessage()}
                    </Text>
                  </View>
                ) : (
                  activeTodos.map(renderTodoRow)
                )}

                {/* Clear Collapsible Completed Section inside Active Views */}
                {completedTodos.length > 0 ? (
                  <View style={[styles.completedSection, { borderTopColor: colors.line }]}>
                    <View style={styles.completedHeaderRow}>
                      <RipplePressable
                        onPress={() => setShowCompletedInView((v) => !v)}
                        style={styles.completedToggle}>
                        <AppIcon
                          name={showCompletedInView ? 'chevronDown' : 'chevronRight'}
                          size="xs"
                          color={colors.muted}
                        />
                        <AppIcon name="checkCircle" size="xs" color={colors.success} />
                        <Text style={[styles.completedHeading, { color: colors.muted }]}>
                          Выполненные · {completedTodos.length}
                        </Text>
                      </RipplePressable>

                      {showCompletedInView ? (
                        <RipplePressable
                          onPress={handleClearDone}
                          style={StyleSheet.flatten([
                            styles.clearDoneMini,
                            {
                              backgroundColor: confirmClearDone
                                ? colors.danger
                                : colors.dangerBg,
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
                    </View>

                    {showCompletedInView ? completedTodos.map(renderTodoRow) : null}
                  </View>
                ) : null}
              </>
            )}
          </ScrollView>

          {/* Minimalist Bottom Quick-Add Bar */}
          {showQuickAdd ? (
            <View style={[styles.bottomQuickAdd, { borderTopColor: colors.line }]}>
              <View
                style={[
                  styles.bottomQuickAddBox,
                  { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                ]}>
                <TextInput
                  value={quickDraft}
                  onChangeText={setQuickDraft}
                  onSubmitEditing={handleQuickAddTodo}
                  placeholder="Новая задача…"
                  placeholderTextColor={colors.muted}
                  returnKeyType="done"
                  style={[styles.quickAddInput, { color: colors.text }]}
                />
                <RipplePressable
                  accessibilityLabel="Быстро добавить задачу"
                  disabled={quickDraft.trim().length === 0}
                  onPress={handleQuickAddTodo}
                  style={StyleSheet.flatten([
                    styles.quickAddIconBtn,
                    {
                      backgroundColor:
                        quickDraft.trim().length > 0 ? colors.accent : colors.surface,
                    },
                    quickDraft.trim().length === 0 ? styles.disabled : null,
                  ])}>
                  <AppIcon
                    name="plus"
                    size="sm"
                    color={quickDraft.trim().length > 0 ? colors.accentText : colors.muted}
                  />
                </RipplePressable>
              </View>
            </View>
          ) : null}
        </View>
      </View>

      {/* Mobile Priority Filter Popover */}
      <AnchoredPopover
        visible={mobilePriorityOpen}
        anchor={mobilePriorityAnchor}
        width={196}
        estimatedHeight={180}
        align="right"
        colors={colors}
        onClose={() => setMobilePriorityOpen(false)}>
        <View style={styles.mobilePopoverBody}>
          {PRIORITY_FILTERS.map((filter) => {
            const active = priorityFilter === filter.key;
            return (
              <RipplePressable
                key={filter.key}
                onPress={() => {
                  setPriorityFilter(filter.key);
                  setMobilePriorityOpen(false);
                }}
                style={StyleSheet.flatten([
                  styles.mobilePopoverRow,
                  active ? { backgroundColor: colors.surfaceActive } : null,
                ])}>
                {filter.key !== 'all' ? (
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: PRIORITY_META[filter.key].dotColor },
                    ]}
                  />
                ) : (
                  <AppIcon name="filter" size="xs" color={colors.muted} />
                )}
                <Text style={[styles.mobilePopoverRowText, { color: colors.text }]}>
                  {filter.fullLabel}
                </Text>
                {active ? <AppIcon name="check" size="xs" color={colors.text} /> : null}
              </RipplePressable>
            );
          })}
        </View>
      </AnchoredPopover>

      {/* Mobile Bottom Sheet for Smart Views & Lists */}
      <Modal
        visible={mobileNavOpen}
        transparent
        animationType="none"
        onRequestClose={() => setMobileNavOpen(false)}>
        <View style={styles.sheetRoot}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setMobileNavOpen(false)} />
          <Animated.View
            entering={FadeIn.duration(110)}
            style={[
              styles.mobileNavSheet,
              {
                backgroundColor: colors.surface,
                borderColor: colors.line,
                paddingBottom: Math.max(insets.bottom, 16),
              },
            ]}>
            <View style={styles.sheetGrabberRow}>
              <View style={[styles.sheetGrabber, { backgroundColor: colors.line }]} />
            </View>

            <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent}>
              <Text style={[styles.sheetSectionLabel, { color: colors.muted }]}>Обзор</Text>
              {SMART_FILTERS.map((item) => {
                const active = view.kind === 'smart' && view.filter === item.key;
                const count = counts[item.key];
                return (
                  <RipplePressable
                    key={item.key}
                    onPress={() => {
                      setConfirmClearDone(false);
                      setView({ kind: 'smart', filter: item.key });
                      setMobileNavOpen(false);
                    }}
                    style={StyleSheet.flatten([
                      styles.sheetRow,
                      active ? { backgroundColor: colors.surfaceActive } : null,
                    ])}>
                    <AppIcon
                      name={item.icon}
                      size="sm"
                      color={active ? colors.text : item.accent ?? colors.muted}
                    />
                    <Text
                      style={[
                        styles.sheetRowTitle,
                        { color: active ? colors.text : colors.text },
                      ]}>
                      {item.label}
                    </Text>
                    {count > 0 ? (
                      <Text style={[styles.sheetRowCount, { color: colors.muted }]}>{count}</Text>
                    ) : null}
                    {active ? <AppIcon name="check" size="xs" color={colors.text} /> : null}
                  </RipplePressable>
                );
              })}

              <View style={[styles.sheetDivider, { backgroundColor: colors.line }]} />

              <View style={styles.sheetSectionHeader}>
                <Text style={[styles.sheetSectionLabel, { color: colors.muted }]}>Мои списки</Text>
                <RipplePressable
                  onPress={() => {
                    setMobileNavOpen(false);
                    setListDialog({ open: true, mode: 'create', list: null });
                  }}
                  style={StyleSheet.flatten([
                    styles.sheetAddListBtn,
                    { backgroundColor: colors.surfaceSubtle },
                  ])}>
                  <AppIcon name="plus" size="xs" color={colors.text} />
                  <Text style={[styles.sheetAddListText, { color: colors.text }]}>Новый</Text>
                </RipplePressable>
              </View>

              {lists.map((list) => {
                const active = view.kind === 'list' && view.listId === list.id;
                const count = counts.byList.get(list.id) ?? 0;
                return (
                  <View
                    key={list.id}
                    style={[
                      styles.sheetListRowWrap,
                      active ? { backgroundColor: colors.surfaceActive } : null,
                    ]}>
                    <RipplePressable
                      onPress={() => {
                        setConfirmClearDone(false);
                        setView({ kind: 'list', listId: list.id });
                        setMobileNavOpen(false);
                      }}
                      style={styles.sheetListSelect}>
                      <AppIcon
                        name="list"
                        size="sm"
                        color={active ? colors.text : colors.muted}
                      />
                      <Text style={[styles.sheetRowTitle, { color: colors.text }]} numberOfLines={1}>
                        {list.title}
                      </Text>
                      {count > 0 ? (
                        <Text style={[styles.sheetRowCount, { color: colors.muted }]}>{count}</Text>
                      ) : null}
                    </RipplePressable>

                    <RipplePressable
                      accessibilityLabel={`Настроить список ${list.title}`}
                      onPress={() => {
                        setMobileNavOpen(false);
                        setListDialog({ open: true, mode: 'edit', list });
                      }}
                      style={styles.sheetListEditBtn}>
                      <AppIcon name="edit" size="xs" color={colors.muted} />
                    </RipplePressable>
                  </View>
                );
              })}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      {/* Modals */}
      <CreateTodoModal
        visible={createModalOpen}
        lists={lists}
        initialListId={targetListForNewTask?.id ?? null}
        initialDueDate={
          view.kind === 'smart' && view.filter === 'today'
            ? todayKey
            : view.kind === 'smart' && view.filter === 'upcoming'
              ? tomorrowKey
              : null
        }
        onClose={() => setCreateModalOpen(false)}
        onCreate={handleCreateDetailedTodo}
      />

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

      <DragTrashZone
        visible={draggingTodoId !== null || (draggingListId !== null && lists.length > 1)}
        label={draggingListId ? 'Удалить список' : 'Удалить задачу'}
        colors={colors}
        onDropDelete={async (event) => {
          if (draggingListId && lists.length > 1) {
            const targetListId =
              event.dataTransfer?.getData('text/sotaq-todo-list') || draggingListId;
            setDraggingListId(null);
            setListDropTarget(null);
            pushTodoHistory('Удаление списка');
            await deleteTodoList(db, targetListId);
            if (view.kind === 'list' && view.listId === targetListId) {
              setView({ kind: 'smart', filter: 'all' });
            }
            await refreshAll();
            return;
          }
          if (draggingTodoId) {
            const todoId =
              event.dataTransfer?.getData('text/sotaq-todo') ||
              event.dataTransfer?.getData('text/plain') ||
              draggingTodoId;
            setDraggingTodoId(null);
            setTodoDropTarget(null);
            setDropSmartFilter(null);
            setDropListId(null);
            await handleDeleteTodo(todoId);
          }
        }}
      />

      <HistoryToast message={historyToast} colors={colors} />
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
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  layout: {
    width: '100%',
    maxWidth: 1080,
    flex: 1,
    minHeight: 0,
  },
  layoutDesktop: {
    flexDirection: 'row',
    gap: 16,
  },
  layoutMobile: {
    flexDirection: 'column',
    gap: 0,
  },
  rail: {
    width: 248,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 12,
  },
  railPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  railPrimaryLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  railSection: {
    gap: 3,
  },
  railListsFlex: {
    flex: 1,
    minHeight: 0,
  },
  railListsScroll: {
    gap: 2,
    paddingBottom: 6,
  },
  railHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 2,
  },
  railCaption: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  railAddBtn: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  railListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 10,
    paddingRight: 6,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
    ...(Platform.OS === 'web'
      ? ({ transition: 'background-color 120ms ease', userSelect: 'none' } as object)
      : null),
  },
  railListMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 7,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  railListEditBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railDropTarget: {
    borderColor: DROP_BLUE,
    backgroundColor: 'rgba(35, 131, 226, 0.12)',
  },
  railListItemWrap: {
    position: 'relative',
  },
  railDropLine: {
    height: 2,
    borderRadius: 2,
    backgroundColor: DROP_BLUE,
    marginHorizontal: 8,
    marginVertical: 1,
  },
  draggingList: {
    opacity: 0.35,
  },
  railLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  railCountPill: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    alignItems: 'center',
  },
  railCount: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  railDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 4,
  },
  railDragHint: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  railDragHintText: {
    fontSize: 11,
    fontWeight: '600',
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
    paddingRight: 4,
  },
  mobileListsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 4,
  },
  mobileListsCaption: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginRight: 2,
  },
  mobilePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  mobilePillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  mobilePillCount: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    opacity: 0.8,
  },
  mobileIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileListPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
  },
  mobileListPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  panel: {
    flex: 1,
    minWidth: 0,
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
  panelHeadingCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  panelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  panelSubtitle: {
    fontSize: 12,
    fontWeight: '500',
  },
  listEditBtn: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerDivider: {
    width: 1,
    height: 18,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    height: 32,
    width: 170,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  clearBtn: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 9,
  },
  headerAddBtnMobile: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAddLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  bottomQuickAdd: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 10,
  },
  bottomQuickAddBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 12,
    paddingRight: 5,
    paddingVertical: 5,
  },
  quickAddInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 5,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  quickAddIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelMobile: {
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
  },
  mobileCleanBarWrap: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mobileCleanBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  mobileViewTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 36,
    paddingHorizontal: 11,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '62%',
  },
  mobileViewTriggerText: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  mobileViewTriggerCount: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  mobileCleanActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  mobileActiveFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mobileActiveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  mobileActiveChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  mobilePopoverBody: {
    gap: 2,
  },
  mobilePopoverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderRadius: 8,
  },
  mobilePopoverRowText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 12, 16, 0.5)',
  },
  mobileNavSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    maxHeight: '78%',
    overflow: 'hidden',
  },
  sheetGrabberRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  sheetGrabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  sheetScroll: {
    maxHeight: 460,
  },
  sheetContent: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 3,
  },
  sheetSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 2,
    marginBottom: 2,
  },
  sheetSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sheetAddListBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  sheetAddListText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 11,
    borderRadius: 10,
  },
  sheetRowTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  sheetRowCount: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  sheetDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 8,
    marginHorizontal: 6,
  },
  sheetListRowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
  },
  sheetListSelect: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 11,
    minWidth: 0,
  },
  sheetListEditBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  disabled: {
    opacity: 0.35,
  },
  sectionToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexWrap: 'wrap',
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  priorityFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  priorityFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
  },
  priorityFilterText: {
    fontSize: 11,
    fontWeight: '600',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  clearDoneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  clearDoneMini: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 7,
  },
  clearDoneLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  listScroll: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 28,
  },
  emptyBox: {
    paddingVertical: 42,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  completedSection: {
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  completedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  completedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 7,
  },
  completedHeading: {
    fontSize: 12,
    fontWeight: '600',
  },
});
