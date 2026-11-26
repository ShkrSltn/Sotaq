import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { RipplePressable } from '@/components/ripple-pressable';
import {
  formatDueDateLabel,
  type KanbanCardRecord,
  PRIORITY_META,
} from '@/features/kanban/types';
import { type ThemeColors } from '@/theme/colors';

type Props = {
  card: KanbanCardRecord;
  colors: ThemeColors;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  isDragging: boolean;
  onPress: () => void;
  onMove: (direction: -1 | 1) => void;
  onDragStart?: (cardId: string) => void;
  onDragEnd?: () => void;
};

type WebDragProps = {
  draggable?: boolean;
  onDragStart?: (event: { dataTransfer?: { setData: (k: string, v: string) => void; effectAllowed: string } }) => void;
  onDragEnd?: () => void;
};

export function KanbanCardItem({
  card,
  colors,
  canMoveLeft,
  canMoveRight,
  isDragging,
  onPress,
  onMove,
  onDragStart,
  onDragEnd,
}: Props) {
  const scale = useSharedValue(1);
  const animatedPressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));

  const dueInfo = formatDueDateLabel(card.dueDate);
  const totalSubtasks = card.subtasks.length;
  const doneSubtasks = card.subtasks.filter((item) => item.isDone).length;
  const hasDescription = card.description.trim().length > 0;
  const showPriorityDot = card.priority !== 'medium';
  const hasMeta = hasDescription || dueInfo !== null || totalSubtasks > 0 || showPriorityDot;

  const webDragProps: WebDragProps =
    Platform.OS === 'web'
      ? {
          draggable: true,
          onDragStart: (event) => {
            if (event.dataTransfer) {
              event.dataTransfer.setData('text/plain', card.id);
              event.dataTransfer.effectAllowed = 'move';
            }
            onDragStart?.(card.id);
          },
          onDragEnd: () => {
            onDragEnd?.();
          },
        }
      : {};

  return (
    <Animated.View
      entering={FadeInDown.duration(170)}
      exiting={FadeOut.duration(130)}
      layout={LinearTransition.springify().damping(24).stiffness(260)}
      style={[animatedPressStyle, isDragging ? styles.dragging : null]}>
      <View {...(webDragProps as object)}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={card.title}
          onPress={onPress}
          onPressIn={() => {
            scale.set(withSpring(0.982, { damping: 20, stiffness: 360 }));
          }}
          onPressOut={() => {
            scale.set(withSpring(1, { damping: 20, stiffness: 360 }));
          }}
          style={({ hovered }: { hovered?: boolean }) => [
            styles.card,
            {
              backgroundColor: hovered ? colors.surfaceActive : colors.surfaceSubtle,
              borderColor: hovered ? colors.line : 'transparent',
            },
          ]}>
          <View style={styles.topRow}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={3}>
              {card.title}
            </Text>

            <View style={styles.quickMoves}>
              {canMoveLeft ? (
                <RipplePressable
                  accessibilityLabel="Перенести назад"
                  hitSlop={6}
                  onPress={(event) => {
                    event.stopPropagation?.();
                    onMove(-1);
                  }}
                  style={styles.moveBtn}>
                  <Text style={[styles.moveGlyph, { color: colors.muted }]}>‹</Text>
                </RipplePressable>
              ) : null}
              {canMoveRight ? (
                <RipplePressable
                  accessibilityLabel="Перенести дальше"
                  hitSlop={6}
                  onPress={(event) => {
                    event.stopPropagation?.();
                    onMove(1);
                  }}
                  style={styles.moveBtn}>
                  <Text style={[styles.moveGlyph, { color: colors.muted }]}>›</Text>
                </RipplePressable>
              ) : null}
            </View>
          </View>

          {hasMeta ? (
            <View style={styles.metaRow}>
              {showPriorityDot ? (
                <View style={[styles.metaPill, { backgroundColor: colors.surface }]}>
                  <View
                    style={[
                      styles.priorityDot,
                      { backgroundColor: PRIORITY_META[card.priority].dotColor },
                    ]}
                  />
                  <Text style={[styles.metaText, { color: colors.muted }]}>
                    {PRIORITY_META[card.priority].shortLabel}
                  </Text>
                </View>
              ) : null}

              {dueInfo ? (
                <View
                  style={[
                    styles.metaPill,
                    {
                      backgroundColor: dueInfo.isOverdue
                        ? colors.dangerBg
                        : dueInfo.isToday
                          ? colors.warningBg
                          : colors.surface,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.metaText,
                      {
                        color: dueInfo.isOverdue
                          ? colors.danger
                          : dueInfo.isToday
                            ? colors.warning
                            : colors.muted,
                      },
                    ]}>
                    {dueInfo.text}
                  </Text>
                </View>
              ) : null}

              {totalSubtasks > 0 ? (
                <View
                  style={[
                    styles.metaPill,
                    {
                      backgroundColor:
                        doneSubtasks === totalSubtasks ? colors.successBg : colors.surface,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.metaText,
                      {
                        color:
                          doneSubtasks === totalSubtasks ? colors.success : colors.muted,
                      },
                    ]}>
                    ✓ {doneSubtasks}/{totalSubtasks}
                  </Text>
                </View>
              ) : null}

              {hasDescription ? (
                <View style={[styles.metaPill, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.metaText, { color: colors.muted }]}>≡</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dragging: {
    opacity: 0.45,
  },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  quickMoves: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -2,
    marginRight: -4,
  },
  moveBtn: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveGlyph: {
    fontSize: 17,
    lineHeight: 19,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  metaText: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
