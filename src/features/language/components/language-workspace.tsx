import { type ComponentRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  AnchoredPopover,
  type AnchorRect,
  measureAnchor,
} from '@/components/anchored-popover';
import { AppIcon } from '@/components/app-icon';
import { DragTrashZone } from '@/components/drag-trash-zone';
import { RipplePressable } from '@/components/ripple-pressable';
import { HistoryToast, UndoRedoButtons } from '@/components/undo-redo-bar';
import { WebDragBox, type WebDomDragEvent } from '@/components/web-drag-box';
import { useDatabase } from '@/db/provider';
import { useAuth } from '@/features/auth/auth-context';
import { AddLanguageDialog } from '@/features/language/components/add-language-dialog';
import { CreateWordModal } from '@/features/language/components/create-word-modal';
import { FlashcardStudyModal } from '@/features/language/components/flashcard-study-modal';
import {
  SENTENCE_DRAG_MIME,
  SentenceCardItem,
} from '@/features/language/components/sentence-card-item';
import {
  WORD_DRAG_MIME,
  WordCardItem,
} from '@/features/language/components/word-card-item';
import { WordDetailModal } from '@/features/language/components/word-detail-modal';
import {
  addVocabExamples,
  captureLanguageSnapshot,
  createLanguage,
  createVocabWord,
  deleteAnalyzedSentence,
  deleteLanguage,
  deleteVocabExample,
  deleteVocabWord,
  ensureDefaultLanguage,
  getLanguageStats,
  linkWordToSentence,
  listAnalyzedSentences,
  listLanguages,
  listVocabWords,
  recordWordReview,
  reorderAnalyzedSentences,
  reorderVocabExamples,
  reorderVocabWords,
  restoreLanguageSnapshot,
  saveAnalyzedSentence,
  setVocabWordStatus,
  updateLanguage,
  updateVocabWord,
} from '@/features/language/language-repository';
import {
  type AnalyzedSentenceRecord,
  isWordDueForReview,
  type LanguageRecord,
  type LanguageSnapshot,
  type LanguageStat,
  type ReviewRating,
  VOCAB_SORT_META,
  VOCAB_STATUS_META,
  VOCAB_STATUS_ORDER,
  type VocabSortMode,
  type VocabStatus,
  type VocabWordRecord,
} from '@/features/language/types';
import { useUndoRedoHotkeys } from '@/hooks/use-undo-redo';
import type { GeneratedExample, SentenceToken, WordAnalysisResult } from '@/services/ai/language-ai';
import { getLanguageAIProvider } from '@/services/ai/mock-language-ai';
import { useSpeech } from '@/services/speech';
import { useThemeColors, useViewport } from '@/theme/colors';

type LabTab = 'vocab' | 'sentences';
type StatusFilter = 'all' | VocabStatus;

const SORT_MODES: readonly VocabSortMode[] = ['manual', 'recent', 'alpha'];
const MAX_HISTORY = 50;

