import { type ComponentRef, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AnchoredPopover,
  type AnchorRect,
  measureAnchor,
} from '@/components/anchored-popover';
import { AppIcon } from '@/components/app-icon';
import { RipplePressable } from '@/components/ripple-pressable';
import { WebDragBox, type WebDomDragEvent } from '@/components/web-drag-box';
import {
  type CalendarItem,
  formatShortDateRu,
  getTodayDateKey,
  getTomorrowDateKey,
} from '@/features/calendar/types';
import { PRIORITY_META } from '@/features/kanban/types';
import type { ThemeColors } from '@/theme/colors';

export const CALENDAR_DRAG_MIME = 'application/x-sotaq-calendar-item';

type Props = {
  item: CalendarItem;
  colors: ThemeColors;
  compact?: boolean;
  showOverdueDate?: boolean;
  isDragging: boolean;
  onOpen: (item: CalendarItem) => void;
  onToggleDone: (item: CalendarItem) => void;
  onReschedule: (item: CalendarItem, nextDate: string | null) => void;
  onSendToFocus: (item: CalendarItem) => void;
  onDelete: (item: CalendarItem) => void;
  onDragStart: (key: string, event: WebDomDragEvent) => void;
  onDragEnd: () => void;
};

export function CalendarItemChip({
  item,
  colors,
  compact = false,
  showOverdueDate = false,
  isDragging,
  onOpen,
  onToggleDone,
  onReschedule,
  onSendToFocus,
  onDelete,
  onDragStart,
  onDragEnd,
}: Props) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<AnchorRect | null>(null);
  const menuBtnRef = useRef<ComponentRef<typeof View>>(null);

  const todayKey = getTodayDateKey();
  const tomorrowKey = getTomorrowDateKey();
  const isOverdue = !item.isDone && Boolean(item.dueDate) && (item.dueDate ?? '') < todayKey;
  const showMenuBtn = !compact && (Platform.OS !== 'web' || hovered || menuOpen);

  return (
    <>
      <WebDragBox
        draggable={Platform.OS === 'web'}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onDragStart={(event) => {
          event.stopPropagation();
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData(CALENDAR_DRAG_MIME, item.key);
            event.dataTransfer.setData('text/plain', item.key);
          }
          onDragStart(item.key, event);
        }}
        onDragEnd={() => onDragEnd()}
        style={[
          compact ? styles.monthChip : styles.weekChip,
          {
            backgroundColor: hovered ? colors.surfaceActive : colors.surfaceSubtle,
            borderColor: hovered ? colors.muted : colors.line,
          },
          item.isDone ? styles.itemDone : null,
          isDragging ? styles.dragging : null,
          Platform.OS === 'web' ? styles.draggable : null,
        ]}>
        <View style={styles.topRow}>
          {item.kind === 'todo' ? (
            <Pressable
              accessibilityLabel={item.isDone ? 'Снять отметку' : 'Отметить выполненной'}
              hitSlop={5}
              onPress={() => onToggleDone(item)}
              style={[
                styles.miniCheck,
                {
                  borderColor: item.isDone ? colors.success : colors.muted,
                  backgroundColor: item.isDone ? colors.success : 'transparent',
                },
              ]}>
              {item.isDone ? (
                <AppIcon name="check" size={9} color="#FFFFFF" strokeWidth={2.8} />
              ) : null}
            </Pressable>
          ) : (
            <View style={styles.kanbanIconWrap}>
              <AppIcon name="kanban" size={11} color={item.accentColor} />
            </View>
          )}

          <Pressable
            onPress={() => onOpen(item)}
            style={({ pressed }) => [styles.titleHit, pressed ? styles.pressed : null]}>
            <Text
              style={[
                compact ? styles.monthTitle : styles.weekTitle,
                { color: colors.text },
                item.isDone ? styles.strike : null,
              ]}
              numberOfLines={compact ? 1 : 2}>
              {item.title}
            </Text>
          </Pressable>

          {!compact ? (
            <View
              ref={menuBtnRef}
              collapsable={false}
              style={[styles.menuBtnWrap, { opacity: showMenuBtn ? 1 : 0 }]}>
              <RipplePressable
                accessibilityLabel="Действия"
                onPress={() => {
                  measureAnchor(menuBtnRef.current, (rect) => {
                    setMenuAnchor(rect);
                    setMenuOpen(true);
                  });
                }}
                style={styles.menuBtn}>
                <AppIcon name="more" size={12} color={colors.muted} />
              </RipplePressable>
            </View>
          ) : null}
        </View>

        {!compact ? (
          <View style={styles.metaRow}>
            <View
              style={[
                styles.priorityDot,
                {
                  backgroundColor: isOverdue
                    ? colors.danger
                    : PRIORITY_META[item.priority].dotColor,
                },
              ]}
            />
            <Text style={[styles.badgeText, { color: colors.muted }]} numberOfLines={1}>
              {item.badgeLabel}
            </Text>
            {showOverdueDate && item.dueDate ? (
              <Text style={[styles.overdueDateText, { color: colors.danger }]}>
                {formatShortDateRu(item.dueDate)}
              </Text>
            ) : null}
          </View>
        ) : null}
      </WebDragBox>

      <AnchoredPopover
        visible={menuOpen}
        anchor={menuAnchor}
        width={196}
        estimatedHeight={230}
        align="right"
        colors={colors}
        onClose={() => setMenuOpen(false)}>
        <View style={styles.popoverBody}>
          <RipplePressable
            onPress={() => {
              setMenuOpen(false);
              onOpen(item);
            }}
            style={styles.menuRow}>
            <AppIcon name="edit" size="xs" color={colors.muted} />
            <Text style={[styles.menuRowText, { color: colors.text }]}>Открыть</Text>
          </RipplePressable>

          {item.dueDate !== todayKey ? (
            <RipplePressable
              onPress={() => {
                setMenuOpen(false);
                onReschedule(item, todayKey);
              }}
              style={styles.menuRow}>
              <AppIcon name="sun" size="xs" color={colors.muted} />
              <Text style={[styles.menuRowText, { color: colors.text }]}>На сегодня</Text>
            </RipplePressable>
          ) : null}

          {item.dueDate !== tomorrowKey ? (
            <RipplePressable
              onPress={() => {
                setMenuOpen(false);
                onReschedule(item, tomorrowKey);
              }}
              style={styles.menuRow}>
              <AppIcon name="calendar" size="xs" color={colors.muted} />
              <Text style={[styles.menuRowText, { color: colors.text }]}>На завтра</Text>
            </RipplePressable>
          ) : null}

          {item.dueDate !== null ? (
            <RipplePressable
              onPress={() => {
                setMenuOpen(false);
                onReschedule(item, null);
              }}
              style={styles.menuRow}>
              <AppIcon name="close" size="xs" color={colors.muted} />
              <Text style={[styles.menuRowText, { color: colors.text }]}>Убрать срок</Text>
            </RipplePressable>
          ) : null}

          {!item.isDone ? (
            <>
              <View style={[styles.menuDivider, { backgroundColor: colors.line }]} />
              <RipplePressable
                onPress={() => {
                  setMenuOpen(false);
                  onSendToFocus(item);
                }}
                style={styles.menuRow}>
                <AppIcon name="timer" size="xs" color={colors.muted} />
                <Text style={[styles.menuRowText, { color: colors.text }]}>В фокус-таймер</Text>
              </RipplePressable>
            </>
          ) : null}

          <View style={[styles.menuDivider, { backgroundColor: colors.line }]} />

          <RipplePressable
            onPress={() => {
              setMenuOpen(false);
              onDelete(item);
            }}
            style={styles.menuRow}>
            <AppIcon name="trash" size="xs" color={colors.danger} />
            <Text style={[styles.menuRowText, { color: colors.danger }]}>Удалить</Text>
          </RipplePressable>
        </View>
      </AnchoredPopover>
    </>
  );
}

