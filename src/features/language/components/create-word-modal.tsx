import { useEffect, useState } from 'react';
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
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { KeyboardAvoidingModalView } from '@/components/keyboard-avoiding-modal-view';
import { RipplePressable } from '@/components/ripple-pressable';
import {
  type LanguageRecord,
  VOCAB_STATUS_META,
  VOCAB_STATUS_ORDER,
  type VocabStatus,
  type VocabWordRecord,
} from '@/features/language/types';
import type { GeneratedExample, WordAnalysisResult } from '@/services/ai/language-ai';
import { useThemeColors, useViewport } from '@/theme/colors';

type CreateWordInput = {
  term: string;
  reading: string;
  partOfSpeech: string;
  translation: string;
  explanation: string;
  status: VocabStatus;
  examples: GeneratedExample[];
  aiPayload: WordAnalysisResult | null;
  source: 'manual' | 'ai';
};

type Props = {
  visible: boolean;
  language: LanguageRecord;
  existingWordsByTerm: Map<string, VocabWordRecord>;
  onClose: () => void;
  onOpenExisting: (wordId: string) => void;
  onAnalyzeWithAI: (term: string) => Promise<WordAnalysisResult>;
  onCreate: (input: CreateWordInput) => Promise<void>;
};

export function CreateWordModal(props: Props) {
  if (!props.visible) {
    return null;
  }
  return <CreateWordModalContent {...props} />;
}

