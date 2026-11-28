import type { SQLiteDatabase } from 'expo-sqlite';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { RipplePressable } from '@/components/ripple-pressable';
import {
  closeInitializedDatabase,
  createId,
  DB_LOCK_CHANNEL,
  getInitializedDatabase,
  isOpfsLockError,
} from '@/db/client';
import * as SplashScreen from 'expo-splash-screen';
import { useThemeColors } from '@/theme/colors';

type DatabaseContextValue = {
  db: SQLiteDatabase | null;
  status: 'loading' | 'ready' | 'error' | 'yielded';
  schemaVersion: number;
  error: string | null;
  retry: () => void;
};

type LockChannelMessage =
  | { type: 'CLAIM_LOCK'; senderId: string }
  | { type: 'LOCK_RELEASED'; targetId: string };

const DatabaseContext = createContext<DatabaseContextValue | null>(null);

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const colors = useThemeColors();
  const [db, setDb] = useState<SQLiteDatabase | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'yielded'>('loading');
  const [schemaVersion, setSchemaVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isLockConflict, setIsLockConflict] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const tabIdRef = useRef<string>(createId());
  const channelRef = useRef<BroadcastChannel | null>(null);
  const claimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const retry = useCallback(() => {
    if (claimTimerRef.current) {
      clearTimeout(claimTimerRef.current);
      claimTimerRef.current = null;
    }
    setStatus('loading');
    setError(null);
    setIsLockConflict(false);
    setClaiming(false);
    setAttempt((value) => value + 1);
  }, []);

  // Multi-tab BroadcastChannel coordination on Web so another tab can cleanly yield the OPFS lock
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof BroadcastChannel === 'undefined') {
      return;
    }
    const channel = new BroadcastChannel(DB_LOCK_CHANNEL);
    channelRef.current = channel;

    channel.onmessage = async (event: MessageEvent<LockChannelMessage>) => {
      const msg = event.data;
      if (!msg) {
        return;
      }

      if (msg.type === 'CLAIM_LOCK' && msg.senderId !== tabIdRef.current) {
        await closeInitializedDatabase();
        setDb(null);
        setStatus('yielded');
        channel.postMessage({
          type: 'LOCK_RELEASED',
          targetId: msg.senderId,
        } satisfies LockChannelMessage);
      } else if (msg.type === 'LOCK_RELEASED' && msg.targetId === tabIdRef.current) {
        if (claimTimerRef.current) {
          clearTimeout(claimTimerRef.current);
        }
        claimTimerRef.current = setTimeout(() => {
          retry();
        }, 180);
      }
    };

    return () => {
      if (claimTimerRef.current) {
        clearTimeout(claimTimerRef.current);
        claimTimerRef.current = null;
      }
      channel.close();
      channelRef.current = null;
    };
  }, [retry]);

  const claimInThisTab = useCallback(() => {
    setClaiming(true);
    if (channelRef.current) {
      channelRef.current.postMessage({
        type: 'CLAIM_LOCK',
        senderId: tabIdRef.current,
      } satisfies LockChannelMessage);
      if (claimTimerRef.current) {
        clearTimeout(claimTimerRef.current);
      }
      // Fallback retry in case the other tab was already closed or unresponsive
      claimTimerRef.current = setTimeout(() => {
        retry();
      }, 650);
    } else {
      retry();
    }
  }, [retry]);

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
        setIsLockConflict(false);
        setClaiming(false);
        setStatus('ready');
      } catch (err) {
        if (cancelled) {
          return;
        }
        const message =
          err instanceof Error ? err.message : 'Не удалось инициализировать локальную базу SQLite.';
        setError(message);
        setIsLockConflict(isOpfsLockError(err));
        setClaiming(false);
        setStatus('error');
      }
    }

    boot();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    if (status === 'error' || status === 'yielded') {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [status]);

  if (status === 'yielded') {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <View
          style={[
            styles.errorCard,
            { backgroundColor: colors.surface, borderColor: colors.line },
          ]}>
          <Text style={[styles.errorTitle, { color: colors.text }]}>
            Sotaq открыт в другой вкладке
          </Text>
          <Text style={[styles.errorBody, { color: colors.muted }]}>
            Эта вкладка освободила доступ к локальной базе SQLite, чтобы данные не конфликтовали.
          </Text>
          <RipplePressable
            onPress={claimInThisTab}
            style={StyleSheet.flatten([styles.retryButton, { backgroundColor: colors.accent }])}>
            <Text style={[styles.retryLabel, { color: colors.accentText }]}>
              Продолжить в этой вкладке
            </Text>
          </RipplePressable>
        </View>
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
          <Text style={[styles.errorTitle, { color: colors.text }]}>
            {isLockConflict ? 'База открыта в другой вкладке' : 'Ошибка SQLite'}
          </Text>
          <Text style={[styles.errorBody, { color: colors.muted }]}>
            {isLockConflict
              ? 'На Web локальная SQLite (OPFS) может работать только в одной вкладке браузера одновременно.'
              : error}
          </Text>
          <Text style={[styles.errorHint, { color: colors.muted }]}>
            {isLockConflict
              ? 'Нажмите «Открыть в этой вкладке», чтобы автоматически перенести сессию сюда, либо закройте дублирующую вкладку.'
              : 'На Web локальная SQLite требует безопасный контекст (localhost или HTTPS) и заголовки COOP/COEP.'}
          </Text>
          <View style={styles.actionsRow}>
            {isLockConflict ? (
              <RipplePressable
                disabled={claiming}
                onPress={claimInThisTab}
                style={StyleSheet.flatten([
                  styles.retryButton,
                  { backgroundColor: colors.accent },
                ])}>
                <Text style={[styles.retryLabel, { color: colors.accentText }]}>
                  {claiming ? 'Переключение…' : 'Открыть в этой вкладке'}
                </Text>
              </RipplePressable>
            ) : null}
            <RipplePressable
              onPress={retry}
              style={StyleSheet.flatten([
                styles.retryButton,
                {
                  backgroundColor: isLockConflict ? colors.surfaceSubtle : colors.accent,
                },
              ])}>
              <Text
                style={[
                  styles.retryLabel,
                  { color: isLockConflict ? colors.text : colors.accentText },
                ]}>
                Повторить
              </Text>
            </RipplePressable>
          </View>
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
  errorCard: {
    width: '100%',
    maxWidth: 440,
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
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  retryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
});
