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
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { RipplePressable } from '@/components/ripple-pressable';
import {
  addDaysDateKey,
  formatDueDateLabel,
  type KanbanColumnRecord,
  type KanbanPriority,
  PRIORITY_META,
} from '@/features/kanban/types';
import { useThemeColors, useViewport } from '@/theme/colors';

type Props = {
  visible: boolean;
  columns: KanbanColumnRecord[];
  initialColumnId: string | null;
  initialPriority: KanbanPriority;
  onClose: () => void;
  onCreate: (input: {
    columnId: string;
    title: string;
    description: string;
    priority: KanbanPriority;
    dueDate: string | null;
    subtasks: string[];
  }) => Promise<void>;
};

const PRIORITIES: readonly KanbanPriority[] = ['high', 'medium', 'low'];

export function CreateCardModal(props: Props) {
  if (!props.visible || props.columns.length === 0) {
    return null;
  }
  const fallbackColId = props.initialColumnId ?? props.columns[0].id;
  return (
    <CreateCardModalContent
      key={`${fallbackColId}-${props.initialPriority}`}
      {...props}
      resolvedColumnId={fallbackColId}
    />
  );
}

function CreateCardModalContent({
  columns,
  resolvedColumnId,
  initialPriority,
  onClose,
  onCreate,
}: Props & { resolvedColumnId: string }) {
  const colors = useThemeColors();
  const { isDesktop } = useViewport();
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [columnId, setColumnId] = useState(resolvedColumnId);
  const [priority, setPriority] = useState<KanbanPriority>(initialPriority);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const dueInfo = formatDueDateLabel(dueDate);
  const canSubmit = title.trim().length > 0 && !submitting;

  function handleAddDraftSubtask() {
    const clean = subtaskDraft.trim();
    if (!clean) {
      return;
    }
    setSubtasks((prev) => [...prev, clean]);
    setSubtaskDraft('');
  }

  async function handleSubmit() {
    const cleanTitle = title.trim();
    if (!cleanTitle || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      const pendingSubtask = subtaskDraft.trim();
      const finalSubtasks = pendingSubtask ? [...subtasks, pendingSubtask] : subtasks;
      await onCreate({
        columnId,
        title: cleanTitle,
        description: description.trim(),
        priority,
        dueDate,
        subtasks: finalSubtasks,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <Animated.View
          entering={
            isDesktop ? FadeIn.duration(140) : SlideInDown.springify().damping(24).stiffness(260)
          }
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
            <View style={styles.headerLeft}>
              <AppIcon name="plus" size="sm" color={colors.text} />
              <Text style={[styles.headerTitle, { color: colors.text }]}>Новая карточка</Text>
            </View>
            <RipplePressable
              accessibilityLabel="Закрыть"
              onPress={onClose}
              style={StyleSheet.flatten([
                styles.iconCloseBtn,
                { backgroundColor: colors.surfaceSubtle },
              ])}>
              <AppIcon name="close" size="sm" color={colors.muted} />
            </RipplePressable>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled">
            <TextInput
              value={title}
              onChangeText={setTitle}
              onSubmitEditing={handleSubmit}
              autoFocus
              placeholder="Название задачи…"
              placeholderTextColor={colors.muted}
              returnKeyType="done"
              style={[styles.titleInput, { color: colors.text }]}
            />

            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Описание, детали или ссылки (необязательно)…"
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

            {/* Column Picker */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>Колонка</Text>
              <View style={styles.pillRow}>
                {columns.map((col) => {
                  const selected = col.id === columnId;
                  return (
                    <RipplePressable
                      key={col.id}
                      onPress={() => setColumnId(col.id)}
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

            {/* Priority Picker */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>Приоритет</Text>
              <View style={styles.pillRow}>
                {PRIORITIES.map((item) => {
                  const selected = priority === item;
                  const meta = PRIORITY_META[item];
                  return (
                    <RipplePressable
                      key={item}
                      onPress={() => setPriority(item)}
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

            {/* Due Date Picker */}
            <View style={styles.fieldGroup}>
              <View style={styles.fieldHeaderRow}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>Срок</Text>
                {dueInfo ? (
                  <Text style={[styles.duePreview, { color: colors.text }]}>{dueInfo.text}</Text>
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
                      onPress={() =>
                        setDueDate((prev) => (prev === preset.value ? null : preset.value))
                      }
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
                    onPress={() => setDueDate(null)}
                    style={StyleSheet.flatten([
                      styles.pill,
                      { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                    ])}>
                    <Text style={[styles.pillText, { color: colors.muted }]}>Убрать</Text>
                  </RipplePressable>
                ) : null}
              </View>
            </View>

            {/* Initial Subtasks */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>
                Подзадачи {subtasks.length > 0 ? `(${subtasks.length})` : ''}
              </Text>

              {subtasks.length > 0 ? (
                <View style={styles.subtaskList}>
                  {subtasks.map((item, idx) => (
                    <View
                      key={`${idx}-${item}`}
                      style={[styles.subtaskRow, { backgroundColor: colors.surfaceSubtle }]}>
                      <AppIcon name="circle" size="xs" color={colors.muted} />
                      <Text style={[styles.subtaskText, { color: colors.text }]}>{item}</Text>
                      <RipplePressable
                        accessibilityLabel="Убрать подзадачу"
                        onPress={() =>
                          setSubtasks((prev) => prev.filter((_, itemIdx) => itemIdx !== idx))
                        }
                        style={styles.subtaskRemoveBtn}>
                        <AppIcon name="close" size="xs" color={colors.muted} />
                      </RipplePressable>
                    </View>
                  ))}
                </View>
              ) : null}

              <View
                style={[
                  styles.subtaskComposer,
                  { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                ]}>
                <TextInput
                  value={subtaskDraft}
                  onChangeText={setSubtaskDraft}
                  onSubmitEditing={handleAddDraftSubtask}
                  placeholder="Добавить шаг…"
                  placeholderTextColor={colors.muted}
                  returnKeyType="done"
                  style={[styles.subtaskInput, { color: colors.text }]}
                />
                <RipplePressable
                  accessibilityLabel="Добавить шаг"
                  disabled={subtaskDraft.trim().length === 0}
                  onPress={handleAddDraftSubtask}
                  style={StyleSheet.flatten([
                    styles.subtaskAddBtn,
                    { backgroundColor: colors.surface },
                    subtaskDraft.trim().length === 0 ? styles.disabled : null,
                  ])}>
                  <AppIcon name="plus" size="xs" color={colors.text} />
                </RipplePressable>
              </View>
            </View>
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.line }]}>
            <RipplePressable
              onPress={onClose}
              style={StyleSheet.flatten([
                styles.footerBtn,
                { backgroundColor: colors.surfaceSubtle },
              ])}>
              <Text style={[styles.footerBtnText, { color: colors.text }]}>Отмена</Text>
            </RipplePressable>

            <RipplePressable
              disabled={!canSubmit}
              onPress={handleSubmit}
              style={StyleSheet.flatten([
                styles.footerBtn,
                styles.footerPrimaryBtn,
                { backgroundColor: colors.accent },
                !canSubmit ? styles.disabled : null,
              ])}>
              <AppIcon name="plus" size="xs" color={colors.accentText} />
              <Text style={[styles.footerBtnText, { color: colors.accentText }]}>
                Создать карточку
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
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    maxHeight: '90%',
  },
  sheetDesktop: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    marginVertical: 'auto',
    borderRadius: 18,
    maxHeight: '86%',
  },
  sheetMobile: {
    width: '100%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  grabberRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 2,
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  iconCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 16,
  },
  titleInput: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    paddingVertical: 4,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  descriptionInput: {
    minHeight: 76,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 20,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
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
    fontSize: 11,
    fontWeight: '700',
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
    gap: 7,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  subtaskList: {
    gap: 6,
  },
  subtaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 9,
  },
  subtaskText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  subtaskRemoveBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtaskComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  subtaskInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 4,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  subtaskAddBtn: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  footerPrimaryBtn: {
    paddingHorizontal: 18,
  },
  footerBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.35,
  },
});
