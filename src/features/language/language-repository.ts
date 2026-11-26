import type { SQLiteDatabase } from 'expo-sqlite';

import { createId, nowIso } from '@/db/client';
import type {
  AnalyzedSentenceRecord,
  LanguageRecord,
  VocabExampleRecord,
  VocabStatus,
  VocabWordRecord,
} from '@/features/language/types';
import type {
  GeneratedExample,
  SentenceAnalysisResult,
  SentenceGrammarRule,
  SentenceToken,
  WordAnalysisResult,
} from '@/services/ai/language-ai';

type LanguageRow = {
  id: string;
  user_id: string;
  code: string;
  name: string;
  native_lang: string;
  is_default: number;
  created_at: string;
};

type WordRow = {
  id: string;
  user_id: string;
  language_id: string;
  term: string;
  reading: string;
  part_of_speech: string;
  translation: string;
  explanation: string;
  status: string;
  review_count: number;
  ai_payload_json: string | null;
  created_at: string;
  updated_at: string;
};

type ExampleRow = {
  id: string;
  word_id: string;
  sentence: string;
  translation: string;
  note: string;
  source: string;
  created_at: string;
};

type SentenceRow = {
  id: string;
  user_id: string;
  language_id: string;
  original_text: string;
  translation: string;
  grammar_summary: string;
  rules_json: string;
  tokens_json: string;
  created_at: string;
};

function normalizeStatus(raw: string): VocabStatus {
  if (raw === 'learning' || raw === 'known' || raw === 'new') {
    return raw;
  }
  return 'new';
}

function safeParseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function mapLanguage(row: LanguageRow): LanguageRecord {
  return {
    id: row.id,
    userId: row.user_id,
    code: row.code,
    name: row.name,
    nativeLang: row.native_lang,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
  };
}

