import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import { RipplePressable } from '@/components/ripple-pressable';
import { formatDueDateLabel, PRIORITY_META } from '@/features/kanban/types';
import type { TodoItemRecord } from '@/features/todos/types';
import type { ThemeColors } from '@/theme/colors';

type Props = {
  todo: TodoItemRecord;
  listTitle?: string | null;
  colors: ThemeColors;
  onToggle: () => void;
  onPress: () => void;
  onDelete: () => void;
};

export function TodoRowItem({ todo, listTitle, colors, onToggle, onPress, onDelete }: Props) {
  const checkScale = useSharedValue(1);
  const checkAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.get() }],
  }));

  const dueInfo = formatDueDateLabel(todo.dueDate);
  const showPriority = todo.priority !== 'medium' && !todo.isDone;
  const hasNotes = todo.notes.trim().length > 0;
  const hasMeta =
    showPriority ||
    dueInfo !== null ||
    Boolean(listTitle) ||
    todo.linkedCard !== null ||
    hasNotes;

  function handleToggle() {
    checkScale.set(
      withSequence(
        withSpring(0.8, { damping: 16, stiffness: 420 }),
        withSpring(1, { damping: 14, stiffness: 320 }),
      ),
    );
    onToggle();
  }

  return (
    <Animated.View
      entering={FadeInDown.duration(160)}
      exiting={FadeOut.duration(120)}
      layout={LinearTransition.springify().damping(24).stiffness(260)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={todo.title}
        onPress={onPress}
        style={({ hovered }: { hovered?: boolean }) => [
          styles.row,
          {
            backgroundColor: hovered ? colors.surfaceSubtle : 'transparent',
            borderBottomColor: colors.line,
          },
        ]}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: todo.isDone }}
          accessibilityLabel={todo.isDone ? 'Вернуть в работу' : 'Отметить выполненной'}
          hitSlop={8}
          onPress={(event) => {
            event.stopPropagation?.();
            handleToggle();
          }}
          style={styles.checkHit}>
          <Animated.View
            style={[
              styles.checkbox,
              checkAnimatedStyle,
              {
                borderColor: todo.isDone
                  ? colors.success
                  : todo.priority === 'high'
                    ? PRIORITY_META.high.dotColor
                    : colors.muted,
                backgroundColor: todo.isDone ? colors.success : 'transparent',
              },
            ]}>
            {todo.isDone ? <Text style={styles.checkmark}>✓</Text> : null}
          </Animated.View>
        </Pressable>

        <View style={styles.content}>
          <Text
            style={[
              styles.title,
              { color: todo.isDone ? colors.muted : colors.text },
              todo.isDone ? styles.titleDone : null,
            ]}
            numberOfLines={2}>
            {todo.title}
          </Text>

          {hasMeta ? (
            <View style={styles.metaRow}>
              {showPriority ? (
                <View style={[styles.pill, { backgroundColor: colors.surfaceSubtle }]}>
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: PRIORITY_META[todo.priority].dotColor },
                    ]}
                  />
                  <Text style={[styles.pillText, { color: colors.muted }]}>
                    {PRIORITY_META[todo.priority].shortLabel}
                  </Text>
                </View>
              ) : null}

              {dueInfo ? (
                <View
                  style={[
                    styles.pill,
                    {
                      backgroundColor: todo.isDone
                        ? colors.surfaceSubtle
                        : dueInfo.isOverdue
                          ? colors.dangerBg
                          : dueInfo.isToday
                            ? colors.warningBg
                            : colors.surfaceSubtle,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.pillText,
                      {
                        color: todo.isDone
                          ? colors.muted
                          : dueInfo.isOverdue
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

              {listTitle ? (
                <View style={[styles.pill, { backgroundColor: colors.surfaceSubtle }]}>
                  <Text style={[styles.pillText, { color: colors.muted }]}>{listTitle}</Text>
                </View>
              ) : null}

              {todo.linkedCard ? (
                <View style={[styles.pill, { backgroundColor: colors.surfaceSubtle }]}>
                  <View
                    style={[styles.dot, { backgroundColor: todo.linkedCard.columnAccent }]}
                  />
                  <Text style={[styles.pillText, { color: colors.text }]}>
                    ▦ {todo.linkedCard.columnTitle}
                  </Text>
                </View>
              ) : null}

              {hasNotes ? (
                <View style={[styles.pill, { backgroundColor: colors.surfaceSubtle }]}>
                  <Text style={[styles.pillText, { color: colors.muted }]}>≡</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        <RipplePressable
          accessibilityLabel="Удалить задачу"
          hitSlop={6}
          onPress={(event) => {
            event.stopPropagation?.();
            onDelete();
          }}
          style={styles.deleteBtn}>
          <Text style={[styles.deleteGlyph, { color: colors.muted }]}>×</Text>
        </RipplePressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkHit: {
    paddingTop: 1,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.75,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 13,
  },
  content: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  title: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
  titleDone: {
    textDecorationLine: 'line-through',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -2,
  },
  deleteGlyph: {
    fontSize: 18,
    lineHeight: 20,
  },
});
