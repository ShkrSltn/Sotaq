import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RipplePressable } from '@/components/ripple-pressable';
import {
  addDaysDateKey,
  formatDueDateLabel,
  type KanbanCardRecord,
  type KanbanColumnRecord,
  type KanbanPriority,
  PRIORITY_META,
} from '@/features/kanban/types';
import { useThemeColors, useViewport } from '@/theme/colors';

type Props = {
  card: KanbanCardRecord | null;
  columns: KanbanColumnRecord[];
  cardIndex: number;
  columnCardCount: number;
  onClose: () => void;
  onSave: (
    cardId: string,
    patch: {
      title: string;
      description: string;
      priority: KanbanPriority;
      dueDate: string | null;
    },
  ) => Promise<void>;
  onMoveColumn: (cardId: string, targetColumnId: string) => Promise<void>;
  onReorder: (cardId: string, direction: -1 | 1) => Promise<void>;
  onDelete: (cardId: string) => Promise<void>;
  onAddSubtask: (cardId: string, title: string) => Promise<void>;
  onToggleSubtask: (cardId: string, subtaskId: string, isDone: boolean) => Promise<void>;
  onDeleteSubtask: (cardId: string, subtaskId: string) => Promise<void>;
};

const PRIORITIES: readonly KanbanPriority[] = ['low', 'medium', 'high'];

export function CardDetailModal(props: Props) {
  if (!props.card) {
    return null;
  }
  return <CardDetailModalContent key={props.card.id} {...props} card={props.card} />;
}