function CreateWordModalContent({
  language,
  existingWordsByTerm,
  onClose,
  onOpenExisting,
  onAnalyzeWithAI,
  onCreate,
}: Props) {
  const colors = useThemeColors();
  const { isDesktop } = useViewport();
  const insets = useSafeAreaInsets();

  const [term, setTerm] = useState('');
  const [reading, setReading] = useState('');
  const [partOfSpeech, setPartOfSpeech] = useState('');
  const [translation, setTranslation] = useState('');
  const [explanation, setExplanation] = useState('');
  const [status, setStatus] = useState<VocabStatus>('new');
  const [examples, setExamples] = useState<GeneratedExample[]>([]);
  const [aiPayload, setAiPayload] = useState<WordAnalysisResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const normalizedTerm = term.trim().toLowerCase();
  const duplicateWord = normalizedTerm.length > 0 ? existingWordsByTerm.get(normalizedTerm) ?? null : null;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  async function handleFillWithAI() {
    const clean = term.trim();
    if (!clean || aiLoading) {
      return;
    }
    setAiLoading(true);
    try {
      const analysis = await onAnalyzeWithAI(clean);
      setTerm(analysis.term || clean);
      setReading(analysis.reading);
      setPartOfSpeech(analysis.partOfSpeech);
      setTranslation(analysis.translation);
      setExplanation(analysis.explanation);
      setExamples(analysis.examples);
      setAiPayload(analysis);
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSubmit() {
    const clean = term.trim();
    if (!clean || submitting || duplicateWord) {
      return;
    }
    setSubmitting(true);
    try {
      await onCreate({
        term: clean,
        reading: reading.trim(),
        partOfSpeech: partOfSpeech.trim(),
        translation: translation.trim(),
        explanation: explanation.trim(),
        status,
        examples,
        aiPayload,
        source: aiPayload ? 'ai' : 'manual',
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingModalView style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />

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
            <View style={styles.headerLeft}>
              <Text style={[styles.headerTitle, { color: colors.text }]}>Новое слово</Text>
              <View style={[styles.langTag, { backgroundColor: colors.surfaceSubtle }]}>
                <Text style={[styles.langTagText, { color: colors.muted }]}>
                  {language.code.toUpperCase()} · {language.name}
                </Text>
              </View>
            </View>
            <RipplePressable
              accessibilityLabel="Закрыть"
              onPress={onClose}
              style={StyleSheet.flatten([
                styles.closeIconBtn,
                { backgroundColor: colors.surfaceSubtle },
              ])}>
              <AppIcon name="close" size="sm" color={colors.muted} />
            </RipplePressable>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled">
            {/* Term + Fill with AI */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]}>Слово или фраза</Text>
              <View style={styles.termRow}>
                <TextInput
                  autoFocus
                  value={term}
                  onChangeText={setTerm}
                  onSubmitEditing={handleSubmit}
                  placeholder={`Например, на языке «${language.name}»…`}
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.input,
                    styles.termInput,
                    {
                      color: colors.text,
                      backgroundColor: colors.surfaceSubtle,
                      borderColor: duplicateWord ? colors.warning : colors.line,
                    },
                  ]}
                />
                <RipplePressable
                  disabled={term.trim().length === 0 || aiLoading}
                  onPress={handleFillWithAI}
                  style={StyleSheet.flatten([
                    styles.aiFillBtn,
                    {
                      backgroundColor: colors.surfaceSubtle,
                      borderColor: colors.line,
                    },
                    term.trim().length === 0 || aiLoading ? styles.disabled : null,
                  ])}>
                  {aiLoading ? (
                    <ActivityIndicator size="small" color={colors.text} />
                  ) : (
                    <>
                      <AppIcon name="sparkles" size="xs" color={colors.text} />
                      <Text style={[styles.aiFillText, { color: colors.text }]}>ИИ</Text>
                    </>
                  )}
                </RipplePressable>
              </View>

              {duplicateWord ? (
                <View
                  style={[
                    styles.dupBanner,
                    { backgroundColor: colors.warningBg, borderColor: colors.warning },
                  ]}>
                  <Text style={[styles.dupText, { color: colors.warning }]} numberOfLines={1}>
                    «{duplicateWord.term}» уже есть в словаре
                  </Text>
                  <RipplePressable
                    onPress={() => {
                      onClose();
                      onOpenExisting(duplicateWord.id);
                    }}
                    style={StyleSheet.flatten([
                      styles.dupOpenBtn,
                      { backgroundColor: colors.surface },
                    ])}>
                    <Text style={[styles.dupOpenText, { color: colors.text }]}>Открыть</Text>
                  </RipplePressable>
                </View>
              ) : null}
            </View>

            {/* Status selector */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]}>Статус</Text>
              <View style={styles.statusRow}>
                {VOCAB_STATUS_ORDER.map((item) => {
                  const selected = status === item;
                  const meta = VOCAB_STATUS_META[item];
                  return (
                    <RipplePressable
                      key={item}
                      onPress={() => setStatus(item)}
                      style={StyleSheet.flatten([
                        styles.statusChip,
                        {
                          backgroundColor: selected ? colors.surfaceActive : colors.surfaceSubtle,
                          borderColor: selected ? colors.text : colors.line,
                        },
                      ])}>
                      <View style={[styles.statusDot, { backgroundColor: meta.dotColor }]} />
                      <Text
                        style={[
                          styles.statusChipText,
                          { color: selected ? colors.text : colors.muted },
                        ]}>
                        {meta.label}
                      </Text>
                    </RipplePressable>
                  );
                })}
              </View>
            </View>

            {/* Translation */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]}>Перевод</Text>
              <TextInput
                value={translation}
                onChangeText={setTranslation}
                placeholder="Значение на родном языке…"
                placeholderTextColor={colors.muted}
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.line,
                  },
                ]}
              />
            </View>

            {/* Reading + POS */}
            <View style={styles.twoCol}>
              <View style={[styles.field, styles.flexOne]}>
                <Text style={[styles.label, { color: colors.muted }]}>Транскрипция</Text>
                <TextInput
                  value={reading}
                  onChangeText={setReading}
                  placeholder="/…/"
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      backgroundColor: colors.surfaceSubtle,
                      borderColor: colors.line,
                    },
                  ]}
                />
              </View>
              <View style={[styles.field, styles.posCol]}>
                <Text style={[styles.label, { color: colors.muted }]}>Часть речи</Text>
                <TextInput
                  value={partOfSpeech}
                  onChangeText={setPartOfSpeech}
                  placeholder="глагол, сущ…"
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      backgroundColor: colors.surfaceSubtle,
                      borderColor: colors.line,
                    },
                  ]}
                />
              </View>
            </View>

            {/* Explanation */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]}>Нюансы и контекст</Text>
              <TextInput
                value={explanation}
                onChangeText={setExplanation}
                multiline
                textAlignVertical="top"
                placeholder="Оттенки смысла, сочетания, заметка…"
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

            {/* AI generated examples preview */}
            {examples.length > 0 ? (
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.muted }]}>
                  Примеры ({examples.length})
                </Text>
                <View style={styles.examplesList}>
                  {examples.map((ex, idx) => (
                    <View
                      key={`${idx}-${ex.sentence.slice(0, 12)}`}
                      style={[
                        styles.examplePreview,
                        { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                      ]}>
                      <View style={styles.examplePreviewTexts}>
                        <Text style={[styles.exampleSent, { color: colors.text }]}>
                          {ex.sentence}
                        </Text>
                        {ex.translation ? (
                          <Text style={[styles.exampleTrans, { color: colors.muted }]}>
                            {ex.translation}
                          </Text>
                        ) : null}
                      </View>
                      <RipplePressable
                        accessibilityLabel="Убрать пример"
                        onPress={() => setExamples((prev) => prev.filter((_, i) => i !== idx))}
                        style={styles.exampleRemoveBtn}>
                        <AppIcon name="close" size="xs" color={colors.muted} />
                      </RipplePressable>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.line }]}>
            <RipplePressable
              onPress={onClose}
              style={StyleSheet.flatten([
                styles.cancelBtn,
                { backgroundColor: colors.surfaceSubtle },
              ])}>
              <Text style={[styles.cancelText, { color: colors.muted }]}>Отмена</Text>
            </RipplePressable>

            <RipplePressable
              disabled={term.trim().length === 0 || Boolean(duplicateWord) || submitting}
              onPress={handleSubmit}
              style={StyleSheet.flatten([
                styles.submitBtn,
                { backgroundColor: colors.accent },
                term.trim().length === 0 || duplicateWord || submitting ? styles.disabled : null,
              ])}>
              <AppIcon name="plus" size="xs" color={colors.accentText} />
              <Text style={[styles.submitText, { color: colors.accentText }]}>Добавить слово</Text>
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
    backgroundColor: 'rgba(10, 12, 16, 0.5)',
  },
  sheet: {
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  sheetDesktop: {
    maxWidth: 540,
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
  closeIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    padding: 18,
    gap: 13,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.45,
  },
  termRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  termInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  aiFillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 66,
  },
  aiFillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  dupBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dupText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  dupOpenBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
  },
  dupOpenText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  twoCol: {
    flexDirection: 'row',
    gap: 8,
  },
  flexOne: {
    flex: 1,
  },
  posCol: {
    width: 150,
  },
  input: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 14,
  },
  notesInput: {
    minHeight: 72,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 11,
    fontSize: 14,
    lineHeight: 20,
  },
  examplesList: {
    gap: 6,
  },
  examplePreview: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
  },
  examplePreviewTexts: {
    flex: 1,
    gap: 2,
  },
  exampleSent: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  exampleTrans: {
    fontSize: 12,
    lineHeight: 17,
  },
  exampleRemoveBtn: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  cancelText: {
    fontSize: 13,
    fontWeight: '600',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 10,
  },
  submitText: {
    fontSize: 13,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.38,
  },
});