export function LanguageWorkspace() {
  const db = useDatabase();
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const colors = useThemeColors();
  const { isDesktop } = useViewport();
  const aiProvider = getLanguageAIProvider();

  const [languages, setLanguages] = useState<LanguageRecord[]>([]);
  const [langStats, setLangStats] = useState<Record<string, LanguageStat>>({});
  const [activeLangId, setActiveLangId] = useState<string | null>(null);
  const [words, setWords] = useState<VocabWordRecord[]>([]);
  const [sentences, setSentences] = useState<AnalyzedSentenceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<LabTab>('vocab');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortMode, setSortMode] = useState<VocabSortMode>('manual');
  const [search, setSearch] = useState('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [knownExpanded, setKnownExpanded] = useState(false);

  const [quickWordDraft, setQuickWordDraft] = useState('');
  const [sentenceDraft, setSentenceDraft] = useState('');
  const [aiBusy, setAiBusy] = useState<'word' | 'examples' | 'sentence' | null>(null);

  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [createWordOpen, setCreateWordOpen] = useState(false);
  const [studyOpen, setStudyOpen] = useState(false);
  const { speakingId, speak } = useSpeech();
  const [langDialog, setLangDialog] = useState<{
    open: boolean;
    mode: 'create' | 'edit';
    language: LanguageRecord | null;
  }>({ open: false, mode: 'create', language: null });

  // Toolbar Popovers
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [langMenuAnchor, setLangMenuAnchor] = useState<AnchorRect | null>(null);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [sortMenuAnchor, setSortMenuAnchor] = useState<AnchorRect | null>(null);

  const langMenuBtnRef = useRef<ComponentRef<typeof View>>(null);
  const sortMenuBtnRef = useRef<ComponentRef<typeof View>>(null);
  const sentenceInputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  // Drag-and-drop state
  const [draggingWordId, setDraggingWordId] = useState<string | null>(null);
  const [wordDropTarget, setWordDropTarget] = useState<{
    id: string;
    position: 'before' | 'after';
  } | null>(null);
  const [statusDropHover, setStatusDropHover] = useState<VocabStatus | null>(null);
  const [knownSectionHover, setKnownSectionHover] = useState(false);

  const [draggingSentenceId, setDraggingSentenceId] = useState<string | null>(null);
  const [sentenceDropTarget, setSentenceDropTarget] = useState<{
    id: string;
    position: 'before' | 'after';
  } | null>(null);

  // Undo / Redo state per language
  const historyByLangRef = useRef<
    Map<string, { past: LanguageSnapshot[]; future: LanguageSnapshot[] }>
  >(new Map());
  const [historyMeta, setHistoryMeta] = useState({ canUndo: false, canRedo: false });
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyBusyRef = useRef(false);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 1800);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const syncHistoryMeta = useCallback((langId: string | null) => {
    if (!langId) {
      setHistoryMeta({ canUndo: false, canRedo: false });
      return;
    }
    const entry = historyByLangRef.current.get(langId);
    setHistoryMeta({
      canUndo: (entry?.past.length ?? 0) > 0,
      canRedo: (entry?.future.length ?? 0) > 0,
    });
  }, []);

  const refreshLanguageData = useCallback(
    async (langId: string) => {
      if (!userId) {
        return;
      }
      const [nextLangs, nextStats, nextWords, nextSentences] = await Promise.all([
        listLanguages(db, userId),
        getLanguageStats(db, userId),
        listVocabWords(db, userId, langId),
        listAnalyzedSentences(db, userId, langId),
      ]);
      setLanguages(nextLangs);
      setLangStats(nextStats);
      setWords(nextWords);
      setSentences(nextSentences);
    },
    [db, userId],
  );

  const pushUndoSnapshot = useCallback(
    async (langId: string) => {
      if (!userId) {
        return;
      }
      const snap = await captureLanguageSnapshot(db, userId, langId);
      let entry = historyByLangRef.current.get(langId);
      if (!entry) {
        entry = { past: [], future: [] };
        historyByLangRef.current.set(langId, entry);
      }
      entry.past.push(snap);
      if (entry.past.length > MAX_HISTORY) {
        entry.past.shift();
      }
      entry.future = [];
      syncHistoryMeta(langId);
    },
    [db, userId, syncHistoryMeta],
  );

  const handleUndo = useCallback(async () => {
    if (!activeLangId || !userId || historyBusyRef.current) {
      return;
    }
    const entry = historyByLangRef.current.get(activeLangId);
    if (!entry || entry.past.length === 0) {
      return;
    }
    historyBusyRef.current = true;
    try {
      const current = await captureLanguageSnapshot(db, userId, activeLangId);
      const previous = entry.past.pop();
      if (!previous) {
        return;
      }
      entry.future.push(current);
      await restoreLanguageSnapshot(db, userId, activeLangId, previous);
      await refreshLanguageData(activeLangId);
      syncHistoryMeta(activeLangId);
      showToast('Отменено');
    } finally {
      historyBusyRef.current = false;
    }
  }, [activeLangId, userId, db, refreshLanguageData, syncHistoryMeta, showToast]);

  const handleRedo = useCallback(async () => {
    if (!activeLangId || !userId || historyBusyRef.current) {
      return;
    }
    const entry = historyByLangRef.current.get(activeLangId);
    if (!entry || entry.future.length === 0) {
      return;
    }
    historyBusyRef.current = true;
    try {
      const current = await captureLanguageSnapshot(db, userId, activeLangId);
      const next = entry.future.pop();
      if (!next) {
        return;
      }
      entry.past.push(current);
      await restoreLanguageSnapshot(db, userId, activeLangId, next);
      await refreshLanguageData(activeLangId);
      syncHistoryMeta(activeLangId);
      showToast('Возвращено');
    } finally {
      historyBusyRef.current = false;
    }
  }, [activeLangId, userId, db, refreshLanguageData, syncHistoryMeta, showToast]);

  useUndoRedoHotkeys({
    enabled:
      Boolean(activeLangId) && !createWordOpen && !selectedWordId && !langDialog.open && !studyOpen,
    ignoreInsideInputs: true,
    onUndo: () => {
      handleUndo();
    },
    onRedo: () => {
      handleRedo();
    },
  });

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
      const firstId = initialLangs[0]?.id ?? null;
      const stats = await getLanguageStats(db, userId);
      if (cancelled) {
        return;
      }
      setLanguages(initialLangs);
      setLangStats(stats);
      if (firstId) {
        const [initialWords, initialSentences] = await Promise.all([
          listVocabWords(db, userId, firstId),
          listAnalyzedSentences(db, userId, firstId),
        ]);
        if (!cancelled) {
          setActiveLangId(firstId);
          setWords(initialWords);
          setSentences(initialSentences);
          syncHistoryMeta(firstId);
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
  }, [db, userId, syncHistoryMeta]);

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

  const sortedWords = useMemo(() => {
    const list = [...words];
    if (sortMode === 'recent') {
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } else if (sortMode === 'alpha') {
      list.sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: 'base' }));
    } else {
      list.sort((a, b) => a.position - b.position);
    }
    return list;
  }, [words, sortMode]);

  const filteredWords = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sortedWords.filter((word) => {
      if (statusFilter !== 'all' && word.status !== statusFilter) {
        return false;
      }
      if (query.length > 0) {
        const hay = `${word.term} ${word.translation} ${word.reading} ${word.explanation}`.toLowerCase();
        if (!hay.includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [sortedWords, statusFilter, search]);

  const shouldSplitKnown = statusFilter === 'all' && search.trim().length === 0;

  const activeWords = useMemo(
    () => (shouldSplitKnown ? filteredWords.filter((w) => w.status !== 'known') : filteredWords),
    [filteredWords, shouldSplitKnown],
  );

  const knownWords = useMemo(
    () => (shouldSplitKnown ? filteredWords.filter((w) => w.status === 'known') : []),
    [filteredWords, shouldSplitKnown],
  );

  const filteredSentences = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return sentences;
    }
    return sentences.filter((item) => {
      const tokenText = item.tokens.map((t) => `${t.surface} ${t.translation}`).join(' ');
      const hay = `${item.originalText} ${item.translation} ${item.grammarSummary} ${tokenText}`.toLowerCase();
      return hay.includes(query);
    });
  }, [sentences, search]);

  const selectedWord = useMemo(
    () => words.find((item) => item.id === selectedWordId) ?? null,
    [words, selectedWordId],
  );

  const masteryPct = words.length > 0 ? Math.round((statusCounts.known / words.length) * 100) : 0;
  const dueReviewCount = useMemo(
    () => words.filter((word) => isWordDueForReview(word)).length,
    [words],
  );

  async function handleRateWordInStudy(word: VocabWordRecord, rating: ReviewRating) {
    const result = await recordWordReview(db, word, rating);
    if (activeLangId) {
      await refreshLanguageData(activeLangId);
    }
    return result;
  }

  // Language CRUD
  async function selectLanguage(langId: string) {
    if (langId === activeLangId) {
      return;
    }
    setActiveLangId(langId);
    setSelectedWordId(null);
    setSearch('');
    await refreshLanguageData(langId);
    syncHistoryMeta(langId);
  }

  async function handleCreateLanguage(input: { code: string; name: string }) {
    if (!userId) {
      return;
    }
    const created = await createLanguage(db, userId, input);
    setActiveLangId(created.id);
    setSearch('');
    await refreshLanguageData(created.id);
    syncHistoryMeta(created.id);
  }

  async function handleUpdateLanguage(languageId: string, input: { code: string; name: string }) {
    await updateLanguage(db, languageId, input);
    if (activeLangId) {
      await refreshLanguageData(activeLangId);
    }
  }

  async function handleDeleteLanguage(languageId: string) {
    if (languages.length <= 1) {
      return;
    }
    await deleteLanguage(db, languageId);
    historyByLangRef.current.delete(languageId);
    const remaining = languages.filter((lang) => lang.id !== languageId);
    const nextLangId =
      activeLangId === languageId ? (remaining[0]?.id ?? null) : activeLangId;
    setActiveLangId(nextLangId);
    if (nextLangId) {
      await refreshLanguageData(nextLangId);
      syncHistoryMeta(nextLangId);
    }
  }

  // Word CRUD & Quick Add
  async function handleAnalyzeWordDraft(term: string): Promise<WordAnalysisResult> {
    if (!activeLanguage) {
      throw new Error('No active language');
    }
    return aiProvider.analyzeWord({
      term,
      targetLangCode: activeLanguage.code,
      targetLangName: activeLanguage.name,
      nativeLangCode: activeLanguage.nativeLang,
    });
  }

  async function handleCreateWordFromModal(input: {
    term: string;
    reading: string;
    partOfSpeech: string;
    translation: string;
    explanation: string;
    status: VocabStatus;
    examples: GeneratedExample[];
    aiPayload: WordAnalysisResult | null;
    source: 'manual' | 'ai';
  }) {
    if (!activeLanguage || !userId) {
      return;
    }
    await pushUndoSnapshot(activeLanguage.id);
    await createVocabWord(db, userId, activeLanguage.id, input);
    await refreshLanguageData(activeLanguage.id);
  }

  async function handleQuickAddWord(withAI: boolean) {
    if (!activeLanguage || !userId || aiBusy) {
      return;
    }
    const term = quickWordDraft.trim();
    if (!term) {
      return;
    }

    const existing = vocabByNormalizedTerm.get(term.toLowerCase());
    if (existing) {
      setQuickWordDraft('');
      setSelectedWordId(existing.id);
      showToast('Уже есть в словаре');
      return;
    }

    const initialStatus: VocabStatus =
      statusFilter === 'learning' || statusFilter === 'known' ? statusFilter : 'new';

    if (withAI) {
      setAiBusy('word');
      try {
        await pushUndoSnapshot(activeLanguage.id);
        const analysis = await aiProvider.analyzeWord({
          term,
          targetLangCode: activeLanguage.code,
          targetLangName: activeLanguage.name,
          nativeLangCode: activeLanguage.nativeLang,
        });
        await createVocabWord(db, userId, activeLanguage.id, {
          term: analysis.term,
          reading: analysis.reading,
          partOfSpeech: analysis.partOfSpeech,
          translation: analysis.translation,
          explanation: analysis.explanation,
          status: initialStatus,
          aiPayload: analysis,
          examples: analysis.examples,
          source: 'ai',
        });
        setQuickWordDraft('');
        await refreshLanguageData(activeLanguage.id);
      } finally {
        setAiBusy(null);
      }
    } else {
      await pushUndoSnapshot(activeLanguage.id);
      await createVocabWord(db, userId, activeLanguage.id, {
        term,
        status: initialStatus,
        source: 'manual',
      });
      setQuickWordDraft('');
      await refreshLanguageData(activeLanguage.id);
    }
  }

  async function handleChangeWordStatus(word: VocabWordRecord, nextStatus: VocabStatus) {
    if (!activeLangId || word.status === nextStatus) {
      return;
    }
    await pushUndoSnapshot(activeLangId);
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
    await pushUndoSnapshot(activeLangId);
    await updateVocabWord(db, wordId, patch);
    await refreshLanguageData(activeLangId);
  }

  async function handleDeleteWord(wordId: string) {
    if (!activeLangId) {
      return;
    }
    await pushUndoSnapshot(activeLangId);
    await deleteVocabWord(db, wordId);
    if (selectedWordId === wordId) {
      setSelectedWordId(null);
    }
    await refreshLanguageData(activeLangId);
    showToast('Слово удалено');
  }

  async function handleGenerateExamples(word: VocabWordRecord) {
    if (!activeLanguage || aiBusy) {
      return;
    }
    setAiBusy('examples');
    try {
      await pushUndoSnapshot(activeLanguage.id);
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
      showToast('Примеры добавлены');
    } finally {
      setAiBusy(null);
    }
  }

  async function handleAddManualExample(wordId: string, sentence: string, translation: string) {
    if (!activeLangId) {
      return;
    }
    await pushUndoSnapshot(activeLangId);
    await addVocabExamples(db, wordId, [{ sentence, translation, note: '' }], 'manual');
    await refreshLanguageData(activeLangId);
  }

  async function handleReorderExamples(wordId: string, orderedIds: string[]) {
    if (!activeLangId) {
      return;
    }
    await pushUndoSnapshot(activeLangId);
    await reorderVocabExamples(db, wordId, orderedIds);
    await refreshLanguageData(activeLangId);
  }

  async function handleDeleteExample(exampleId: string) {
    if (!activeLangId) {
      return;
    }
    await pushUndoSnapshot(activeLangId);
    await deleteVocabExample(db, exampleId);
    await refreshLanguageData(activeLangId);
  }

  // Word Ordering & Drag
  async function applyWordOrder(orderedIds: string[]) {
    if (!activeLangId) {
      return;
    }
    await pushUndoSnapshot(activeLangId);
    await reorderVocabWords(db, orderedIds);
    if (sortMode !== 'manual') {
      setSortMode('manual');
    }
    await refreshLanguageData(activeLangId);
  }

  async function handleMoveWordByOffset(wordId: string, delta: -1 | 1, sectionList: VocabWordRecord[]) {
    const idx = sectionList.findIndex((w) => w.id === wordId);
    const targetIdx = idx + delta;
    if (idx < 0 || targetIdx < 0 || targetIdx >= sectionList.length) {
      return;
    }
    const targetId = sectionList[targetIdx].id;
    const allIds = sortedWords.map((w) => w.id);
    const fromAll = allIds.indexOf(wordId);
    const toAll = allIds.indexOf(targetId);
    if (fromAll < 0 || toAll < 0) {
      return;
    }
    const nextIds = [...allIds];
    nextIds.splice(fromAll, 1);
    nextIds.splice(toAll, 0, wordId);
    await applyWordOrder(nextIds);
  }

  async function handleDropWordOnWord(
    draggedWordId: string,
    targetWordId: string,
    position: 'before' | 'after',
  ) {
    setDraggingWordId(null);
    setWordDropTarget(null);
    if (!activeLangId || draggedWordId === targetWordId) {
      return;
    }

    const draggedWord = words.find((w) => w.id === draggedWordId);
    const targetWord = words.find((w) => w.id === targetWordId);
    if (!draggedWord || !targetWord) {
      return;
    }

    const ids = sortedWords.map((w) => w.id).filter((id) => id !== draggedWordId);
    const targetIndex = ids.indexOf(targetWordId);
    if (targetIndex < 0) {
      return;
    }
    const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
    ids.splice(insertIndex, 0, draggedWordId);

    await pushUndoSnapshot(activeLangId);

    // If dropped between active & known sections in split view, sync status naturally
    if (shouldSplitKnown) {
      if (draggedWord.status !== 'known' && targetWord.status === 'known') {
        await setVocabWordStatus(db, draggedWordId, 'known');
      } else if (draggedWord.status === 'known' && targetWord.status !== 'known') {
        await setVocabWordStatus(db, draggedWordId, 'learning');
      }
    }

    await reorderVocabWords(db, ids);
    if (sortMode !== 'manual') {
      setSortMode('manual');
    }
    await refreshLanguageData(activeLangId);
  }

  async function handleDropWordOnStatus(event: WebDomDragEvent, targetStatus: VocabStatus) {
    event.preventDefault();
    event.stopPropagation();
    setStatusDropHover(null);
    setKnownSectionHover(false);
    setDraggingWordId(null);
    setWordDropTarget(null);

    const draggedId =
      event.dataTransfer?.getData(WORD_DRAG_MIME) ||
      event.dataTransfer?.getData('text/plain') ||
      draggingWordId ||
      '';
    if (!draggedId) {
      return;
    }
    const word = words.find((w) => w.id === draggedId);
    if (!word || word.status === targetStatus) {
      return;
    }
    await handleChangeWordStatus(word, targetStatus);
    showToast(`Статус: ${VOCAB_STATUS_META[targetStatus].label}`);
  }

  // Sentences CRUD & Ordering
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
      await pushUndoSnapshot(activeLanguage.id);
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

    await pushUndoSnapshot(activeLanguage.id);
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
    showToast(`Добавлено: ${token.lemma || token.surface}`);
  }

  async function handleAddAllTokensToVocab(sentenceId: string, tokens: SentenceToken[]) {
    if (!activeLanguage || !userId || tokens.length === 0) {
      return;
    }
    await pushUndoSnapshot(activeLanguage.id);
    let added = 0;
    const seen = new Set<string>(vocabByNormalizedTerm.keys());

    for (const token of tokens) {
      const term = (token.lemma || token.surface).trim();
      const key = term.toLowerCase();
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      const createdId = await createVocabWord(db, userId, activeLanguage.id, {
        term,
        partOfSpeech: token.partOfSpeech,
        translation: token.translation,
        explanation: token.role ? `Роль в предложении: ${token.role}` : '',
        status: 'new',
        source: 'ai',
      });
      await linkWordToSentence(db, sentenceId, createdId, token.surface);
      added += 1;
    }

    await refreshLanguageData(activeLanguage.id);
    if (added > 0) {
      showToast(`Добавлено слов: ${added}`);
    }
  }

  async function handleDeleteSentence(sentenceId: string) {
    if (!activeLangId) {
      return;
    }
    await pushUndoSnapshot(activeLangId);
    await deleteAnalyzedSentence(db, sentenceId);
    await refreshLanguageData(activeLangId);
    showToast('Предложение удалено');
  }

  async function handleMoveSentenceByOffset(sentenceId: string, delta: -1 | 1) {
    if (!activeLangId) {
      return;
    }
    const ids = sentences.map((s) => s.id);
    const idx = ids.indexOf(sentenceId);
    const nextIdx = idx + delta;
    if (idx < 0 || nextIdx < 0 || nextIdx >= ids.length) {
      return;
    }
    const reordered = [...ids];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(nextIdx, 0, moved);
    await pushUndoSnapshot(activeLangId);
    await reorderAnalyzedSentences(db, reordered);
    await refreshLanguageData(activeLangId);
  }

  async function handleDropSentence(
    draggedId: string,
    targetId: string,
    position: 'before' | 'after',
  ) {
    setDraggingSentenceId(null);
    setSentenceDropTarget(null);
    if (!activeLangId || draggedId === targetId) {
      return;
    }
    const ids = sentences.map((s) => s.id).filter((id) => id !== draggedId);
    const targetIdx = ids.indexOf(targetId);
    if (targetIdx < 0) {
      return;
    }
    const insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
    ids.splice(insertIdx, 0, draggedId);
    await pushUndoSnapshot(activeLangId);
    await reorderAnalyzedSentences(db, ids);
    await refreshLanguageData(activeLangId);
  }

  async function handleCopyText(text: string) {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        showToast('Скопировано');
      } catch {
        // Ignore clipboard denial
      }
    }
  }

  // Drag Trash Drop Handler
  async function handleDropToTrash(event: WebDomDragEvent) {
    const wordId = event.dataTransfer?.getData(WORD_DRAG_MIME) || draggingWordId;
    const sentId = event.dataTransfer?.getData(SENTENCE_DRAG_MIME) || draggingSentenceId;

    setDraggingWordId(null);
    setWordDropTarget(null);
    setStatusDropHover(null);
    setKnownSectionHover(false);
    setDraggingSentenceId(null);
    setSentenceDropTarget(null);

    if (wordId && words.some((w) => w.id === wordId)) {
      await handleDeleteWord(wordId);
      return;
    }
    if (sentId && sentences.some((s) => s.id === sentId)) {
      await handleDeleteSentence(sentId);
    }
  }

  function handlePrimaryCTA() {
    if (tab === 'vocab') {
      setCreateWordOpen(true);
    } else {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      sentenceInputRef.current?.focus();
    }
  }

  if (loading || !activeLanguage) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator size="small" color={colors.text} />
      </View>
    );
  }

  const isDraggingAnything = draggingWordId !== null || draggingSentenceId !== null;
  const trashLabel = draggingSentenceId ? 'Удалить предложение' : 'Удалить слово';

  return (
    <View style={[styles.screen, isDesktop ? styles.screenDesktop : styles.screenMobile]}>
      {/* Unified Clean Top Toolbar */}
      <View style={styles.toolbar}>
        <View style={styles.toolbarLeft}>
          {/* Language Switcher Pill */}
          <View ref={langMenuBtnRef} collapsable={false}>
            <RipplePressable
              accessibilityLabel="Выбрать или настроить язык"
              onPress={() => {
                if (langMenuOpen) {
                  setLangMenuOpen(false);
                  return;
                }
                measureAnchor(langMenuBtnRef.current, (rect) => {
                  setLangMenuAnchor(rect);
                  setLangMenuOpen(true);
                });
              }}
              style={StyleSheet.flatten([
                styles.langSwitcherBtn,
                {
                  backgroundColor: langMenuOpen ? colors.surfaceActive : colors.surface,
                  borderColor: langMenuOpen ? colors.text : colors.line,
                },
              ])}>
              <AppIcon name="language" size="sm" color={colors.muted} />
              <Text style={[styles.langCodeTag, { color: colors.muted }]}>
                {activeLanguage.code.toUpperCase()}
              </Text>
              <Text style={[styles.langSwitcherName, { color: colors.text }]} numberOfLines={1}>
                {activeLanguage.name}
              </Text>
              <AppIcon name="chevronDown" size="xs" color={colors.muted} />
            </RipplePressable>
          </View>

          {/* Desktop Segmented Tabs */}
          {isDesktop ? (
            <View
              style={[
                styles.segmentedWrap,
                { backgroundColor: colors.surface, borderColor: colors.line },
              ]}>
              {(
                [
                  { key: 'vocab', label: 'Словарь', count: words.length },
                  { key: 'sentences', label: 'Предложения', count: sentences.length },
                ] as const
              ).map((item) => {
                const active = tab === item.key;
                return (
                  <RipplePressable
                    key={item.key}
                    onPress={() => setTab(item.key)}
                    style={StyleSheet.flatten([
                      styles.segmentBtn,
                      active ? { backgroundColor: colors.surfaceActive } : null,
                    ])}>
                    <Text
                      style={[
                        styles.segmentLabel,
                        { color: active ? colors.text : colors.muted },
                      ]}>
                      {item.label}
                    </Text>
                    <Text
                      style={[
                        styles.segmentCount,
                        { color: active ? colors.text : colors.muted },
                      ]}>
                      {item.count}
                    </Text>
                  </RipplePressable>
                );
              })}
            </View>
          ) : null}
        </View>

        <View style={styles.toolbarRight}>
          {isDesktop ? (
            <>
              {/* Group 1: Search & Sort */}
              <View style={styles.toolbarGroup}>
                <View
                  style={[
                    styles.searchBox,
                    { backgroundColor: colors.surface, borderColor: colors.line },
                  ]}>
                  <AppIcon name="search" size="xs" color={colors.muted} />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder={tab === 'vocab' ? 'Поиск слов…' : 'Поиск предложений…'}
                    placeholderTextColor={colors.muted}
                    style={[styles.searchInput, { color: colors.text }]}
                  />
                  {search.length > 0 ? (
                    <RipplePressable onPress={() => setSearch('')} style={styles.clearBtn}>
                      <AppIcon name="close" size="xs" color={colors.muted} />
                    </RipplePressable>
                  ) : null}
                </View>

                {tab === 'vocab' ? (
                  <View ref={sortMenuBtnRef} collapsable={false}>
                    <RipplePressable
                      accessibilityLabel="Сортировка словаря"
                      onPress={() => {
                        if (sortMenuOpen) {
                          setSortMenuOpen(false);
                          return;
                        }
                        measureAnchor(sortMenuBtnRef.current, (rect) => {
                          setSortMenuAnchor(rect);
                          setSortMenuOpen(true);
                        });
                      }}
                      style={StyleSheet.flatten([
                        styles.sortTriggerBtn,
                        {
                          backgroundColor:
                            sortMode !== 'manual' || sortMenuOpen
                              ? colors.surfaceActive
                              : colors.surface,
                          borderColor:
                            sortMode !== 'manual' || sortMenuOpen ? colors.text : colors.line,
                        },
                      ])}>
                      <AppIcon name="reorder" size="xs" color={colors.muted} />
                      <Text
                        style={[
                          styles.sortTriggerText,
                          { color: sortMode !== 'manual' ? colors.text : colors.muted },
                        ]}>
                        {VOCAB_SORT_META[sortMode].label}
                      </Text>
                      <AppIcon name="chevronDown" size={11} color={colors.muted} />
                    </RipplePressable>
                  </View>
                ) : null}
              </View>

              <View style={[styles.toolbarDivider, { backgroundColor: colors.line }]} />

              {/* Group 2: Undo / Redo */}
              <UndoRedoButtons
                canUndo={historyMeta.canUndo}
                canRedo={historyMeta.canRedo}
                colors={colors}
                onUndo={() => {
                  handleUndo();
                }}
                onRedo={() => {
                  handleRedo();
                }}
              />

              <View style={[styles.toolbarDivider, { backgroundColor: colors.line }]} />

              {/* Group 3: Single Primary CTA */}
              <RipplePressable
                onPress={handlePrimaryCTA}
                style={StyleSheet.flatten([
                  styles.primaryCtaBtn,
                  { backgroundColor: colors.accent },
                ])}>
                <AppIcon name="plus" size="xs" color={colors.accentText} />
                <Text style={[styles.primaryCtaText, { color: colors.accentText }]}>
                  {tab === 'vocab' ? 'Слово' : 'Предложение'}
                </Text>
              </RipplePressable>
            </>
          ) : (
            <>
              {historyMeta.canUndo || historyMeta.canRedo ? (
                <UndoRedoButtons
                  compact
                  canUndo={historyMeta.canUndo}
                  canRedo={historyMeta.canRedo}
                  colors={colors}
                  onUndo={() => {
                    handleUndo();
                  }}
                  onRedo={() => {
                    handleRedo();
                  }}
                />
              ) : null}

              <RipplePressable
                accessibilityLabel="Поиск"
                onPress={() => setMobileSearchOpen((v) => !v)}
                style={StyleSheet.flatten([
                  styles.iconPill,
                  {
                    backgroundColor:
                      mobileSearchOpen || search.length > 0
                        ? colors.surfaceActive
                        : colors.surface,
                    borderColor:
                      mobileSearchOpen || search.length > 0 ? colors.text : colors.line,
                  },
                ])}>
                <AppIcon
                  name="search"
                  size="sm"
                  color={mobileSearchOpen || search.length > 0 ? colors.text : colors.muted}
                />
              </RipplePressable>

              {tab === 'vocab' ? (
                <View ref={sortMenuBtnRef} collapsable={false}>
                  <RipplePressable
                    accessibilityLabel="Сортировка"
                    onPress={() => {
                      measureAnchor(sortMenuBtnRef.current, (rect) => {
                        setSortMenuAnchor(rect);
                        setSortMenuOpen(true);
                      });
                    }}
                    style={StyleSheet.flatten([
                      styles.iconPill,
                      {
                        backgroundColor:
                          sortMode !== 'manual' ? colors.surfaceActive : colors.surface,
                        borderColor: sortMode !== 'manual' ? colors.text : colors.line,
                      },
                    ])}>
                    <AppIcon
                      name="reorder"
                      size="sm"
                      color={sortMode !== 'manual' ? colors.text : colors.muted}
                    />
                  </RipplePressable>
                </View>
              ) : null}

              <RipplePressable
                accessibilityLabel={tab === 'vocab' ? 'Новое слово' : 'Новое предложение'}
                onPress={handlePrimaryCTA}
                style={StyleSheet.flatten([
                  styles.iconPill,
                  { backgroundColor: colors.accent, borderColor: colors.accent },
                ])}>
                <AppIcon name="plus" size="sm" color={colors.accentText} />
              </RipplePressable>
            </>
          )}
        </View>
      </View>

      {/* Mobile Tabs + Collapsible Search */}
      {!isDesktop ? (
        <View style={styles.mobileSubBar}>
          <View
            style={[
              styles.segmentedWrap,
              styles.segmentedFull,
              { backgroundColor: colors.surface, borderColor: colors.line },
            ]}>
            {(
              [
                { key: 'vocab', label: 'Словарь', count: words.length },
                { key: 'sentences', label: 'Предложения', count: sentences.length },
              ] as const
            ).map((item) => {
              const active = tab === item.key;
              return (
                <RipplePressable
                  key={item.key}
                  onPress={() => setTab(item.key)}
                  style={StyleSheet.flatten([
                    styles.segmentBtn,
                    styles.segmentBtnFull,
                    active ? { backgroundColor: colors.surfaceActive } : null,
                  ])}>
                  <Text
                    style={[
                      styles.segmentLabel,
                      { color: active ? colors.text : colors.muted },
                    ]}>
                    {item.label}
                  </Text>
                  <Text
                    style={[
                      styles.segmentCount,
                      { color: active ? colors.text : colors.muted },
                    ]}>
                    {item.count}
                  </Text>
                </RipplePressable>
              );
            })}
          </View>

          {mobileSearchOpen ? (
            <View
              style={[
                styles.searchBox,
                styles.searchBoxFull,
                { backgroundColor: colors.surface, borderColor: colors.line },
              ]}>
              <AppIcon name="search" size="xs" color={colors.muted} />
              <TextInput
                autoFocus
                value={search}
                onChangeText={setSearch}
                placeholder={tab === 'vocab' ? 'Поиск в словаре…' : 'Поиск предложений…'}
                placeholderTextColor={colors.muted}
                style={[styles.searchInput, { color: colors.text }]}
              />
              {search.length > 0 ? (
                <RipplePressable onPress={() => setSearch('')} style={styles.clearBtn}>
                  <AppIcon name="close" size="xs" color={colors.muted} />
                </RipplePressable>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Main Content */}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>
          {tab === 'vocab' ? (
            <View style={styles.section}>
              {/* Status Filter Pills (Web drop targets for 1-drag status change) + Progress */}
              <View style={styles.statusHeaderRow}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterPills}>
                  <RipplePressable
                    onPress={() => setStatusFilter('all')}
                    style={StyleSheet.flatten([
                      styles.filterChip,
                      {
                        backgroundColor:
                          statusFilter === 'all' ? colors.surfaceActive : colors.surface,
                        borderColor: statusFilter === 'all' ? colors.text : colors.line,
                      },
                    ])}>
                    <Text
                      style={[
                        styles.filterChipText,
                        { color: statusFilter === 'all' ? colors.text : colors.muted },
                      ]}>
                      Все ({statusCounts.all})
                    </Text>
                  </RipplePressable>

                  {VOCAB_STATUS_ORDER.map((statusKey) => {
                    const active = statusFilter === statusKey;
                    const dropOver = statusDropHover === statusKey;
                    const meta = VOCAB_STATUS_META[statusKey];
                    const count = statusCounts[statusKey];

                    return (
                      <WebDragBox
                        key={statusKey}
                        onDragOver={(event) => {
                          if (!draggingWordId) {
                            return;
                          }
                          event.preventDefault();
                          event.stopPropagation();
                          if (event.dataTransfer) {
                            event.dataTransfer.dropEffect = 'move';
                          }
                          if (statusDropHover !== statusKey) {
                            setStatusDropHover(statusKey);
                          }
                        }}
                        onDragLeave={() => {
                          setStatusDropHover((prev) => (prev === statusKey ? null : prev));
                        }}
                        onDrop={(event) => handleDropWordOnStatus(event, statusKey)}>
                        <RipplePressable
                          onPress={() => setStatusFilter(statusKey)}
                          style={StyleSheet.flatten([
                            styles.filterChip,
                            {
                              backgroundColor: dropOver
                                ? colors.accent
                                : active
                                  ? colors.surfaceActive
                                  : colors.surface,
                              borderColor: dropOver
                                ? colors.accent
                                : active
                                  ? colors.text
                                  : colors.line,
                            },
                          ])}>
                          <View
                            style={[
                              styles.filterDot,
                              {
                                backgroundColor: dropOver
                                  ? colors.accentText
                                  : meta.dotColor,
                              },
                            ]}
                          />
                          <Text
                            style={[
                              styles.filterChipText,
                              {
                                color: dropOver
                                  ? colors.accentText
                                  : active
                                    ? colors.text
                                    : colors.muted,
                              },
                            ]}>
                            {meta.pluralLabel} ({count})
                          </Text>
                        </RipplePressable>
                      </WebDragBox>
                    );
                  })}
                </ScrollView>

                {words.length > 0 ? (
                  <View style={styles.statusRightGroup}>
                    <View style={styles.progressWrap}>
                      <Text style={[styles.progressText, { color: colors.muted }]}>
                        Выучено {statusCounts.known}/{words.length}
                      </Text>
                      <View style={[styles.progressTrack, { backgroundColor: colors.surfaceSubtle }]}>
                        <View
                          style={[
                            styles.progressFill,
                            { width: `${masteryPct}%`, backgroundColor: colors.success },
                          ]}
                        />
                      </View>
                    </View>

                    <RipplePressable
                      onPress={() => setStudyOpen(true)}
                      style={StyleSheet.flatten([
                        styles.studyBtn,
                        { backgroundColor: colors.surface, borderColor: colors.line },
                      ])}>
                      <AppIcon name="study" size="xs" color={colors.text} />
                      <Text style={[styles.studyBtnText, { color: colors.text }]}>
                        Тренировка{dueReviewCount > 0 ? ` · ${dueReviewCount}` : ''}
                      </Text>
                    </RipplePressable>
                  </View>
                ) : null}
              </View>

              {/* Active / Filtered Words Grid */}
              {activeWords.length === 0 ? (
                <View
                  style={[
                    styles.emptyCard,
                    { backgroundColor: colors.surface, borderColor: colors.line },
                  ]}>
                  <Text style={[styles.emptyText, { color: colors.muted }]}>
                    {search.trim().length > 0
                      ? 'В словаре нет совпадений'
                      : shouldSplitKnown && knownWords.length > 0
                        ? 'Все слова изучены — добавьте новое ниже'
                        : 'Словарь пока пуст — добавьте слово ниже или через «+ Слово»'}
                  </Text>
                </View>
              ) : (
                <View style={[styles.wordGrid, isDesktop ? styles.wordGridDesktop : null]}>
                  {activeWords.map((word, index) => (
                    <WordCardItem
                      key={word.id}
                      word={word}
                      languageCode={activeLanguage.code}
                      speakingId={speakingId}
                      colors={colors}
                      isDesktop={isDesktop}
                      canDrag={Platform.OS === 'web'}
                      canMoveUp={index > 0}
                      canMoveDown={index < activeWords.length - 1}
                      isDragging={draggingWordId === word.id}
                      dropIndicator={
                        wordDropTarget?.id === word.id ? wordDropTarget.position : null
                      }
                      onSpeak={speak}
                      onOpen={(id) => setSelectedWordId(id)}
                      onChangeStatus={handleChangeWordStatus}
                      onGenerateExamples={handleGenerateExamples}
                      onMoveByOffset={(id, delta) =>
                        handleMoveWordByOffset(id, delta, activeWords)
                      }
                      onDelete={handleDeleteWord}
                      onDragStart={(id) => setDraggingWordId(id)}
                      onDragEnd={() => {
                        setDraggingWordId(null);
                        setWordDropTarget(null);
                        setStatusDropHover(null);
                        setKnownSectionHover(false);
                      }}
                      onDragOver={(targetId, pos) => {
                        setWordDropTarget((prev) =>
                          prev?.id === targetId && prev.position === pos
                            ? prev
                            : { id: targetId, position: pos },
                        );
                      }}
                      onDragLeave={(targetId) => {
                        setWordDropTarget((prev) => (prev?.id === targetId ? null : prev));
                      }}
                      onDropWord={handleDropWordOnWord}
                    />
                  ))}
                </View>
              )}

              {/* Minimalist Bottom Quick-Add Bar */}
              {search.trim().length === 0 ? (
                <View
                  style={[
                    styles.quickAddBar,
                    { backgroundColor: colors.surface, borderColor: colors.line },
                  ]}>
                  <TextInput
                    value={quickWordDraft}
                    onChangeText={setQuickWordDraft}
                    onSubmitEditing={() => handleQuickAddWord(false)}
                    placeholder="Новое слово…"
                    placeholderTextColor={colors.muted}
                    style={[styles.quickAddInput, { color: colors.text }]}
                  />
                  <RipplePressable
                    accessibilityLabel="Добавить и разобрать с ИИ"
                    disabled={quickWordDraft.trim().length === 0 || aiBusy !== null}
                    onPress={() => handleQuickAddWord(true)}
                    style={StyleSheet.flatten([
                      styles.quickAddIconBtn,
                      { backgroundColor: colors.surfaceSubtle },
                      quickWordDraft.trim().length === 0 || aiBusy !== null
                        ? styles.disabled
                        : null,
                    ])}>
                    {aiBusy === 'word' ? (
                      <ActivityIndicator size="small" color={colors.text} />
                    ) : (
                      <AppIcon name="sparkles" size="sm" color={colors.text} />
                    )}
                  </RipplePressable>

                  <RipplePressable
                    accessibilityLabel="Быстро добавить слово"
                    disabled={quickWordDraft.trim().length === 0 || aiBusy !== null}
                    onPress={() => handleQuickAddWord(false)}
                    style={StyleSheet.flatten([
                      styles.quickAddSubmitBtn,
                      { backgroundColor: colors.accent },
                      quickWordDraft.trim().length === 0 || aiBusy !== null
                        ? styles.disabled
                        : null,
                    ])}>
                    <AppIcon name="plus" size="sm" color={colors.accentText} />
                  </RipplePressable>
                </View>
              ) : null}

              {/* Collapsible Known Section when viewing 'all' */}
              {shouldSplitKnown && (knownWords.length > 0 || draggingWordId !== null) ? (
                <View style={styles.knownSection}>
                  <WebDragBox
                    onDragOver={(event) => {
                      if (!draggingWordId) {
                        return;
                      }
                      event.preventDefault();
                      event.stopPropagation();
                      if (event.dataTransfer) {
                        event.dataTransfer.dropEffect = 'move';
                      }
                      if (!knownSectionHover) {
                        setKnownSectionHover(true);
                      }
                    }}
                    onDragLeave={() => setKnownSectionHover(false)}
                    onDrop={(event) => handleDropWordOnStatus(event, 'known')}>
                    <RipplePressable
                      onPress={() => setKnownExpanded((v) => !v)}
                      style={StyleSheet.flatten([
                        styles.knownHeader,
                        {
                          backgroundColor: knownSectionHover
                            ? colors.successBg
                            : 'transparent',
                          borderColor: knownSectionHover ? colors.success : colors.line,
                        },
                      ])}>
                      <View style={styles.knownHeaderLeft}>
                        <AppIcon
                          name={knownExpanded ? 'chevronDown' : 'chevronRight'}
                          size="xs"
                          color={knownSectionHover ? colors.success : colors.muted}
                        />
                        <View
                          style={[
                            styles.filterDot,
                            { backgroundColor: VOCAB_STATUS_META.known.dotColor },
                          ]}
                        />
                        <Text
                          style={[
                            styles.knownHeaderText,
                            { color: knownSectionHover ? colors.success : colors.muted },
                          ]}>
                          {knownSectionHover
                            ? 'Отпустите, чтобы отметить как выученное'
                            : `Выучено (${knownWords.length})`}
                        </Text>
                      </View>
                    </RipplePressable>
                  </WebDragBox>

                  {knownExpanded && knownWords.length > 0 ? (
                    <View
                      style={[
                        styles.wordGrid,
                        isDesktop ? styles.wordGridDesktop : null,
                        styles.knownGridOpacity,
                      ]}>
                      {knownWords.map((word, index) => (
                        <WordCardItem
                          key={word.id}
                          word={word}
                          languageCode={activeLanguage.code}
                          speakingId={speakingId}
                          colors={colors}
                          isDesktop={isDesktop}
                          canDrag={Platform.OS === 'web'}
                          canMoveUp={index > 0}
                          canMoveDown={index < knownWords.length - 1}
                          isDragging={draggingWordId === word.id}
                          dropIndicator={
                            wordDropTarget?.id === word.id ? wordDropTarget.position : null
                          }
                          onSpeak={speak}
                          onOpen={(id) => setSelectedWordId(id)}
                          onChangeStatus={handleChangeWordStatus}
                          onGenerateExamples={handleGenerateExamples}
                          onMoveByOffset={(id, delta) =>
                            handleMoveWordByOffset(id, delta, knownWords)
                          }
                          onDelete={handleDeleteWord}
                          onDragStart={(id) => setDraggingWordId(id)}
                          onDragEnd={() => {
                            setDraggingWordId(null);
                            setWordDropTarget(null);
                            setStatusDropHover(null);
                            setKnownSectionHover(false);
                          }}
                          onDragOver={(targetId, pos) => {
                            setWordDropTarget((prev) =>
                              prev?.id === targetId && prev.position === pos
                                ? prev
                                : { id: targetId, position: pos },
                            );
                          }}
                          onDragLeave={(targetId) => {
                            setWordDropTarget((prev) => (prev?.id === targetId ? null : prev));
                          }}
                          onDropWord={handleDropWordOnWord}
                        />
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.section}>
              {/* Compact Sentence Composer */}
              <View
                style={[
                  styles.sentenceComposer,
                  { backgroundColor: colors.surface, borderColor: colors.line },
                ]}>
                <TextInput
                  ref={sentenceInputRef}
                  value={sentenceDraft}
                  onChangeText={setSentenceDraft}
                  multiline
                  placeholder={`Предложение на языке «${activeLanguage.name}» для разбора…`}
                  placeholderTextColor={colors.muted}
                  textAlignVertical="top"
                  onKeyPress={(event) => {
                    if (Platform.OS === 'web') {
                      const nativeEvent = event.nativeEvent as unknown as {
                        key?: string;
                        metaKey?: boolean;
                        ctrlKey?: boolean;
                      };
                      if (
                        nativeEvent.key === 'Enter' &&
                        (nativeEvent.metaKey || nativeEvent.ctrlKey)
                      ) {
                        handleAnalyzeSentence();
                      }
                    }
                  }}
                  style={[styles.sentenceInput, { color: colors.text }]}
                />
                <View style={styles.sentenceComposerFooter}>
                  <View style={styles.aiHintRow}>
                    <View
                      style={[
                        styles.aiDot,
                        { backgroundColor: aiProvider.isMock ? colors.warning : colors.success },
                      ]}
                    />
                    <Text style={[styles.aiHintText, { color: colors.muted }]}>
                      {aiProvider.label}
                    </Text>
                  </View>

                  <RipplePressable
                    disabled={sentenceDraft.trim().length === 0 || aiBusy !== null}
                    onPress={handleAnalyzeSentence}
                    style={StyleSheet.flatten([
                      styles.analyzeBtn,
                      { backgroundColor: colors.accent },
                      sentenceDraft.trim().length === 0 || aiBusy !== null
                        ? styles.disabled
                        : null,
                    ])}>
                    {aiBusy === 'sentence' ? (
                      <ActivityIndicator size="small" color={colors.accentText} />
                    ) : (
                      <>
                        <AppIcon name="sparkles" size="xs" color={colors.accentText} />
                        <Text style={[styles.analyzeBtnText, { color: colors.accentText }]}>
                          Разобрать
                        </Text>
                      </>
                    )}
                  </RipplePressable>
                </View>
              </View>

              {/* Sentences List */}
              {filteredSentences.length === 0 ? (
                <View
                  style={[
                    styles.emptyCard,
                    { backgroundColor: colors.surface, borderColor: colors.line },
                  ]}>
                  <Text style={[styles.emptyText, { color: colors.muted }]}>
                    {search.trim().length > 0
                      ? 'Подходящих предложений не найдено'
                      : 'Разобранных предложений пока нет — вставьте первое выше'}
                  </Text>
                </View>
              ) : (
                <View style={styles.sentencesList}>
                  {filteredSentences.map((item, index) => (
                    <SentenceCardItem
                      key={item.id}
                      sentence={item}
                      languageCode={activeLanguage.code}
                      speakingId={speakingId}
                      colors={colors}
                      vocabByNormalizedTerm={vocabByNormalizedTerm}
                      canDrag={Platform.OS === 'web' && search.trim().length === 0}
                      canMoveUp={search.trim().length === 0 && index > 0}
                      canMoveDown={
                        search.trim().length === 0 && index < filteredSentences.length - 1
                      }
                      isDragging={draggingSentenceId === item.id}
                      dropIndicator={
                        sentenceDropTarget?.id === item.id ? sentenceDropTarget.position : null
                      }
                      onSpeak={speak}
                      onAddTokenToVocab={handleAddTokenToVocab}
                      onAddAllTokensToVocab={handleAddAllTokensToVocab}
                      onMoveByOffset={handleMoveSentenceByOffset}
                      onDelete={handleDeleteSentence}
                      onCopyText={handleCopyText}
                      onDragStart={(id) => setDraggingSentenceId(id)}
                      onDragEnd={() => {
                        setDraggingSentenceId(null);
                        setSentenceDropTarget(null);
                      }}
                      onDragOver={(targetId, pos) => {
                        setSentenceDropTarget((prev) =>
                          prev?.id === targetId && prev.position === pos
                            ? prev
                            : { id: targetId, position: pos },
                        );
                      }}
                      onDragLeave={(targetId) => {
                        setSentenceDropTarget((prev) => (prev?.id === targetId ? null : prev));
                      }}
                      onDropSentence={handleDropSentence}
                    />
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Language Switcher Popover */}
      <AnchoredPopover
        visible={langMenuOpen}
        anchor={langMenuAnchor}
        width={260}
        estimatedHeight={320}
        align="left"
        colors={colors}
        onClose={() => setLangMenuOpen(false)}>
        <View style={styles.popoverBody}>
          {languages.map((lang) => {
            const active = lang.id === activeLangId;
            const stat = langStats[lang.id];
            const wordCount = stat?.wordCount ?? 0;

            return (
              <View
                key={lang.id}
                style={[
                  styles.langPopoverRow,
                  active ? { backgroundColor: colors.surfaceActive } : null,
                ]}>
                <RipplePressable
                  onPress={() => {
                    setLangMenuOpen(false);
                    selectLanguage(lang.id);
                  }}
                  style={styles.langPopoverSelect}>
                  <Text style={[styles.langCodeBadge, { color: colors.muted }]}>
                    {lang.code.toUpperCase()}
                  </Text>
                  <Text
                    style={[styles.langPopoverName, { color: colors.text }]}
                    numberOfLines={1}>
                    {lang.name}
                  </Text>
                  <Text style={[styles.langPopoverCount, { color: colors.muted }]}>
                    {wordCount}
                  </Text>
                  {active ? <AppIcon name="check" size="xs" color={colors.text} /> : null}
                </RipplePressable>

                <RipplePressable
                  accessibilityLabel={`Настроить язык ${lang.name}`}
                  onPress={() => {
                    setLangMenuOpen(false);
                    setLangDialog({ open: true, mode: 'edit', language: lang });
                  }}
                  style={styles.langEditBtn}>
                  <AppIcon name="edit" size="xs" color={colors.muted} />
                </RipplePressable>
              </View>
            );
          })}

          <View style={[styles.popoverDivider, { backgroundColor: colors.line }]} />

          <RipplePressable
            onPress={() => {
              setLangMenuOpen(false);
              setLangDialog({ open: true, mode: 'create', language: null });
            }}
            style={styles.popoverActionRow}>
            <AppIcon name="plus" size="xs" color={colors.text} />
            <Text style={[styles.popoverActionText, { color: colors.text }]}>Добавить язык</Text>
          </RipplePressable>

          <View style={[styles.popoverDivider, { backgroundColor: colors.line }]} />

          <View style={styles.popoverAiRow}>
            <View
              style={[
                styles.aiDot,
                { backgroundColor: aiProvider.isMock ? colors.warning : colors.success },
              ]}
            />
            <Text style={[styles.popoverAiText, { color: colors.muted }]}>{aiProvider.label}</Text>
          </View>
        </View>
      </AnchoredPopover>

      {/* Sort Mode Popover */}
      <AnchoredPopover
        visible={sortMenuOpen}
        anchor={sortMenuAnchor}
        width={186}
        estimatedHeight={145}
        align="right"
        colors={colors}
        onClose={() => setSortMenuOpen(false)}>
        <View style={styles.popoverBody}>
          {SORT_MODES.map((mode) => {
            const active = sortMode === mode;
            return (
              <RipplePressable
                key={mode}
                onPress={() => {
                  setSortMode(mode);
                  setSortMenuOpen(false);
                }}
                style={StyleSheet.flatten([
                  styles.popoverActionRow,
                  active ? { backgroundColor: colors.surfaceActive } : null,
                ])}>
                <Text style={[styles.popoverActionText, { color: colors.text }]}>
                  {VOCAB_SORT_META[mode].label}
                </Text>
                {active ? <AppIcon name="check" size="xs" color={colors.text} /> : null}
              </RipplePressable>
            );
          })}
        </View>
      </AnchoredPopover>

      {/* Modals */}
      <CreateWordModal
        visible={createWordOpen}
        language={activeLanguage}
        existingWordsByTerm={vocabByNormalizedTerm}
        onClose={() => setCreateWordOpen(false)}
        onOpenExisting={(id) => setSelectedWordId(id)}
        onAnalyzeWithAI={handleAnalyzeWordDraft}
        onCreate={handleCreateWordFromModal}
      />

      <WordDetailModal
        word={selectedWord}
        languageCode={activeLanguage.code}
        speakingId={speakingId}
        aiGenerating={aiBusy === 'examples'}
        onSpeak={speak}
        onClose={() => setSelectedWordId(null)}
        onSave={handleSaveWord}
        onDelete={handleDeleteWord}
        onGenerateExamples={handleGenerateExamples}
        onAddManualExample={handleAddManualExample}
        onReorderExamples={handleReorderExamples}
        onDeleteExample={handleDeleteExample}
      />

      <FlashcardStudyModal
        visible={studyOpen}
        language={activeLanguage}
        words={words}
        onClose={() => setStudyOpen(false)}
        onRateWord={handleRateWordInStudy}
      />

      <AddLanguageDialog
        visible={langDialog.open}
        mode={langDialog.mode}
        language={langDialog.language}
        canDelete={languages.length > 1}
        existingCodes={existingLangCodes}
        onClose={() => setLangDialog({ open: false, mode: 'create', language: null })}
        onCreate={handleCreateLanguage}
        onUpdate={handleUpdateLanguage}
        onDelete={handleDeleteLanguage}
      />

      {/* Floating Drag-to-Delete Trash Zone */}
      <DragTrashZone
        visible={isDraggingAnything}
        label={trashLabel}
        colors={colors}
        onDropDelete={handleDropToTrash}
      />

      {/* Undo / Redo & Status Toast */}
      <HistoryToast message={toastMessage} colors={colors} />
    </View>
  );
}

const styles = StyleSheet.create({
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screen: {
    flex: 1,
  },
  screenDesktop: {
    paddingHorizontal: 24,
    paddingTop: 14,
  },
  screenMobile: {
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 40,
    marginBottom: 12,
  },
  toolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
    minWidth: 0,
  },
  langSwitcherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 34,
    paddingHorizontal: 11,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 220,
  },
  langCodeTag: {
    fontSize: 10,
    fontWeight: '700',
  },
  langSwitcherName: {
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  segmentedWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
    height: 34,
  },
  segmentedFull: {
    width: '100%',
  },
  segmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 7,
  },
  segmentBtnFull: {
    flex: 1,
  },
  segmentLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  segmentCount: {
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.75,
  },
  toolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  toolbarGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toolbarDivider: {
    width: 1,
    height: 20,
    opacity: 0.7,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 184,
    height: 34,
    borderRadius: 9,
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
    minWidth: 0,
  },
  clearBtn: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sortTriggerText: {
    fontSize: 12,
    fontWeight: '600',
  },
  primaryCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    height: 34,
    borderRadius: 9,
  },
  primaryCtaText: {
    fontSize: 13,
    fontWeight: '600',
  },
  iconPill: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileSubBar: {
    gap: 8,
    marginBottom: 12,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingBottom: 64,
  },
  inner: {
    width: '100%',
    maxWidth: 960,
  },
  section: {
    gap: 14,
  },
  statusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  filterPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
  },
  filterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  studyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
  },
  studyBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
  },
  progressTrack: {
    width: 72,
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  emptyCard: {
    borderRadius: 14,
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
  quickAddBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
  },
  quickAddInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 6,
    minWidth: 0,
  },
  quickAddIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAddSubmitBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  knownSection: {
    gap: 10,
    marginTop: 4,
  },
  knownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  knownHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  knownHeaderText: {
    fontSize: 12,
    fontWeight: '600',
  },
  knownGridOpacity: {
    opacity: 0.85,
  },
  sentenceComposer: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 13,
    gap: 10,
  },
  sentenceInput: {
    fontSize: 15,
    lineHeight: 22,
    minHeight: 56,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  sentenceComposerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  aiHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aiDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  aiHintText: {
    fontSize: 11,
    fontWeight: '600',
  },
  analyzeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 9,
    minWidth: 108,
  },
  analyzeBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sentencesList: {
    gap: 12,
  },
  popoverBody: {
    gap: 2,
  },
  langPopoverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
  },
  langPopoverSelect: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 0,
  },
  langCodeBadge: {
    fontSize: 10,
    fontWeight: '700',
    width: 24,
  },
  langPopoverName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  langPopoverCount: {
    fontSize: 11,
    fontWeight: '600',
  },
  langEditBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
  },
  popoverDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
    marginHorizontal: 6,
  },
  popoverActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderRadius: 8,
  },
  popoverActionText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  popoverAiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  popoverAiText: {
    fontSize: 11,
    fontWeight: '500',
  },
  disabled: {
    opacity: 0.35,
  },
});
