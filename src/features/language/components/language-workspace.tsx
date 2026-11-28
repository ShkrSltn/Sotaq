import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import { AppIcon } from '@/components/app-icon';
import { RipplePressable } from '@/components/ripple-pressable';
import { useDatabase } from '@/db/provider';
import { useAuth } from '@/features/auth/auth-context';
import { AddLanguageDialog } from '@/features/language/components/add-language-dialog';
import { WordDetailModal } from '@/features/language/components/word-detail-modal';
import {
  addVocabExamples,
  createLanguage,
  createVocabWord,
  deleteAnalyzedSentence,
  deleteVocabExample,
  deleteVocabWord,
  ensureDefaultLanguage,
  linkWordToSentence,
  listAnalyzedSentences,
  listLanguages,
  listVocabWords,
  saveAnalyzedSentence,
  setVocabWordStatus,
  updateVocabWord,
} from '@/features/language/language-repository';
import {
  type AnalyzedSentenceRecord,
  type LanguageRecord,
  VOCAB_STATUS_META,
  type VocabStatus,
  type VocabWordRecord,
} from '@/features/language/types';
import type { SentenceToken } from '@/services/ai/language-ai';
import { getLanguageAIProvider } from '@/services/ai/mock-language-ai';
import { useThemeColors, useViewport } from '@/theme/colors';

type LabTab = 'vocab' | 'sentences';
type StatusFilter = 'all' | VocabStatus;