export async function ensureDefaultLanguage(
  db: SQLiteDatabase,
  userId: string,
): Promise<LanguageRecord[]> {
  const existing = await listLanguages(db, userId);
  if (existing.length > 0) {
    return existing;
  }

  const now = nowIso();
  const langId = createId();
  const word1Id = createId();
  const word2Id = createId();
  const sentenceId = createId();

  const starterTokens: SentenceToken[] = [
    {
      surface: 'Consistency',
      lemma: 'consistency',
      partOfSpeech: 'существительное',
      translation: 'последовательность, регулярность',
      role: 'подлежащее',
    },
    {
      surface: 'beats',
      lemma: 'beat',
      partOfSpeech: 'глагол',
      translation: 'побеждает, превосходит',
      role: 'сказуемое (Present Simple, 3-е л.)',
    },
    {
      surface: 'intensity',
      lemma: 'intensity',
      partOfSpeech: 'существительное',
      translation: 'интенсивность',
      role: 'дополнение',
    },
  ];

  const starterRules: SentenceGrammarRule[] = [
    {
      title: 'Present Simple (3-е лицо ед. ч.)',
      explanation:
        'Глагол «beat» получает окончание -s («beats»), так как подлежащее «Consistency» выражает общее утверждение в единственном числе.',
    },
    {
      title: 'Абстрактные существительные без артикля',
      explanation:
        '«Consistency» и «intensity» используются в обобщённом смысле, поэтому артикль «the» не ставится.',
    },
  ];

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO languages (id, user_id, code, name, native_lang, is_default, created_at)
       VALUES (?, ?, 'en', 'Английский', 'ru', 1, ?);`,
      langId,
      userId,
      now,
    );

    await db.runAsync(
      `INSERT INTO vocab_words
         (id, user_id, language_id, term, reading, part_of_speech, translation, explanation, status, review_count, ai_payload_json, created_at, updated_at)
       VALUES (?, ?, ?, 'consistency', '/kənˈsɪs.tən.si/', 'существительное', 'регулярность, последовательность', 'Часто используется в контексте привычек и обучения: делать понемногу, но каждый день.', 'learning', 1, NULL, ?, ?),
              (?, ?, ?, 'nuance', '/ˈnjuː.ɑːns/', 'существительное', 'нюанс, тонкий оттенок', 'Оттенок смысла, интонации или различие, которое важно в живой речи.', 'new', 0, NULL, ?, ?);`,
      word1Id,
      userId,
      langId,
      now,
      now,
      word2Id,
      userId,
      langId,
      now,
      now,
    );

    await db.runAsync(
      `INSERT INTO vocab_examples (id, word_id, sentence, translation, note, source, created_at)
       VALUES (?, ?, 'Consistency beats intensity when learning a language.', 'Регулярность побеждает интенсивность при изучении языка.', 'Устойчивый мотивационный пример', 'manual', ?),
              (?, ?, 'There is a subtle nuance between these two verbs.', 'Между этими двумя глаголами есть тонкий нюанс.', 'Часто сочетается со словом subtle', 'manual', ?);`,
      createId(),
      word1Id,
      now,
      createId(),
      word2Id,
      now,
    );

    await db.runAsync(
      `INSERT INTO analyzed_sentences
         (id, user_id, language_id, original_text, translation, grammar_summary, rules_json, tokens_json, created_at)
       VALUES (?, ?, ?, 'Consistency beats intensity.', 'Регулярность побеждает интенсивность.', 'Короткое утверждение в Present Simple с абстрактными существительными без артиклей.', ?, ?, ?);`,
      sentenceId,
      userId,
      langId,
      JSON.stringify(starterRules),
      JSON.stringify(starterTokens),
      now,
    );

    await db.runAsync(
      `INSERT INTO sentence_word_links (id, sentence_id, word_id, surface_form)
       VALUES (?, ?, ?, 'Consistency');`,
      createId(),
      sentenceId,
      word1Id,
    );
  });

  return listLanguages(db, userId);
}

export async function listLanguages(
  db: SQLiteDatabase,
  userId: string,
): Promise<LanguageRecord[]> {
  const rows = await db.getAllAsync<LanguageRow>(
    'SELECT * FROM languages WHERE user_id = ? ORDER BY is_default DESC, created_at ASC;',
    userId,
  );
  return rows.map(mapLanguage);
}

export async function createLanguage(
  db: SQLiteDatabase,
  userId: string,
  input: { code: string; name: string; nativeLang?: string },
): Promise<LanguageRecord> {
  const id = createId();
  const now = nowIso();
  const code = input.code.trim().toLowerCase() || 'custom';
  const name = input.name.trim();
  const nativeLang = input.nativeLang ?? 'ru';

  await db.runAsync(
    `INSERT INTO languages (id, user_id, code, name, native_lang, is_default, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?);`,
    id,
    userId,
    code,
    name,
    nativeLang,
    now,
  );

  return {
    id,
    userId,
    code,
    name,
    nativeLang,
    isDefault: false,
    createdAt: now,
  };
}

export async function deleteLanguage(db: SQLiteDatabase, languageId: string): Promise<void> {
  await db.runAsync('DELETE FROM languages WHERE id = ?;', languageId);
}

export async function listVocabWords(
  db: SQLiteDatabase,
  userId: string,
  languageId: string,
): Promise<VocabWordRecord[]> {
  const [wordRows, exampleRows] = await Promise.all([
    db.getAllAsync<WordRow>(
      `SELECT * FROM vocab_words
       WHERE user_id = ? AND language_id = ?
       ORDER BY updated_at DESC, created_at DESC;`,
      userId,
      languageId,
    ),
    db.getAllAsync<ExampleRow>(
      `SELECT e.*
       FROM vocab_examples e
       INNER JOIN vocab_words w ON w.id = e.word_id
       WHERE w.user_id = ? AND w.language_id = ?
       ORDER BY e.created_at ASC;`,
      userId,
      languageId,
    ),
  ]);

  const examplesByWord = new Map<string, VocabExampleRecord[]>();
  for (const row of exampleRows) {
    const list = examplesByWord.get(row.word_id) ?? [];
    list.push({
      id: row.id,
      wordId: row.word_id,
      sentence: row.sentence,
      translation: row.translation,
      note: row.note,
      source: row.source === 'ai' ? 'ai' : 'manual',
      createdAt: row.created_at,
    });
    examplesByWord.set(row.word_id, list);
  }

  return wordRows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    languageId: row.language_id,
    term: row.term,
    reading: row.reading,
    partOfSpeech: row.part_of_speech,
    translation: row.translation,
    explanation: row.explanation,
    status: normalizeStatus(row.status),
    reviewCount: row.review_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    examples: examplesByWord.get(row.id) ?? [],
  }));
}

export async function createVocabWord(
  db: SQLiteDatabase,
  userId: string,
  languageId: string,
  input: {
    term: string;
    reading?: string;
    partOfSpeech?: string;
    translation?: string;
    explanation?: string;
    status?: VocabStatus;
    aiPayload?: WordAnalysisResult | null;
    examples?: GeneratedExample[];
    source?: 'manual' | 'ai';
  },
): Promise<string> {
  const id = createId();
  const now = nowIso();
  const source = input.source ?? (input.aiPayload ? 'ai' : 'manual');

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO vocab_words
         (id, user_id, language_id, term, reading, part_of_speech, translation, explanation, status, review_count, ai_payload_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?);`,
      id,
      userId,
      languageId,
      input.term.trim(),
      input.reading?.trim() ?? '',
      input.partOfSpeech?.trim() ?? '',
      input.translation?.trim() ?? '',
      input.explanation?.trim() ?? '',
      input.status ?? 'new',
      input.aiPayload ? JSON.stringify(input.aiPayload) : null,
      now,
      now,
    );

    if (input.examples && input.examples.length > 0) {
      for (const ex of input.examples) {
        await db.runAsync(
          `INSERT INTO vocab_examples (id, word_id, sentence, translation, note, source, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?);`,
          createId(),
          id,
          ex.sentence.trim(),
          ex.translation.trim(),
          ex.note.trim(),
          source,
          now,
        );
      }
    }
  });

  return id;
}

