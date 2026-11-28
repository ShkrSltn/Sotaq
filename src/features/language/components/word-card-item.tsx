import { type ComponentRef, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import {
  AnchoredPopover,
  type AnchorRect,
  measureAnchor,
} from '@/components/anchored-popover';
import { AppIcon } from '@/components/app-icon';
import { RipplePressable } from '@/components/ripple-pressable';
import { WebDragBox, type WebDomDragEvent } from '@/components/web-drag-box';
import {
  VOCAB_STATUS_META,
  VOCAB_STATUS_ORDER,
  type VocabStatus,
  type VocabWordRecord,
} from '@/features/language/types';
import type { ThemeColors } from '@/theme/colors';

const DROP_BLUE = '#3B82F6';
export const WORD_DRAG_MIME = 'application/x-sotaq-vocab-word';

type Props = {
  word: VocabWordRecord;
  languageCode: string;
  speakingId: string | null;
  colors: ThemeColors;
  isDesktop: boolean;
  canDrag: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  isDragging: boolean;
  dropIndicator: 'before' | 'after' | null;
  onSpeak: (id: string, text: string, langCode: string, rate?: number) => void;
  onOpen: (wordId: string) => void;
  onChangeStatus: (word: VocabWordRecord, status: VocabStatus) => void;
  onGenerateExamples: (word: VocabWordRecord) => void;
  onMoveByOffset: (wordId: string, delta: -1 | 1) => void;
  onDelete: (wordId: string) => void;
  onDragStart: (wordId: string, event: WebDomDragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (wordId: string, position: 'before' | 'after') => void;
  onDragLeave: (wordId: string) => void;
  onDropWord: (draggedWordId: string, targetWordId: string, position: 'before' | 'after') => void;
};

export function WordCardItem({
  word,
  languageCode,
  speakingId,
  colors,
  isDesktop,
  canDrag,
  canMoveUp,
  canMoveDown,
  isDragging,
  dropIndicator,
  onSpeak,
  onOpen,
  onChangeStatus,
  onGenerateExamples,
  onMoveByOffset,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDropWord,
}: Props) {
  const [hovered, setHovered] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [statusMenuAnchor, setStatusMenuAnchor] = useState<AnchorRect | null>(null);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [actionsMenuAnchor, setActionsMenuAnchor] = useState<AnchorRect | null>(null);

  const statusBtnRef = useRef<ComponentRef<typeof View>>(null);
  const actionsBtnRef = useRef<ComponentRef<typeof View>>(null);

  const statusColors =
    word.status === 'known'
      ? { bg: colors.successBg, fg: colors.success }
      : word.status === 'learning'
        ? { bg: colors.warningBg, fg: colors.warning }
        : { bg: colors.surfaceSubtle, fg: colors.muted };

  function resolveDropPosition(event: WebDomDragEvent): 'before' | 'after' {
    const el = event.currentTarget as HTMLElement | null;
    if (!el || typeof el.getBoundingClientRect !== 'function') {
      return 'after';
    }
    const rect = el.getBoundingClientRect();
    return event.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
  }

  function handleWebDragOver(event: WebDomDragEvent) {
    if (!canDrag) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    onDragOver(word.id, resolveDropPosition(event));
  }

  function handleWebDrop(event: WebDomDragEvent) {
    if (!canDrag) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const draggedId =
      event.dataTransfer?.getData(WORD_DRAG_MIME) ||
      event.dataTransfer?.getData('text/plain') ||
      '';
    if (!draggedId || draggedId === word.id) {
      return;
    }
    onDropWord(draggedId, word.id, resolveDropPosition(event));
  }

  const showControls = !isDesktop || hovered || actionsMenuOpen || statusMenuOpen;

  return (
    <Animated.View
      entering={FadeInDown.duration(140)}
      layout={LinearTransition.springify().damping(24).stiffness(260)}
      style={[
        styles.wrap,
        isDesktop ? styles.wrapDesktop : styles.wrapMobile,
        isDragging ? styles.dragging : null,
      ]}>
      {dropIndicator === 'before' ? (
        <View pointerEvents="none" style={[styles.dropLineWrap, styles.dropLineBefore]}>
          <View style={styles.dropDot} />
          <View style={styles.dropLine} />
        </View>
      ) : null}

      <WebDragBox
        draggable={Platform.OS === 'web' && canDrag}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onDragStart={(event) => {
          event.stopPropagation();
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData(WORD_DRAG_MIME, word.id);
            event.dataTransfer.setData('text/plain', word.id);
          }
          onDragStart(word.id, event);
        }}
        onDragEnd={() => onDragEnd()}
        onDragOver={handleWebDragOver}
        onDragLeave={() => onDragLeave(word.id)}
        onDrop={handleWebDrop}
        style={[
          styles.card,
          {
            backgroundColor: hovered ? colors.surfaceSubtle : colors.surface,
            borderColor: hovered ? colors.muted : colors.line,
          },
          Platform.OS === 'web' && canDrag ? styles.cardWebDraggable : null,
        ]}>
        {/* Top Row: non-nested sibling clickable title + status/menu controls */}
        <View style={styles.topRow}>
          <Pressable
            onPress={() => onOpen(word.id)}
            style={({ pressed }) => [
              styles.titlePressArea,
              pressed ? styles.pressed : null,
            ]}>
            <View style={styles.termRow}>
              {Platform.OS === 'web' && canDrag ? (
                <View style={[styles.gripWrap, { opacity: hovered ? 0.75 : 0.25 }]}>
                  <AppIcon name="grip" size="xs" color={colors.muted} />
                </View>
              ) : null}
              <Text style={[styles.term, { color: colors.text }]} numberOfLines={1}>
                {word.term}
              </Text>
            </View>
            {word.reading || word.partOfSpeech ? (
              <Text style={[styles.reading, { color: colors.muted }]} numberOfLines={1}>
                {[word.reading, word.partOfSpeech].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </Pressable>

          <View style={styles.topActions}>
            <RipplePressable
              accessibilityLabel="Озвучить слово"
              onPress={() => onSpeak(`word-${word.id}`, word.term, languageCode)}
              style={StyleSheet.flatten([
                styles.speakBtn,
                {
                  backgroundColor:
                    speakingId === `word-${word.id}` ? colors.accent : 'transparent',
                },
              ])}>
              <AppIcon
                name="volume"
                size="xs"
                color={speakingId === `word-${word.id}` ? colors.accentText : colors.muted}
              />
            </RipplePressable>

            <View ref={statusBtnRef} collapsable={false}>
              <RipplePressable
                accessibilityLabel="Сменить статус слова"
                onPress={() => {
                  measureAnchor(statusBtnRef.current, (rect) => {
                    setStatusMenuAnchor(rect);
                    setStatusMenuOpen(true);
                  });
                }}
                style={StyleSheet.flatten([
                  styles.statusBadge,
                  { backgroundColor: statusColors.bg },
                ])}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: VOCAB_STATUS_META[word.status].dotColor },
                  ]}
                />
                <Text style={[styles.statusBadgeText, { color: statusColors.fg }]}>
                  {VOCAB_STATUS_META[word.status].label}
                </Text>
              </RipplePressable>
            </View>

            <View
              ref={actionsBtnRef}
              collapsable={false}
              style={{ opacity: showControls ? 1 : 0 }}>
              <RipplePressable
                accessibilityLabel="Действия со словом"
                onPress={() => {
                  measureAnchor(actionsBtnRef.current, (rect) => {
                    setActionsMenuAnchor(rect);
                    setActionsMenuOpen(true);
                  });
                }}
                style={StyleSheet.flatten([
                  styles.moreBtn,
                  { backgroundColor: actionsMenuOpen ? colors.surfaceActive : 'transparent' },
                ])}>
                <AppIcon name="more" size="xs" color={colors.muted} />
              </RipplePressable>
            </View>
          </View>
        </View>

        {/* Body & Footer: clickable area to open WordDetailModal */}
        <Pressable
          onPress={() => onOpen(word.id)}
          style={({ pressed }) => [styles.bodyPressArea, pressed ? styles.pressed : null]}>
          <Text
            style={[
              styles.translation,
              { color: word.translation ? colors.text : colors.muted },
            ]}
            numberOfLines={2}>
            {word.translation || 'Без перевода — нажмите, чтобы заполнить'}
          </Text>

          <View style={styles.footer}>
            <Text style={[styles.meta, { color: colors.muted }]}>
              {word.examples.length > 0
                ? `Примеров: ${word.examples.length}`
                : 'Без примеров'}
            </Text>
            <View style={[styles.openHint, { opacity: hovered ? 1 : 0.65 }]}>
              <Text style={[styles.meta, { color: colors.muted }]}>Открыть</Text>
              <AppIcon name="arrowRight" size="xs" color={colors.muted} />
            </View>
          </View>
        </Pressable>
      </WebDragBox>

      {dropIndicator === 'after' ? (
        <View pointerEvents="none" style={[styles.dropLineWrap, styles.dropLineAfter]}>
          <View style={styles.dropDot} />
          <View style={styles.dropLine} />
        </View>
      ) : null}

      {/* Floating Status Picker Popover */}
      <AnchoredPopover
        visible={statusMenuOpen}
        anchor={statusMenuAnchor}
        width={168}
        estimatedHeight={140}
        align="right"
        colors={colors}
        onClose={() => setStatusMenuOpen(false)}>
        <View style={styles.popoverBody}>
          {VOCAB_STATUS_ORDER.map((statusItem) => {
            const active = word.status === statusItem;
            const meta = VOCAB_STATUS_META[statusItem];
            return (
              <RipplePressable
                key={statusItem}
                onPress={() => {
                  setStatusMenuOpen(false);
                  if (statusItem !== word.status) {
                    onChangeStatus(word, statusItem);
                  }
                }}
                style={StyleSheet.flatten([
                  styles.menuRow,
                  active ? { backgroundColor: colors.surfaceActive } : null,
                ])}>
                <View style={[styles.statusDot, { backgroundColor: meta.dotColor }]} />
                <Text style={[styles.menuRowText, { color: colors.text }]}>{meta.label}</Text>
                {active ? <AppIcon name="check" size="xs" color={colors.text} /> : null}
              </RipplePressable>
            );
          })}
        </View>
      </AnchoredPopover>

      {/* Floating Actions Popover */}
      <AnchoredPopover
        visible={actionsMenuOpen}
        anchor={actionsMenuAnchor}
        width={216}
        estimatedHeight={230}
        align="right"
        colors={colors}
        onClose={() => setActionsMenuOpen(false)}>
        <View style={styles.popoverBody}>
          <RipplePressable
            onPress={() => {
              setActionsMenuOpen(false);
              onOpen(word.id);
            }}
            style={styles.menuRow}>
            <AppIcon name="edit" size="xs" color={colors.muted} />
            <Text style={[styles.menuRowText, { color: colors.text }]}>Открыть карточку</Text>
          </RipplePressable>

          <RipplePressable
            onPress={() => {
              setActionsMenuOpen(false);
              onGenerateExamples(word);
            }}
            style={styles.menuRow}>
            <AppIcon name="sparkles" size="xs" color={colors.muted} />
            <Text style={[styles.menuRowText, { color: colors.text }]}>Примеры от ИИ</Text>
          </RipplePressable>

          {canMoveUp || canMoveDown ? (
            <>
              <View style={[styles.menuDivider, { backgroundColor: colors.line }]} />
              {canMoveUp ? (
                <RipplePressable
                  onPress={() => {
                    setActionsMenuOpen(false);
                    onMoveByOffset(word.id, -1);
                  }}
                  style={styles.menuRow}>
                  <AppIcon name="arrowUp" size="xs" color={colors.muted} />
                  <Text style={[styles.menuRowText, { color: colors.text }]}>Поднять выше</Text>
                </RipplePressable>
              ) : null}
              {canMoveDown ? (
                <RipplePressable
                  onPress={() => {
                    setActionsMenuOpen(false);
                    onMoveByOffset(word.id, 1);
                  }}
                  style={styles.menuRow}>
                  <AppIcon name="arrowDown" size="xs" color={colors.muted} />
                  <Text style={[styles.menuRowText, { color: colors.text }]}>Опустить ниже</Text>
                </RipplePressable>
              ) : null}
            </>
          ) : null}

          <View style={[styles.menuDivider, { backgroundColor: colors.line }]} />

          <RipplePressable
            onPress={() => {
              setActionsMenuOpen(false);
              onDelete(word.id);
            }}
            style={styles.menuRow}>
            <AppIcon name="trash" size="xs" color={colors.danger} />
            <Text style={[styles.menuRowText, { color: colors.danger }]}>Удалить слово</Text>
          </RipplePressable>
        </View>
      </AnchoredPopover>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
  wrapDesktop: {
    width: '49%',
    minWidth: 280,
  },
  wrapMobile: {
    width: '100%',
  },
  dragging: {
    opacity: 0.35,
  },
  dropLineWrap: {
    position: 'absolute',
    left: 6,
    right: 6,
    height: 6,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 20,
  },
  dropLineBefore: {
    top: -4,
  },
  dropLineAfter: {
    bottom: -4,
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
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 8,
    ...(Platform.OS === 'web'
      ? ({
          transition: 'background-color 120ms ease, border-color 120ms ease',
        } as object)
      : null),
  },
  cardWebDraggable: {
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'grab',
          userSelect: 'none',
        } as object)
      : null),
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  titlePressArea: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  bodyPressArea: {
    gap: 8,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  pressed: {
    opacity: 0.78,
  },
  termRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  gripWrap: {
    marginLeft: -4,
  },
  term: {
    fontSize: 17,
    fontWeight: '700',
    flexShrink: 1,
  },
  reading: {
    fontSize: 12,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  moreBtn: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakBtn: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  translation: {
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  openHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  meta: {
    fontSize: 11,
    fontWeight: '600',
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
