import { type ComponentRef, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import {
  AnchoredPopover,
  type AnchorRect,
  measureAnchor,
} from '@/components/anchored-popover';
import { AppIcon } from '@/components/app-icon';
import { RipplePressable } from '@/components/ripple-pressable';
import { WebDragBox, type WebDomDragEvent } from '@/components/web-drag-box';
import {
  addDaysDateKey,
  formatDueDateLabel,
  getBoardColorDisplayName,
  hexWithAlpha,
  type KanbanBoardColorRecord,
  type KanbanCardRecord,
  type KanbanColumnRecord,
  type KanbanPriority,
  PRIORITY_META,
} from '@/features/kanban/types';
import { type ThemeColors } from '@/theme/colors';

export type CardDropPosition = 'before' | 'after';

const DROP_BLUE = '#2383E2';
const PRIORITIES: readonly KanbanPriority[] = ['high', 'medium', 'low'];

type Props = {
  card: KanbanCardRecord;
  columns: KanbanColumnRecord[];
  boardColors: KanbanBoardColorRecord[];
  colors: ThemeColors;
  isDesktop: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  isDragging: boolean;
  isCardDragActive: boolean;
  dropIndicator: CardDropPosition | null;
  onPress: () => void;
  onMoveColumnStep: (direction: -1 | 1) => void;
  onMoveToColumn: (columnId: string) => void;
  onReorderStep: (direction: -1 | 1) => void;
  onQuickUpdate: (patch: {
    priority?: KanbanPriority;
    dueDate?: string | null;
    colorId?: string | null;
  }) => void;
  onDelete: () => void;
  onDragStart?: (cardId: string) => void;
  onDragEnd?: () => void;
  onDragOverCard?: (cardId: string, position: CardDropPosition) => void;
  onDropOnCard?: (draggedCardId: string, targetCardId: string, position: CardDropPosition) => void;
};

export function KanbanCardItem({
  card,
  columns,
  boardColors,
  colors,
  isDesktop,
  canMoveLeft,
  canMoveRight,
  canMoveUp,
  canMoveDown,
  isDragging,
  isCardDragActive,
  dropIndicator,
  onPress,
  onMoveColumnStep,
  onMoveToColumn,
  onReorderStep,
  onQuickUpdate,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOverCard,
  onDropOnCard,
}: Props) {
  const [hovered, setHovered] = useState(false);
  const [priorityMenuOpen, setPriorityMenuOpen] = useState(false);
  const [priorityAnchor, setPriorityAnchor] = useState<AnchorRect | null>(null);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [actionsAnchor, setActionsAnchor] = useState<AnchorRect | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const priorityBtnRef = useRef<ComponentRef<typeof View>>(null);
  const actionsBtnRef = useRef<ComponentRef<typeof View>>(null);

  const dueInfo = formatDueDateLabel(card.dueDate);
  const totalSubtasks = card.subtasks.length;
  const doneSubtasks = card.subtasks.filter((item) => item.isDone).length;
  const hasDescription = card.description.trim().length > 0;
  const priorityMeta = PRIORITY_META[card.priority];
  const cardColor = card.colorId
    ? (boardColors.find((item) => item.id === card.colorId) ?? null)
    : null;
  const cardColorName = cardColor?.name.trim() ?? '';
  const showDesktopHoverBar = isDesktop && (hovered || actionsMenuOpen) && !isDragging;

  function resolveVerticalPosition(event: WebDomDragEvent): CardDropPosition {
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
    setConfirmDelete(false);
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
      entering={FadeInDown.duration(170)}
      exiting={FadeOut.duration(130)}
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
            event.dataTransfer.setData('text/sotaq-kanban-card', card.id);
            event.dataTransfer.setData('text/plain', card.id);
            event.dataTransfer.effectAllowed = 'move';
          }
          onDragStart?.(card.id);
        }}
        onDragEnd={() => {
          onDragEnd?.();
        }}
        onDragOver={(event) => {
          if (!isCardDragActive || isDragging) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
          }
          onDragOverCard?.(card.id, resolveVerticalPosition(event));
        }}
        onDrop={(event) => {
          if (!isCardDragActive) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          const droppedId =
            event.dataTransfer?.getData('text/sotaq-kanban-card') ||
            event.dataTransfer?.getData('text/plain') ||
            '';
          if (droppedId && droppedId !== card.id) {
            onDropOnCard?.(droppedId, card.id, dropIndicator ?? resolveVerticalPosition(event));
          } else {
            onDragEnd?.();
          }
        }}
        style={[
          styles.card,
          cardColor
            ? {
                backgroundColor: hovered
                  ? hexWithAlpha(cardColor.color, 0.22)
                  : hexWithAlpha(cardColor.color, 0.14),
                borderColor:
                  hovered || actionsMenuOpen || priorityMenuOpen
                    ? hexWithAlpha(cardColor.color, 0.55)
                    : hexWithAlpha(cardColor.color, 0.3),
                borderLeftWidth: 3.5,
                borderLeftColor: cardColor.color,
              }
            : {
                backgroundColor: hovered ? colors.surfaceActive : colors.surfaceSubtle,
                borderColor:
                  hovered || actionsMenuOpen || priorityMenuOpen ? colors.line : 'transparent',
              },
        ]}>
        {/* Main clickable title area (independent sibling, never wraps buttons) */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={card.title}
          onPress={onPress}
          style={styles.titleHit}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={3}>
            {card.title}
          </Text>
        </Pressable>

        {/* Bottom Meta & Controls Row */}
        <View style={styles.footerRow}>
          <View style={styles.metaRow}>
            {cardColor && cardColorName.length > 0 ? (
              <Pressable
                onPress={onPress}
                style={[
                  styles.metaPill,
                  {
                    backgroundColor: hexWithAlpha(cardColor.color, 0.2),
                    borderColor: hexWithAlpha(cardColor.color, 0.45),
                    borderWidth: StyleSheet.hairlineWidth,
                  },
                ]}>
                <View style={[styles.priorityDot, { backgroundColor: cardColor.color }]} />
                <Text style={[styles.metaText, { color: colors.text }]} numberOfLines={1}>
                  {cardColorName}
                </Text>
              </Pressable>
            ) : null}

            {/* 1-click Priority Pill */}
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
                <View style={[styles.priorityDot, { backgroundColor: priorityMeta.dotColor }]} />
                <Text style={[styles.metaText, { color: colors.muted }]}>
                  {priorityMeta.shortLabel}
                </Text>
              </RipplePressable>
            </View>

            {dueInfo ? (
              <Pressable
                onPress={onPress}
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
                <AppIcon
                  name="calendar"
                  size={11}
                  color={
                    dueInfo.isOverdue
                      ? colors.danger
                      : dueInfo.isToday
                        ? colors.warning
                        : colors.muted
                  }
                />
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
              </Pressable>
            ) : null}

            {totalSubtasks > 0 ? (
              <Pressable
                onPress={onPress}
                style={[
                  styles.metaPill,
                  {
                    backgroundColor:
                      doneSubtasks === totalSubtasks ? colors.successBg : colors.surface,
                  },
                ]}>
                <AppIcon
                  name="check"
                  size={11}
                  color={doneSubtasks === totalSubtasks ? colors.success : colors.muted}
                />
                <Text
                  style={[
                    styles.metaText,
                    {
                      color: doneSubtasks === totalSubtasks ? colors.success : colors.muted,
                    },
                  ]}>
                  {doneSubtasks}/{totalSubtasks}
                </Text>
              </Pressable>
            ) : null}

            {hasDescription ? (
              <Pressable
                onPress={onPress}
                style={[styles.metaPill, { backgroundColor: colors.surface }]}>
                <AppIcon name="alignLeft" size={11} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>

          {/* Mobile compact column arrows & menu */}
          {!isDesktop ? (
            <View style={styles.mobileActions}>
              {canMoveLeft ? (
                <RipplePressable
                  accessibilityLabel="В предыдущую колонку"
                  hitSlop={4}
                  onPress={() => onMoveColumnStep(-1)}
                  style={StyleSheet.flatten([
                    styles.mobileActionBtn,
                    { backgroundColor: colors.surface },
                  ])}>
                  <AppIcon name="chevronLeft" size="xs" color={colors.muted} />
                </RipplePressable>
              ) : null}
              {canMoveRight ? (
                <RipplePressable
                  accessibilityLabel="В следующую колонку"
                  hitSlop={4}
                  onPress={() => onMoveColumnStep(1)}
                  style={StyleSheet.flatten([
                    styles.mobileActionBtn,
                    { backgroundColor: colors.surface },
                  ])}>
                  <AppIcon name="chevronRight" size="xs" color={colors.muted} />
                </RipplePressable>
              ) : null}
              <View ref={actionsBtnRef} collapsable={false}>
                <RipplePressable
                  accessibilityLabel="Действия с карточкой"
                  hitSlop={4}
                  onPress={openActionsMenu}
                  style={StyleSheet.flatten([
                    styles.mobileActionBtn,
                    { backgroundColor: colors.surface },
                  ])}>
                  <AppIcon name="more" size="xs" color={colors.muted} />
                </RipplePressable>
              </View>
            </View>
          ) : null}
        </View>

        {/* Desktop Web Floating Quick-Move Bar on Hover (zero layout shift!) */}
        {isDesktop ? (
          <View
            pointerEvents={showDesktopHoverBar ? 'auto' : 'none'}
            style={[
              styles.hoverToolbar,
              {
                backgroundColor: colors.surface,
                borderColor: colors.line,
              },
              showDesktopHoverBar ? styles.hoverToolbarVisible : styles.hoverToolbarHidden,
            ]}>
            {canMoveUp ? (
              <RipplePressable
                accessibilityLabel="Поднять выше"
                onPress={() => onReorderStep(-1)}
                style={styles.hoverBtn}>
                <AppIcon name="arrowUp" size={13} color={colors.muted} />
              </RipplePressable>
            ) : null}
            {canMoveDown ? (
              <RipplePressable
                accessibilityLabel="Опустить ниже"
                onPress={() => onReorderStep(1)}
                style={styles.hoverBtn}>
                <AppIcon name="arrowDown" size={13} color={colors.muted} />
              </RipplePressable>
            ) : null}
            {canMoveLeft ? (
              <RipplePressable
                accessibilityLabel="В левую колонку"
                onPress={() => onMoveColumnStep(-1)}
                style={styles.hoverBtn}>
                <AppIcon name="chevronLeft" size={14} color={colors.muted} />
              </RipplePressable>
            ) : null}
            {canMoveRight ? (
              <RipplePressable
                accessibilityLabel="В правую колонку"
                onPress={() => onMoveColumnStep(1)}
                style={styles.hoverBtn}>
                <AppIcon name="chevronRight" size={14} color={colors.muted} />
              </RipplePressable>
            ) : null}
            <View ref={actionsBtnRef} collapsable={false}>
              <RipplePressable
                accessibilityLabel="Быстрые действия"
                onPress={openActionsMenu}
                style={StyleSheet.flatten([
                  styles.hoverBtn,
                  actionsMenuOpen ? { backgroundColor: colors.surfaceActive } : null,
                ])}>
                <AppIcon
                  name="more"
                  size={14}
                  color={actionsMenuOpen ? colors.text : colors.muted}
                />
              </RipplePressable>
            </View>
          </View>
        ) : null}
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
            const selected = card.priority === item;
            return (
              <Pressable
                key={item}
                onPress={() => {
                  setPriorityMenuOpen(false);
                  if (item !== card.priority) {
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
                <View style={[styles.priorityDot, { backgroundColor: meta.dotColor }]} />
                <Text style={[styles.popoverLabel, { color: colors.text }]}>{meta.label}</Text>
                {selected ? <AppIcon name="check" size="xs" color={colors.text} /> : null}
              </Pressable>
            );
          })}
        </View>
      </AnchoredPopover>

      {/* Floating Card Quick Actions Popover (Color, Priority, Column, Due Date, Reorder, Delete) */}
      <AnchoredPopover
        visible={actionsMenuOpen}
        anchor={actionsAnchor}
        width={244}
        estimatedHeight={boardColors.length > 0 ? 410 : 340}
        align="right"
        colors={colors}
        onClose={() => {
          setActionsMenuOpen(false);
          setConfirmDelete(false);
        }}>
        <View style={styles.popoverBody}>
          {/* Quick Board Color / Project Picker */}
          {boardColors.length > 0 ? (
            <View style={[styles.popoverSection, { borderBottomColor: colors.line }]}>
              <Text style={[styles.popoverCaption, { color: colors.muted }]}>Цвет / Проект</Text>
              <View style={styles.quickChipRow}>
                {boardColors.map((item) => {
                  const selected = card.colorId === item.id;
                  return (
                    <RipplePressable
                      key={item.id}
                      onPress={() => {
                        onQuickUpdate({ colorId: selected ? null : item.id });
                        setActionsMenuOpen(false);
                      }}
                      style={StyleSheet.flatten([
                        styles.quickChip,
                        {
                          backgroundColor: selected
                            ? hexWithAlpha(item.color, 0.28)
                            : colors.surfaceSubtle,
                          borderWidth: StyleSheet.hairlineWidth,
                          borderColor: selected ? item.color : 'transparent',
                        },
                      ])}>
                      <View style={[styles.priorityDot, { backgroundColor: item.color }]} />
                      <Text
                        style={[styles.quickChipText, { color: colors.text }]}
                        numberOfLines={1}>
                        {getBoardColorDisplayName(item)}
                      </Text>
                    </RipplePressable>
                  );
                })}
                {card.colorId ? (
                  <RipplePressable
                    accessibilityLabel="Убрать цвет"
                    onPress={() => {
                      onQuickUpdate({ colorId: null });
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
          ) : null}

          {/* Quick Priority Row */}
          <View style={[styles.popoverSection, { borderBottomColor: colors.line }]}>
            <Text style={[styles.popoverCaption, { color: colors.muted }]}>Приоритет</Text>
            <View style={styles.quickChipRow}>
              {PRIORITIES.map((item) => {
                const meta = PRIORITY_META[item];
                const selected = card.priority === item;
                return (
                  <RipplePressable
                    key={item}
                    onPress={() => {
                      onQuickUpdate({ priority: item });
                      setActionsMenuOpen(false);
                    }}
                    style={StyleSheet.flatten([
                      styles.quickChip,
                      {
                        backgroundColor: selected ? colors.accent : colors.surfaceSubtle,
                      },
                    ])}>
                    <View style={[styles.priorityDot, { backgroundColor: meta.dotColor }]} />
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

          {/* Move to Column */}
          <View style={[styles.popoverSection, { borderBottomColor: colors.line }]}>
            <Text style={[styles.popoverCaption, { color: colors.muted }]}>Колонка</Text>
            <View style={styles.popoverList}>
              {columns.map((col) => {
                const selected = col.id === card.columnId;
                return (
                  <Pressable
                    key={col.id}
                    onPress={() => {
                      setActionsMenuOpen(false);
                      if (!selected) {
                        onMoveToColumn(col.id);
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
                    <View style={[styles.priorityDot, { backgroundColor: col.accent }]} />
                    <Text
                      style={[styles.popoverLabel, { color: colors.text }]}
                      numberOfLines={1}>
                      {col.title}
                    </Text>
                    {selected ? <AppIcon name="check" size="xs" color={colors.text} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Quick Due Date Presets */}
          <View style={[styles.popoverSection, { borderBottomColor: colors.line }]}>
            <Text style={[styles.popoverCaption, { color: colors.muted }]}>Срок</Text>
            <View style={styles.quickChipRow}>
              {[
                { label: 'Сегодня', value: addDaysDateKey(0) },
                { label: 'Завтра', value: addDaysDateKey(1) },
                { label: '+3д', value: addDaysDateKey(3) },
              ].map((preset) => {
                const selected = card.dueDate === preset.value;
                return (
                  <RipplePressable
                    key={preset.label}
                    onPress={() => {
                      onQuickUpdate({ dueDate: preset.value });
                      setActionsMenuOpen(false);
                    }}
                    style={StyleSheet.flatten([
                      styles.quickChip,
                      {
                        backgroundColor: selected ? colors.accent : colors.surfaceSubtle,
                      },
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
              {card.dueDate ? (
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

          {/* Reorder + Details + Delete */}
          <View style={styles.popoverList}>
            {canMoveUp || canMoveDown ? (
              <View style={styles.quickChipRow}>
                <RipplePressable
                  disabled={!canMoveUp}
                  onPress={() => {
                    onReorderStep(-1);
                    setActionsMenuOpen(false);
                  }}
                  style={StyleSheet.flatten([
                    styles.quickChip,
                    { backgroundColor: colors.surfaceSubtle },
                    !canMoveUp ? styles.disabled : null,
                  ])}>
                  <AppIcon name="arrowUp" size="xs" color={colors.text} />
                  <Text style={[styles.quickChipText, { color: colors.text }]}>Выше</Text>
                </RipplePressable>
                <RipplePressable
                  disabled={!canMoveDown}
                  onPress={() => {
                    onReorderStep(1);
                    setActionsMenuOpen(false);
                  }}
                  style={StyleSheet.flatten([
                    styles.quickChip,
                    { backgroundColor: colors.surfaceSubtle },
                    !canMoveDown ? styles.disabled : null,
                  ])}>
                  <AppIcon name="arrowDown" size="xs" color={colors.text} />
                  <Text style={[styles.quickChipText, { color: colors.text }]}>Ниже</Text>
                </RipplePressable>
              </View>
            ) : null}

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
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                setActionsMenuOpen(false);
                onDelete();
              }}
              style={({ hovered: rowHovered }: { hovered?: boolean }) => [
                styles.popoverRow,
                rowHovered ? { backgroundColor: colors.dangerBg } : null,
              ]}>
              <AppIcon name="trash" size="xs" color={colors.danger} />
              <Text style={[styles.popoverLabel, { color: colors.danger }]}>
                {confirmDelete ? 'Точно удалить?' : 'Удалить карточку'}
              </Text>
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
    left: 2,
    right: 2,
    height: 6,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 20,
  },
  dropLineBefore: {
    top: -7,
  },
  dropLineAfter: {
    bottom: -7,
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
  card: {
    position: 'relative',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 9,
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'grab',
          userSelect: 'none',
          transition: 'background-color 120ms ease, border-color 120ms ease',
        } as object)
      : null),
  },
  titleHit: {
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  metaRow: {
    flex: 1,
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
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
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
  mobileActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  mobileActionBtn: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hoverToolbar: {
    position: 'absolute',
    top: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    padding: 2,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 10,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.24)',
          transition: 'opacity 120ms ease',
        } as object)
      : null),
  },
  hoverToolbarVisible: {
    opacity: 1,
  },
  hoverToolbarHidden: {
    opacity: 0,
  },
  hoverBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
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
  disabled: {
    opacity: 0.35,
  },
});
