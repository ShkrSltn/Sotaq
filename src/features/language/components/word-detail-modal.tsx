import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { KeyboardAvoidingModalView } from '@/components/keyboard-avoiding-modal-view';
import { RipplePressable } from '@/components/ripple-pressable';
import { WebDragBox, type WebDomDragEvent } from '@/components/web-drag-box';
import {
  VOCAB_STATUS_META,
  VOCAB_STATUS_ORDER,
  type VocabStatus,
  type VocabWordRecord,
} from '@/features/language/types';
import { useThemeColors, useViewport } from '@/theme/colors';

const EXAMPLE_DRAG_MIME = 'application/x-sotaq-vocab-example';
const DROP_BLUE = '#3B82F6';

type Props = {
  word: VocabWordRecord | null;
  languageCode: string;
  speakingId: string | null;
  aiGenerating: boolean;
  onSpeak: (id: string, text: string, langCode: string, rate?: number) => void;
  onClose: () => void;
  onSave: (
    wordId: string,
    patch: {
      term: string;
      reading: string;
      partOfSpeech: string;
      translation: string;
      explanation: string;
      status: VocabStatus;
    },
  ) => Promise<void>;
  onDelete: (wordId: string) => Promise<void>;
  onGenerateExamples: (word: VocabWordRecord) => Promise<void>;
  onAddManualExample: (wordId: string, sentence: string, translation: string) => Promise<void>;
  onReorderExamples: (wordId: string, orderedExampleIds: string[]) => Promise<void>;
  onDeleteExample: (exampleId: string) => Promise<void>;
};

export function WordDetailModal(props: Props) {
  if (!props.word) {
    return null;
  }
  return <WordDetailModalContent key={props.word.id} {...props} word={props.word} />;
}

