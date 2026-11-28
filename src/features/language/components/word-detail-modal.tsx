import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { RipplePressable } from '@/components/ripple-pressable';
import {
  VOCAB_STATUS_META,
  type VocabStatus,
  type VocabWordRecord,
} from '@/features/language/types';
import { useThemeColors, useViewport } from '@/theme/colors';

type Props = {
  word: VocabWordRecord | null;
  aiGenerating: boolean;
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
  onDeleteExample: (exampleId: string) => Promise<void>;
};

const STATUS_LIST: readonly VocabStatus[] = ['new', 'learning', 'known'];

export function WordDetailModal(props: Props) {
  if (!props.word) {
    return null;
  }
  return <WordDetailModalContent key={props.word.id} {...props} word={props.word} />;
}

function WordDetailModalContent({
  word,
  aiGenerating,
  onClose,
  onSave,
  onDelete,
  onGenerateExamples,
  onAddManualExample,
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

  async function savePatch(
    override?: Partial<{
      term: string;
      reading: string;
      partOfSpeech: string;
      translation: string;
      explanation: string;
      status: VocabStatus;
    }>,
  ) {
    const cleanTerm = (override?.term ?? term).trim() || word.term;
    await onSave(word.id, {
      term: cleanTerm,
      reading: override?.reading ?? reading,
      partOfSpeech: override?.partOfSpeech ?? partOfSpeech,
      translation: override?.translation ?? translation,
      explanation: override?.explanation ?? explanation,
      status: override?.status ?? status,
    });
  }

  async function persistAndClose() {
    await savePatch();
    onClose();
  }

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
    return { bg: colors.accent, fg: colors.accentText, border: colors.accent };
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={persistAndClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}>
        <Pressable style={styles.backdrop} onPress={persistAndClose} />

        <Animated.View
          entering={
            isDesktop ? FadeIn.duration(160) : SlideInDown.springify().damping(24).stiffness(260)
          }
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
              {STATUS_LIST.map((item) => {
                const selected = status === item;
                const sc = statusColors(item, selected);
                return (
                  <RipplePressable
                    key={item}
                    onPress={() => {
                      setStatus(item);
                      savePatch({ status: item });
                    }}
                    style={StyleSheet.flatten([
                      styles.statusPill,
                      { backgroundColor: sc.bg, borderColor: sc.border },
                    ])}>
                    <Text style={[styles.statusPillText, { color: sc.fg }]}>
                      {VOCAB_STATUS_META[item].label}
                    </Text>
                  </RipplePressable>
                );
              })}
            </View>

            <TextInput
              value={term}
              onChangeText={setTerm}
              onBlur={() => savePatch()}
              placeholder="Слово или фраза"
              placeholderTextColor={colors.muted}
              style={[styles.termInput, { color: colors.text }]}
            />

            <View style={styles.metaInputsRow}>
              <TextInput
                value={reading}
                onChangeText={setReading}
                onBlur={() => savePatch()}
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
                onBlur={() => savePatch()}
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
                onBlur={() => savePatch()}
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
              <Text style={[styles.label, { color: colors.muted }]}>
                Нюансы и описание
              </Text>
              <TextInput
                value={explanation}
                onChangeText={setExplanation}
                onBlur={() => savePatch()}
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
                  word.examples.map((ex) => (
                    <Animated.View
                      key={ex.id}
                      entering={FadeInDown.duration(140)}
                      exiting={FadeOut.duration(120)}
                      style={[
                        styles.exampleCard,
                        { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                      ]}>
                      <View style={styles.exampleTop}>
                        <Text style={[styles.exampleSentence, { color: colors.text }]}>
                          {ex.sentence}
                        </Text>
                        <RipplePressable
                          accessibilityLabel="Удалить пример"
                          onPress={() => onDeleteExample(ex.id)}
                          style={styles.exampleDel}>
                          <AppIcon name="close" size="xs" color={colors.muted} />
                        </RipplePressable>
                      </View>
                      {ex.translation ? (
                        <Text style={[styles.exampleTranslation, { color: colors.muted }]}>
                          {ex.translation}
                        </Text>
                      ) : null}
                      {ex.note ? (
                        <Text style={[styles.exampleNote, { color: colors.muted }]}>{ex.note}</Text>
                      ) : null}
                    </Animated.View>
                  ))
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
                    <Text style={[styles.addExLabel, { color: colors.text }]}>+ Добавить</Text>
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
      </KeyboardAvoidingView>
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
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusPillText: {
    fontSize: 13,
    fontWeight: '700',
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
  exampleCard: {
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 11,
    gap: 4,
  },
  exampleTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  exampleSentence: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  exampleDel: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exampleDelGlyph: {
    fontSize: 16,
    lineHeight: 18,
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
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  deleteLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
});
