import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

const LANG_CODE_TO_LOCALE: Record<string, string> = {
  en: 'en-US',
  de: 'de-DE',
  es: 'es-ES',
  fr: 'fr-FR',
  ja: 'ja-JP',
  ko: 'ko-KR',
  pl: 'pl-PL',
  it: 'it-IT',
  ru: 'ru-RU',
  uk: 'uk-UA',
  sr: 'sr-RS',
  pt: 'pt-BR',
  zh: 'zh-CN',
  tr: 'tr-TR',
  nl: 'nl-NL',
  cs: 'cs-CZ',
  sv: 'sv-SE',
  ar: 'ar-SA',
};

export function resolveSpeechLocale(code: string): string {
  const normalized = code.trim().toLowerCase();
  if (!normalized) {
    return 'en-US';
  }
  if (normalized.includes('-')) {
    return normalized;
  }
  return LANG_CODE_TO_LOCALE[normalized] ?? normalized;
}

export function stopSpeaking(): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    return;
  }
  Speech.stop();
}

export function speakText(
  text: string,
  langCode: string,
  options?: {
    rate?: number;
    onStart?: () => void;
    onDone?: () => void;
    onError?: () => void;
  },
): void {
  const clean = text.trim();
  if (!clean) {
    options?.onDone?.();
    return;
  }

  const locale = resolveSpeechLocale(langCode);
  const rate = options?.rate ?? 1.0;

  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      options?.onDone?.();
      return;
    }
    const synth = window.speechSynthesis;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = locale;
    utterance.rate = rate;

    const voices = synth.getVoices();
    const shortPrefix = locale.split('-')[0].toLowerCase();
    const matchedVoice =
      voices.find((v) => v.lang.toLowerCase() === locale.toLowerCase()) ??
      voices.find((v) => v.lang.toLowerCase().startsWith(`${shortPrefix}-`)) ??
      voices.find((v) => v.lang.toLowerCase().startsWith(shortPrefix));
    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }

    utterance.onstart = () => options?.onStart?.();
    utterance.onend = () => options?.onDone?.();
    utterance.onerror = () => options?.onError?.();

    synth.speak(utterance);
    return;
  }

  Speech.stop();
  Speech.speak(clean, {
    language: locale,
    rate,
    onStart: options?.onStart,
    onDone: options?.onDone,
    onStopped: options?.onDone,
    onError: () => options?.onError?.(),
  });
}

export function useSpeech() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  const stop = useCallback(() => {
    activeIdRef.current = null;
    setSpeakingId(null);
    stopSpeaking();
  }, []);

  const speak = useCallback(
    (id: string, text: string, langCode: string, rate = 1.0) => {
      if (activeIdRef.current === id) {
        stop();
        return;
      }
      activeIdRef.current = id;
      setSpeakingId(id);

      speakText(text, langCode, {
        rate,
        onDone: () => {
          if (activeIdRef.current === id) {
            activeIdRef.current = null;
            setSpeakingId(null);
          }
        },
        onError: () => {
          if (activeIdRef.current === id) {
            activeIdRef.current = null;
            setSpeakingId(null);
          }
        },
      });
    },
    [stop],
  );

  return { speakingId, speak, stop };
}
