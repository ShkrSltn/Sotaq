import type { Migration } from '@/db/migrations/001_initial';

export const migration008LanguageLabV2: Migration = {
  version: 8,
  name: '008_language_lab_v2',
  async up(db) {
    await db.execAsync(`
      ALTER TABLE languages ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE vocab_words ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE vocab_examples ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE analyzed_sentences ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

      CREATE INDEX IF NOT EXISTS idx_vocab_words_lang_pos
        ON vocab_words(user_id, language_id, position ASC, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_analyzed_sentences_lang_pos
        ON analyzed_sentences(user_id, language_id, position ASC, created_at DESC);
    `);

    // Backfill deterministic positions for existing records per user/language/word
    const langRows = await db.getAllAsync<{ id: string; user_id: string }>(
      'SELECT id, user_id FROM languages ORDER BY user_id ASC, is_default DESC, created_at ASC;',
    );
    const langPosByUser = new Map<string, number>();
    for (const row of langRows) {
      const pos = langPosByUser.get(row.user_id) ?? 0;
      await db.runAsync('UPDATE languages SET position = ? WHERE id = ?;', pos, row.id);
      langPosByUser.set(row.user_id, pos + 1);
    }

    const wordRows = await db.getAllAsync<{ id: string; language_id: string }>(
      'SELECT id, language_id FROM vocab_words ORDER BY language_id ASC, updated_at DESC, created_at DESC;',
    );
    const wordPosByLang = new Map<string, number>();
    for (const row of wordRows) {
      const pos = wordPosByLang.get(row.language_id) ?? 0;
      await db.runAsync('UPDATE vocab_words SET position = ? WHERE id = ?;', pos, row.id);
      wordPosByLang.set(row.language_id, pos + 1);
    }

    const exRows = await db.getAllAsync<{ id: string; word_id: string }>(
      'SELECT id, word_id FROM vocab_examples ORDER BY word_id ASC, created_at ASC;',
    );
    const exPosByWord = new Map<string, number>();
    for (const row of exRows) {
      const pos = exPosByWord.get(row.word_id) ?? 0;
      await db.runAsync('UPDATE vocab_examples SET position = ? WHERE id = ?;', pos, row.id);
      exPosByWord.set(row.word_id, pos + 1);
    }

    const sentRows = await db.getAllAsync<{ id: string; language_id: string }>(
      'SELECT id, language_id FROM analyzed_sentences ORDER BY language_id ASC, created_at DESC;',
    );
    const sentPosByLang = new Map<string, number>();
    for (const row of sentRows) {
      const pos = sentPosByLang.get(row.language_id) ?? 0;
      await db.runAsync('UPDATE analyzed_sentences SET position = ? WHERE id = ?;', pos, row.id);
      sentPosByLang.set(row.language_id, pos + 1);
    }
  },
};
