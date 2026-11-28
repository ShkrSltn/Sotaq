import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { RipplePressable } from '@/components/ripple-pressable';
import {
  isWordDueForReview,
  type LanguageRecord,
  type ReviewRating,
  VOCAB_STATUS_META,
  type VocabWordRecord,
} from '@/features/language/types';
import { useSpeech } from '@/services/speech';
import { useThemeColors, useViewport } from '@/theme/colors';

type StudyDeckMode = 'due' | 'learning' | 'all';

type Props = {
  visible: boolean;
  language: LanguageRecord;
  words: VocabWordRecord[];
  onClose: () => void;
  onRateWord: (
    word: VocabWordRecord,
    rating: ReviewRating,
  ) => Promise<{ nextStatus: VocabWordRecord['status']; nextIntervalDays: number }>;
};

export function FlashcardStudyModal(props: Props) {
  if (!props.visible) {
    return null;
  }
  return <FlashcardStudyModalContent key={props.language.id} {...props} />;
}

function FlashcardStudyModalContent({
  language,
  words,
  onClose,
  onRateWord,
}: Props) {
  const colors = useThemeColors();
  const { isDesktop } = useViewport();
  const insets = useSafeAreaInsets();
  const { speakingId, speak, stop } = useSpeech();

  const buildQueue = useCallback(
    (mode: StudyDeckMode): string[] => {
      let filtered: VocabWordRecord[];
      if (mode === 'due') {
        filtered = words.filter((w) => isWordDueForReview(w));
        if (filtered.length === 0) {
          filtered = words.filter((w) => w.status !== 'known');
        }
      } else if (mode === 'learning') {
        filtered = words.filter((w) => w.status === 'learning' || w.status === 'new');
      } else {
        filtered = [...words];
      }
      return filtered.map((w) => w.id);
    },
    [words],
  );

  const [deckMode, setDeckMode] = useState<StudyDeckMode>('due');
  const [queue, setQueue] = useState<string[]>(() => buildQueue('due'));
  const [flipped, setFlipped] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState({ reviewed: 0, remembered: 0, mastered: 0 });
  const [initialTotal, setInitialTotal] = useState(() => Math.max(1, buildQueue('due').length));

  const wordsById = useMemo(() => {
    const map = new Map<string, VocabWordRecord>();
    for (const w of words) {
      map.set(w.id, w);
    }
    return map;
  }, [words]);

  const currentWord = queue.length > 0 ? wordsById.get(queue[0]) ?? null : null;

  const restartWithDeck = useCallback(
    (nextMode: StudyDeckMode) => {
      stop();
      const nextQueue = buildQueue(nextMode);
      setDeckMode(nextMode);
      setQueue(nextQueue);
      setInitialTotal(Math.max(1, nextQueue.length));
      setFlipped(false);
      setStats({ reviewed: 0, remembered: 0, mastered: 0 });
    },
    [buildQueue, stop],
  );

  useEffect(() => {
    if (autoSpeak && currentWord && !flipped) {
      speak(`fc-word-${currentWord.id}`, currentWord.term, language.code, 1.0);
    }
  }, [autoSpeak, currentWord, flipped, language.code, speak]);

  const handleRate = useCallback(
    async (rating: ReviewRating) => {
      if (!currentWord || busy) {
        return;
      }
      setBusy(true);
      stop();
      try {
        const result = await onRateWord(currentWord, rating);
        setStats((prev) => ({
          reviewed: prev.reviewed + 1,
          remembered: prev.remembered + (rating === 'again' ? 0 : 1),
          mastered:
            prev.mastered +
            (currentWord.status !== 'known' && result.nextStatus === 'known' ? 1 : 0),
        }));

        setQueue((prev) => {
          const rest = prev.slice(1);
          if (rating === 'again') {
            return [...rest, currentWord.id];
          }
          return rest;
        });
        setFlipped(false);
      } finally {
        setBusy(false);
      }
    },
    [currentWord, busy, stop, onRateWord],
  );

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        stop();
        onClose();
        return;
      }
      if (!currentWord) {
        return;
      }
      if (event.code === 'Space' || event.key === 'Enter') {
        event.preventDefault();
        setFlipped((v) => !v);
      } else if (event.code === 'KeyS') {
        event.preventDefault();
        speak(`fc-word-${currentWord.id}`, currentWord.term, language.code, 1.0);
      } else if (flipped && event.key === '1') {
        event.preventDefault();
        handleRate('again');
      } else if (flipped && event.key === '2') {
        event.preventDefault();
        handleRate('good');
      } else if (flipped && event.key === '3') {
        event.preventDefault();
        handleRate('easy');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentWord, flipped, handleRate, language.code, onClose, speak, stop]);

  const progressPct =
    initialTotal > 0 ? Math.min(100, Math.round(((initialTotal - queue.length) / initialTotal) * 100)) : 100;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            stop();
            onClose();
          }}
        />

        <Animated.View
          entering={
            isDesktop ? FadeIn.duration(150) : SlideInDown.springify().damping(24).stiffness(260)
          }
          style={[
            styles.sheet,
            isDesktop ? styles.sheetDesktop : styles.sheetMobile,
            {
              backgroundColor: colors.surface,
              borderColor: colors.line,
              paddingBottom: isDesktop ? 18 : Math.max(insets.bottom, 18),
            },
          ]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.line }]}>
            <View style={styles.headerLeft}>
              <Text style={[styles.headerTitle, { color: colors.text }]}>Тренировка</Text>
              <View style={[styles.langTag, { backgroundColor: colors.surfaceSubtle }]}>
                <Text style={[styles.langTagText, { color: colors.muted }]}>
                  {language.code.toUpperCase()} · {language.name}
                </Text>
              </View>
            </View>

            <View style={styles.headerRight}>
              <RipplePressable
                accessibilityLabel="Автоозвучка карточек"
                onPress={() => setAutoSpeak((v) => !v)}
                style={StyleSheet.flatten([
                  styles.iconToggleBtn,
                  {
                    backgroundColor: autoSpeak ? colors.surfaceActive : colors.surfaceSubtle,
                    borderColor: autoSpeak ? colors.text : colors.line,
                  },
                ])}>
                <AppIcon
                  name={autoSpeak ? 'volume' : 'volumeOff'}
                  size="xs"
                  color={autoSpeak ? colors.text : colors.muted}
                />
              </RipplePressable>

              <RipplePressable
                accessibilityLabel="Закрыть тренировку"
                onPress={() => {
                  stop();
                  onClose();
                }}
                style={StyleSheet.flatten([
                  styles.closeBtn,
                  { backgroundColor: colors.surfaceSubtle },
                ])}>
                <AppIcon name="close" size="sm" color={colors.muted} />
              </RipplePressable>
            </View>
          </View>

          {/* Deck Selector & Progress */}
          <View style={styles.controlsBar}>
            <View style={styles.deckPills}>
              {(
                [
                  { key: 'due', label: 'К повторению' },
                  { key: 'learning', label: 'Новые и учу' },
                  { key: 'all', label: `Все (${words.length})` },
                ] as const
              ).map((item) => {
                const active = deckMode === item.key;
                return (
                  <RipplePressable
                    key={item.key}
                    onPress={() => restartWithDeck(item.key)}
                    style={StyleSheet.flatten([
                      styles.deckPill,
                      {
                        backgroundColor: active ? colors.surfaceActive : colors.surfaceSubtle,
                        borderColor: active ? colors.text : colors.line,
                      },
                    ])}>
                    <Text
                      style={[
                        styles.deckPillText,
                        { color: active ? colors.text : colors.muted },
                      ]}>
                      {item.label}
                    </Text>
                  </RipplePressable>
                );
              })}
            </View>

            <Text style={[styles.counterText, { color: colors.muted }]}>
              Осталось: {queue.length}
            </Text>
          </View>

          <View style={[styles.progressTrack, { backgroundColor: colors.surfaceSubtle }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${progressPct}%`, backgroundColor: colors.accent },
              ]}
            />
          </View>

          {/* Card Body or Done Summary */}
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled">
            {!currentWord ? (
              <Animated.View entering={FadeInDown.duration(160)} style={styles.doneState}>
                <View style={[styles.doneBadge, { backgroundColor: colors.successBg }]}>
                  <AppIcon name="checkCircle" size={28} color={colors.success} />
                </View>
                <Text style={[styles.doneTitle, { color: colors.text }]}>
                  {stats.reviewed > 0 ? 'Сессия завершена!' : 'Пока нечего повторять'}
                </Text>
                <Text style={[styles.doneSub, { color: colors.muted }]}>
                  {stats.reviewed > 0
                    ? `Пройдено: ${stats.reviewed} · Запомнено: ${Math.round((stats.remembered / stats.reviewed) * 100)}%${stats.mastered > 0 ? ` · Выучено новых: ${stats.mastered}` : ''}`
                    : 'Выберите колоду «Все» выше или добавьте новые слова в словарь.'}
                </Text>

                <View style={styles.doneActions}>
                  {words.length > 0 ? (
                    <RipplePressable
                      onPress={() => restartWithDeck('all')}
                      style={StyleSheet.flatten([
                        styles.secondaryActionBtn,
                        { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                      ])}>
                      <Text style={[styles.actionBtnText, { color: colors.text }]}>
                        Повторить все ({words.length})
                      </Text>
                    </RipplePressable>
                  ) : null}
                  <RipplePressable
                    onPress={() => {
                      stop();
                      onClose();
                    }}
                    style={StyleSheet.flatten([
                      styles.primaryActionBtn,
                      { backgroundColor: colors.accent },
                    ])}>
                    <Text style={[styles.actionBtnText, { color: colors.accentText }]}>Готово</Text>
                  </RipplePressable>
                </View>
              </Animated.View>
            ) : (
              <View style={styles.studyWrap}>
                <Pressable
                  onPress={() => setFlipped((v) => !v)}
                  style={[
                    styles.flashcard,
                    { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                  ]}>
                  {/* Top meta */}
                  <View style={styles.cardTopRow}>
                    <View style={styles.statusChip}>
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: VOCAB_STATUS_META[currentWord.status].dotColor },
                        ]}
                      />
                      <Text style={[styles.statusLabel, { color: colors.muted }]}>
                        {VOCAB_STATUS_META[currentWord.status].label} · повторов: {currentWord.reviewCount}
                      </Text>
                    </View>

                    <View style={styles.audioBtns}>
                      <RipplePressable
                        accessibilityLabel="Озвучить слово"
                        onPress={(event) => {
                          event.stopPropagation?.();
                          speak(`fc-word-${currentWord.id}`, currentWord.term, language.code, 1.0);
                        }}
                        style={StyleSheet.flatten([
                          styles.speakBtn,
                          {
                            backgroundColor:
                              speakingId === `fc-word-${currentWord.id}`
                                ? colors.accent
                                : colors.surface,
                            borderColor: colors.line,
                          },
                        ])}>
                        <AppIcon
                          name="volume"
                          size="xs"
                          color={
                            speakingId === `fc-word-${currentWord.id}`
                              ? colors.accentText
                              : colors.text
                          }
                        />
                      </RipplePressable>

                      <RipplePressable
                        accessibilityLabel="Озвучить медленно"
                        onPress={(event) => {
                          event.stopPropagation?.();
                          speak(`fc-slow-${currentWord.id}`, currentWord.term, language.code, 0.72);
                        }}
                        style={StyleSheet.flatten([
                          styles.slowBtn,
                          {
                            backgroundColor:
                              speakingId === `fc-slow-${currentWord.id}`
                                ? colors.accent
                                : colors.surface,
                            borderColor: colors.line,
                          },
                        ])}>
                        <Text
                          style={[
                            styles.slowBtnText,
                            {
                              color:
                                speakingId === `fc-slow-${currentWord.id}`
                                  ? colors.accentText
                                  : colors.muted,
                            },
                          ]}>
                          0.7×
                        </Text>
                      </RipplePressable>
                    </View>
                  </View>

                  {/* Front: Word */}
                  <View style={styles.termCenter}>
                    <Text style={[styles.termText, { color: colors.text }]}>
                      {currentWord.term}
                    </Text>
                    {currentWord.reading || currentWord.partOfSpeech ? (
                      <Text style={[styles.readingText, { color: colors.muted }]}>
                        {[currentWord.reading, currentWord.partOfSpeech]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    ) : null}
                  </View>

                  {/* Back: Translation & Examples */}
                  {flipped ? (
                    <Animated.View
                      entering={FadeIn.duration(140)}
                      style={[styles.backSection, { borderTopColor: colors.line }]}>
                      <Text style={[styles.translationText, { color: colors.text }]}>
                        {currentWord.translation || 'Перевод не заполнен'}
                      </Text>

                      {currentWord.explanation ? (
                        <Text style={[styles.explanationText, { color: colors.muted }]}>
                          {currentWord.explanation}
                        </Text>
                      ) : null}

                      {currentWord.examples.length > 0 ? (
                        <View style={styles.examplesBox}>
                          {currentWord.examples.slice(0, 2).map((ex) => {
                            const exSpeakId = `fc-ex-${ex.id}`;
                            const activeSpeak = speakingId === exSpeakId;
                            return (
                              <View
                                key={ex.id}
                                style={[
                                  styles.exampleItem,
                                  { backgroundColor: colors.surface, borderColor: colors.line },
                                ]}>
                                <View style={styles.exampleRow}>
                                  <Text style={[styles.exampleSent, { color: colors.text }]}>
                                    {ex.sentence}
                                  </Text>
                                  <RipplePressable
                                    accessibilityLabel="Озвучить пример"
                                    onPress={(event) => {
                                      event.stopPropagation?.();
                                      speak(exSpeakId, ex.sentence, language.code, 0.95);
                                    }}
                                    style={StyleSheet.flatten([
                                      styles.exSpeakBtn,
                                      {
                                        backgroundColor: activeSpeak
                                          ? colors.accent
                                          : colors.surfaceSubtle,
                                      },
                                    ])}>
                                    <AppIcon
                                      name="volume"
                                      size={12}
                                      color={activeSpeak ? colors.accentText : colors.muted}
                                    />
                                  </RipplePressable>
                                </View>
                                {ex.translation ? (
                                  <Text style={[styles.exampleTrans, { color: colors.muted }]}>
                                    {ex.translation}
                                  </Text>
                                ) : null}
                              </View>
                            );
                          })}
                        </View>
                      ) : null}
                    </Animated.View>
                  ) : (
                    <Text style={[styles.flipHint, { color: colors.muted }]}>
                      {Platform.OS === 'web'
                        ? 'Нажмите на карточку или Space, чтобы увидеть перевод'
                        : 'Нажмите, чтобы увидеть перевод'}
                    </Text>
                  )}
                </Pressable>

                {/* Action buttons */}
                {!flipped ? (
                  <RipplePressable
                    onPress={() => setFlipped(true)}
                    style={StyleSheet.flatten([
                      styles.revealBtn,
                      { backgroundColor: colors.accent },
                    ])}>
                    <Text style={[styles.revealBtnText, { color: colors.accentText }]}>
                      Показать ответ
                    </Text>
                  </RipplePressable>
                ) : (
                  <View style={styles.rateRow}>
                    <RipplePressable
                      disabled={busy}
                      onPress={() => handleRate('again')}
                      style={StyleSheet.flatten([
                        styles.rateBtn,
                        { backgroundColor: colors.dangerBg, borderColor: colors.danger },
                      ])}>
                      <Text style={[styles.rateTitle, { color: colors.danger }]}>Не помню</Text>
                      <Text style={[styles.rateSub, { color: colors.danger }]}>
                        {Platform.OS === 'web' ? '1 · ещё раз' : 'ещё раз'}
                      </Text>
                    </RipplePressable>

                    <RipplePressable
                      disabled={busy}
                      onPress={() => handleRate('good')}
                      style={StyleSheet.flatten([
                        styles.rateBtn,
                        { backgroundColor: colors.warningBg, borderColor: colors.warning },
                      ])}>
                      <Text style={[styles.rateTitle, { color: colors.warning }]}>Помню</Text>
                      <Text style={[styles.rateSub, { color: colors.warning }]}>
                        {Platform.OS === 'web' ? '2 · закрепить' : 'закрепить'}
                      </Text>
                    </RipplePressable>

                    <RipplePressable
                      disabled={busy}
                      onPress={() => handleRate('easy')}
                      style={StyleSheet.flatten([
                        styles.rateBtn,
                        { backgroundColor: colors.successBg, borderColor: colors.success },
                      ])}>
                      <Text style={[styles.rateTitle, { color: colors.success }]}>Легко</Text>
                      <Text style={[styles.rateSub, { color: colors.success }]}>
                        {Platform.OS === 'web' ? '3 · знаю' : 'знаю'}
                      </Text>
                    </RipplePressable>
                  </View>
                )}
              </View>
            )}
          </ScrollView>
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
    backgroundColor: 'rgba(10, 12, 16, 0.56)',
  },
  sheet: {
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  sheetDesktop: {
    maxWidth: 580,
    maxHeight: '90%',
    borderRadius: 18,
  },
  sheetMobile: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '92%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomWidth: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  langTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
  },
  langTagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconToggleBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 10,
  },
  deckPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deckPill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  deckPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  counterText: {
    fontSize: 12,
    fontWeight: '600',
  },
  progressTrack: {
    height: 3,
    width: '100%',
  },
  progressFill: {
    height: '100%',
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    padding: 18,
  },
  studyWrap: {
    gap: 14,
  },
  flashcard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    gap: 16,
    minHeight: 240,
    justifyContent: 'space-between',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', userSelect: 'none' } as object) : null),
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  audioBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  speakBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slowBtn: {
    height: 30,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slowBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  termCenter: {
    alignItems: 'center',
    paddingVertical: 14,
    gap: 6,
  },
  termText: {
    fontSize: 30,
    fontWeight: '700',
    textAlign: 'center',
  },
  readingText: {
    fontSize: 14,
    textAlign: 'center',
  },
  flipHint: {
    fontSize: 12,
    textAlign: 'center',
    opacity: 0.8,
  },
  backSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 14,
    gap: 10,
  },
  translationText: {
    fontSize: 19,
    fontWeight: '700',
    textAlign: 'center',
  },
  explanationText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  examplesBox: {
    gap: 7,
    marginTop: 4,
  },
  exampleItem: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    gap: 3,
  },
  exampleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  exampleSent: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  exSpeakBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exampleTrans: {
    fontSize: 12,
    lineHeight: 17,
  },
  revealBtn: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revealBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  rateRow: {
    flexDirection: 'row',
    gap: 8,
  },
  rateBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 11,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 2,
  },
  rateTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  rateSub: {
    fontSize: 10,
    fontWeight: '600',
    opacity: 0.85,
  },
  doneState: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  doneBadge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneTitle: {
    fontSize: 19,
    fontWeight: '700',
  },
  doneSub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  doneActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  secondaryActionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  primaryActionBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
