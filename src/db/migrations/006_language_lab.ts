import type { Migration } from '@/db/migrations/001_initial';

export const migration006LanguageLab: Migration = {
  version: 6,
  name: '006_language_lab',
  async up(db) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS languages (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        native_lang TEXT NOT NULL DEFAULT 'ru',
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_languages_user
        ON languages(user_id, is_default DESC, created_at ASC);

      CREATE TABLE IF NOT EXISTS vocab_words (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        language_id TEXT NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
        term TEXT NOT NULL,
        reading TEXT NOT NULL DEFAULT '',
        part_of_speech TEXT NOT NULL DEFAULT '',
        translation TEXT NOT NULL DEFAULT '',
        explanation TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'new',
        review_count INTEGER NOT NULL DEFAULT 0,
        ai_payload_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_vocab_words_lang_status
        ON vocab_words(user_id, language_id, status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS vocab_examples (
        id TEXT PRIMARY KEY NOT NULL,
        word_id TEXT NOT NULL REFERENCES vocab_words(id) ON DELETE CASCADE,
        sentence TEXT NOT NULL,
        translation TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'manual',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_vocab_examples_word
        ON vocab_examples(word_id, created_at ASC);

      CREATE TABLE IF NOT EXISTS analyzed_sentences (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        language_id TEXT NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
        original_text TEXT NOT NULL,
        translation TEXT NOT NULL DEFAULT '',
        grammar_summary TEXT NOT NULL DEFAULT '',
        rules_json TEXT NOT NULL DEFAULT '[]',
        tokens_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_analyzed_sentences_lang
        ON analyzed_sentences(user_id, language_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS sentence_word_links (
        id TEXT PRIMARY KEY NOT NULL,
        sentence_id TEXT NOT NULL REFERENCES analyzed_sentences(id) ON DELETE CASCADE,
        word_id TEXT NOT NULL REFERENCES vocab_words(id) ON DELETE CASCADE,
        surface_form TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sentence_word_links_sentence
        ON sentence_word_links(sentence_id);
    `);
  },
};
