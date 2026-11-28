import type { SentenceGrammarRule, SentenceToken } from '@/services/ai/language-ai';

export type VocabStatus = 'new' | 'learning' | 'known';
export type VocabSortMode = 'manual' | 'recent' | 'alpha';
export type ReviewRating = 'again' | 'good' | 'easy';

export type LanguageRecord = {
  id: string;
  userId: string;
  code: string;
  name: string;
  nativeLang: string;
  isDefault: boolean;
  position: number;
  createdAt: string;
};

export type VocabExampleRecord = {
  id: string;
  wordId: string;
  sentence: string;
  translation: string;
  note: string;
  source: 'manual' | 'ai';
  position: number;
  createdAt: string;
};

export type VocabWordRecord = {
  id: string;
  userId: string;
  languageId: string;
  term: string;
  reading: string;
  partOfSpeech: string;
  translation: string;
  explanation: string;
  status: VocabStatus;
  reviewCount: number;
  position: number;
  nextReviewAt: string | null;
  intervalDays: number;
  easeFactor: number;
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  examples: VocabExampleRecord[];
};

export function isWordDueForReview(word: VocabWordRecord, nowMs = Date.now()): boolean {
  if (word.status === 'new') {
    return true;
  }
  if (!word.nextReviewAt) {
    return word.status === 'learning';
  }
  const ts = Date.parse(word.nextReviewAt);
  if (Number.isNaN(ts)) {
    return word.status !== 'known';
  }
  return ts <= nowMs;
}

export type AnalyzedSentenceRecord = {
  id: string;
  userId: string;
  languageId: string;
  originalText: string;
  translation: string;
  grammarSummary: string;
  rules: SentenceGrammarRule[];
  tokens: SentenceToken[];
  position: number;
  createdAt: string;
};

export type SentenceWordLinkRecord = {
  id: string;
  sentenceId: string;
  wordId: string;
  surfaceForm: string;
};

export type LanguageSnapshot = {
  words: VocabWordRecord[];
  sentences: AnalyzedSentenceRecord[];
  links: SentenceWordLinkRecord[];
};

export type LanguageStat = {
  wordCount: number;
  sentenceCount: number;
};

export const VOCAB_STATUS_ORDER: readonly VocabStatus[] = ['new', 'learning', 'known'];

export const VOCAB_STATUS_META: Record<
  VocabStatus,
  { label: string; pluralLabel: string; next: VocabStatus; dotColor: string }
> = {
  new: { label: 'Новое', pluralLabel: 'Новые', next: 'learning', dotColor: '#8B909C' },
  learning: { label: 'Учу', pluralLabel: 'Учу', next: 'known', dotColor: '#F59E0B' },
  known: { label: 'Знаю', pluralLabel: 'Знаю', next: 'new', dotColor: '#34C759' },
};

export const VOCAB_SORT_META: Record<VocabSortMode, { label: string }> = {
  manual: { label: 'Мой порядок' },
  recent: { label: 'Новые сверху' },
  alpha: { label: 'По алфавиту' },
};

export const LANGUAGE_PRESETS = [
  { code: 'en', name: 'Английский' },
  { code: 'de', name: 'Немецкий' },
  { code: 'es', name: 'Испанский' },
  { code: 'fr', name: 'Французский' },
  { code: 'ja', name: 'Японский' },
  { code: 'ko', name: 'Корейский' },
  { code: 'pl', name: 'Польский' },
  { code: 'it', name: 'Итальянский' },
] as const;