function CardDetailModalContent({
  card,
  columns,
  cardIndex,
  columnCardCount,
  onClose,
  onSave,
  onMoveColumn,
  onReorder,
  onDelete,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
}: Omit<Props, 'card'> & { card: KanbanCardRecord }) {
  const colors = useThemeColors();
  const { isDesktop } = useViewport();
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [priority, setPriority] = useState<KanbanPriority>(card.priority);
  const [dueDate, setDueDate] = useState<string | null>(card.dueDate);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const activeCard = card;
  const dueInfo = formatDueDateLabel(dueDate);
  const doneSubtasks = activeCard.subtasks.filter((item) => item.isDone).length;
  const totalSubtasks = activeCard.subtasks.length;
  const progressRatio = totalSubtasks > 0 ? doneSubtasks / totalSubtasks : 0;

  async function persistAndClose() {
    const cleanTitle = title.trim() || activeCard.title;
    if (
      cleanTitle !== activeCard.title ||
      description !== activeCard.description ||
      priority !== activeCard.priority ||
      dueDate !== activeCard.dueDate
    ) {
      await onSave(activeCard.id, {
        title: cleanTitle,
        description,
        priority,
        dueDate,
      });
    }
    onClose();
  }

  async function savePatch(
    override: Partial<{
      title: string;
      description: string;
      priority: KanbanPriority;
      dueDate: string | null;
    }>,
  ) {
    const nextTitle = (override.title ?? title).trim() || activeCard.title;
    const nextDescription = override.description ?? description;
    const nextPriority = override.priority ?? priority;
    const nextDueDate = override.dueDate !== undefined ? override.dueDate : dueDate;
    await onSave(activeCard.id, {
      title: nextTitle,
      description: nextDescription,
      priority: nextPriority,
      dueDate: nextDueDate,
    });
  }

  async function handleAddSubtask() {
    const text = subtaskDraft.trim();
    if (!text) {
      return;
    }
    setSubtaskDraft('');
    await onAddSubtask(activeCard.id, text);
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await onDelete(activeCard.id);
    onClose();
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={persistAndClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}>
        <Pressable style={styles.backdrop} onPress={persistAndClose} />

        <Animated.View
          entering={isDesktop ? FadeIn.duration(160) : SlideInDown.springify().damping(24).stiffness(260)}
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
            <Text style={[styles.headerTitle, { color: colors.muted }]}>Карточка</Text>
            <View style={styles.headerActions}>
              {columnCardCount > 1 ? (
                <View style={styles.reorderGroup}>
                  <RipplePressable
                    accessibilityLabel="Поднять выше"
                    disabled={cardIndex <= 0}
                    onPress={() => onReorder(activeCard.id, -1)}
                    style={StyleSheet.flatten([
                      styles.smallIconBtn,
                      { backgroundColor: colors.surfaceSubtle },
                      cardIndex <= 0 ? styles.disabledBtn : null,
                    ])}>
                    <Text style={[styles.smallIconText, { color: colors.text }]}>↑</Text>
                  </RipplePressable>
                  <RipplePressable
                    accessibilityLabel="Опустить ниже"
                    disabled={cardIndex >= columnCardCount - 1}
                    onPress={() => onReorder(activeCard.id, 1)}
                    style={StyleSheet.flatten([
                      styles.smallIconBtn,
                      { backgroundColor: colors.surfaceSubtle },
                      cardIndex >= columnCardCount - 1 ? styles.disabledBtn : null,
                    ])}>
                    <Text style={[styles.smallIconText, { color: colors.text }]}>↓</Text>
                  </RipplePressable>
                </View>
              ) : null}
              <RipplePressable
                accessibilityLabel="Закрыть"
                onPress={persistAndClose}
                style={StyleSheet.flatten([
                  styles.closeBtn,
                  { backgroundColor: colors.surfaceSubtle },
                ])}>
                <Text style={[styles.closeLabel, { color: colors.text }]}>Готово</Text>
              </RipplePressable>
            </View>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled">
            <TextInput
              value={title}
              onChangeText={setTitle}
              onBlur={() => savePatch({ title })}
              placeholder="Название карточки"
              placeholderTextColor={colors.muted}
              style={[styles.titleInput, { color: colors.text }]}
            />

            <TextInput
              value={description}
              onChangeText={setDescription}
              onBlur={() => savePatch({ description })}
              placeholder="Добавить описание или детали…"
              placeholderTextColor={colors.muted}
              multiline
              textAlignVertical="top"
              style={[
                styles.descriptionInput,
                {
                  color: colors.text,
                  backgroundColor: colors.surfaceSubtle,
                  borderColor: colors.line,
                },
              ]}
            />

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>Колонка</Text>
              <View style={styles.pillRow}>
                {columns.map((col) => {
                  const selected = col.id === activeCard.columnId;
                  return (
                    <RipplePressable
                      key={col.id}
                      onPress={() => {
                        if (!selected) {
                          onMoveColumn(activeCard.id, col.id);
                        }
                      }}
                      style={StyleSheet.flatten([
                        styles.pill,
                        {
                          backgroundColor: selected ? colors.accent : colors.surfaceSubtle,
                          borderColor: selected ? colors.accent : colors.line,
                        },
                      ])}>
                      <View style={[styles.dot, { backgroundColor: col.accent }]} />
                      <Text
                        style={[
                          styles.pillText,
                          { color: selected ? colors.accentText : colors.text },
                        ]}>
                        {col.title}
                      </Text>
                    </RipplePressable>
                  );
                })}
              </View>
            </View>

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

            <View style={styles.fieldGroup}>
              <View style={styles.fieldHeaderRow}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>Подзадачи</Text>
                {totalSubtasks > 0 ? (
                  <Text style={[styles.subtaskCount, { color: colors.muted }]}>
                    {doneSubtasks}/{totalSubtasks}
                  </Text>
                ) : null}
              </View>

              {totalSubtasks > 0 ? (
                <View style={[styles.progressTrack, { backgroundColor: colors.surfaceSubtle }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.round(progressRatio * 100)}%`,
                        backgroundColor:
                          progressRatio === 1 ? colors.success : colors.accent,
                      },
                    ]}
                  />
                </View>
              ) : null}

              <View style={styles.subtaskList}>
                {activeCard.subtasks.map((item) => (
                  <Animated.View
                    key={item.id}
                    entering={FadeInDown.duration(140)}
                    exiting={FadeOut.duration(120)}
                    layout={LinearTransition.springify().damping(24).stiffness(260)}
                    style={[styles.subtaskRow, { backgroundColor: colors.surfaceSubtle }]}>
                    <RipplePressable
                      onPress={() => onToggleSubtask(activeCard.id, item.id, !item.isDone)}
                      style={styles.subtaskMain}>
                      <View
                        style={[
                          styles.checkbox,
                          { borderColor: item.isDone ? colors.success : colors.muted },
                          item.isDone ? { backgroundColor: colors.success } : null,
                        ]}>
                        {item.isDone ? <Text style={styles.checkmark}>✓</Text> : null}
                      </View>
                      <Text
                        style={[
                          styles.subtaskTitle,
                          { color: item.isDone ? colors.muted : colors.text },
                          item.isDone ? styles.subtaskDone : null,
                        ]}>
                        {item.title}
                      </Text>
                    </RipplePressable>
                    <RipplePressable
                      accessibilityLabel="Удалить подзадачу"
                      onPress={() => onDeleteSubtask(activeCard.id, item.id)}
                      style={styles.subtaskDelete}>
                      <Text style={[styles.subtaskDeleteText, { color: colors.muted }]}>×</Text>
                    </RipplePressable>
                  </Animated.View>
                ))}
              </View>

              <View
                style={[
                  styles.subtaskComposer,
                  { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                ]}>
                <TextInput
                  value={subtaskDraft}
                  onChangeText={setSubtaskDraft}
                  onSubmitEditing={handleAddSubtask}
                  placeholder="Добавить шаг…"
                  placeholderTextColor={colors.muted}
                  returnKeyType="done"
                  style={[styles.subtaskInput, { color: colors.text }]}
                />
                <RipplePressable
                  disabled={subtaskDraft.trim().length === 0}
                  onPress={handleAddSubtask}
                  style={StyleSheet.flatten([
                    styles.subtaskAddBtn,
                    { backgroundColor: colors.surface },
                    subtaskDraft.trim().length === 0 ? styles.disabledBtn : null,
                  ])}>
                  <Text style={[styles.subtaskAddLabel, { color: colors.text }]}>+</Text>
                </RipplePressable>
              </View>
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
                {confirmDelete ? 'Точно удалить?' : 'Удалить карточку'}
              </Text>
            </RipplePressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
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
    maxWidth: 560,
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
  headerTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reorderGroup: {
    flexDirection: 'row',
    gap: 4,
  },
  smallIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallIconText: {
    fontSize: 14,
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
  disabledBtn: {
    opacity: 0.35,
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
  descriptionInput: {
    minHeight: 84,
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
  subtaskCount: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  subtaskList: {
    gap: 6,
  },
  subtaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingRight: 6,
  },
  subtaskMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 13,
  },
  subtaskTitle: {
    flex: 1,
    fontSize: 14,
  },
  subtaskDone: {
    textDecorationLine: 'line-through',
  },
  subtaskDelete: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtaskDeleteText: {
    fontSize: 16,
  },
  subtaskComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 4,
  },
  subtaskInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 6,
  },
  subtaskAddBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtaskAddLabel: {
    fontSize: 18,
    lineHeight: 20,
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
