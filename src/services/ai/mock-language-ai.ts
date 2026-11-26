import type {
  AnalyzeSentenceInput,
  AnalyzeWordInput,
  GeneratedExample,
  GenerateExamplesInput,
  LanguageAIProvider,
  SentenceAnalysisResult,
  SentenceToken,
  WordAnalysisResult,
} from '@/services/ai/language-ai';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tokenizeSentence(sentence: string): string[] {
  return sentence
    .split(/\s+/)
    .map((part) => part.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((part) => part.length > 0);
}

/**
 * Local stub provider used in Stage 6 so the full Language Lab UI & SQLite schema
 * can be exercised end-to-end before plugging in a real LLM in Stage 7.
 */
export const mockLanguageAIProvider: LanguageAIProvider = {
  id: 'mock-local',
  label: 'Mock AI (Этап 6)',
  isMock: true,

  async analyzeWord(input: AnalyzeWordInput): Promise<WordAnalysisResult> {
    await wait(280);
    const term = input.term.trim();

    return {
      term,
      reading: `[${term.toLowerCase()}]`,
      partOfSpeech: 'слово / фраза',
      translation: `Перевод «${term}» (подключится ИИ на Этапе 7)`,
      explanation: `Локальная заготовка разбора для языка «${input.targetLangName}». После подключения AI-модели здесь будут нюансы употребления, оттенки смысла и частые сочетания.`,
      examples: [
        {
          sentence: `Example using "${term}" in everyday context.`,
          translation: `Пример употребления «${term}» в повседневном контексте.`,
          note: 'Сгенерировано локальным mock-провайдером',
        },
        {
          sentence: `Try to notice how "${term}" sounds in a natural sentence.`,
          translation: `Обратите внимание, как «${term}» звучит в живом предложении.`,
          note: 'Второй шаблонный пример',
        },
      ],
    };
  },

  async generateExamples(input: GenerateExamplesInput): Promise<GeneratedExample[]> {
    await wait(260);
    const term = input.term.trim();
    const count = Math.max(1, Math.min(input.count, 5));
    const templates = [
      {
        sentence: `In practice, "${term}" often appears in short conversations.`,
        translation: `На практике «${term}» часто встречается в коротких диалогах.`,
        note: 'Разговорный пример (mock)',
      },
      {
        sentence: `Writing a note with "${term}" helps lock it into memory.`,
        translation: `Запись примера с «${term}» помогает быстрее закрепить слово.`,
        note: 'Учебный пример (mock)',
      },
      {
        sentence: `We heard "${term}" several times while watching a video.`,
        translation: `Мы слышали «${term}» несколько раз во время просмотра видео.`,
        note: 'Контекстный пример (mock)',
      },
    ];

    return templates.slice(0, count);
  },

  async analyzeSentence(input: AnalyzeSentenceInput): Promise<SentenceAnalysisResult> {
    await wait(320);
    const originalText = input.sentence.trim();
    const rawTokens = tokenizeSentence(originalText);

    const tokens: SentenceToken[] = rawTokens.map((surface, index) => ({
      surface,
      lemma: surface.toLowerCase(),
      partOfSpeech: index === 0 ? 'слово' : 'лексема',
      translation: `Значение «${surface}»`,
      role: index === 0 ? 'начало фразы' : 'элемент предложения',
    }));

    return {
      originalText,
      translation: `Перевод предложения (${input.targetLangName} → ${input.nativeLangCode.toUpperCase()}) появится после подключения AI на Этапе 7.`,
      grammarSummary: `Предложение разбито на ${tokens.length} слов(а). Вы уже можете добавлять незнакомые слова в личный словарь в 1 клик — реальный грамматический разбор подключится на Этапе 7.`,
      tokens,
      rules: [
        {
          title: 'Порядок слов и структура (mock)',
          explanation:
            'На Этапе 7 ИИ автоматически выделит времена, падежи, частицы, предлоги и устойчивые конструкции именно для этого предложения.',
        },
        {
          title: 'Связь с личным словарём',
          explanation:
            'Нажмите на любое слово выше, чтобы сразу добавить его в личный словарь и отмечать статус знания.',
        },
      ],
    };
  },
};

let activeProvider: LanguageAIProvider = mockLanguageAIProvider;

export function getLanguageAIProvider(): LanguageAIProvider {
  return activeProvider;
}

export function setLanguageAIProvider(provider: LanguageAIProvider): void {
  activeProvider = provider;
}
