import { type ComponentRef, useMemo, useRef, useState } from 'react';
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
  type AnalyzedSentenceRecord,
  VOCAB_STATUS_META,
  type VocabStatus,
  type VocabWordRecord,
} from '@/features/language/types';
import type { SentenceToken } from '@/services/ai/language-ai';
import type { ThemeColors } from '@/theme/colors';

const DROP_BLUE = '#3B82F6';
export const SENTENCE_DRAG_MIME = 'application/x-sotaq-sentence';

type Props = {
  sentence: AnalyzedSentenceRecord;
  colors: ThemeColors;
  vocabByNormalizedTerm: Map<string, VocabWordRecord>;
  canDrag: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  isDragging: boolean;
  dropIndicator: 'before' | 'after' | null;
  onAddTokenToVocab: (sentenceId: string, token: SentenceToken) => void;
  onAddAllTokensToVocab: (sentenceId: string, tokens: SentenceToken[]) => void;
  onMoveByOffset: (sentenceId: string, delta: -1 | 1) => void;
  onDelete: (sentenceId: string) => void;
  onCopyText: (text: string) => void;
  onDragStart: (sentenceId: string, event: WebDomDragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (sentenceId: string, position: 'before' | 'after') => void;
  onDragLeave: (sentenceId: string) => void;
  onDropSentence: (
    draggedSentenceId: string,
    targetSentenceId: string,
    position: 'before' | 'after',
  ) => void;
};

export function SentenceCardItem({
  sentence,
  colors,
  vocabByNormalizedTerm,
  canDrag,
  canMoveUp,
  canMoveDown,
  isDragging,
  dropIndicator,
  onAddTokenToVocab,
  onAddAllTokensToVocab,
  onMoveByOffset,
  onDelete,
  onCopyText,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDropSentence,
}: Props) {
  const [hovered, setHovered] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<AnchorRect | null>(null);
  const menuBtnRef = useRef<ComponentRef<typeof View>>(null);

  const unsavedTokens = useMemo(() => {
    const seen = new Set<string>();
    const list: SentenceToken[] = [];
    for (const token of sentence.tokens) {
      const key = (token.lemma || token.surface).trim().toLowerCase();
      if (!key || seen.has(key)) {
        continue;
      }
      const existing =
        vocabByNormalizedTerm.get(token.lemma.toLowerCase()) ??
        vocabByNormalizedTerm.get(token.surface.toLowerCase());
      if (!existing) {
        seen.add(key);
        list.push(token);
      }
    }
    return list;
  }, [sentence.tokens, vocabByNormalizedTerm]);

  function statusStyle(status: VocabStatus) {
    if (status === 'known') {
      return { bg: colors.successBg, fg: colors.success };
    }
    if (status === 'learning') {
      return { bg: colors.warningBg, fg: colors.warning };
    }
    return { bg: colors.surfaceActive, fg: colors.muted };
  }

  function resolveDropPosition(event: WebDomDragEvent): 'before' | 'after' {
    const el = event.currentTarget as HTMLElement | null;
    if (!el || typeof el.getBoundingClientRect !== 'function') {
      return 'after';
    }
    const rect = el.getBoundingClientRect();
    return event.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
  }

  return (
    <Animated.View
      entering={FadeInDown.duration(150)}
      layout={LinearTransition.springify().damping(24).stiffness(260)}
      style={[styles.wrap, isDragging ? styles.dragging : null]}>
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
            event.dataTransfer.setData(SENTENCE_DRAG_MIME, sentence.id);
            event.dataTransfer.setData('text/plain', sentence.id);
          }
          onDragStart(sentence.id, event);
        }}
        onDragEnd={() => onDragEnd()}
        onDragOver={(event) => {
          if (!canDrag) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
          }
          onDragOver(sentence.id, resolveDropPosition(event));
        }}
        onDragLeave={() => onDragLeave(sentence.id)}
        onDrop={(event) => {
          if (!canDrag) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          const draggedId =
            event.dataTransfer?.getData(SENTENCE_DRAG_MIME) ||
            event.dataTransfer?.getData('text/plain') ||
            '';
          if (!draggedId || draggedId === sentence.id) {
            return;
          }
          onDropSentence(draggedId, sentence.id, resolveDropPosition(event));
        }}
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: hovered ? colors.muted : colors.line,
          },
          Platform.OS === 'web' && canDrag ? styles.cardWebDraggable : null,
        ]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => setCollapsed((v) => !v)}
            style={styles.headerPressArea}>
            <View style={styles.titleRow}>
              {Platform.OS === 'web' && canDrag ? (
                <View style={[styles.gripWrap, { opacity: hovered ? 0.75 : 0.28 }]}>
                  <AppIcon name="grip" size="xs" color={colors.muted} />
                </View>
              ) : null}
              <Text style={[styles.original, { color: colors.text }]}>
                {sentence.originalText}
              </Text>
            </View>
            {sentence.translation ? (
              <Text style={[styles.trans, { color: colors.muted }]}>{sentence.translation}</Text>
            ) : null}
          </Pressable>

          <View style={styles.headerActions}>
            <RipplePressable
              accessibilityLabel={collapsed ? 'Развернуть разбор' : 'Свернуть разбор'}
              onPress={() => setCollapsed((v) => !v)}
              style={styles.iconBtn}>
              <AppIcon
                name={collapsed ? 'chevronRight' : 'chevronDown'}
                size="sm"
                color={colors.muted}
              />
            </RipplePressable>

            <View ref={menuBtnRef} collapsable={false}>
              <RipplePressable
                accessibilityLabel="Действия с предложением"
                onPress={() => {
                  measureAnchor(menuBtnRef.current, (rect) => {
                    setMenuAnchor(rect);
                    setMenuOpen(true);
                  });
                }}
                style={StyleSheet.flatten([
                  styles.iconBtn,
                  { backgroundColor: menuOpen ? colors.surfaceActive : 'transparent' },
                ])}>
                <AppIcon name="more" size="sm" color={colors.muted} />
              </RipplePressable>
            </View>
          </View>
        </View>

        {!collapsed ? (
          <>
            {/* Tokens */}
            {sentence.tokens.length > 0 ? (
              <View style={styles.subBlock}>
                <View style={styles.subBlockHeader}>
                  <Text style={[styles.subBlockLabel, { color: colors.muted }]}>
                    Слова ({sentence.tokens.length})
                  </Text>
                  {unsavedTokens.length > 0 ? (
                    <RipplePressable
                      onPress={() => onAddAllTokensToVocab(sentence.id, unsavedTokens)}
                      style={StyleSheet.flatten([
                        styles.addAllBtn,
                        { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                      ])}>
                      <AppIcon name="plus" size="xs" color={colors.text} />
                      <Text style={[styles.addAllText, { color: colors.text }]}>
                        Все новые ({unsavedTokens.length})
                      </Text>
                    </RipplePressable>
                  ) : (
                    <Text style={[styles.allSavedText, { color: colors.success }]}>
                      Все в словаре
                    </Text>
                  )}
                </View>

                <View style={styles.tokensWrap}>
                  {sentence.tokens.map((token, idx) => {
                    const savedWord =
                      vocabByNormalizedTerm.get(token.lemma.toLowerCase()) ??
                      vocabByNormalizedTerm.get(token.surface.toLowerCase());
                    const st = savedWord ? statusStyle(savedWord.status) : null;

                    return (
                      <RipplePressable
                        key={`${sentence.id}-tok-${idx}`}
                        onPress={() => onAddTokenToVocab(sentence.id, token)}
                        style={StyleSheet.flatten([
                          styles.tokenCard,
                          {
                            backgroundColor: colors.surfaceSubtle,
                            borderColor: savedWord ? colors.success : colors.line,
                          },
                        ])}>
                        <View style={styles.tokenTop}>
                          <Text style={[styles.tokenSurface, { color: colors.text }]}>
                            {token.surface}
                          </Text>
                          {savedWord && st ? (
                            <View style={[styles.tokenBadge, { backgroundColor: st.bg }]}>
                              <Text style={[styles.tokenBadgeText, { color: st.fg }]}>
                                {VOCAB_STATUS_META[savedWord.status].label}
                              </Text>
                            </View>
                          ) : (
                            <Text style={[styles.tokenPlus, { color: colors.muted }]}>
                              + словарь
                            </Text>
                          )}
                        </View>
                        <Text style={[styles.tokenMeta, { color: colors.muted }]}>
                          {token.translation}
                        </Text>
                        {token.role ? (
                          <Text style={[styles.tokenRole, { color: colors.muted }]}>
                            {token.partOfSpeech} · {token.role}
                          </Text>
                        ) : null}
                      </RipplePressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Grammar rules */}
            {sentence.rules.length > 0 ? (
              <View style={styles.subBlock}>
                <Text style={[styles.subBlockLabel, { color: colors.muted }]}>
                  Правила и грамматика
                </Text>
                <View style={styles.rulesList}>
                  {sentence.rules.map((rule, idx) => (
                    <View
                      key={`${sentence.id}-rule-${idx}`}
                      style={[
                        styles.ruleBox,
                        { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                      ]}>
                      <Text style={[styles.ruleTitle, { color: colors.text }]}>{rule.title}</Text>
                      <Text style={[styles.ruleDesc, { color: colors.muted }]}>
                        {rule.explanation}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Summary */}
            {sentence.grammarSummary ? (
              <View style={[styles.summaryBox, { backgroundColor: colors.surfaceSubtle }]}>
                <Text style={[styles.summaryText, { color: colors.muted }]}>
                  {sentence.grammarSummary}
                </Text>
              </View>
            ) : null}
          </>
        ) : null}
      </WebDragBox>

      {dropIndicator === 'after' ? (
        <View pointerEvents="none" style={[styles.dropLineWrap, styles.dropLineAfter]}>
          <View style={styles.dropDot} />
          <View style={styles.dropLine} />
        </View>
      ) : null}

      <AnchoredPopover
        visible={menuOpen}
        anchor={menuAnchor}
        width={210}
        estimatedHeight={220}
        align="right"
        colors={colors}
        onClose={() => setMenuOpen(false)}>
        <View style={styles.popoverBody}>
          <RipplePressable
            onPress={() => {
              setMenuOpen(false);
              onCopyText(sentence.originalText);
            }}
            style={styles.menuRow}>
            <AppIcon name="copy" size="xs" color={colors.muted} />
            <Text style={[styles.menuRowText, { color: colors.text }]}>Скопировать текст</Text>
          </RipplePressable>

          {unsavedTokens.length > 0 ? (
            <RipplePressable
              onPress={() => {
                setMenuOpen(false);
                onAddAllTokensToVocab(sentence.id, unsavedTokens);
              }}
              style={styles.menuRow}>
              <AppIcon name="plus" size="xs" color={colors.muted} />
              <Text style={[styles.menuRowText, { color: colors.text }]}>
                Добавить новые ({unsavedTokens.length})
              </Text>
            </RipplePressable>
          ) : null}

          {canMoveUp || canMoveDown ? (
            <>
              <View style={[styles.menuDivider, { backgroundColor: colors.line }]} />
              {canMoveUp ? (
                <RipplePressable
                  onPress={() => {
                    setMenuOpen(false);
                    onMoveByOffset(sentence.id, -1);
                  }}
                  style={styles.menuRow}>
                  <AppIcon name="arrowUp" size="xs" color={colors.muted} />
                  <Text style={[styles.menuRowText, { color: colors.text }]}>Поднять выше</Text>
                </RipplePressable>
              ) : null}
              {canMoveDown ? (
                <RipplePressable
                  onPress={() => {
                    setMenuOpen(false);
                    onMoveByOffset(sentence.id, 1);
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
              setMenuOpen(false);
              onDelete(sentence.id);
            }}
            style={styles.menuRow}>
            <AppIcon name="trash" size="xs" color={colors.danger} />
            <Text style={[styles.menuRowText, { color: colors.danger }]}>Удалить</Text>
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
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 15,
    gap: 13,
    ...(Platform.OS === 'web'
      ? ({ transition: 'border-color 120ms ease' } as object)
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
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerPressArea: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  gripWrap: {
    marginLeft: -4,
    marginTop: 5,
  },
  original: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
  },
  trans: {
    fontSize: 14,
    lineHeight: 20,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subBlock: {
    gap: 8,
  },
  subBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  subBlockLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  addAllText: {
    fontSize: 11,
    fontWeight: '600',
  },
  allSavedText: {
    fontSize: 11,
    fontWeight: '600',
  },
  tokensWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tokenCard: {
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
    minWidth: 140,
  },
  tokenTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  tokenSurface: {
    fontSize: 14,
    fontWeight: '700',
  },
  tokenBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tokenBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  tokenPlus: {
    fontSize: 10,
    fontWeight: '600',
  },
  tokenMeta: {
    fontSize: 12,
  },
  tokenRole: {
    fontSize: 11,
    opacity: 0.8,
  },
  rulesList: {
    gap: 8,
  },
  ruleBox: {
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 11,
    gap: 4,
  },
  ruleTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  ruleDesc: {
    fontSize: 13,
    lineHeight: 19,
  },
  summaryBox: {
    borderRadius: 10,
    padding: 11,
  },
  summaryText: {
    fontSize: 13,
    lineHeight: 19,
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
