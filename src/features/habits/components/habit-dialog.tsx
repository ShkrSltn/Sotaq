import { useEffect, useState } from 'react';
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
import { useThemeColors, useViewport } from '@/theme/colors';

type Props = {
  visible: boolean;
  mode: 'create' | 'edit';
  habit?: HabitWithStats | null;
  defaultColor?: string;
  canMovePrev?: boolean;
  canMoveNext?: boolean;
  onMoveOrder?: (delta: -1 | 1) => Promise<void>;
  onClose: () => void;
  onSave: (input: {
    title: string;
    color: string;
    icon: IconName;
    targetPerWeek: number;
  }) => Promise<void>;
  onDelete?: (habitId: string) => Promise<void>;
};

export function HabitDialog(props: Props) {
  if (!props.visible) {
    return null;
  }
  return <HabitDialogContent key={`${props.mode}-${props.habit?.id ?? 'new'}`} {...props} />;
}

function HabitDialogContent({
  mode,
  habit,
  defaultColor,
  canMovePrev,
  canMoveNext,
  onMoveOrder,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const colors = useThemeColors();
  const { isDesktop } = useViewport();
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState(mode === 'edit' && habit ? habit.title : '');
  const [color, setColor] = useState(
    mode === 'edit' && habit ? habit.color : defaultColor ?? HABIT_COLORS[0],
  );
  const [icon, setIcon] = useState<IconName>(mode === 'edit' && habit ? habit.icon : 'flame');
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
    await onSave({
      title: clean,
      color,
      icon,
      targetPerWeek: mode === 'edit' && habit ? habit.targetPerWeek : 7,
    });
    onClose();
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={[styles.root, isDesktop ? styles.rootDesktop : styles.rootMobile]}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View
          entering={
            isDesktop ? FadeIn.duration(140) : SlideInDown.springify().damping(24).stiffness(260)
          }
          style={[
            styles.card,
            isDesktop ? styles.cardDesktop : styles.cardMobile,
            {
              backgroundColor: colors.surface,
              borderColor: colors.line,
              paddingBottom: isDesktop ? 18 : Math.max(insets.bottom, 18),
            },
          ]}>
          <View style={[styles.header, { borderBottomColor: colors.line }]}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {mode === 'create' ? 'Новая привычка' : 'Настроить привычку'}
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

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {/* Compact streak summary in Edit Mode */}
            {mode === 'edit' && habit ? (
              <View style={styles.streakRow}>
                <View style={[styles.statTile, { backgroundColor: colors.surfaceSubtle }]}>
                  <Text style={[styles.statVal, { color: colors.text }]}>
                    {habit.currentStreak} дн.
                  </Text>
                  <Text style={[styles.statLbl, { color: colors.muted }]}>Текущая серия</Text>
                </View>
                <View style={[styles.statTile, { backgroundColor: colors.surfaceSubtle }]}>
                  <Text style={[styles.statVal, { color: colors.text }]}>
                    {habit.bestStreak} дн.
                  </Text>
                  <Text style={[styles.statLbl, { color: colors.muted }]}>Лучшая серия</Text>
                </View>
                <View style={[styles.statTile, { backgroundColor: colors.surfaceSubtle }]}>
                  <Text style={[styles.statVal, { color: colors.text }]}>
                    {habit.completedDates.size}
                  </Text>
                  <Text style={[styles.statLbl, { color: colors.muted }]}>Всего отметок</Text>
                </View>
              </View>
            ) : null}

            <Text style={[styles.label, { color: colors.muted }]}>Название</Text>
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

            <Text style={[styles.label, { color: colors.muted }]}>Цвет ячеек</Text>
            <View style={styles.paletteRow}>
              {HABIT_COLORS.map((c) => {
                const active = color === c;
                return (
                  <RipplePressable
                    key={c}
                    onPress={() => setColor(c)}
                    style={StyleSheet.flatten([
                      styles.colorCircle,
                      {
                        backgroundColor: c,
                        borderColor: active ? colors.text : 'transparent',
                      },
                    ])}>
                    {active ? <AppIcon name="check" size="xs" color="#FFFFFF" /> : null}
                  </RipplePressable>
                );
              })}
            </View>

            <Text style={[styles.label, { color: colors.muted }]}>Иконка</Text>
            <View style={styles.paletteRow}>
              {HABIT_ICONS.map((ic) => {
                const active = icon === ic;
                return (
                  <RipplePressable
                    key={ic}
                    onPress={() => setIcon(ic)}
                    style={StyleSheet.flatten([
                      styles.iconTile,
                      {
                        backgroundColor: active ? colors.surfaceActive : colors.surfaceSubtle,
                        borderColor: active ? colors.text : colors.line,
                      },
                    ])}>
                    <AppIcon name={ic} size="sm" color={active ? color : colors.muted} />
                  </RipplePressable>
                );
              })}
            </View>

            {mode === 'edit' && onMoveOrder && (canMovePrev || canMoveNext) ? (
              <>
                <Text style={[styles.label, { color: colors.muted }]}>Порядок в списке</Text>
                <View style={styles.orderRow}>
                  <RipplePressable
                    disabled={!canMovePrev}
                    onPress={() => onMoveOrder(-1)}
                    style={StyleSheet.flatten([
                      styles.orderBtn,
                      { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                      !canMovePrev ? styles.disabled : null,
                    ])}>
                    <AppIcon name="arrowLeft" size="xs" color={colors.text} />
                    <Text style={[styles.orderBtnText, { color: colors.text }]}>Раньше</Text>
                  </RipplePressable>

                  <RipplePressable
                    disabled={!canMoveNext}
                    onPress={() => onMoveOrder(1)}
                    style={StyleSheet.flatten([
                      styles.orderBtn,
                      { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                      !canMoveNext ? styles.disabled : null,
                    ])}>
                    <Text style={[styles.orderBtnText, { color: colors.text }]}>Дальше</Text>
                    <AppIcon name="arrowRight" size="xs" color={colors.text} />
                  </RipplePressable>
                </View>
              </>
            ) : null}

            <View style={styles.footerActions}>
              {mode === 'edit' && habit && onDelete ? (
                <RipplePressable
                  onPress={async () => {
                    if (!confirmDelete) {
                      setConfirmDelete(true);
                      return;
                    }
                    await onDelete(habit.id);
                    onClose();
                  }}
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
                      styles.deleteBtnText,
                      { color: confirmDelete ? '#FFFFFF' : colors.danger },
                    ]}>
                    {confirmDelete ? 'Точно удалить?' : 'Удалить'}
                  </Text>
                </RipplePressable>
              ) : (
                <View />
              )}

              <RipplePressable
                disabled={title.trim().length === 0}
                onPress={handleSubmit}
                style={StyleSheet.flatten([
                  styles.saveBtn,
                  { backgroundColor: colors.accent },
                  title.trim().length === 0 ? styles.disabled : null,
                ])}>
                <Text style={[styles.saveBtnText, { color: colors.accentText }]}>
                  {mode === 'create' ? 'Создать' : 'Сохранить'}
                </Text>
              </RipplePressable>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  rootDesktop: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  rootMobile: {
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 12, 16, 0.5)',
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  cardDesktop: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    borderRadius: 16,
  },
  cardMobile: {
    width: '100%',
    maxHeight: '88%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
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
    padding: 18,
    gap: 10,
  },
  streakRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  statTile: {
    flex: 1,
    borderRadius: 10,
    padding: 10,
    gap: 2,
  },
  statVal: {
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statLbl: {
    fontSize: 11,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  input: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  paletteRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  colorCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderRow: {
    flexDirection: 'row',
    gap: 8,
  },
  orderBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 34,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
  },
  orderBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 10,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 9,
  },
  deleteBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  saveBtn: {
    paddingHorizontal: 18,
    height: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.4,
  },
});
