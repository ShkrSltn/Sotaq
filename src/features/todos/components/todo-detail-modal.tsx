import { router } from 'expo-router';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { KeyboardAvoidingModalView } from '@/components/keyboard-avoiding-modal-view';
import { RipplePressable } from '@/components/ripple-pressable';
import {
  addDaysDateKey,
  formatDueDateLabel,
  PRIORITY_META,
} from '@/features/kanban/types';
import type { BoardColumnOption } from '@/features/todos/todos-repository';
import type {
  TodoItemRecord,
  TodoListRecord,
  TodoPriority,
} from '@/features/todos/types';
import { useThemeColors, useViewport } from '@/theme/colors';

type Props = {
  todo: TodoItemRecord | null;
  lists: TodoListRecord[];
  kanbanTargets: BoardColumnOption[];
  onClose: () => void;
  onSave: (
    todoId: string,
    patch: {
      title: string;
      notes: string;
      listId: string | null;
      priority: TodoPriority;
      dueDate: string | null;
    },
  ) => Promise<void>;
  onToggleDone: (todoId: string, isDone: boolean) => Promise<void>;
  onDelete: (todoId: string) => Promise<void>;
  onSendToKanban: (todoId: string, boardId: string, columnId: string) => Promise<void>;
  onUnlinkKanban: (todoId: string) => Promise<void>;
};

const PRIORITIES: readonly TodoPriority[] = ['low', 'medium', 'high'];

export function TodoDetailModal(props: Props) {
  if (!props.todo) {
    return null;
  }
  return <TodoDetailModalContent key={props.todo.id} {...props} todo={props.todo} />;
}

