import type { SQLiteDatabase } from 'expo-sqlite';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { RipplePressable } from '@/components/ripple-pressable';
import { getInitializedDatabase } from '@/db/client';
import { useThemeColors } from '@/theme/colors';

type DatabaseContextValue = {
  db: SQLiteDatabase | null;
  status: 'loading' | 'ready' | 'error';
  schemaVersion: number;
  error: string | null;
  retry: () => void;
};

const DatabaseContext = createContext<DatabaseContextValue | null>(null);

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const colors = useThemeColors();
  const [db, setDb] = useState<SQLiteDatabase | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [schemaVersion, setSchemaVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setStatus('loading');
    setError(null);
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const result = await getInitializedDatabase();
        if (cancelled) {
          return;
        }
        setDb(result.db);
        setSchemaVersion(result.schemaVersion);
        setStatus('ready');
      } catch (err) {
        if (cancelled) {
          return;
        }
        const message =
          err instanceof Error ? err.message : 'Не удалось инициализировать локальную базу SQLite.';
        setError(message);
        setStatus('error');
      }
    }

    boot();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (status === 'loading') {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="small" color={colors.text} />
        <Text style={[styles.loadingText, { color: colors.muted }]}>Загрузка базы данных…</Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <View
          style={[
            styles.errorCard,
            { backgroundColor: colors.surface, borderColor: colors.line },
          ]}>
          <Text style={[styles.errorTitle, { color: colors.text }]}>Ошибка SQLite</Text>
          <Text style={[styles.errorBody, { color: colors.muted }]}>{error}</Text>
          <Text style={[styles.errorHint, { color: colors.muted }]}>
            На Web локальная SQLite требует безопасный контекст (localhost или HTTPS) и заголовки
            COOP/COEP.
          </Text>
          <RipplePressable
            onPress={retry}
            style={StyleSheet.flatten([styles.retryButton, { backgroundColor: colors.accent }])}>
            <Text style={[styles.retryLabel, { color: colors.accentText }]}>Повторить</Text>
          </RipplePressable>
        </View>
      </View>
    );
  }

  return (
    <DatabaseContext.Provider value={{ db, status, schemaVersion, error, retry }}>
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDatabaseState(): DatabaseContextValue {
  const ctx = useContext(DatabaseContext);
  if (!ctx) {
    throw new Error('useDatabaseState must be used inside DatabaseProvider');
  }
  return ctx;
}

export function useDatabase(): SQLiteDatabase {
  const { db, status } = useDatabaseState();
  if (status !== 'ready' || !db) {
    throw new Error('useDatabase called before SQLite database is ready');
  }
  return db;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  errorCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    gap: 10,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  errorBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  errorHint: {
    fontSize: 12,
    lineHeight: 18,
  },
  retryButton: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
});
