import type { SentenceGrammarRule, SentenceToken } from '@/services/ai/language-ai';

export type VocabStatus = 'new' | 'learning' | 'known';

export type LanguageRecord = {
  id: string;
  userId: string;
  code: string;
  name: string;
  nativeLang: string;
  isDefault: boolean;
  createdAt: string;
};

export type VocabExampleRecord = {
  id: string;
  wordId: string;
  sentence: string;
  translation: string;
  note: string;
  source: 'manual' | 'ai';
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
  createdAt: string;
  updatedAt: string;
  examples: VocabExampleRecord[];
};

export type AnalyzedSentenceRecord = {
  id: string;
  userId: string;
  languageId: string;
  originalText: string;
  translation: string;
  grammarSummary: string;
  rules: SentenceGrammarRule[];
  tokens: SentenceToken[];
  createdAt: string;
};

export const VOCAB_STATUS_META: Record<
  VocabStatus,
  { label: string; next: VocabStatus }
> = {
  new: { label: 'Новое', next: 'learning' },
  learning: { label: 'Учу', next: 'known' },
  known: { label: 'Знаю', next: 'new' },
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
