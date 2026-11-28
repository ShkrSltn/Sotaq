import { type ComponentRef, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';

import {
  AnchoredPopover,
  type AnchorRect,
  measureAnchor,
} from '@/components/anchored-popover';
import { AppIcon } from '@/components/app-icon';
import { RipplePressable } from '@/components/ripple-pressable';
import { WebDragBox, type WebDomDragEvent } from '@/components/web-drag-box';
import type { HabitDayColumn, HabitWithStats } from '@/features/habits/types';
import { toDateKey } from '@/features/kanban/types';
import type { ThemeColors } from '@/theme/colors';

export const HABIT_DRAG_MIME = 'application/x-sotaq-habit';
const DROP_BLUE = '#3B82F6';

function TactileCheckCell({
  done,
  disabled,
  isToday,
  habitColor,
  colors,
  size = 28,
  accessibilityLabel,
  onPress,
}: {
  done: boolean;
  disabled: boolean;
  isToday: boolean;
  habitColor: string;
  colors: ThemeColors;
  size?: number;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function handlePress() {
    scale.set(
      withSequence(
        withSpring(0.84, { damping: 18, stiffness: 360 }),
        withSpring(1, { damping: 15, stiffness: 300 }),
      ),
    );
    onPress();
  }

  return (
    <Animated.View style={animStyle}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        onPress={handlePress}
        style={({ hovered }: { hovered?: boolean }) => [
          styles.checkCellBase,
          {
            width: size,
            height: size,
            borderRadius: Math.round(size * 0.3),
            backgroundColor: done
              ? habitColor
              : isToday
                ? colors.surfaceActive
                : hovered
                  ? colors.surfaceActive
                  : colors.surfaceSubtle,
            borderColor: done
              ? habitColor
              : isToday
                ? colors.text
                : hovered
                  ? colors.muted
                  : colors.line,
          },
          disabled ? styles.futureCell : null,
          Platform.OS === 'web' && !disabled ? ({ cursor: 'pointer' } as object) : null,
        ]}>
        {done ? (
          <AppIcon name="check" size={size >= 34 ? 15 : 13} color="#FFFFFF" strokeWidth={2.7} />
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

type CommonProps = {
  habit: HabitWithStats;
  days: HabitDayColumn[];
  targetForPeriod: number;
  colors: ThemeColors;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggleCell: (habitId: string, dateKey: string) => void;
  onEdit: (habit: HabitWithStats) => void;
  onMoveByOffset: (habitId: string, delta: -1 | 1) => void;
  onDelete: (habitId: string) => void;
};

function HabitActionMenu({
  visible,
  anchor,
  colors,
  canMoveUp,
  canMoveDown,
  onClose,
  onEdit,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  visible: boolean;
  anchor: AnchorRect | null;
  colors: ThemeColors;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onClose: () => void;
  onEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  return (
    <AnchoredPopover
      visible={visible}
      anchor={anchor}
      width={196}
      estimatedHeight={195}
      align="right"
      colors={colors}
      onClose={onClose}>
      <View style={styles.popoverBody}>
        <RipplePressable
          onPress={() => {
            onClose();
            onEdit();
          }}
          style={styles.menuRow}>
          <AppIcon name="edit" size="xs" color={colors.muted} />
          <Text style={[styles.menuRowText, { color: colors.text }]}>Статистика и правка</Text>
        </RipplePressable>

        {canMoveUp ? (
          <RipplePressable
            onPress={() => {
              onClose();
              onMoveUp();
            }}
            style={styles.menuRow}>
            <AppIcon name="arrowUp" size="xs" color={colors.muted} />
            <Text style={[styles.menuRowText, { color: colors.text }]}>Поднять выше</Text>
          </RipplePressable>
        ) : null}

        {canMoveDown ? (
          <RipplePressable
            onPress={() => {
              onClose();
              onMoveDown();
            }}
            style={styles.menuRow}>
            <AppIcon name="arrowDown" size="xs" color={colors.muted} />
            <Text style={[styles.menuRowText, { color: colors.text }]}>Опустить ниже</Text>
          </RipplePressable>
        ) : null}

        <View style={[styles.menuDivider, { backgroundColor: colors.line }]} />

        <RipplePressable
          onPress={() => {
            onClose();
            onDelete();
          }}
          style={styles.menuRow}>
          <AppIcon name="trash" size="xs" color={colors.danger} />
          <Text style={[styles.menuRowText, { color: colors.danger }]}>Удалить</Text>
        </RipplePressable>
      </View>
    </AnchoredPopover>
  );
}

export function HabitMobileCard({
  habit,
  days,
  targetForPeriod,
  colors,
  canMoveUp,
  canMoveDown,
  onToggleCell,
  onEdit,
  onMoveByOffset,
  onDelete,
}: CommonProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<AnchorRect | null>(null);
  const menuBtnRef = useRef<ComponentRef<typeof View>>(null);

  const todayKey = toDateKey(new Date());
  const periodDone = days.reduce(
    (acc, d) => acc + (habit.completedDates.has(d.dateKey) ? 1 : 0),
    0,
  );
  const goalReached = periodDone >= targetForPeriod;
  const pct = Math.min(100, Math.round((periodDone / Math.max(1, targetForPeriod)) * 100));

  return (
    <View
      style={[
        styles.mobileCard,
        {
          backgroundColor: colors.surface,
          borderColor: habit.completedToday ? `${habit.color}66` : colors.line,
        },
      ]}>
      {/* Top Row: Identity + Quick Today Check + Menu */}
      <View style={styles.mobileTopRow}>
        <Pressable
          onPress={() => onEdit(habit)}
          style={({ pressed }) => [
            styles.mobileIdentityPress,
            pressed ? styles.pressed : null,
          ]}>
          <View style={[styles.mobileIconBox, { backgroundColor: `${habit.color}20` }]}>
            <AppIcon name={habit.icon} size="sm" color={habit.color} />
          </View>
          <View style={styles.mobileTitleCol}>
            <Text style={[styles.mobileTitle, { color: colors.text }]} numberOfLines={1}>
              {habit.title}
            </Text>
            <View style={styles.mobileMetaRow}>
              <View style={styles.streakInline}>
                <AppIcon
                  name="flame"
                  size={11}
                  color={habit.currentStreak > 0 ? colors.warning : colors.muted}
                />
                <Text
                  style={[
                    styles.mobileMetaText,
                    { color: habit.currentStreak > 0 ? colors.text : colors.muted },
                  ]}>
                  {habit.currentStreak}д
                </Text>
              </View>
              <Text style={[styles.mobileDotSep, { color: colors.muted }]}>·</Text>
              <Text
                style={[
                  styles.mobileMetaText,
                  { color: goalReached ? colors.success : colors.muted },
                ]}>
                {periodDone}/{targetForPeriod} за нед.
              </Text>
            </View>
          </View>
        </Pressable>

        <View style={styles.mobileRightActions}>
          {/* Big thumb-friendly Today button */}
          <TactileCheckCell
            done={habit.completedToday}
            disabled={false}
            isToday
            habitColor={habit.color}
            colors={colors}
            size={38}
            accessibilityLabel={`Отметить «${habit.title}» за сегодня`}
            onPress={() => onToggleCell(habit.id, todayKey)}
          />

          <View ref={menuBtnRef} collapsable={false}>
            <RipplePressable
              accessibilityLabel="Действия"
              onPress={() => {
                measureAnchor(menuBtnRef.current, (rect) => {
                  setMenuAnchor(rect);
                  setMenuOpen(true);
                });
              }}
              style={styles.mobileMoreBtn}>
              <AppIcon name="more" size="sm" color={colors.muted} />
            </RipplePressable>
          </View>
        </View>
      </View>

      {/* Bottom 7-day interactive thumb strip */}
      <View style={[styles.mobileDaysStrip, { borderTopColor: colors.line }]}>
        {days.map((day) => {
          const done = habit.completedDates.has(day.dateKey);
          return (
            <View key={day.dateKey} style={styles.mobileDayCol}>
              <Text
                style={[
                  styles.mobileDayLabel,
                  { color: day.isToday ? colors.text : colors.muted },
                ]}>
                {day.weekdayLabel}
              </Text>
              <TactileCheckCell
                done={done}
                disabled={day.isFuture}
                isToday={day.isToday}
                habitColor={habit.color}
                colors={colors}
                size={34}
                accessibilityLabel={`${habit.title} — ${day.dateKey}`}
                onPress={() => onToggleCell(habit.id, day.dateKey)}
              />
              <Text
                style={[
                  styles.mobileDayNum,
                  { color: day.isToday ? colors.text : colors.muted },
                ]}>
                {day.dayNum}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Subtle Bottom Progress Line */}
      <View style={[styles.mobileProgressTrack, { backgroundColor: colors.surfaceSubtle }]}>
        <View
          style={[
            styles.mobileProgressFill,
            {
              width: `${pct}%`,
              backgroundColor: goalReached ? colors.success : habit.color,
            },
          ]}
        />
      </View>

      <HabitActionMenu
        visible={menuOpen}
        anchor={menuAnchor}
        colors={colors}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        onClose={() => setMenuOpen(false)}
        onEdit={() => onEdit(habit)}
        onMoveUp={() => onMoveByOffset(habit.id, -1)}
        onMoveDown={() => onMoveByOffset(habit.id, 1)}
        onDelete={() => onDelete(habit.id)}
      />
    </View>
  );
}

type DesktopRowProps = CommonProps & {
  isLast: boolean;
  isDragging: boolean;
  dropPosition: 'before' | 'after' | null;
  onDragStart: (habitId: string) => void;
  onDragEnd: () => void;
  onDragOver: (habitId: string, position: 'before' | 'after') => void;
  onDragLeave: (habitId: string) => void;
  onDropHabit: (draggedId: string, targetId: string, position: 'before' | 'after') => void;
};

export function HabitDesktopRow({
  habit,
  days,
  targetForPeriod,
  colors,
  isLast,
  canMoveUp,
  canMoveDown,
  isDragging,
  dropPosition,
  onToggleCell,
  onEdit,
  onMoveByOffset,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDropHabit,
}: DesktopRowProps) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<AnchorRect | null>(null);
  const menuBtnRef = useRef<ComponentRef<typeof View>>(null);

  const periodDone = days.reduce(
    (acc, d) => acc + (habit.completedDates.has(d.dateKey) ? 1 : 0),
    0,
  );
  const goalReached = periodDone >= targetForPeriod;

  function resolvePos(event: WebDomDragEvent): 'before' | 'after' {
    const el = event.currentTarget as HTMLElement | null;
    if (!el || typeof el.getBoundingClientRect !== 'function') {
      return 'after';
    }
    const rect = el.getBoundingClientRect();
    return event.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
  }

  return (
    <View style={[styles.rowWrap, isDragging ? styles.dragging : null]}>
      {dropPosition === 'before' ? (
        <View pointerEvents="none" style={[styles.dropLine, styles.dropBefore]} />
      ) : null}

      <WebDragBox
        draggable={Platform.OS === 'web'}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onDragStart={(event) => {
          event.stopPropagation();
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData(HABIT_DRAG_MIME, habit.id);
            event.dataTransfer.setData('text/plain', habit.id);
          }
          onDragStart(habit.id);
        }}
        onDragEnd={() => onDragEnd()}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
          }
          onDragOver(habit.id, resolvePos(event));
        }}
        onDragLeave={() => onDragLeave(habit.id)}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const draggedId =
            event.dataTransfer?.getData(HABIT_DRAG_MIME) ||
            event.dataTransfer?.getData('text/plain') ||
            '';
          if (draggedId && draggedId !== habit.id) {
            onDropHabit(draggedId, habit.id, resolvePos(event));
          }
        }}
        style={[
          styles.desktopRow,
          {
            backgroundColor: hovered ? colors.surfaceSubtle : 'transparent',
          },
          !isLast
            ? { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth }
            : null,
          Platform.OS === 'web' ? styles.rowWebDrag : null,
        ]}>
        {/* Identity (clickable to open stats/edit) */}
        <Pressable
          onPress={() => onEdit(habit)}
          style={({ pressed }) => [
            styles.desktopNameCol,
            pressed ? styles.pressed : null,
            Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null,
          ]}>
          {Platform.OS === 'web' ? (
            <View style={[styles.gripIcon, { opacity: hovered ? 0.75 : 0.22 }]}>
              <AppIcon name="grip" size="xs" color={colors.muted} />
            </View>
          ) : null}
          <View style={[styles.desktopIconBox, { backgroundColor: `${habit.color}20` }]}>
            <AppIcon name={habit.icon} size="xs" color={habit.color} />
          </View>
          <Text style={[styles.desktopTitle, { color: colors.text }]} numberOfLines={1}>
            {habit.title}
          </Text>
        </Pressable>

        {/* Day Check Cells */}
        <View style={styles.daysRow}>
          {days.map((day) => {
            const done = habit.completedDates.has(day.dateKey);
            return (
              <View
                key={day.dateKey}
                style={[
                  styles.dayCellWrap,
                  day.isToday ? { backgroundColor: `${colors.surfaceActive}66`, borderRadius: 9 } : null,
                ]}>
                <TactileCheckCell
                  done={done}
                  disabled={day.isFuture}
                  isToday={day.isToday}
                  habitColor={habit.color}
                  colors={colors}
                  size={28}
                  accessibilityLabel={`${habit.title} — ${day.dateKey}`}
                  onPress={() => onToggleCell(habit.id, day.dateKey)}
                />
              </View>
            );
          })}
        </View>

        {/* Streak + Goal Progress */}
        <View style={styles.desktopStatsCol}>
          <View style={styles.streakInline}>
            <AppIcon
              name="flame"
              size={12}
              color={habit.currentStreak > 0 ? colors.warning : colors.muted}
            />
            <Text
              style={[
                styles.streakNum,
                { color: habit.currentStreak > 0 ? colors.text : colors.muted },
              ]}>
              {habit.currentStreak}
            </Text>
          </View>
          <Text
            style={[
              styles.goalRatio,
              { color: goalReached ? colors.success : colors.muted },
            ]}>
            {periodDone}/{targetForPeriod}
          </Text>
        </View>

        {/* More Menu */}
        <View
          ref={menuBtnRef}
          collapsable={false}
          style={[styles.menuCol, { opacity: hovered || menuOpen ? 1 : 0.45 }]}>
          <RipplePressable
            accessibilityLabel="Действия"
            onPress={() => {
              measureAnchor(menuBtnRef.current, (rect) => {
                setMenuAnchor(rect);
                setMenuOpen(true);
              });
            }}
            style={styles.moreBtn}>
            <AppIcon name="more" size="xs" color={colors.muted} />
          </RipplePressable>
        </View>
      </WebDragBox>

      {dropPosition === 'after' ? (
        <View pointerEvents="none" style={[styles.dropLine, styles.dropAfter]} />
      ) : null}

      <HabitActionMenu
        visible={menuOpen}
        anchor={menuAnchor}
        colors={colors}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        onClose={() => setMenuOpen(false)}
        onEdit={() => onEdit(habit)}
        onMoveUp={() => onMoveByOffset(habit.id, -1)}
        onMoveDown={() => onMoveByOffset(habit.id, 1)}
        onDelete={() => onDelete(habit.id)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  checkCellBase: {
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  futureCell: {
    opacity: 0.25,
  },
  pressed: {
    opacity: 0.72,
  },
  mobileCard: {
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  mobileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 13,
    paddingVertical: 12,
    gap: 10,
  },
  mobileIdentityPress: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  mobileIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  mobileTitleCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  mobileTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  mobileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  mobileMetaText: {
    fontSize: 11.5,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  mobileDotSep: {
    fontSize: 11,
  },
  mobileRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  mobileMoreBtn: {
    width: 30,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileDaysStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  mobileDayCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  mobileDayLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  mobileDayNum: {
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  mobileProgressTrack: {
    height: 3,
    width: '100%',
  },
  mobileProgressFill: {
    height: '100%',
  },
  rowWrap: {
    position: 'relative',
  },
  dragging: {
    opacity: 0.35,
  },
  dropLine: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: DROP_BLUE,
    zIndex: 10,
  },
  dropBefore: {
    top: -1,
  },
  dropAfter: {
    bottom: -1,
  },
  desktopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    ...(Platform.OS === 'web' ? ({ transition: 'background-color 110ms ease' } as object) : null),
  },
  rowWebDrag: {
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'grab',
          userSelect: 'none',
        } as object)
      : null),
  },
  desktopNameCol: {
    width: 232,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    minWidth: 0,
  },
  gripIcon: {
    marginLeft: -4,
  },
  desktopIconBox: {
    width: 27,
    height: 27,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  desktopTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  daysRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  dayCellWrap: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 3,
  },
  desktopStatsCol: {
    width: 76,
    alignItems: 'flex-end',
    gap: 1,
  },
  streakInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  streakNum: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  goalRatio: {
    fontSize: 10.5,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  menuCol: {
    width: 28,
    alignItems: 'flex-end',
  },
  moreBtn: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  popoverBody: {
    gap: 2,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderRadius: 8,
  },
  menuRowText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 3,
    marginHorizontal: 6,
  },
});
