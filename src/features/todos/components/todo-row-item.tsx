import { type ComponentRef, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import {
  AnchoredPopover,
  type AnchorRect,
  measureAnchor,
} from '@/components/anchored-popover';
import { AppIcon } from '@/components/app-icon';
import { RipplePressable } from '@/components/ripple-pressable';
import { WebDragBox, type WebDomDragEvent } from '@/components/web-drag-box';
import { addDaysDateKey, formatDueDateLabel, PRIORITY_META } from '@/features/kanban/types';
import type { TodoItemRecord, TodoListRecord, TodoPriority } from '@/features/todos/types';
import type { ThemeColors } from '@/theme/colors';

export type TodoDropPosition = 'before' | 'after';

const DROP_BLUE = '#2383E2';
const PRIORITIES: readonly TodoPriority[] = ['high', 'medium', 'low'];

type Props = {
  todo: TodoItemRecord;
  lists: TodoListRecord[];
  listTitle?: string | null;
  colors: ThemeColors;
  isDesktop: boolean;
  isDragging?: boolean;
  isTodoDragActive?: boolean;
  dropIndicator?: TodoDropPosition | null;
  onToggle: () => void;
  onPress: () => void;
  onQuickUpdate: (patch: {
    priority?: TodoPriority;
    listId?: string | null;
    dueDate?: string | null;
  }) => void;
  onDelete: () => void;
  onDragStart?: (todoId: string) => void;
  onDragEnd?: () => void;
  onDragOverTodo?: (todoId: string, position: TodoDropPosition) => void;
  onDropOnTodo?: (draggedId: string, targetId: string, position: TodoDropPosition) => void;
};

export function TodoRowItem({
  todo,
  lists,
  listTitle,
  colors,
  isDesktop,
  isDragging = false,
  isTodoDragActive = false,
  dropIndicator = null,
  onToggle,
  onPress,
  onQuickUpdate,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOverTodo,
  onDropOnTodo,
}: Props) {
  const [hovered, setHovered] = useState(false);
  const [priorityMenuOpen, setPriorityMenuOpen] = useState(false);
  const [priorityAnchor, setPriorityAnchor] = useState<AnchorRect | null>(null);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [actionsAnchor, setActionsAnchor] = useState<AnchorRect | null>(null);

  const priorityBtnRef = useRef<ComponentRef<typeof View>>(null);
  const actionsBtnRef = useRef<ComponentRef<typeof View>>(null);

  const checkScale = useSharedValue(1);
  const checkAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.get() }],
  }));

  const dueInfo = formatDueDateLabel(todo.dueDate);
  const priorityMeta = PRIORITY_META[todo.priority];
  const hasNotes = todo.notes.trim().length > 0;
  const showActions = !isDesktop || hovered || actionsMenuOpen;

  function handleToggle() {
    checkScale.set(
      withSequence(
        withSpring(0.8, { damping: 16, stiffness: 420 }),
        withSpring(1, { damping: 14, stiffness: 320 }),
      ),
    );
    onToggle();
  }

  function resolveVerticalPosition(event: WebDomDragEvent): TodoDropPosition {
    const target = event.currentTarget as HTMLElement | null;
    const rect = target?.getBoundingClientRect?.();
    if (!rect || rect.height <= 0) {
      return 'after';
    }
    return event.clientY - rect.top < rect.height * 0.5 ? 'before' : 'after';
  }

  function openPriorityMenu() {
    if (priorityMenuOpen) {
      setPriorityMenuOpen(false);
      return;
    }
    measureAnchor(priorityBtnRef.current, (rect) => {
      setPriorityAnchor(rect);
      setPriorityMenuOpen(true);
    });
  }

  function openActionsMenu() {
    if (actionsMenuOpen) {
      setActionsMenuOpen(false);
      return;
    }
    measureAnchor(actionsBtnRef.current, (rect) => {
      setActionsAnchor(rect);
      setActionsMenuOpen(true);
    });
  }

  return (
    <Animated.View
      entering={FadeInDown.duration(150)}
      exiting={FadeOut.duration(120)}
      layout={LinearTransition.springify().damping(24).stiffness(260)}
      style={[styles.wrap, isDragging ? styles.dragging : null]}>
      {dropIndicator === 'before' ? (
        <View pointerEvents="none" style={[styles.dropLineWrap, styles.dropLineBefore]}>
          <View style={styles.dropDot} />
          <View style={styles.dropLine} />
        </View>
      ) : null}

      <WebDragBox
        draggable={Platform.OS === 'web'}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onDragStart={(event) => {
          event.stopPropagation();
          if (event.dataTransfer) {
            event.dataTransfer.setData('text/sotaq-todo', todo.id);
            event.dataTransfer.setData('text/plain', todo.id);
            event.dataTransfer.effectAllowed = 'move';
          }
          onDragStart?.(todo.id);
        }}
        onDragEnd={() => onDragEnd?.()}
        onDragOver={(event) => {
          if (!isTodoDragActive || isDragging) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
          }
          onDragOverTodo?.(todo.id, resolveVerticalPosition(event));
        }}
        onDrop={(event) => {
          if (!isTodoDragActive) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          const draggedId =
            event.dataTransfer?.getData('text/sotaq-todo') ||
            event.dataTransfer?.getData('text/plain') ||
            '';
          if (draggedId && draggedId !== todo.id) {
            onDropOnTodo?.(draggedId, todo.id, dropIndicator ?? resolveVerticalPosition(event));
          } else {
            onDragEnd?.();
          }
        }}
        style={[
          styles.row,
          {
            backgroundColor:
              hovered || actionsMenuOpen || priorityMenuOpen
                ? colors.surfaceSubtle
                : 'transparent',
            borderBottomColor: colors.line,
          },
        ]}>
        {Platform.OS === 'web' && isDesktop ? (
          <View style={[styles.gripSlot, hovered ? styles.gripVisible : styles.gripHidden]}>
            <AppIcon name="grip" size="xs" color={colors.muted} />
          </View>
        ) : null}

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: todo.isDone }}
          accessibilityLabel={todo.isDone ? 'Вернуть в работу' : 'Отметить выполненной'}
          hitSlop={8}
          onPress={handleToggle}
          style={styles.checkHit}>
          {(state) => {
            const boxHovered =
              Platform.OS === 'web' && (state as { hovered?: boolean }).hovered === true;
            return (
              <Animated.View
                style={[
                  styles.checkbox,
                  checkAnimatedStyle,
                  {
                    borderColor: todo.isDone
                      ? colors.success
                      : boxHovered
                        ? colors.text
                        : todo.priority === 'high'
                          ? PRIORITY_META.high.dotColor
                          : colors.muted,
                    backgroundColor: todo.isDone
                      ? colors.success
                      : boxHovered
                        ? colors.surfaceActive
                        : 'transparent',
                  },
                ]}>
                {todo.isDone ? (
                  <AppIcon name="check" size={12} color="#FFFFFF" strokeWidth={2.5} />
                ) : null}
              </Animated.View>
            );
          }}
        </Pressable>

        <View style={styles.mainCol}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={todo.title}
            onPress={onPress}
            style={styles.titleHit}>
            <Text
              style={[
                styles.title,
                { color: todo.isDone ? colors.muted : colors.text },
                todo.isDone ? styles.titleDone : null,
              ]}
              numberOfLines={2}>
              {todo.title}
            </Text>
          </Pressable>

          <View style={styles.metaRow}>
            {!todo.isDone ? (
              <View ref={priorityBtnRef} collapsable={false}>
                <RipplePressable
                  accessibilityLabel={`Приоритет: ${priorityMeta.label}`}
                  onPress={openPriorityMenu}
                  style={StyleSheet.flatten([
                    styles.priorityPill,
                    {
                      backgroundColor: colors.surface,
                      borderColor: priorityMenuOpen ? colors.text : colors.line,
                    },
                  ])}>
                  <View style={[styles.dot, { backgroundColor: priorityMeta.dotColor }]} />
                  <Text style={[styles.pillText, { color: colors.muted }]}>
                    {priorityMeta.shortLabel}
                  </Text>
                </RipplePressable>
              </View>
            ) : null}

            {dueInfo ? (
              <Pressable
                onPress={onPress}
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
                <AppIcon
                  name="calendar"
                  size={11}
                  color={
                    todo.isDone
                      ? colors.muted
                      : dueInfo.isOverdue
                        ? colors.danger
                        : dueInfo.isToday
                          ? colors.warning
                          : colors.muted
                  }
                />
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
              </Pressable>
            ) : null}

            {listTitle ? (
              <Pressable
                onPress={onPress}
                style={[styles.pill, { backgroundColor: colors.surfaceSubtle }]}>
                <AppIcon name="list" size={11} color={colors.muted} />
                <Text style={[styles.pillText, { color: colors.muted }]}>{listTitle}</Text>
              </Pressable>
            ) : null}

            {todo.linkedCard ? (
              <Pressable
                onPress={onPress}
                style={[styles.pill, { backgroundColor: colors.surfaceSubtle }]}>
                <View
                  style={[styles.dot, { backgroundColor: todo.linkedCard.columnAccent }]}
                />
                <Text style={[styles.pillText, { color: colors.muted }]} numberOfLines={1}>
                  {todo.linkedCard.columnTitle}
                </Text>
              </Pressable>
            ) : null}

            {hasNotes ? (
              <Pressable
                onPress={onPress}
                style={[styles.pill, { backgroundColor: colors.surfaceSubtle }]}>
                <AppIcon name="alignLeft" size={11} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <View
          pointerEvents={showActions ? 'auto' : 'none'}
          style={[
            styles.rowActions,
            isDesktop ? (showActions ? styles.actionsVisible : styles.actionsHidden) : null,
          ]}>
          <View ref={actionsBtnRef} collapsable={false}>
            <RipplePressable
              accessibilityLabel="Действия с задачей"
              hitSlop={4}
              onPress={openActionsMenu}
              style={StyleSheet.flatten([
                styles.actionBtn,
                actionsMenuOpen ? { backgroundColor: colors.surfaceActive } : null,
              ])}>
              <AppIcon
                name="more"
                size="sm"
                color={actionsMenuOpen ? colors.text : colors.muted}
              />
            </RipplePressable>
          </View>

          {isDesktop ? (
            <RipplePressable
              accessibilityLabel="Удалить задачу"
              hitSlop={4}
              onPress={onDelete}
              style={styles.actionBtn}>
              <AppIcon name="close" size="sm" color={colors.muted} />
            </RipplePressable>
          ) : null}
        </View>
      </WebDragBox>

      {dropIndicator === 'after' ? (
        <View pointerEvents="none" style={[styles.dropLineWrap, styles.dropLineAfter]}>
          <View style={styles.dropDot} />
          <View style={styles.dropLine} />
        </View>
      ) : null}

      {/* Floating Priority Picker Popover */}
      <AnchoredPopover
        visible={priorityMenuOpen}
        anchor={priorityAnchor}
        width={176}
        estimatedHeight={124}
        align="left"
        colors={colors}
        onClose={() => setPriorityMenuOpen(false)}>
        <View style={styles.popoverList}>
          {PRIORITIES.map((item) => {
            const meta = PRIORITY_META[item];
            const selected = todo.priority === item;
            return (
              <Pressable
                key={item}
                onPress={() => {
                  setPriorityMenuOpen(false);
                  if (item !== todo.priority) {
                    onQuickUpdate({ priority: item });
                  }
                }}
                style={({ hovered: rowHovered }: { hovered?: boolean }) => [
                  styles.popoverRow,
                  selected
                    ? { backgroundColor: colors.surfaceActive }
                    : rowHovered
                      ? { backgroundColor: colors.surfaceSubtle }
                      : null,
                ]}>
                <View style={[styles.dot, { backgroundColor: meta.dotColor }]} />
                <Text style={[styles.popoverLabel, { color: colors.text }]}>{meta.label}</Text>
                {selected ? <AppIcon name="check" size="xs" color={colors.text} /> : null}
              </Pressable>
            );
          })}
        </View>
      </AnchoredPopover>

      {/* Floating Quick Actions Popover */}
      <AnchoredPopover
        visible={actionsMenuOpen}
        anchor={actionsAnchor}
        width={232}
        estimatedHeight={320}
        align="right"
        colors={colors}
        onClose={() => setActionsMenuOpen(false)}>
        <View style={styles.popoverBody}>
          {/* Priority */}
          <View style={[styles.popoverSection, { borderBottomColor: colors.line }]}>
            <Text style={[styles.popoverCaption, { color: colors.muted }]}>Приоритет</Text>
            <View style={styles.quickChipRow}>
              {PRIORITIES.map((item) => {
                const meta = PRIORITY_META[item];
                const selected = todo.priority === item;
                return (
                  <RipplePressable
                    key={item}
                    onPress={() => {
                      onQuickUpdate({ priority: item });
                      setActionsMenuOpen(false);
                    }}
                    style={StyleSheet.flatten([
                      styles.quickChip,
                      { backgroundColor: selected ? colors.accent : colors.surfaceSubtle },
                    ])}>
                    <View style={[styles.dot, { backgroundColor: meta.dotColor }]} />
                    <Text
                      style={[
                        styles.quickChipText,
                        { color: selected ? colors.accentText : colors.text },
                      ]}>
                      {meta.shortLabel}
                    </Text>
                  </RipplePressable>
                );
              })}
            </View>
          </View>

          {/* Move to List */}
          {lists.length > 0 ? (
            <View style={[styles.popoverSection, { borderBottomColor: colors.line }]}>
              <Text style={[styles.popoverCaption, { color: colors.muted }]}>Список</Text>
              <View style={styles.popoverList}>
                {lists.map((item) => {
                  const selected = todo.listId === item.id;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => {
                        setActionsMenuOpen(false);
                        if (!selected) {
                          onQuickUpdate({ listId: item.id });
                        }
                      }}
                      style={({ hovered: rowHovered }: { hovered?: boolean }) => [
                        styles.popoverRow,
                        selected
                          ? { backgroundColor: colors.surfaceActive }
                          : rowHovered
                            ? { backgroundColor: colors.surfaceSubtle }
                            : null,
                      ]}>
                      <AppIcon name="list" size="xs" color={colors.muted} />
                      <Text
                        style={[styles.popoverLabel, { color: colors.text }]}
                        numberOfLines={1}>
                        {item.title}
                      </Text>
                      {selected ? <AppIcon name="check" size="xs" color={colors.text} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* Quick Due Date */}
          <View style={[styles.popoverSection, { borderBottomColor: colors.line }]}>
            <Text style={[styles.popoverCaption, { color: colors.muted }]}>Срок</Text>
            <View style={styles.quickChipRow}>
              {[
                { label: 'Сегодня', value: addDaysDateKey(0) },
                { label: 'Завтра', value: addDaysDateKey(1) },
                { label: '+3д', value: addDaysDateKey(3) },
              ].map((preset) => {
                const selected = todo.dueDate === preset.value;
                return (
                  <RipplePressable
                    key={preset.label}
                    onPress={() => {
                      onQuickUpdate({ dueDate: preset.value });
                      setActionsMenuOpen(false);
                    }}
                    style={StyleSheet.flatten([
                      styles.quickChip,
                      { backgroundColor: selected ? colors.accent : colors.surfaceSubtle },
                    ])}>
                    <Text
                      style={[
                        styles.quickChipText,
                        { color: selected ? colors.accentText : colors.text },
                      ]}>
                      {preset.label}
                    </Text>
                  </RipplePressable>
                );
              })}
              {todo.dueDate ? (
                <RipplePressable
                  accessibilityLabel="Убрать срок"
                  onPress={() => {
                    onQuickUpdate({ dueDate: null });
                    setActionsMenuOpen(false);
                  }}
                  style={StyleSheet.flatten([
                    styles.quickIconChip,
                    { backgroundColor: colors.surfaceSubtle },
                  ])}>
                  <AppIcon name="close" size="xs" color={colors.muted} />
                </RipplePressable>
              ) : null}
            </View>
          </View>

          <View style={styles.popoverList}>
            <Pressable
              onPress={() => {
                setActionsMenuOpen(false);
                onPress();
              }}
              style={({ hovered: rowHovered }: { hovered?: boolean }) => [
                styles.popoverRow,
                rowHovered ? { backgroundColor: colors.surfaceSubtle } : null,
              ]}>
              <AppIcon name="edit" size="xs" color={colors.muted} />
              <Text style={[styles.popoverLabel, { color: colors.text }]}>Открыть детали</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setActionsMenuOpen(false);
                onDelete();
              }}
              style={({ hovered: rowHovered }: { hovered?: boolean }) => [
                styles.popoverRow,
                rowHovered ? { backgroundColor: colors.dangerBg } : null,
              ]}>
              <AppIcon name="trash" size="xs" color={colors.danger} />
              <Text style={[styles.popoverLabel, { color: colors.danger }]}>Удалить задачу</Text>
            </Pressable>
          </View>
        </View>
      </AnchoredPopover>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
  dragging: {
    opacity: 0.35,
  },
  dropLineWrap: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 6,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 20,
  },
  dropLineBefore: {
    top: -3,
  },
  dropLineAfter: {
    bottom: -3,
  },
  dropDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: DROP_BLUE,
    marginRight: -1,
  },
  dropLine: {
    flex: 1,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: DROP_BLUE,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'grab',
          userSelect: 'none',
          transition: 'background-color 120ms ease',
        } as object)
      : null),
  },
  gripSlot: {
    width: 14,
    paddingTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({ transition: 'opacity 120ms ease' } as object)
      : null),
  },
  gripVisible: {
    opacity: 0.85,
  },
  gripHidden: {
    opacity: 0,
  },
  checkHit: {
    paddingTop: 2,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.75,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({ transition: 'background-color 120ms ease, border-color 120ms ease' } as object)
      : null),
  },
  mainCol: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  titleHit: {
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
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
    gap: 5,
  },
  priorityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
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
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    ...(Platform.OS === 'web'
      ? ({ transition: 'opacity 120ms ease' } as object)
      : null),
  },
  actionsVisible: {
    opacity: 1,
  },
  actionsHidden: {
    opacity: 0,
  },
  actionBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  popoverBody: {
    gap: 4,
  },
  popoverSection: {
    paddingHorizontal: 4,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  popoverCaption: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 4,
  },
  popoverList: {
    gap: 2,
  },
  popoverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 7,
    ...(Platform.OS === 'web'
      ? ({ cursor: 'pointer', transition: 'background-color 110ms ease' } as object)
      : null),
  },
  popoverLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  quickChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 2,
  },
  quickChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 7,
  },
  quickIconChip: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
