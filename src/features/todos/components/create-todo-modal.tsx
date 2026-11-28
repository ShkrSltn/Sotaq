import { useState } from 'react';
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

import { AppIcon } from '@/components/app-icon';
import { KeyboardAvoidingModalView } from '@/components/keyboard-avoiding-modal-view';
import { RipplePressable } from '@/components/ripple-pressable';
import { addDaysDateKey, formatDueDateLabel, PRIORITY_META } from '@/features/kanban/types';
import type { TodoListRecord, TodoPriority } from '@/features/todos/types';
import { useThemeColors, useViewport } from '@/theme/colors';

type Props = {
  visible: boolean;
  lists: TodoListRecord[];
  initialListId: string | null;
  initialDueDate: string | null;
  onClose: () => void;
  onCreate: (input: {
    title: string;
    notes: string;
    listId: string | null;
    priority: TodoPriority;
    dueDate: string | null;
  }) => Promise<void>;
};

const PRIORITIES: readonly TodoPriority[] = ['high', 'medium', 'low'];

export function CreateTodoModal(props: Props) {
  if (!props.visible) {
    return null;
  }
  const resolvedListId = props.initialListId ?? props.lists[0]?.id ?? null;
  return (
    <CreateTodoModalContent
      key={`${resolvedListId ?? 'none'}-${props.initialDueDate ?? 'nodate'}`}
      {...props}
      resolvedListId={resolvedListId}
    />
  );
}

function CreateTodoModalContent({
  lists,
  resolvedListId,
  initialDueDate,
  onClose,
  onCreate,
}: Props & { resolvedListId: string | null }) {
  const colors = useThemeColors();
  const { isDesktop } = useViewport();
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [listId, setListId] = useState<string | null>(resolvedListId);
  const [priority, setPriority] = useState<TodoPriority>('medium');
  const [dueDate, setDueDate] = useState<string | null>(initialDueDate);
  const [submitting, setSubmitting] = useState(false);

  const dueInfo = formatDueDateLabel(dueDate);
  const canSubmit = title.trim().length > 0 && !submitting;

  async function handleSubmit() {
    const cleanTitle = title.trim();
    if (!cleanTitle || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      await onCreate({
        title: cleanTitle,
        notes: notes.trim(),
        listId,
        priority,
        dueDate,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingModalView style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />

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
            <Text style={[styles.headerTitle, { color: colors.text }]}>Новая задача</Text>
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
              placeholder="Что нужно сделать?"
              placeholderTextColor={colors.muted}
              returnKeyType="done"
              style={[styles.titleInput, { color: colors.text }]}
            />

            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Заметка, контекст или детали (необязательно)…"
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

            {/* List Picker */}
            {lists.length > 0 ? (
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>Список</Text>
                <View style={styles.pillRow}>
                  {lists.map((item) => {
                    const selected = listId === item.id;
                    return (
                      <RipplePressable
                        key={item.id}
                        onPress={() => setListId(item.id)}
                        style={StyleSheet.flatten([
                          styles.pill,
                          {
                            backgroundColor: selected ? colors.accent : colors.surfaceSubtle,
                            borderColor: selected ? colors.accent : colors.line,
                          },
                        ])}>
                        <AppIcon
                          name="list"
                          size="xs"
                          color={selected ? colors.accentText : colors.muted}
                        />
                        <Text
                          style={[
                            styles.pillText,
                            { color: selected ? colors.accentText : colors.text },
                          ]}>
                          {item.title}
                        </Text>
                      </RipplePressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

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
                Создать задачу
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
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    maxHeight: '88%',
  },
  sheetDesktop: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    marginVertical: 'auto',
    borderRadius: 18,
    maxHeight: '84%',
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
  notesInput: {
    minHeight: 74,
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