export function LanguageWorkspace() {
  const db = useDatabase();
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const colors = useThemeColors();
  const { isDesktop } = useViewport();
  const aiProvider = getLanguageAIProvider();

  const [languages, setLanguages] = useState<LanguageRecord[]>([]);
  const [activeLangId, setActiveLangId] = useState<string | null>(null);
  const [words, setWords] = useState<VocabWordRecord[]>([]);
  const [sentences, setSentences] = useState<AnalyzedSentenceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<LabTab>('vocab');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  const [wordDraft, setWordDraft] = useState('');
  const [sentenceDraft, setSentenceDraft] = useState('');
  const [aiBusy, setAiBusy] = useState<'word' | 'examples' | 'sentence' | null>(null);

  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [addLangOpen, setAddLangOpen] = useState(false);
  const [confirmDeleteSentenceId, setConfirmDeleteSentenceId] = useState<string | null>(null);

  const refreshLanguageData = useCallback(
    async (langId: string) => {
      if (!userId) {
        return;
      }
      const [nextLangs, nextWords, nextSentences] = await Promise.all([
        listLanguages(db, userId),
        listVocabWords(db, userId, langId),
        listAnalyzedSentences(db, userId, langId),
      ]);
      setLanguages(nextLangs);
      setWords(nextWords);
      setSentences(nextSentences);
    },
    [db, userId],
  );

  useEffect(() => {
    if (!userId) {
      return;
    }
    let cancelled = false;

    async function init() {
      const initialLangs = await ensureDefaultLanguage(db, userId);
      if (cancelled) {
        return;
      }
      setLanguages(initialLangs);
      const firstId = initialLangs[0]?.id ?? null;
      if (firstId) {
        const [initialWords, initialSentences] = await Promise.all([
          listVocabWords(db, userId, firstId),
          listAnalyzedSentences(db, userId, firstId),
        ]);
        if (!cancelled) {
          setActiveLangId(firstId);
          setWords(initialWords);
          setSentences(initialSentences);
        }
      }
      if (!cancelled) {
        setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [db, userId]);

  const activeLanguage = useMemo(
    () => languages.find((lang) => lang.id === activeLangId) ?? null,
    [languages, activeLangId],
  );

  const existingLangCodes = useMemo(
    () => new Set(languages.map((lang) => lang.code.toLowerCase())),
    [languages],
  );

  const vocabByNormalizedTerm = useMemo(() => {
    const map = new Map<string, VocabWordRecord>();
    for (const word of words) {
      map.set(word.term.trim().toLowerCase(), word);
    }
    return map;
  }, [words]);

  const statusCounts = useMemo(() => {
    let newCount = 0;
    let learningCount = 0;
    let knownCount = 0;
    for (const word of words) {
      if (word.status === 'new') newCount += 1;
      else if (word.status === 'learning') learningCount += 1;
      else knownCount += 1;
    }
    return {
      all: words.length,
      new: newCount,
      learning: learningCount,
      known: knownCount,
    };
  }, [words]);

  const filteredWords = useMemo(() => {
    const query = search.trim().toLowerCase();
    return words.filter((word) => {
      if (statusFilter !== 'all' && word.status !== statusFilter) {
        return false;
      }
      if (query.length > 0) {
        const hay = `${word.term} ${word.translation} ${word.reading}`.toLowerCase();
        if (!hay.includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [words, statusFilter, search]);

  const selectedWord = useMemo(
    () => words.find((item) => item.id === selectedWordId) ?? null,
    [words, selectedWordId],
  );

  async function selectLanguage(langId: string) {
    if (langId === activeLangId) {
      return;
    }
    setActiveLangId(langId);
    setSelectedWordId(null);
    await refreshLanguageData(langId);
  }

  async function handleCreateLanguage(input: { code: string; name: string }) {
    if (!userId) {
      return;
    }
    const created = await createLanguage(db, userId, input);
    setActiveLangId(created.id);
    await refreshLanguageData(created.id);
  }

  async function handleAddWordWithAI() {
    if (!activeLanguage || !userId || aiBusy) {
      return;
    }
    const term = wordDraft.trim();
    if (!term) {
      return;
    }

    setAiBusy('word');
    try {
      const analysis = await aiProvider.analyzeWord({
        term,
        targetLangCode: activeLanguage.code,
        targetLangName: activeLanguage.name,
        nativeLangCode: activeLanguage.nativeLang,
      });

      const createdId = await createVocabWord(db, userId, activeLanguage.id, {
        term: analysis.term,
        reading: analysis.reading,
        partOfSpeech: analysis.partOfSpeech,
        translation: analysis.translation,
        explanation: analysis.explanation,
        status: 'new',
        aiPayload: analysis,
        examples: analysis.examples,
        source: 'ai',
      });

      setWordDraft('');
      await refreshLanguageData(activeLanguage.id);
      setSelectedWordId(createdId);
    } finally {
      setAiBusy(null);
    }
  }

  async function handleAddWordManual() {
    if (!activeLanguage || !userId) {
      return;
    }
    const term = wordDraft.trim();
    if (!term) {
      return;
    }
    const createdId = await createVocabWord(db, userId, activeLanguage.id, {
      term,
      status: 'new',
      source: 'manual',
    });
    setWordDraft('');
    await refreshLanguageData(activeLanguage.id);
    setSelectedWordId(createdId);
  }

  async function handleCycleWordStatus(word: VocabWordRecord) {
    if (!activeLangId) {
      return;
    }
    const nextStatus = VOCAB_STATUS_META[word.status].next;
    await setVocabWordStatus(db, word.id, nextStatus);
    await refreshLanguageData(activeLangId);
  }

  async function handleSaveWord(
    wordId: string,
    patch: {
      term: string;
      reading: string;
      partOfSpeech: string;
      translation: string;
      explanation: string;
      status: VocabStatus;
    },
  ) {
    if (!activeLangId) {
      return;
    }
    await updateVocabWord(db, wordId, patch);
    await refreshLanguageData(activeLangId);
  }

  async function handleDeleteWord(wordId: string) {
    if (!activeLangId) {
      return;
    }
    await deleteVocabWord(db, wordId);
    await refreshLanguageData(activeLangId);
  }

  async function handleGenerateExamples(word: VocabWordRecord) {
    if (!activeLanguage || aiBusy) {
      return;
    }
    setAiBusy('examples');
    try {
      const generated = await aiProvider.generateExamples({
        term: word.term,
        translation: word.translation,
        targetLangCode: activeLanguage.code,
        targetLangName: activeLanguage.name,
        nativeLangCode: activeLanguage.nativeLang,
        count: 2,
      });
      await addVocabExamples(db, word.id, generated, 'ai');
      await refreshLanguageData(activeLanguage.id);
    } finally {
      setAiBusy(null);
    }
  }

  async function handleAddManualExample(wordId: string, sentence: string, translation: string) {
    if (!activeLangId) {
      return;
    }
    await addVocabExamples(db, wordId, [{ sentence, translation, note: '' }], 'manual');
    await refreshLanguageData(activeLangId);
  }

  async function handleDeleteExample(exampleId: string) {
    if (!activeLangId) {
      return;
    }
    await deleteVocabExample(db, exampleId);
    await refreshLanguageData(activeLangId);
  }

  async function handleAnalyzeSentence() {
    if (!activeLanguage || !userId || aiBusy) {
      return;
    }
    const sentence = sentenceDraft.trim();
    if (!sentence) {
      return;
    }

    setAiBusy('sentence');
    try {
      const result = await aiProvider.analyzeSentence({
        sentence,
        targetLangCode: activeLanguage.code,
        targetLangName: activeLanguage.name,
        nativeLangCode: activeLanguage.nativeLang,
      });
      await saveAnalyzedSentence(db, userId, activeLanguage.id, result);
      setSentenceDraft('');
      await refreshLanguageData(activeLanguage.id);
    } finally {
      setAiBusy(null);
    }
  }

  async function handleAddTokenToVocab(sentenceId: string, token: SentenceToken) {
    if (!activeLanguage || !userId) {
      return;
    }
    const existing =
      vocabByNormalizedTerm.get(token.lemma.toLowerCase()) ??
      vocabByNormalizedTerm.get(token.surface.toLowerCase());
    if (existing) {
      setSelectedWordId(existing.id);
      return;
    }

    const createdId = await createVocabWord(db, userId, activeLanguage.id, {
      term: token.lemma || token.surface,
      partOfSpeech: token.partOfSpeech,
      translation: token.translation,
      explanation: token.role ? `Роль в предложении: ${token.role}` : '',
      status: 'new',
      source: 'ai',
    });
    await linkWordToSentence(db, sentenceId, createdId, token.surface);
    await refreshLanguageData(activeLanguage.id);
  }

  async function handleDeleteSentence(sentenceId: string) {
    if (!activeLangId) {
      return;
    }
    if (confirmDeleteSentenceId !== sentenceId) {
      setConfirmDeleteSentenceId(sentenceId);
      return;
    }
    setConfirmDeleteSentenceId(null);
    await deleteAnalyzedSentence(db, sentenceId);
    await refreshLanguageData(activeLangId);
  }

  function statusStyle(status: VocabStatus) {
    if (status === 'known') {
      return { bg: colors.successBg, fg: colors.success };
    }
    if (status === 'learning') {
      return { bg: colors.warningBg, fg: colors.warning };
    }
    return { bg: colors.surfaceSubtle, fg: colors.muted };
  }

  if (loading || !activeLanguage) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator size="small" color={colors.text} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.container,
        isDesktop ? styles.containerDesktop : styles.containerMobile,
      ]}
      keyboardShouldPersistTaps="handled">
      <View style={styles.inner}>
        {/* Header + Languages */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={styles.titleGroup}>
              <Text style={[styles.title, { color: colors.text }]}>Изучение языков</Text>
              <Text style={[styles.subtitle, { color: colors.muted }]}>
                Личный словарь, примеры и разбор предложений на слова и правила
              </Text>
            </View>

            <View
              style={[
                styles.aiChip,
                { backgroundColor: colors.surface, borderColor: colors.line },
              ]}>
              <View
                style={[
                  styles.aiDot,
                  { backgroundColor: aiProvider.isMock ? colors.warning : colors.success },
                ]}
              />
              <Text style={[styles.aiChipText, { color: colors.muted }]}>
                {aiProvider.label}
              </Text>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.langRow}>
            {languages.map((lang) => {
              const active = lang.id === activeLangId;
              return (
                <RipplePressable
                  key={lang.id}
                  onPress={() => selectLanguage(lang.id)}
                  style={StyleSheet.flatten([
                    styles.langPill,
                    {
                      backgroundColor: active ? colors.accent : colors.surface,
                      borderColor: active ? colors.accent : colors.line,
                    },
                  ])}>
                  <Text
                    style={[
                      styles.langCode,
                      { color: active ? colors.accentText : colors.muted },
                    ]}>
                    {lang.code.toUpperCase()}
                  </Text>
                  <Text
                    style={[
                      styles.langName,
                      { color: active ? colors.accentText : colors.text },
                    ]}>
                    {lang.name}
                  </Text>
                </RipplePressable>
              );
            })}

            <RipplePressable
              onPress={() => setAddLangOpen(true)}
              style={StyleSheet.flatten([
                styles.langPill,
                { backgroundColor: colors.surface, borderColor: colors.line },
              ])}>
              <Text style={[styles.langName, { color: colors.text }]}>+ Язык</Text>
            </RipplePressable>
          </ScrollView>

          {/* Tabs */}
          <View style={styles.tabsRow}>
            {(
              [
                { key: 'vocab', label: `Словарь (${words.length})` },
                { key: 'sentences', label: `Предложения (${sentences.length})` },
              ] as const
            ).map((item) => {
              const active = tab === item.key;
              return (
                <RipplePressable
                  key={item.key}
                  onPress={() => setTab(item.key)}
                  style={StyleSheet.flatten([
                    styles.tabBtn,
                    {
                      backgroundColor: active ? colors.surfaceActive : colors.surface,
                      borderColor: active ? colors.text : colors.line,
                    },
                  ])}>
                  <Text
                    style={[
                      styles.tabLabel,
                      { color: active ? colors.text : colors.muted },
                    ]}>
                    {item.label}
                  </Text>
                </RipplePressable>
              );
            })}
          </View>
        </View>

        {tab === 'vocab' ? (
          <View style={styles.section}>
            {/* Add Word Composer */}
            <View
              style={[
                styles.composerCard,
                { backgroundColor: colors.surface, borderColor: colors.line },
              ]}>
              <TextInput
                value={wordDraft}
                onChangeText={setWordDraft}
                onSubmitEditing={handleAddWordWithAI}
                placeholder={`Новое слово на языке «${activeLanguage.name}»…`}
                placeholderTextColor={colors.muted}
                style={[styles.composerInput, { color: colors.text }]}
              />
              <View style={styles.composerActions}>
                <RipplePressable
                  disabled={wordDraft.trim().length === 0 || aiBusy !== null}
                  onPress={handleAddWordManual}
                  style={StyleSheet.flatten([
                    styles.secondaryBtn,
                    { backgroundColor: colors.surfaceSubtle },
                    wordDraft.trim().length === 0 ? styles.disabled : null,
                  ])}>
                  <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Вручную</Text>
                </RipplePressable>

                <RipplePressable
                  disabled={wordDraft.trim().length === 0 || aiBusy !== null}
                  onPress={handleAddWordWithAI}
                  style={StyleSheet.flatten([
                    styles.primaryBtn,
                    { backgroundColor: colors.accent },
                    wordDraft.trim().length === 0 || aiBusy !== null ? styles.disabled : null,
                  ])}>
                  {aiBusy === 'word' ? (
                    <ActivityIndicator size="small" color={colors.accentText} />
                  ) : (
                    <View style={styles.btnIconRow}>
                      <AppIcon name="sparkles" size="sm" color={colors.accentText} />
                      <Text style={[styles.primaryBtnText, { color: colors.accentText }]}>
                        Изучить с ИИ
                      </Text>
                    </View>
                  )}
                </RipplePressable>
              </View>
            </View>

            {/* Filter & Search Bar */}
            <View style={styles.filterBar}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterPills}>
                {(
                  [
                    { key: 'all', label: `Все (${statusCounts.all})` },
                    { key: 'new', label: `Новые (${statusCounts.new})` },
                    { key: 'learning', label: `Учу (${statusCounts.learning})` },
                    { key: 'known', label: `Знаю (${statusCounts.known})` },
                  ] as const
                ).map((item) => {
                  const active = statusFilter === item.key;
                  return (
                    <RipplePressable
                      key={item.key}
                      onPress={() => setStatusFilter(item.key)}
                      style={StyleSheet.flatten([
                        styles.filterChip,
                        {
                          backgroundColor: active ? colors.surfaceActive : colors.surface,
                          borderColor: active ? colors.line : colors.line,
                        },
                      ])}>
                      <Text
                        style={[
                          styles.filterChipText,
                          { color: active ? colors.text : colors.muted },
                        ]}>
                        {item.label}
                      </Text>
                    </RipplePressable>
                  );
                })}
              </ScrollView>

              <View
                style={[
                  styles.searchBox,
                  !isDesktop ? styles.searchBoxFull : null,
                  { backgroundColor: colors.surface, borderColor: colors.line },
                ]}>
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Поиск в словаре…"
                  placeholderTextColor={colors.muted}
                  style={[styles.searchInput, { color: colors.text }]}
                />
                {search.length > 0 ? (
                  <RipplePressable onPress={() => setSearch('')} style={styles.clearBtn}>
                    <AppIcon name="close" size="xs" color={colors.muted} />
                  </RipplePressable>
                ) : null}
              </View>
            </View>

            {/* Words Grid */}
            {filteredWords.length === 0 ? (
              <View
                style={[
                  styles.emptyCard,
                  { backgroundColor: colors.surface, borderColor: colors.line },
                ]}>
                <Text style={[styles.emptyText, { color: colors.muted }]}>
                  {search.trim().length > 0
                    ? 'В словаре нет совпадений'
                    : 'Словарь пока пуст — добавьте слово выше'}
                </Text>
              </View>
            ) : (
              <View style={[styles.wordGrid, isDesktop ? styles.wordGridDesktop : null]}>
                {filteredWords.map((word) => {
                  const st = statusStyle(word.status);
                  return (
                    <Animated.View
                      key={word.id}
                      entering={FadeInDown.duration(150)}
                      layout={LinearTransition.springify().damping(24).stiffness(260)}
                      style={isDesktop ? styles.wordCardWrapDesktop : styles.wordCardWrapMobile}>
                      <RipplePressable
                        onPress={() => setSelectedWordId(word.id)}
                        style={StyleSheet.flatten([
                          styles.wordCard,
                          { backgroundColor: colors.surface, borderColor: colors.line },
                        ])}>
                        <View style={styles.wordTopRow}>
                          <View style={styles.wordTitleCol}>
                            <Text style={[styles.wordTerm, { color: colors.text }]}>
                              {word.term}
                            </Text>
                            {word.reading || word.partOfSpeech ? (
                              <Text style={[styles.wordReading, { color: colors.muted }]}>
                                {[word.reading, word.partOfSpeech].filter(Boolean).join(' · ')}
                              </Text>
                            ) : null}
                          </View>

                          <RipplePressable
                            accessibilityLabel="Сменить статус знания"
                            onPress={(event) => {
                              event.stopPropagation?.();
                              handleCycleWordStatus(word);
                            }}
                            style={StyleSheet.flatten([
                              styles.statusBadge,
                              { backgroundColor: st.bg },
                            ])}>
                            <Text style={[styles.statusBadgeText, { color: st.fg }]}>
                              {VOCAB_STATUS_META[word.status].label}
                            </Text>
                          </RipplePressable>
                        </View>

                        <Text
                          style={[styles.wordTranslation, { color: colors.text }]}
                          numberOfLines={2}>
                          {word.translation || 'Без перевода — нажмите, чтобы заполнить'}
                        </Text>

                        <View style={styles.wordFooter}>
                          <Text style={[styles.wordMeta, { color: colors.muted }]}>
                            Примеров: {word.examples.length}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={[styles.wordMeta, { color: colors.muted }]}>Открыть</Text>
                            <AppIcon name="arrowRight" size="xs" color={colors.muted} />
                          </View>
                        </View>
                      </RipplePressable>
                    </Animated.View>
                  );
                })}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.section}>
            {/* Sentence Composer */}
            <View
              style={[
                styles.composerCard,
                { backgroundColor: colors.surface, borderColor: colors.line },
              ]}>
              <TextInput
                value={sentenceDraft}
                onChangeText={setSentenceDraft}
                multiline
                placeholder={`Вставьте предложение на языке «${activeLanguage.name}» для разбора на слова и правила…`}
                placeholderTextColor={colors.muted}
                textAlignVertical="top"
                style={[styles.sentenceInput, { color: colors.text }]}
              />
              <View style={styles.composerActions}>
                <RipplePressable
                  disabled={sentenceDraft.trim().length === 0 || aiBusy !== null}
                  onPress={handleAnalyzeSentence}
                  style={StyleSheet.flatten([
                    styles.primaryBtn,
                    { backgroundColor: colors.accent },
                    sentenceDraft.trim().length === 0 || aiBusy !== null ? styles.disabled : null,
                  ])}>
                  {aiBusy === 'sentence' ? (
                    <ActivityIndicator size="small" color={colors.accentText} />
                  ) : (
                    <View style={styles.btnIconRow}>
                      <AppIcon name="sparkles" size="sm" color={colors.accentText} />
                      <Text style={[styles.primaryBtnText, { color: colors.accentText }]}>
                        Разобрать с ИИ
                      </Text>
                    </View>
                  )}
                </RipplePressable>
              </View>
            </View>

            {/* Sentences List */}
            {sentences.length === 0 ? (
              <View
                style={[
                  styles.emptyCard,
                  { backgroundColor: colors.surface, borderColor: colors.line },
                ]}>
                <Text style={[styles.emptyText, { color: colors.muted }]}>
                  Разобранных предложений пока нет — добавьте первое выше.
                </Text>
              </View>
            ) : (
              <View style={styles.sentencesList}>
                {sentences.map((item) => {
                  const confirming = confirmDeleteSentenceId === item.id;
                  return (
                    <Animated.View
                      key={item.id}
                      entering={FadeInDown.duration(160)}
                      layout={LinearTransition.springify().damping(24).stiffness(260)}
                      style={[
                        styles.sentenceCard,
                        { backgroundColor: colors.surface, borderColor: colors.line },
                      ]}>
                      <View style={styles.sentenceHeader}>
                        <View style={styles.sentenceTexts}>
                          <Text style={[styles.sentenceOriginal, { color: colors.text }]}>
                            {item.originalText}
                          </Text>
                          {item.translation ? (
                            <Text style={[styles.sentenceTrans, { color: colors.muted }]}>
                              {item.translation}
                            </Text>
                          ) : null}
                        </View>

                        <RipplePressable
                          onPress={() => handleDeleteSentence(item.id)}
                          style={StyleSheet.flatten([
                            styles.sentenceDelBtn,
                            {
                              backgroundColor: confirming
                                ? colors.danger
                                : colors.surfaceSubtle,
                            },
                          ])}>
                          {confirming ? (
                            <Text style={[styles.sentenceDelText, { color: '#FFFFFF' }]}>
                              Удалить?
                            </Text>
                          ) : (
                            <AppIcon name="close" size="sm" color={colors.muted} />
                          )}
                        </RipplePressable>
                      </View>

                      {/* Word-by-word tokens */}
                      {item.tokens.length > 0 ? (
                        <View style={styles.subBlock}>
                          <Text style={[styles.subBlockLabel, { color: colors.muted }]}>
                            Разбор по словам (тап — добавить в словарь или открыть)
                          </Text>
                          <View style={styles.tokensWrap}>
                            {item.tokens.map((token, idx) => {
                              const savedWord =
                                vocabByNormalizedTerm.get(token.lemma.toLowerCase()) ??
                                vocabByNormalizedTerm.get(token.surface.toLowerCase());
                              const st = savedWord ? statusStyle(savedWord.status) : null;

                              return (
                                <RipplePressable
                                  key={`${item.id}-tok-${idx}`}
                                  onPress={() => handleAddTokenToVocab(item.id, token)}
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
                                      <View
                                        style={[styles.tokenBadge, { backgroundColor: st.bg }]}>
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
                      {item.rules.length > 0 ? (
                        <View style={styles.subBlock}>
                          <Text style={[styles.subBlockLabel, { color: colors.muted }]}>
                            Правила и грамматика
                          </Text>
                          <View style={styles.rulesList}>
                            {item.rules.map((rule, idx) => (
                              <View
                                key={`${item.id}-rule-${idx}`}
                                style={[
                                  styles.ruleBox,
                                  { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                                ]}>
                                <Text style={[styles.ruleTitle, { color: colors.text }]}>
                                  {rule.title}
                                </Text>
                                <Text style={[styles.ruleDesc, { color: colors.muted }]}>
                                  {rule.explanation}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      ) : null}

                      {/* Summary */}
                      {item.grammarSummary ? (
                        <View
                          style={[styles.summaryBox, { backgroundColor: colors.surfaceSubtle }]}>
                          <Text style={[styles.summaryText, { color: colors.muted }]}>
                            {item.grammarSummary}
                          </Text>
                        </View>
                      ) : null}
                    </Animated.View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </View>

      <WordDetailModal
        word={selectedWord}
        aiGenerating={aiBusy === 'examples'}
        onClose={() => setSelectedWordId(null)}
        onSave={handleSaveWord}
        onDelete={handleDeleteWord}
        onGenerateExamples={handleGenerateExamples}
        onAddManualExample={handleAddManualExample}
        onDeleteExample={handleDeleteExample}
      />

      <AddLanguageDialog
        visible={addLangOpen}
        existingCodes={existingLangCodes}
        onClose={() => setAddLangOpen(false)}
        onCreate={handleCreateLanguage}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    alignItems: 'center',
  },
  containerDesktop: {
    paddingHorizontal: 28,
    paddingVertical: 24,
  },
  containerMobile: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  inner: {
    width: '100%',
    maxWidth: 960,
    gap: 18,
  },
  header: {
    gap: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  titleGroup: {
    gap: 4,
    flex: 1,
    minWidth: 220,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  aiChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  aiDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  aiChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  langCode: {
    fontSize: 10,
    fontWeight: '700',
  },
  langName: {
    fontSize: 13,
    fontWeight: '600',
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  section: {
    gap: 14,
  },
  composerCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 10,
  },
  composerInput: {
    fontSize: 15,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  sentenceInput: {
    fontSize: 15,
    lineHeight: 22,
    minHeight: 68,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  composerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
  },
  primaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    minWidth: 130,
    alignItems: 'center',
  },
  btnIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  secondaryBtn: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 10,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.35,
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  filterPills: {
    flexDirection: 'row',
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 210,
    height: 34,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 10,
    paddingRight: 4,
  },
  searchBoxFull: {
    width: '100%',
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 4,
  },
  clearBtn: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearGlyph: {
    fontSize: 15,
  },
  emptyCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  wordGrid: {
    gap: 10,
  },
  wordGridDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  wordCardWrapDesktop: {
    width: '49%',
    minWidth: 280,
  },
  wordCardWrapMobile: {
    width: '100%',
  },
  wordCard: {
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 8,
  },
  wordTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  wordTitleCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  wordTerm: {
    fontSize: 18,
    fontWeight: '700',
  },
  wordReading: {
    fontSize: 12,
  },
  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  wordTranslation: {
    fontSize: 14,
    lineHeight: 20,
  },
  wordFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  wordMeta: {
    fontSize: 11,
    fontWeight: '600',
  },
  sentencesList: {
    gap: 14,
  },
  sentenceCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 14,
  },
  sentenceHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  sentenceTexts: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  sentenceOriginal: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 25,
  },
  sentenceTrans: {
    fontSize: 14,
    lineHeight: 20,
  },
  sentenceDelBtn: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sentenceDelText: {
    fontSize: 13,
    fontWeight: '600',
  },
  subBlock: {
    gap: 8,
  },
  subBlockLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
});
