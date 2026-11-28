import { useEffect, useMemo, useState } from 'react';
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
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon, type IconName } from '@/components/app-icon';
import { RipplePressable } from '@/components/ripple-pressable';
import {
  HABIT_COLORS,
  HABIT_ICONS,
  type HabitWithStats,
} from '@/features/habits/types';
import { toDateKey } from '@/features/kanban/types';
import { useThemeColors, useViewport } from '@/theme/colors';

type Props = {
  visible: boolean;
  mode: 'create' | 'edit';
  habit?: HabitWithStats | null;
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
  const { isDesktop } = useViewport();
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState(mode === 'edit' && habit ? habit.title : '');
  const [color, setColor] = useState(mode === 'edit' && habit ? habit.color : HABIT_COLORS[0]);
  const [icon, setIcon] = useState<IconName>(mode === 'edit' && habit ? habit.icon : 'flame');
  const [targetPerWeek, setTargetPerWeek] = useState(
    mode === 'edit' && habit ? habit.targetPerWeek : 7,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const heatmapDays = useMemo(() => {
    if (mode !== 'edit' || !habit) {
      return [];
    }
    const today = new Date();
    const list: { dateKey: string; done: boolean; isToday: boolean }[] = [];
    for (let i = 27; i >= 0; i -= 1) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const key = toDateKey(d);
      list.push({
        dateKey: key,
        done: habit.completedDates.has(key),
        isToday: i === 0,
      });
    }
    return list;
  }, [mode, habit]);

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
          entering={
            isDesktop ? FadeIn.duration(140) : SlideInDown.springify().damping(24).stiffness(260)
          }
          style={[
            styles.dialog,
            isDesktop ? styles.dialogDesktop : styles.dialogMobile,
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

          <View style={[styles.headerRow, { borderBottomColor: colors.line }]}>
            <Text style={[styles.title, { color: colors.text }]}>
              {mode === 'edit' ? 'Привычка' : 'Новая привычка'}
            </Text>
            <RipplePressable
              accessibilityLabel="Закрыть"
              onPress={onClose}
              style={StyleSheet.flatten([
                styles.closeBtn,
                { backgroundColor: colors.surfaceSubtle },
              ])}>
              <AppIcon name="close" size="xs" color={colors.muted} />
            </RipplePressable>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled">
            {/* 28-Day Heatmap & Streak Stats in Edit Mode */}
            {mode === 'edit' && habit ? (
              <View
                style={[
                  styles.statsCard,
                  { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                ]}>
                <View style={styles.statsNumsRow}>
                  <View style={styles.statBox}>
                    <Text style={[styles.statNum, { color: colors.text }]}>
                      {habit.currentStreak}д
                    </Text>
                    <Text style={[styles.statLabel, { color: colors.muted }]}>Серия</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={[styles.statNum, { color: colors.text }]}>
                      {habit.bestStreak}д
                    </Text>
                    <Text style={[styles.statLabel, { color: colors.muted }]}>Рекорд</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={[styles.statNum, { color: colors.text }]}>
                      {habit.completedDates.size}
                    </Text>
                    <Text style={[styles.statLabel, { color: colors.muted }]}>Всего</Text>
                  </View>
                </View>

                <View style={styles.heatmapWrap}>
                  <Text style={[styles.heatmapCaption, { color: colors.muted }]}>
                    Последние 28 дней
                  </Text>
                  <View style={styles.heatmapGrid}>
                    {heatmapDays.map((d) => (
                      <View
                        key={d.dateKey}
                        style={[
                          styles.heatCell,
                          {
                            backgroundColor: d.done ? color : colors.surface,
                            borderColor: d.isToday ? colors.text : colors.line,
                          },
                        ]}
                      />
                    ))}
                  </View>
                </View>
              </View>
            ) : null}

            <TextInput
              autoFocus={mode === 'create'}
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
                      {selected ? (
                        <AppIcon name="check" size={12} color="#FFFFFF" strokeWidth={2.5} />
                      ) : null}
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
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.line }]}>
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
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 12, 16, 0.52)',
  },
  dialog: {
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  dialogDesktop: {
    maxWidth: 440,
    maxHeight: '88%',
    borderRadius: 18,
  },
  dialogMobile: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    padding: 18,
    gap: 14,
  },
  statsCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 12,
  },
  statsNumsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statNum: {
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  heatmapWrap: {
    gap: 6,
  },
  heatmapCaption: {
    fontSize: 11,
    fontWeight: '600',
  },
  heatmapGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  heatCell: {
    width: '12.5%',
    aspectRatio: 1,
    maxWidth: 24,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
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
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChip: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
  },
  targetText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
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
