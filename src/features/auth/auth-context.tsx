import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useDatabase } from '@/db/provider';
import {
  authenticateUser,
  computeEffectiveFeatures,
  createFirstAdmin,
  ensureRoleFeatureDefaults,
  getCurrentSessionUser,
  getUserCount,
  logoutCurrentSession,
} from '@/features/auth/auth-repository';
import type { FeatureAccessMap, UserRecord } from '@/features/auth/types';
import type { FeatureKey } from '@/features/registry';
import { useThemeColors } from '@/theme/colors';

export type AuthStatus = 'loading' | 'needs_setup' | 'unauthenticated' | 'authenticated';

const EMPTY_FEATURES: FeatureAccessMap = {
  home: true,
  calendar: false,
  kanban: false,
  todos: false,
  habits: false,
  notes: false,
  language: false,
  admin: false,
};

type AuthContextValue = {
  status: AuthStatus;
  user: UserRecord | null;
  features: FeatureAccessMap;
  canAccess: (key: FeatureKey) => boolean;
  setupAdmin: (input: {
    username: string;
    displayName: string;
    password: string;
  }) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const db = useDatabase();
  const colors = useThemeColors();

  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<UserRecord | null>(null);
  const [features, setFeatures] = useState<FeatureAccessMap>(EMPTY_FEATURES);

  const loadState = useCallback(async () => {
    await ensureRoleFeatureDefaults(db);
    const totalUsers = await getUserCount(db);
    if (totalUsers === 0) {
      setUser(null);
      setFeatures(EMPTY_FEATURES);
      setStatus('needs_setup');
      return;
    }

    const sessionUser = await getCurrentSessionUser(db);
    if (!sessionUser) {
      setUser(null);
      setFeatures(EMPTY_FEATURES);
      setStatus('unauthenticated');
      return;
    }

    const effective = await computeEffectiveFeatures(db, sessionUser);
    setUser(sessionUser);
    setFeatures(effective);
    setStatus('authenticated');
  }, [db]);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      await ensureRoleFeatureDefaults(db);
      const totalUsers = await getUserCount(db);
      if (cancelled) {
        return;
      }
      if (totalUsers === 0) {
        setUser(null);
        setFeatures(EMPTY_FEATURES);
        setStatus('needs_setup');
        return;
      }

      const sessionUser = await getCurrentSessionUser(db);
      if (cancelled) {
        return;
      }
      if (!sessionUser) {
        setUser(null);
        setFeatures(EMPTY_FEATURES);
        setStatus('unauthenticated');
        return;
      }

      const effective = await computeEffectiveFeatures(db, sessionUser);
      if (cancelled) {
        return;
      }
      setUser(sessionUser);
      setFeatures(effective);
      setStatus('authenticated');
    }

    boot();

    return () => {
      cancelled = true;
    };
  }, [db]);

  const setupAdmin = useCallback(
    async (input: { username: string; displayName: string; password: string }) => {
      const created = await createFirstAdmin(db, input);
      const effective = await computeEffectiveFeatures(db, created);
      setUser(created);
      setFeatures(effective);
      setStatus('authenticated');
    },
    [db],
  );

  const login = useCallback(
    async (username: string, password: string) => {
      const authed = await authenticateUser(db, username, password);
      const effective = await computeEffectiveFeatures(db, authed);
      setUser(authed);
      setFeatures(effective);
      setStatus('authenticated');
    },
    [db],
  );

  const logout = useCallback(async () => {
    await logoutCurrentSession(db);
    setUser(null);
    setFeatures(EMPTY_FEATURES);
    setStatus('unauthenticated');
  }, [db]);

  const canAccess = useCallback(
    (key: FeatureKey) => {
      if (status !== 'authenticated' || !user) {
        return false;
      }
      return Boolean(features[key]);
    },
    [features, status, user],
  );

  if (status === 'loading') {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="small" color={colors.text} />
      </View>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        status,
        user,
        features,
        canAccess,
        setupAdmin,
        login,
        logout,
        refreshAuth: loadState,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}

export function useFeatureAccess(key: FeatureKey): boolean {
  const { canAccess } = useAuth();
  return canAccess(key);
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
