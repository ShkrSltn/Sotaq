export type AnalyzeWordInput = {
  term: string;
  targetLangCode: string;
  targetLangName: string;
  nativeLangCode: string;
};

export type GeneratedExample = {
  sentence: string;
  translation: string;
  note: string;
};

export type WordAnalysisResult = {
  term: string;
  reading: string;
  partOfSpeech: string;
  translation: string;
  explanation: string;
  examples: GeneratedExample[];
};

export type GenerateExamplesInput = {
  term: string;
  translation?: string;
  targetLangCode: string;
  targetLangName: string;
  nativeLangCode: string;
  count: number;
};

export type AnalyzeSentenceInput = {
  sentence: string;
  targetLangCode: string;
  targetLangName: string;
  nativeLangCode: string;
};

export type SentenceToken = {
  surface: string;
  lemma: string;
  partOfSpeech: string;
  translation: string;
  role: string;
};

export type SentenceGrammarRule = {
  title: string;
  explanation: string;
};

export type SentenceAnalysisResult = {
  originalText: string;
  translation: string;
  grammarSummary: string;
  tokens: SentenceToken[];
  rules: SentenceGrammarRule[];
};

export interface LanguageAIProvider {
  readonly id: string;
  readonly label: string;
  readonly isMock: boolean;
  analyzeWord(input: AnalyzeWordInput): Promise<WordAnalysisResult>;
  generateExamples(input: GenerateExamplesInput): Promise<GeneratedExample[]>;
  analyzeSentence(input: AnalyzeSentenceInput): Promise<SentenceAnalysisResult>;
}