const styles = StyleSheet.create({
  weekChip: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 9,
    paddingVertical: 8,
    gap: 5,
    ...(Platform.OS === 'web'
      ? ({ transition: 'background-color 120ms ease, border-color 120ms ease' } as object)
      : null),
  },
  monthChip: {
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 6,
    paddingVertical: 4,
    ...(Platform.OS === 'web'
      ? ({ transition: 'background-color 120ms ease, border-color 120ms ease' } as object)
      : null),
  },
  draggable: {
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'grab',
          userSelect: 'none',
        } as object)
      : null),
  },
  dragging: {
    opacity: 0.35,
  },
  itemDone: {
    opacity: 0.52,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  miniCheck: {
    width: 14,
    height: 14,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  kanbanIconWrap: {
    marginTop: 2,
    flexShrink: 0,
  },
  titleHit: {
    flex: 1,
    minWidth: 0,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  pressed: {
    opacity: 0.72,
  },
  weekTitle: {
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 16.5,
  },
  monthTitle: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
  strike: {
    textDecorationLine: 'line-through',
  },
  menuBtnWrap: {
    flexShrink: 0,
    marginTop: -2,
    marginRight: -3,
  },
  menuBtn: {
    width: 20,
    height: 20,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 20,
  },
  priorityDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    flexShrink: 0,
  },
  badgeText: {
    flex: 1,
    fontSize: 10.5,
    fontWeight: '500',
  },
  overdueDateText: {
    fontSize: 10,
    fontWeight: '700',
    flexShrink: 0,
  },
  popoverBody: {
    gap: 2,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 7,
  },
  menuRowText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '500',
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 3,
    marginHorizontal: 6,
  },
});