function TodoDetailModalContent({
  todo,
  lists,
  kanbanTargets,
  onClose,
  onSave,
  onToggleDone,
  onDelete,
  onSendToKanban,
  onUnlinkKanban,
}: Omit<Props, 'todo'> & { todo: TodoItemRecord }) {
  const colors = useThemeColors();
  const { isDesktop } = useViewport();
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState(todo.title);
  const [notes, setNotes] = useState(todo.notes);
  const [listId, setListId] = useState<string | null>(todo.listId);
  const [priority, setPriority] = useState<TodoPriority>(todo.priority);
  const [dueDate, setDueDate] = useState<string | null>(todo.dueDate);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [selectedBoardId, setSelectedBoardId] = useState<string>(
    kanbanTargets[0]?.boardId ?? '',
  );

  const selectedBoard =
    kanbanTargets.find((board) => board.boardId === selectedBoardId) ?? kanbanTargets[0];
  const dueInfo = formatDueDateLabel(dueDate);

  async function savePatch(
    override: Partial<{
      title: string;
      notes: string;
      listId: string | null;
      priority: TodoPriority;
      dueDate: string | null;
    }>,
  ) {
    const nextTitle = (override.title ?? title).trim() || todo.title;
    await onSave(todo.id, {
      title: nextTitle,
      notes: override.notes ?? notes,
      listId: override.listId !== undefined ? override.listId : listId,
      priority: override.priority ?? priority,
      dueDate: override.dueDate !== undefined ? override.dueDate : dueDate,
    });
  }

  async function persistAndClose() {
    const cleanTitle = title.trim() || todo.title;
    if (
      cleanTitle !== todo.title ||
      notes !== todo.notes ||
      listId !== todo.listId ||
      priority !== todo.priority ||
      dueDate !== todo.dueDate
    ) {
      await savePatch({ title: cleanTitle });
    }
    onClose();
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await onDelete(todo.id);
    onClose();
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={persistAndClose}>
      <KeyboardAvoidingModalView style={styles.root}>
        <Pressable style={styles.backdrop} onPress={persistAndClose} />

        <Animated.View
          entering={FadeIn.duration(110)}
          style={[
            styles.sheet,
            isDesktop ? styles.sheetDesktop : styles.sheetMobile,
            {
              backgroundColor: colors.surface,
              borderColor: colors.line,
              paddingBottom: isDesktop ? 16 : Math.max(insets.bottom, 16),
            },
          ]}>
          {!isDesktop ? (
            <View style={styles.grabberRow}>
              <View style={[styles.grabber, { backgroundColor: colors.line }]} />
            </View>
          ) : null}

          <View style={[styles.header, { borderBottomColor: colors.line }]}>
            <RipplePressable
              onPress={() => onToggleDone(todo.id, !todo.isDone)}
              style={StyleSheet.flatten([
                styles.statusBtn,
                {
                  backgroundColor: todo.isDone ? colors.successBg : colors.surfaceSubtle,
                },
              ])}>
              <View style={styles.inlineIconRow}>
                <AppIcon
                  name={todo.isDone ? 'checkCircle' : 'circle'}
                  size="sm"
                  color={todo.isDone ? colors.success : colors.muted}
                />
                <Text
                  style={[
                    styles.statusBtnLabel,
                    { color: todo.isDone ? colors.success : colors.text },
                  ]}>
                  {todo.isDone ? 'Выполнено' : 'Отметить готовой'}
                </Text>
              </View>
            </RipplePressable>

            <RipplePressable
              onPress={persistAndClose}
              style={StyleSheet.flatten([
                styles.closeBtn,
                { backgroundColor: colors.surfaceSubtle },
              ])}>
              <Text style={[styles.closeLabel, { color: colors.text }]}>Готово</Text>
            </RipplePressable>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled">
            <TextInput
              value={title}
              onChangeText={setTitle}
              onBlur={() => savePatch({ title })}
              placeholder="Название задачи"
              placeholderTextColor={colors.muted}
              style={[styles.titleInput, { color: colors.text }]}
            />

            <TextInput
              value={notes}
              onChangeText={setNotes}
              onBlur={() => savePatch({ notes })}
              placeholder="Заметка или детали…"
              placeholderTextColor={colors.muted}
              multiline
              textAlignVertical="top"
              style={[
                styles.notesInput,
                {
                  color: colors.text,
                  backgroundColor: colors.surfaceSubtle,
                  borderColor: colors.line,
                },
              ]}
            />

            {/* Lists */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>Список</Text>
              <View style={styles.pillRow}>
                {lists.map((list) => {
                  const selected = listId === list.id;
                  return (
                    <RipplePressable
                      key={list.id}
                      onPress={() => {
                        setListId(list.id);
                        savePatch({ listId: list.id });
                      }}
                      style={StyleSheet.flatten([
                        styles.pill,
                        {
                          backgroundColor: selected ? colors.accent : colors.surfaceSubtle,
                          borderColor: selected ? colors.accent : colors.line,
                        },
                      ])}>
                      <Text
                        style={[
                          styles.pillText,
                          { color: selected ? colors.accentText : colors.text },
                        ]}>
                        {list.title}
                      </Text>
                    </RipplePressable>
                  );
                })}
                {listId !== null ? (
                  <RipplePressable
                    onPress={() => {
                      setListId(null);
                      savePatch({ listId: null });
                    }}
                    style={StyleSheet.flatten([
                      styles.pill,
                      { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                    ])}>
                    <Text style={[styles.pillText, { color: colors.muted }]}>Без списка</Text>
                  </RipplePressable>
                ) : null}
              </View>
            </View>

            {/* Priority */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>Приоритет</Text>
              <View style={styles.pillRow}>
                {PRIORITIES.map((item) => {
                  const selected = priority === item;
                  const meta = PRIORITY_META[item];
                  return (
                    <RipplePressable
                      key={item}
                      onPress={() => {
                        setPriority(item);
                        savePatch({ priority: item });
                      }}
                      style={StyleSheet.flatten([
                        styles.pill,
                        {
                          backgroundColor: selected ? colors.accent : colors.surfaceSubtle,
                          borderColor: selected ? colors.accent : colors.line,
                        },
                      ])}>
                      <View style={[styles.dot, { backgroundColor: meta.dotColor }]} />
                      <Text
                        style={[
                          styles.pillText,
                          { color: selected ? colors.accentText : colors.text },
                        ]}>
                        {meta.label}
                      </Text>
                    </RipplePressable>
                  );
                })}
              </View>
            </View>

            {/* Due date */}
            <View style={styles.fieldGroup}>
              <View style={styles.fieldHeaderRow}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>Срок</Text>
                {dueInfo ? (
                  <Text
                    style={[
                      styles.duePreview,
                      { color: dueInfo.isOverdue ? colors.danger : colors.text },
                    ]}>
                    {dueInfo.text}
                  </Text>
                ) : null}
              </View>
              <View style={styles.pillRow}>
                {[
                  { label: 'Сегодня', value: addDaysDateKey(0) },
                  { label: 'Завтра', value: addDaysDateKey(1) },
                  { label: '+3 дня', value: addDaysDateKey(3) },
                  { label: 'Неделя', value: addDaysDateKey(7) },
                ].map((preset) => {
                  const selected = dueDate === preset.value;
                  return (
                    <RipplePressable
                      key={preset.label}
                      onPress={() => {
                        setDueDate(preset.value);
                        savePatch({ dueDate: preset.value });
                      }}
                      style={StyleSheet.flatten([
                        styles.pill,
                        {
                          backgroundColor: selected ? colors.accent : colors.surfaceSubtle,
                          borderColor: selected ? colors.accent : colors.line,
                        },
                      ])}>
                      <Text
                        style={[
                          styles.pillText,
                          { color: selected ? colors.accentText : colors.text },
                        ]}>
                        {preset.label}
                      </Text>
                    </RipplePressable>
                  );
                })}
                {dueDate ? (
                  <RipplePressable
                    onPress={() => {
                      setDueDate(null);
                      savePatch({ dueDate: null });
                    }}
                    style={StyleSheet.flatten([
                      styles.pill,
                      { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                    ])}>
                    <Text style={[styles.pillText, { color: colors.muted }]}>Убрать</Text>
                  </RipplePressable>
                ) : null}
              </View>
            </View>

            {/* Optional Kanban Link */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>Связь с Канбаном</Text>
              {todo.linkedCard ? (
                <View
                  style={[
                    styles.kanbanBox,
                    { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                  ]}>
                  <View style={styles.kanbanInfo}>
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: todo.linkedCard.columnAccent },
                      ]}
                    />
                    <Text style={[styles.kanbanText, { color: colors.text }]}>
                      {todo.linkedCard.boardTitle} · {todo.linkedCard.columnTitle}
                    </Text>
                  </View>
                  <View style={styles.kanbanActions}>
                    <RipplePressable
                      onPress={async () => {
                        await persistAndClose();
                        router.navigate('/board');
                      }}
                      style={StyleSheet.flatten([
                        styles.smallActionBtn,
                        { backgroundColor: colors.surface },
                      ])}>
                      <Text style={[styles.smallActionText, { color: colors.text }]}>
                        Открыть доску
                      </Text>
                    </RipplePressable>
                    <RipplePressable
                      onPress={() => onUnlinkKanban(todo.id)}
                      style={StyleSheet.flatten([
                        styles.smallActionBtn,
                        { backgroundColor: colors.surface },
                      ])}>
                      <Text style={[styles.smallActionText, { color: colors.muted }]}>
                        Отвязать
                      </Text>
                    </RipplePressable>
                  </View>
                </View>
              ) : (
                <View style={styles.linkSection}>
                  <RipplePressable
                    onPress={() => setLinkPickerOpen((value) => !value)}
                    style={StyleSheet.flatten([
                      styles.sendBoardBtn,
                      { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                    ])}>
                    <View style={styles.inlineIconRow}>
                      <AppIcon name="kanban" size="sm" color={colors.text} />
                      <Text style={[styles.sendBoardText, { color: colors.text }]}>
                        Отправить на доску
                      </Text>
                    </View>
                    <AppIcon
                      name={linkPickerOpen ? 'chevronUp' : 'chevronDown'}
                      size="sm"
                      color={colors.muted}
                    />
                  </RipplePressable>

                  {linkPickerOpen && selectedBoard ? (
                    <View
                      style={[
                        styles.kanbanPicker,
                        { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                      ]}>
                      {kanbanTargets.length > 1 ? (
                        <View style={styles.pickerBlock}>
                          <Text style={[styles.pickerCaption, { color: colors.muted }]}>Доска</Text>
                          <View style={styles.pillRow}>
                            {kanbanTargets.map((board) => {
                              const active = board.boardId === selectedBoard.boardId;
                              return (
                                <RipplePressable
                                  key={board.boardId}
                                  onPress={() => setSelectedBoardId(board.boardId)}
                                  style={StyleSheet.flatten([
                                    styles.pill,
                                    {
                                      backgroundColor: active ? colors.accent : colors.surface,
                                      borderColor: active ? colors.accent : colors.line,
                                    },
                                  ])}>
                                  <Text
                                    style={[
                                      styles.pillText,
                                      { color: active ? colors.accentText : colors.text },
                                    ]}>
                                    {board.boardTitle}
                                  </Text>
                                </RipplePressable>
                              );
                            })}
                          </View>
                        </View>
                      ) : null}

                      <View style={styles.pickerBlock}>
                        <Text style={[styles.pickerCaption, { color: colors.muted }]}>
                          Выберите колонку ({selectedBoard.boardTitle})
                        </Text>
                        <View style={styles.pillRow}>
                          {selectedBoard.columns.map((col) => (
                            <RipplePressable
                              key={col.id}
                              onPress={async () => {
                                await savePatch({});
                                await onSendToKanban(todo.id, selectedBoard.boardId, col.id);
                                setLinkPickerOpen(false);
                              }}
                              style={StyleSheet.flatten([
                                styles.pill,
                                { backgroundColor: colors.surface, borderColor: colors.line },
                              ])}>
                              <View style={[styles.dot, { backgroundColor: col.accent }]} />
                              <Text style={[styles.pillText, { color: colors.text }]}>
                                {col.title}
                              </Text>
                            </RipplePressable>
                          ))}
                        </View>
                      </View>
                    </View>
                  ) : null}
                </View>
              )}
            </View>
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.line }]}>
            <RipplePressable
              onPress={handleDelete}
              style={StyleSheet.flatten([
                styles.deleteBtn,
                { backgroundColor: confirmDelete ? colors.danger : colors.dangerBg },
              ])}>
              <Text
                style={[
                  styles.deleteLabel,
                  { color: confirmDelete ? '#FFFFFF' : colors.danger },
                ]}>
                {confirmDelete ? 'Точно удалить?' : 'Удалить задачу'}
              </Text>
            </RipplePressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingModalView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 12, 16, 0.48)',
  },
  sheet: {
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  sheetDesktop: {
    maxWidth: 540,
    maxHeight: '86%',
    borderRadius: 18,
  },
  sheetMobile: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '90%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomWidth: 0,
  },
  grabberRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 2,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statusBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9,
  },
  inlineIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  statusBtnLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  closeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  closeLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    padding: 18,
    gap: 16,
  },
  titleInput: {
    fontSize: 20,
    fontWeight: '700',
    paddingVertical: 4,
  },
  notesInput: {
    minHeight: 78,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  duePreview: {
    fontSize: 12,
    fontWeight: '600',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  kanbanBox: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 10,
  },
  kanbanInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  kanbanText: {
    fontSize: 14,
    fontWeight: '600',
  },
  kanbanActions: {
    flexDirection: 'row',
    gap: 8,
  },
  smallActionBtn: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 9,
  },
  smallActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  linkSection: {
    gap: 8,
  },
  sendBoardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sendBoardText: {
    fontSize: 14,
    fontWeight: '600',
  },
  sendBoardChevron: {
    fontSize: 13,
  },
  kanbanPicker: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 12,
  },
  pickerBlock: {
    gap: 6,
  },
  pickerCaption: {
    fontSize: 12,
    fontWeight: '500',
  },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  deleteBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  deleteLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
});