function WordDetailModalContent({
  word,
  languageCode,
  speakingId,
  aiGenerating,
  onSpeak,
  onClose,
  onSave,
  onDelete,
  onGenerateExamples,
  onAddManualExample,
  onReorderExamples,
  onDeleteExample,
}: Omit<Props, 'word'> & { word: VocabWordRecord }) {
  const colors = useThemeColors();
  const { isDesktop } = useViewport();
  const insets = useSafeAreaInsets();

  const [term, setTerm] = useState(word.term);
  const [reading, setReading] = useState(word.reading);
  const [partOfSpeech, setPartOfSpeech] = useState(word.partOfSpeech);
  const [translation, setTranslation] = useState(word.translation);
  const [explanation, setExplanation] = useState(word.explanation);
  const [status, setStatus] = useState<VocabStatus>(word.status);

  const [exampleSentence, setExampleSentence] = useState('');
  const [exampleTranslation, setExampleTranslation] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [draggingExampleId, setDraggingExampleId] = useState<string | null>(null);
  const [exampleDropTarget, setExampleDropTarget] = useState<{
    id: string;
    position: 'before' | 'after';
  } | null>(null);

  const savePatchIfDirty = useCallback(
    async (
      override?: Partial<{
        term: string;
        reading: string;
        partOfSpeech: string;
        translation: string;
        explanation: string;
        status: VocabStatus;
      }>,
    ) => {
      const next = {
        term: (override?.term ?? term).trim() || word.term,
        reading: (override?.reading ?? reading).trim(),
        partOfSpeech: (override?.partOfSpeech ?? partOfSpeech).trim(),
        translation: (override?.translation ?? translation).trim(),
        explanation: (override?.explanation ?? explanation).trim(),
        status: override?.status ?? status,
      };

      const changed =
        next.term !== word.term ||
        next.reading !== word.reading ||
        next.partOfSpeech !== word.partOfSpeech ||
        next.translation !== word.translation ||
        next.explanation !== word.explanation ||
        next.status !== word.status;

      if (!changed) {
        return;
      }
      await onSave(word.id, next);
    },
    [term, reading, partOfSpeech, translation, explanation, status, word, onSave],
  );

  const persistAndClose = useCallback(async () => {
    await savePatchIfDirty();
    onClose();
  }, [savePatchIfDirty, onClose]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        persistAndClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [persistAndClose]);

  async function handleAddExample() {
    if (!exampleSentence.trim()) {
      return;
    }
    const sentence = exampleSentence.trim();
    const trans = exampleTranslation.trim();
    setExampleSentence('');
    setExampleTranslation('');
    await onAddManualExample(word.id, sentence, trans);
  }

  async function handleMoveExample(exampleId: string, delta: -1 | 1) {
    const ids = word.examples.map((ex) => ex.id);
    const idx = ids.indexOf(exampleId);
    const nextIdx = idx + delta;
    if (idx < 0 || nextIdx < 0 || nextIdx >= ids.length) {
      return;
    }
    const reordered = [...ids];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(nextIdx, 0, moved);
    await onReorderExamples(word.id, reordered);
  }

  async function handleDropExample(
    draggedId: string,
    targetId: string,
    position: 'before' | 'after',
  ) {
    setDraggingExampleId(null);
    setExampleDropTarget(null);
    if (!draggedId || draggedId === targetId) {
      return;
    }
    const ids = word.examples.map((ex) => ex.id).filter((id) => id !== draggedId);
    const targetIdx = ids.indexOf(targetId);
    if (targetIdx < 0) {
      return;
    }
    const insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
    ids.splice(insertIdx, 0, draggedId);
    await onReorderExamples(word.id, ids);
  }

  function resolveExampleDropPos(event: WebDomDragEvent): 'before' | 'after' {
    const el = event.currentTarget as HTMLElement | null;
    if (!el || typeof el.getBoundingClientRect !== 'function') {
      return 'after';
    }
    const rect = el.getBoundingClientRect();
    return event.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await onDelete(word.id);
    onClose();
  }

  function statusColors(item: VocabStatus, selected: boolean) {
    if (!selected) {
      return { bg: colors.surfaceSubtle, fg: colors.muted, border: colors.line };
    }
    if (item === 'known') {
      return { bg: colors.successBg, fg: colors.success, border: colors.success };
    }
    if (item === 'learning') {
      return { bg: colors.warningBg, fg: colors.warning, border: colors.warning };
    }
    return { bg: colors.surfaceActive, fg: colors.text, border: colors.text };
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={persistAndClose}>
      <KeyboardAvoidingModalView style={styles.root}>
        <Pressable style={styles.backdrop} onPress={persistAndClose} />

        <Animated.View
          entering={FadeIn.duration(110)}
          style={[
            styles.sheet,
            isDesktop ? styles.sheetDesktop : styles.sheetMobile,
            {
              backgroundColor: colors.surface,
              borderColor: colors.line,
              paddingBottom: isDesktop ? 16 : Math.max(insets.bottom, 16),
            },
          ]}>
          {!isDesktop ? (
            <View style={styles.grabberRow}>
              <View style={[styles.grabber, { backgroundColor: colors.line }]} />
            </View>
          ) : null}

          <View style={[styles.header, { borderBottomColor: colors.line }]}>
            <Text style={[styles.headerTitle, { color: colors.muted }]}>Карточка слова</Text>
            <RipplePressable
              onPress={persistAndClose}
              style={StyleSheet.flatten([
                styles.closeBtn,
                { backgroundColor: colors.surfaceSubtle },
              ])}>
              <Text style={[styles.closeLabel, { color: colors.text }]}>Готово</Text>
            </RipplePressable>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled">
            {/* Status selector */}
            <View style={styles.pillRow}>
              {VOCAB_STATUS_ORDER.map((item) => {
                const selected = status === item;
                const sc = statusColors(item, selected);
                return (
                  <RipplePressable
                    key={item}
                    onPress={() => {
                      setStatus(item);
                      savePatchIfDirty({ status: item });
                    }}
                    style={StyleSheet.flatten([
                      styles.statusPill,
                      { backgroundColor: sc.bg, borderColor: sc.border },
                    ])}>
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: VOCAB_STATUS_META[item].dotColor },
                      ]}
                    />
                    <Text style={[styles.statusPillText, { color: sc.fg }]}>
                      {VOCAB_STATUS_META[item].label}
                    </Text>
                  </RipplePressable>
                );
              })}
            </View>

            <View style={styles.termSpeakRow}>
              <TextInput
                value={term}
                onChangeText={setTerm}
                onBlur={() => savePatchIfDirty()}
                placeholder="Слово или фраза"
                placeholderTextColor={colors.muted}
                style={[styles.termInput, styles.flexOne, { color: colors.text }]}
              />
              <RipplePressable
                accessibilityLabel="Озвучить слово"
                onPress={() => onSpeak(`modal-word-${word.id}`, term || word.term, languageCode)}
                style={StyleSheet.flatten([
                  styles.modalSpeakBtn,
                  {
                    backgroundColor:
                      speakingId === `modal-word-${word.id}`
                        ? colors.accent
                        : colors.surfaceSubtle,
                    borderColor: colors.line,
                  },
                ])}>
                <AppIcon
                  name="volume"
                  size="sm"
                  color={
                    speakingId === `modal-word-${word.id}` ? colors.accentText : colors.text
                  }
                />
              </RipplePressable>
            </View>

            <View style={styles.metaInputsRow}>
              <TextInput
                value={reading}
                onChangeText={setReading}
                onBlur={() => savePatchIfDirty()}
                placeholder="Транскрипция / чтение"
                placeholderTextColor={colors.muted}
                style={[
                  styles.smallInput,
                  styles.flexOne,
                  {
                    color: colors.text,
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.line,
                  },
                ]}
              />
              <TextInput
                value={partOfSpeech}
                onChangeText={setPartOfSpeech}
                onBlur={() => savePatchIfDirty()}
                placeholder="Часть речи"
                placeholderTextColor={colors.muted}
                style={[
                  styles.smallInput,
                  styles.posInput,
                  {
                    color: colors.text,
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.line,
                  },
                ]}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]}>Перевод</Text>
              <TextInput
                value={translation}
                onChangeText={setTranslation}
                onBlur={() => savePatchIfDirty()}
                placeholder="Значение на родном языке…"
                placeholderTextColor={colors.muted}
                style={[
                  styles.smallInput,
                  {
                    color: colors.text,
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.line,
                  },
                ]}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]}>Нюансы и описание</Text>
              <TextInput
                value={explanation}
                onChangeText={setExplanation}
                onBlur={() => savePatchIfDirty()}
                multiline
                textAlignVertical="top"
                placeholder="Контекст, оттенки смысла, сочетания…"
                placeholderTextColor={colors.muted}
                style={[
                  styles.notesInput,
                  {
                    color: colors.text,
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.line,
                  },
                ]}
              />
            </View>

            {/* Examples */}
            <View style={styles.field}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.label, { color: colors.muted }]}>
                  Примеры ({word.examples.length})
                </Text>
                <RipplePressable
                  disabled={aiGenerating}
                  onPress={() => onGenerateExamples(word)}
                  style={StyleSheet.flatten([
                    styles.aiSmallBtn,
                    { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                  ])}>
                  {aiGenerating ? (
                    <ActivityIndicator size="small" color={colors.text} />
                  ) : (
                    <View style={styles.aiBtnRow}>
                      <AppIcon name="sparkles" size="xs" color={colors.text} />
                      <Text style={[styles.aiSmallBtnText, { color: colors.text }]}>
                        Примеры от ИИ
                      </Text>
                    </View>
                  )}
                </RipplePressable>
              </View>

              <View style={styles.examplesList}>
                {word.examples.length === 0 ? (
                  <Text style={[styles.emptyHint, { color: colors.muted }]}>
                    Примеров пока нет — сгенерируйте через ИИ или добавьте свой ниже.
                  </Text>
                ) : (
                  word.examples.map((ex, idx) => {
                    const dropPos =
                      exampleDropTarget?.id === ex.id ? exampleDropTarget.position : null;
                    return (
                      <Animated.View
                        key={ex.id}
                        entering={FadeInDown.duration(140)}
                        exiting={FadeOut.duration(120)}
                        style={[
                          styles.exampleWrap,
                          draggingExampleId === ex.id ? styles.dragging : null,
                        ]}>
                        {dropPos === 'before' ? (
                          <View pointerEvents="none" style={[styles.dropLine, styles.dropBefore]} />
                        ) : null}

                        <WebDragBox
                          draggable={Platform.OS === 'web' && word.examples.length > 1}
                          onDragStart={(event) => {
                            event.stopPropagation();
                            if (event.dataTransfer) {
                              event.dataTransfer.effectAllowed = 'move';
                              event.dataTransfer.setData(EXAMPLE_DRAG_MIME, ex.id);
                            }
                            setDraggingExampleId(ex.id);
                          }}
                          onDragEnd={() => {
                            setDraggingExampleId(null);
                            setExampleDropTarget(null);
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (event.dataTransfer) {
                              event.dataTransfer.dropEffect = 'move';
                            }
                            const pos = resolveExampleDropPos(event);
                            setExampleDropTarget((prev) =>
                              prev?.id === ex.id && prev.position === pos
                                ? prev
                                : { id: ex.id, position: pos },
                            );
                          }}
                          onDragLeave={() => {
                            setExampleDropTarget((prev) => (prev?.id === ex.id ? null : prev));
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            const draggedId = event.dataTransfer?.getData(EXAMPLE_DRAG_MIME) ?? '';
                            handleDropExample(draggedId, ex.id, resolveExampleDropPos(event));
                          }}
                          style={[
                            styles.exampleCard,
                            { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                            Platform.OS === 'web' && word.examples.length > 1
                              ? styles.exampleDraggable
                              : null,
                          ]}>
                          <View style={styles.exampleTop}>
                            {Platform.OS === 'web' && word.examples.length > 1 ? (
                              <View style={styles.exampleGrip}>
                                <AppIcon name="grip" size="xs" color={colors.muted} />
                              </View>
                            ) : null}
                            <Text style={[styles.exampleSentence, { color: colors.text }]}>
                              {ex.sentence}
                            </Text>
                            <View style={styles.exampleBtns}>
                              <RipplePressable
                                accessibilityLabel="Озвучить пример"
                                onPress={() => onSpeak(`ex-${ex.id}`, ex.sentence, languageCode, 0.95)}
                                style={StyleSheet.flatten([
                                  styles.exampleIconBtn,
                                  speakingId === `ex-${ex.id}`
                                    ? { backgroundColor: colors.accent }
                                    : null,
                                ])}>
                                <AppIcon
                                  name="volume"
                                  size={12}
                                  color={
                                    speakingId === `ex-${ex.id}` ? colors.accentText : colors.muted
                                  }
                                />
                              </RipplePressable>
                              {word.examples.length > 1 ? (
                                <>
                                  <RipplePressable
                                    accessibilityLabel="Выше"
                                    disabled={idx === 0}
                                    onPress={() => handleMoveExample(ex.id, -1)}
                                    style={StyleSheet.flatten([
                                      styles.exampleIconBtn,
                                      idx === 0 ? styles.disabled : null,
                                    ])}>
                                    <AppIcon name="arrowUp" size={12} color={colors.muted} />
                                  </RipplePressable>
                                  <RipplePressable
                                    accessibilityLabel="Ниже"
                                    disabled={idx === word.examples.length - 1}
                                    onPress={() => handleMoveExample(ex.id, 1)}
                                    style={StyleSheet.flatten([
                                      styles.exampleIconBtn,
                                      idx === word.examples.length - 1 ? styles.disabled : null,
                                    ])}>
                                    <AppIcon name="arrowDown" size={12} color={colors.muted} />
                                  </RipplePressable>
                                </>
                              ) : null}
                              <RipplePressable
                                accessibilityLabel="Удалить пример"
                                onPress={() => onDeleteExample(ex.id)}
                                style={styles.exampleIconBtn}>
                                <AppIcon name="close" size="xs" color={colors.muted} />
                              </RipplePressable>
                            </View>
                          </View>
                          {ex.translation ? (
                            <Text style={[styles.exampleTranslation, { color: colors.muted }]}>
                              {ex.translation}
                            </Text>
                          ) : null}
                          {ex.note ? (
                            <Text style={[styles.exampleNote, { color: colors.muted }]}>
                              {ex.note}
                            </Text>
                          ) : null}
                        </WebDragBox>

                        {dropPos === 'after' ? (
                          <View pointerEvents="none" style={[styles.dropLine, styles.dropAfter]} />
                        ) : null}
                      </Animated.View>
                    );
                  })
                )}
              </View>

              <View
                style={[
                  styles.manualExampleBox,
                  { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                ]}>
                <TextInput
                  value={exampleSentence}
                  onChangeText={setExampleSentence}
                  placeholder="Добавить свой пример предложения…"
                  placeholderTextColor={colors.muted}
                  style={[styles.manualInput, { color: colors.text }]}
                />
                <View style={styles.manualBottomRow}>
                  <TextInput
                    value={exampleTranslation}
                    onChangeText={setExampleTranslation}
                    onSubmitEditing={handleAddExample}
                    placeholder="Перевод (необязательно)"
                    placeholderTextColor={colors.muted}
                    style={[styles.manualInput, styles.flexOne, { color: colors.text }]}
                  />
                  <RipplePressable
                    disabled={exampleSentence.trim().length === 0}
                    onPress={handleAddExample}
                    style={StyleSheet.flatten([
                      styles.addExBtn,
                      { backgroundColor: colors.surface },
                      exampleSentence.trim().length === 0 ? styles.disabled : null,
                    ])}>
                    <AppIcon name="plus" size="xs" color={colors.text} />
                    <Text style={[styles.addExLabel, { color: colors.text }]}>Добавить</Text>
                  </RipplePressable>
                </View>
              </View>
            </View>
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.line }]}>
            <RipplePressable
              onPress={handleDelete}
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
                  styles.deleteLabel,
                  { color: confirmDelete ? '#FFFFFF' : colors.danger },
                ]}>
                {confirmDelete ? 'Точно удалить?' : 'Удалить слово'}
              </Text>
            </RipplePressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingModalView>
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
    backgroundColor: 'rgba(10, 12, 16, 0.48)',
  },
  sheet: {
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  sheetDesktop: {
    maxWidth: 580,
    maxHeight: '88%',
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
  grabberRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 2,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  closeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  closeLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    padding: 18,
    gap: 14,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusPillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  termSpeakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalSpeakBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  termInput: {
    fontSize: 24,
    fontWeight: '700',
    paddingVertical: 2,
  },
  metaInputsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  flexOne: {
    flex: 1,
  },
  posInput: {
    width: 140,
  },
  field: {
    gap: 7,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  smallInput: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 14,
  },
  notesInput: {
    minHeight: 74,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 11,
    fontSize: 14,
    lineHeight: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  aiSmallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 28,
    justifyContent: 'center',
  },
  aiBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  aiSmallBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  examplesList: {
    gap: 8,
  },
  emptyHint: {
    fontSize: 13,
    lineHeight: 19,
  },
  exampleWrap: {
    position: 'relative',
  },
  dragging: {
    opacity: 0.35,
  },
  dropLine: {
    position: 'absolute',
    left: 6,
    right: 6,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: DROP_BLUE,
    zIndex: 10,
  },
  dropBefore: {
    top: -4,
  },
  dropAfter: {
    bottom: -4,
  },
  exampleCard: {
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 11,
    gap: 4,
  },
  exampleDraggable: {
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'grab',
          userSelect: 'none',
        } as object)
      : null),
  },
  exampleTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  exampleGrip: {
    marginTop: 3,
    opacity: 0.45,
  },
  exampleSentence: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  exampleBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  exampleIconBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exampleTranslation: {
    fontSize: 13,
    lineHeight: 18,
  },
  exampleNote: {
    fontSize: 11,
    opacity: 0.85,
  },
  manualExampleBox: {
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    gap: 8,
  },
  manualInput: {
    fontSize: 13,
    paddingVertical: 4,
  },
  manualBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addExBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  addExLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.35,
  },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  deleteLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
});
