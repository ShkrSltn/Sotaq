import type { KanbanPriority } from '@/features/kanban/types';

export type TodoPriority = KanbanPriority;

export type TodoListRecord = {
  id: string;
  userId: string | null;
  title: string;
  position: number;
  createdAt: string;
};

export type TodoLinkedCardSummary = {
  cardId: string;
  boardId: string;
  boardTitle: string;
  columnId: string;
  columnTitle: string;
  columnAccent: string;
  isDoneColumn: boolean;
};

export type TodoItemRecord = {
  id: string;
  userId: string | null;
  listId: string | null;
  title: string;
  notes: string;
  isDone: boolean;
  priority: TodoPriority;
  dueDate: string | null;
  position: number;
  linkedCardId: string | null;
  linkedCard: TodoLinkedCardSummary | null;
  createdAt: string;
  updatedAt: string;
};

export type TodoSmartFilter = 'all' | 'today' | 'upcoming' | 'board' | 'done';

export type TodoViewSelection =
  | { kind: 'smart'; filter: TodoSmartFilter }
  | { kind: 'list'; listId: string };
