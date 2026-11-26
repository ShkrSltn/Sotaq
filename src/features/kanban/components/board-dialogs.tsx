import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { RipplePressable } from '@/components/ripple-pressable';
import { COLUMN_ACCENTS } from '@/features/kanban/types';
import { useThemeColors } from '@/theme/colors';

type BoardDialogProps = {
  visible: boolean;
  mode: 'create' | 'edit';
  initialTitle: string;
  canDelete: boolean;
  onClose: () => void;
  onSubmit: (title: string) => Promise<void>;
  onDelete?: () => Promise<void>;
};

export function BoardDialog(props: BoardDialogProps) {
  if (!props.visible) {
    return null;
  }
  return <BoardDialogContent {...props} />;
}

function BoardDialogContent({
  mode,
  initialTitle,
  canDelete,
  onClose,
  onSubmit,
  onDelete,
}: BoardDialogProps) {
  const colors = useThemeColors();
  const [title, setTitle] = useState(initialTitle);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleSubmit() {
    const trimmed = title.trim();
    if (!trimmed) {
      return;
    }
    await onSubmit(trimmed);
    onClose();
  }

  async function handleDelete() {
    if (!onDelete) {
      return;
    }
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await onDelete();
    onClose();
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View
          entering={FadeIn.duration(140)}
          style={[
            styles.dialog,
            { backgroundColor: colors.surface, borderColor: colors.line },
          ]}>
          <Text style={[styles.title, { color: colors.text }]}>
            {mode === 'create' ? 'Новая доска' : 'Настройки доски'}
          </Text>

          <TextInput
            value={title}
            onChangeText={setTitle}
            onSubmitEditing={handleSubmit}
            autoFocus
            placeholder="Название доски"
            placeholderTextColor={colors.muted}
            style={[
              styles.input,
              {
                color: colors.text,
                backgroundColor: colors.surfaceSubtle,
                borderColor: colors.line,
              },
            ]}
          />

          <View style={styles.actions}>
            {mode === 'edit' && canDelete && onDelete ? (
              <RipplePressable
                onPress={handleDelete}
                style={StyleSheet.flatten([
                  styles.btn,
                  { backgroundColor: confirmDelete ? colors.danger : colors.dangerBg },
                ])}>
                <Text
                  style={[
                    styles.btnLabel,
                    { color: confirmDelete ? '#FFFFFF' : colors.danger },
                  ]}>
                  {confirmDelete ? 'Точно удалить?' : 'Удалить'}
                </Text>
              </RipplePressable>
            ) : (
              <View />
            )}

            <View style={styles.rightActions}>
              <RipplePressable
                onPress={onClose}
                style={StyleSheet.flatten([
                  styles.btn,
                  { backgroundColor: colors.surfaceSubtle },
                ])}>
                <Text style={[styles.btnLabel, { color: colors.muted }]}>Отмена</Text>
              </RipplePressable>
              <RipplePressable
                disabled={title.trim().length === 0}
                onPress={handleSubmit}
                style={StyleSheet.flatten([
                  styles.btn,
                  { backgroundColor: colors.accent },
                  title.trim().length === 0 ? styles.disabled : null,
                ])}>
                <Text style={[styles.btnLabel, { color: colors.accentText }]}>
                  {mode === 'create' ? 'Создать' : 'Сохранить'}
                </Text>
              </RipplePressable>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

type ColumnDialogProps = {
  visible: boolean;
  mode: 'create' | 'edit';
  initialTitle: string;
  initialAccent: string;
  canDelete: boolean;
  onClose: () => void;
  onSubmit: (title: string, accent: string) => Promise<void>;
  onDelete?: () => Promise<void>;
};

export function ColumnDialog(props: ColumnDialogProps) {
  if (!props.visible) {
    return null;
  }
  return <ColumnDialogContent {...props} />;
}

function ColumnDialogContent({
  mode,
  initialTitle,
  initialAccent,
  canDelete,
  onClose,
  onSubmit,
  onDelete,
}: ColumnDialogProps) {
  const colors = useThemeColors();
  const [title, setTitle] = useState(initialTitle);
  const [accent, setAccent] = useState(initialAccent || COLUMN_ACCENTS[0]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleSubmit() {
    const trimmed = title.trim();
    if (!trimmed) {
      return;
    }
    await onSubmit(trimmed, accent);
    onClose();
  }

  async function handleDelete() {
    if (!onDelete) {
      return;
    }
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await onDelete();
    onClose();
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View
          entering={FadeIn.duration(140)}
          style={[
            styles.dialog,
            { backgroundColor: colors.surface, borderColor: colors.line },
          ]}>
          <Text style={[styles.title, { color: colors.text }]}>
            {mode === 'create' ? 'Новая колонка' : 'Редактировать колонку'}
          </Text>

          <TextInput
            value={title}
            onChangeText={setTitle}
            onSubmitEditing={handleSubmit}
            autoFocus
            placeholder="Название колонки"
            placeholderTextColor={colors.muted}
            style={[
              styles.input,
              {
                color: colors.text,
                backgroundColor: colors.surfaceSubtle,
                borderColor: colors.line,
              },
            ]}
          />

          <View style={styles.colorRow}>
            {COLUMN_ACCENTS.map((swatch) => {
              const selected = accent === swatch;
              return (
                <Pressable
                  key={swatch}
                  accessibilityLabel={`Цвет ${swatch}`}
                  onPress={() => setAccent(swatch)}
                  style={[
                    styles.swatchOuter,
                    selected ? { borderColor: colors.text } : { borderColor: 'transparent' },
                  ]}>
                  <View style={[styles.swatchInner, { backgroundColor: swatch }]} />
                </Pressable>
              );
            })}
          </View>

          <View style={styles.actions}>
            {mode === 'edit' && canDelete && onDelete ? (
              <RipplePressable
                onPress={handleDelete}
                style={StyleSheet.flatten([
                  styles.btn,
                  { backgroundColor: confirmDelete ? colors.danger : colors.dangerBg },
                ])}>
                <Text
                  style={[
                    styles.btnLabel,
                    { color: confirmDelete ? '#FFFFFF' : colors.danger },
                  ]}>
                  {confirmDelete ? 'Удалить с карточками?' : 'Удалить'}
                </Text>
              </RipplePressable>
            ) : (
              <View />
            )}

            <View style={styles.rightActions}>
              <RipplePressable
                onPress={onClose}
                style={StyleSheet.flatten([
                  styles.btn,
                  { backgroundColor: colors.surfaceSubtle },
                ])}>
                <Text style={[styles.btnLabel, { color: colors.muted }]}>Отмена</Text>
              </RipplePressable>
              <RipplePressable
                disabled={title.trim().length === 0}
                onPress={handleSubmit}
                style={StyleSheet.flatten([
                  styles.btn,
                  { backgroundColor: colors.accent },
                  title.trim().length === 0 ? styles.disabled : null,
                ])}>
                <Text style={[styles.btnLabel, { color: colors.accentText }]}>
                  {mode === 'create' ? 'Добавить' : 'Сохранить'}
                </Text>
              </RipplePressable>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 12, 16, 0.45)',
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    gap: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  input: {
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  swatchOuter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchInner: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 4,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  btn: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 10,
  },
  btnLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.4,
  },
});