export async function updateVocabWord(
  db: SQLiteDatabase,
  wordId: string,
  patch: {
    term?: string;
    reading?: string;
    partOfSpeech?: string;
    translation?: string;
    explanation?: string;
    status?: VocabStatus;
  },
): Promise<void> {
  const existing = await db.getFirstAsync<WordRow>(
    'SELECT * FROM vocab_words WHERE id = ?;',
    wordId,
  );
  if (!existing) {
    return;
  }

  await db.runAsync(
    `UPDATE vocab_words
     SET term = ?, reading = ?, part_of_speech = ?, translation = ?, explanation = ?, status = ?, updated_at = ?
     WHERE id = ?;`,
    patch.term !== undefined ? patch.term.trim() : existing.term,
    patch.reading !== undefined ? patch.reading.trim() : existing.reading,
    patch.partOfSpeech !== undefined ? patch.partOfSpeech.trim() : existing.part_of_speech,
    patch.translation !== undefined ? patch.translation.trim() : existing.translation,
    patch.explanation !== undefined ? patch.explanation.trim() : existing.explanation,
    patch.status !== undefined ? patch.status : existing.status,
    nowIso(),
    wordId,
  );
}

export async function setVocabWordStatus(
  db: SQLiteDatabase,
  wordId: string,
  status: VocabStatus,
): Promise<void> {
  await db.runAsync(
    `UPDATE vocab_words
     SET status = ?, review_count = review_count + 1, updated_at = ?
     WHERE id = ?;`,
    status,
    nowIso(),
    wordId,
  );
}

export async function deleteVocabWord(db: SQLiteDatabase, wordId: string): Promise<void> {
  await db.runAsync('DELETE FROM vocab_words WHERE id = ?;', wordId);
}

export async function addVocabExamples(
  db: SQLiteDatabase,
  wordId: string,
  examples: GeneratedExample[],
  source: 'manual' | 'ai',
): Promise<void> {
  const now = nowIso();
  await db.withTransactionAsync(async () => {
    for (const ex of examples) {
      if (!ex.sentence.trim()) {
        continue;
      }
      await db.runAsync(
        `INSERT INTO vocab_examples (id, word_id, sentence, translation, note, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        createId(),
        wordId,
        ex.sentence.trim(),
        ex.translation.trim(),
        ex.note.trim(),
        source,
        now,
      );
    }
    await db.runAsync('UPDATE vocab_words SET updated_at = ? WHERE id = ?;', now, wordId);
  });
}

export async function deleteVocabExample(db: SQLiteDatabase, exampleId: string): Promise<void> {
  await db.runAsync('DELETE FROM vocab_examples WHERE id = ?;', exampleId);
}

export async function listAnalyzedSentences(
  db: SQLiteDatabase,
  userId: string,
  languageId: string,
): Promise<AnalyzedSentenceRecord[]> {
  const rows = await db.getAllAsync<SentenceRow>(
    `SELECT * FROM analyzed_sentences
     WHERE user_id = ? AND language_id = ?
     ORDER BY created_at DESC;`,
    userId,
    languageId,
  );

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    languageId: row.language_id,
    originalText: row.original_text,
    translation: row.translation,
    grammarSummary: row.grammar_summary,
    rules: safeParseJson<SentenceGrammarRule[]>(row.rules_json, []),
    tokens: safeParseJson<SentenceToken[]>(row.tokens_json, []),
    createdAt: row.created_at,
  }));
}

export async function saveAnalyzedSentence(
  db: SQLiteDatabase,
  userId: string,
  languageId: string,
  analysis: SentenceAnalysisResult,
): Promise<string> {
  const id = createId();
  const now = nowIso();

  await db.runAsync(
    `INSERT INTO analyzed_sentences
       (id, user_id, language_id, original_text, translation, grammar_summary, rules_json, tokens_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    id,
    userId,
    languageId,
    analysis.originalText.trim(),
    analysis.translation.trim(),
    analysis.grammarSummary.trim(),
    JSON.stringify(analysis.rules),
    JSON.stringify(analysis.tokens),
    now,
  );

  return id;
}

export async function linkWordToSentence(
  db: SQLiteDatabase,
  sentenceId: string,
  wordId: string,
  surfaceForm: string,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO sentence_word_links (id, sentence_id, word_id, surface_form)
     VALUES (?, ?, ?, ?);`,
    createId(),
    sentenceId,
    wordId,
    surfaceForm,
  );
}

export async function deleteAnalyzedSentence(
  db: SQLiteDatabase,
  sentenceId: string,
): Promise<void> {
  await db.runAsync('DELETE FROM analyzed_sentences WHERE id = ?;', sentenceId);
}
