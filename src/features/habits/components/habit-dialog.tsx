import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AppIcon, type IconName } from '@/components/app-icon';
import { RipplePressable } from '@/components/ripple-pressable';
import {
  HABIT_COLORS,
  HABIT_ICONS,
  type HabitRecord,
} from '@/features/habits/types';
import { useThemeColors } from '@/theme/colors';

type Props = {
  visible: boolean;
  mode: 'create' | 'edit';
  habit?: HabitRecord | null;
  onClose: () => void;
  onSave: (input: {
    title: string;
    color: string;
    icon: IconName;
    targetPerWeek: number;
  }) => Promise<void>;
  onDelete?: (habitId: string) => Promise<void>;
};

const TARGET_PRESETS = [3, 5, 7] as const;

export function HabitDialog(props: Props) {
  if (!props.visible) {
    return null;
  }
  return <HabitDialogContent key={`${props.mode}-${props.habit?.id ?? 'new'}`} {...props} />;
}

function HabitDialogContent({ mode, habit, onClose, onSave, onDelete }: Props) {
  const colors = useThemeColors();
  const [title, setTitle] = useState(mode === 'edit' && habit ? habit.title : '');
  const [color, setColor] = useState(mode === 'edit' && habit ? habit.color : HABIT_COLORS[0]);
  const [icon, setIcon] = useState<IconName>(mode === 'edit' && habit ? habit.icon : 'flame');
  const [targetPerWeek, setTargetPerWeek] = useState(
    mode === 'edit' && habit ? habit.targetPerWeek : 7,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSubmit() {
    const clean = title.trim();
    if (!clean) {
      return;
    }
    await onSave({ title: clean, color, icon, targetPerWeek });
    onClose();
  }

  async function handleDelete() {
    if (!habit || !onDelete) {
      return;
    }
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await onDelete(habit.id);
    onClose();
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View
          entering={FadeIn.duration(140)}
          style={[styles.dialog, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: colors.text }]}>
              {mode === 'edit' ? 'Редактировать привычку' : 'Новая привычка'}
            </Text>
            <RipplePressable
              onPress={onClose}
              style={StyleSheet.flatten([
                styles.closeBtn,
                { backgroundColor: colors.surfaceSubtle },
              ])}>
              <AppIcon name="close" size="xs" color={colors.muted} />
            </RipplePressable>
          </View>

          <TextInput
            autoFocus
            value={title}
            onChangeText={setTitle}
            onSubmitEditing={handleSubmit}
            placeholder="Например: Читать 20 минут"
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

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.muted }]}>Цвет</Text>
            <View style={styles.rowWrap}>
              {HABIT_COLORS.map((swatch) => {
                const selected = color === swatch;
                return (
                  <RipplePressable
                    key={swatch}
                    onPress={() => setColor(swatch)}
                    style={StyleSheet.flatten([
                      styles.swatch,
                      {
                        backgroundColor: swatch,
                        borderColor: selected ? colors.text : 'transparent',
                      },
                    ])}>
                    {selected ? <AppIcon name="check" size={12} color="#FFFFFF" strokeWidth={2.5} /> : null}
                  </RipplePressable>
                );
              })}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.muted }]}>Иконка</Text>
            <View style={styles.rowWrap}>
              {HABIT_ICONS.map((ic) => {
                const selected = icon === ic;
                return (
                  <RipplePressable
                    key={ic}
                    onPress={() => setIcon(ic)}
                    style={StyleSheet.flatten([
                      styles.iconChip,
                      {
                        backgroundColor: selected ? colors.surfaceActive : colors.surfaceSubtle,
                        borderColor: selected ? colors.text : colors.line,
                      },
                    ])}>
                    <AppIcon name={ic} size="sm" color={selected ? color : colors.muted} />
                  </RipplePressable>
                );
              })}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.muted }]}>Цель в неделю</Text>
            <View style={styles.rowWrap}>
              {TARGET_PRESETS.map((num) => {
                const selected = targetPerWeek === num;
                return (
                  <RipplePressable
                    key={num}
                    onPress={() => setTargetPerWeek(num)}
                    style={StyleSheet.flatten([
                      styles.targetChip,
                      {
                        backgroundColor: selected ? colors.surfaceActive : colors.surfaceSubtle,
                        borderColor: selected ? colors.text : colors.line,
                      },
                    ])}>
                    <Text
                      style={[
                        styles.targetText,
                        { color: selected ? colors.text : colors.muted },
                      ]}>
                      {num === 7 ? 'Каждый день (7)' : `${num} дн / нед`}
                    </Text>
                  </RipplePressable>
                );
              })}
            </View>
          </View>

          <View style={styles.footer}>
            {mode === 'edit' && onDelete && habit ? (
              <RipplePressable
                onPress={handleDelete}
                style={StyleSheet.flatten([
                  styles.deleteBtn,
                  { backgroundColor: confirmDelete ? colors.danger : colors.dangerBg },
                ])}>
                <AppIcon
                  name="trash"
                  size="xs"
                  color={confirmDelete ? '#FFFFFF' : colors.danger}
                />
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

            <View style={styles.actions}>
              <RipplePressable
                onPress={onClose}
                style={StyleSheet.flatten([styles.btn, { backgroundColor: colors.surfaceSubtle }])}>
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
                  {mode === 'edit' ? 'Сохранить' : 'Добавить'}
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
    backgroundColor: 'rgba(10, 12, 16, 0.5)',
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '500',
  },
  field: {
    gap: 7,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.45,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChip: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetChip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
  },
  targetText: {
    fontSize: 12,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
  },
  btnLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.35,
  },
});
