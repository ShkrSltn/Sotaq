import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useDatabaseState } from '@/db/provider';
import {
  authenticateUser,
  buildDefaultUserPagePrefs,
  computeEffectiveFeatures,
  createFirstAdmin,
  ensureRoleFeatureDefaults,
  getCurrentSessionUser,
  getUserCount,
  getUserPagePrefs,
  logoutCurrentSession,
  resetUserPagePrefs,
  saveUserPagePrefs,
} from '@/features/auth/auth-repository';
import {
  CONTROLLABLE_FEATURE_KEYS,
  type ControllableFeatureKey,
  type FeatureAccessMap,
  type UserPagePrefsMap,
  type UserRecord,
} from '@/features/auth/types';
import type { FeatureKey } from '@/features/registry';

export type AuthStatus = 'loading' | 'needs_setup' | 'unauthenticated' | 'authenticated';

const EMPTY_FEATURES: FeatureAccessMap = {
  home: true,
  calendar: false,
  kanban: false,
  todos: false,
  habits: false,
  focus: false,
  notes: false,
  language: false,
  admin: false,
};

function mergeEffectiveWithPrefs(
  allowed: FeatureAccessMap,
  prefs: UserPagePrefsMap,
): FeatureAccessMap {
  const merged: FeatureAccessMap = { ...allowed };
  for (const key of CONTROLLABLE_FEATURE_KEYS) {
    merged[key] = Boolean(allowed[key] && prefs[key]?.enabled !== false);
  }
  return merged;
}

type AuthContextValue = {
  status: AuthStatus;
  user: UserRecord | null;
  allowedFeatures: FeatureAccessMap;
  pagePrefs: UserPagePrefsMap;
  features: FeatureAccessMap;
  orderedControllableKeys: ControllableFeatureKey[];
  canAccess: (key: FeatureKey) => boolean;
  setMyPageEnabled: (key: ControllableFeatureKey, enabled: boolean) => Promise<void>;
  moveMyPage: (key: ControllableFeatureKey, delta: -1 | 1) => Promise<void>;
  applyMyPagePreset: (enabledKeys: readonly ControllableFeatureKey[]) => Promise<void>;
  resetMyPagePrefs: () => Promise<void>;
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
  const { db, status: dbStatus } = useDatabaseState();

  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<UserRecord | null>(null);
  const [allowedFeatures, setAllowedFeatures] = useState<FeatureAccessMap>(EMPTY_FEATURES);
  const [pagePrefs, setPagePrefs] = useState<UserPagePrefsMap>(() => buildDefaultUserPagePrefs());

  const loadState = useCallback(async () => {
    if (!db) {
      return;
    }
    await ensureRoleFeatureDefaults(db);
    const totalUsers = await getUserCount(db);
    if (totalUsers === 0) {
      setUser(null);
      setAllowedFeatures(EMPTY_FEATURES);
      setPagePrefs(buildDefaultUserPagePrefs());
      setStatus('needs_setup');
      return;
    }

    const sessionUser = await getCurrentSessionUser(db);
    if (!sessionUser) {
      setUser(null);
      setAllowedFeatures(EMPTY_FEATURES);
      setPagePrefs(buildDefaultUserPagePrefs());
      setStatus('unauthenticated');
      return;
    }

    const [allowed, prefs] = await Promise.all([
      computeEffectiveFeatures(db, sessionUser),
      getUserPagePrefs(db, sessionUser.id),
    ]);
    setUser(sessionUser);
    setAllowedFeatures(allowed);
    setPagePrefs(prefs);
    setStatus('authenticated');
  }, [db]);

  useEffect(() => {
    if (dbStatus !== 'ready' || !db) {
      return;
    }
    const database = db;
    let cancelled = false;

    async function boot() {
      await ensureRoleFeatureDefaults(database);
      const totalUsers = await getUserCount(database);
      if (cancelled) {
        return;
      }
      if (totalUsers === 0) {
        setUser(null);
        setAllowedFeatures(EMPTY_FEATURES);
        setPagePrefs(buildDefaultUserPagePrefs());
        setStatus('needs_setup');
        return;
      }

      const sessionUser = await getCurrentSessionUser(database);
      if (cancelled) {
        return;
      }
      if (!sessionUser) {
        setUser(null);
        setAllowedFeatures(EMPTY_FEATURES);
        setPagePrefs(buildDefaultUserPagePrefs());
        setStatus('unauthenticated');
        return;
      }

      const [allowed, prefs] = await Promise.all([
        computeEffectiveFeatures(database, sessionUser),
        getUserPagePrefs(database, sessionUser.id),
      ]);
      if (cancelled) {
        return;
      }
      setUser(sessionUser);
      setAllowedFeatures(allowed);
      setPagePrefs(prefs);
      setStatus('authenticated');
    }

    boot();

    return () => {
      cancelled = true;
    };
  }, [db, dbStatus]);

  const setupAdmin = useCallback(
    async (input: { username: string; displayName: string; password: string }) => {
      if (!db) {
        return;
      }
      const created = await createFirstAdmin(db, input);
      const [allowed, prefs] = await Promise.all([
        computeEffectiveFeatures(db, created),
        getUserPagePrefs(db, created.id),
      ]);
      setUser(created);
      setAllowedFeatures(allowed);
      setPagePrefs(prefs);
      setStatus('authenticated');
    },
    [db],
  );

  const login = useCallback(
    async (username: string, password: string) => {
      if (!db) {
        return;
      }
      const authed = await authenticateUser(db, username, password);
      const [allowed, prefs] = await Promise.all([
        computeEffectiveFeatures(db, authed),
        getUserPagePrefs(db, authed.id),
      ]);
      setUser(authed);
      setAllowedFeatures(allowed);
      setPagePrefs(prefs);
      setStatus('authenticated');
    },
    [db],
  );

  const logout = useCallback(async () => {
    if (!db) {
      return;
    }
    await logoutCurrentSession(db);
    setUser(null);
    setAllowedFeatures(EMPTY_FEATURES);
    setPagePrefs(buildDefaultUserPagePrefs());
    setStatus('unauthenticated');
  }, [db]);

  const orderedControllableKeys = useMemo(() => {
    return [...CONTROLLABLE_FEATURE_KEYS].sort(
      (a, b) => (pagePrefs[a]?.position ?? 0) - (pagePrefs[b]?.position ?? 0),
    );
  }, [pagePrefs]);

  const features = useMemo(
    () => mergeEffectiveWithPrefs(allowedFeatures, pagePrefs),
    [allowedFeatures, pagePrefs],
  );

  const setMyPageEnabled = useCallback(
    async (key: ControllableFeatureKey, enabled: boolean) => {
      if (!user || !db) return;
      const next: UserPagePrefsMap = {
        ...pagePrefs,
        [key]: { ...pagePrefs[key], enabled },
      };
      setPagePrefs(next);
      await saveUserPagePrefs(db, user.id, next);
    },
    [db, pagePrefs, user],
  );

  const moveMyPage = useCallback(
    async (key: ControllableFeatureKey, delta: -1 | 1) => {
      if (!user || !db) return;
      const sorted = [...CONTROLLABLE_FEATURE_KEYS].sort(
        (a, b) => (pagePrefs[a]?.position ?? 0) - (pagePrefs[b]?.position ?? 0),
      );
      const allowedOnly = sorted.filter((k) => allowedFeatures[k]);
      const idx = allowedOnly.indexOf(key);
      const targetIdx = idx + delta;
      if (idx < 0 || targetIdx < 0 || targetIdx >= allowedOnly.length) {
        return;
      }
      const otherKey = allowedOnly[targetIdx];
      const fullIdxA = sorted.indexOf(key);
      const fullIdxB = sorted.indexOf(otherKey);
      const reordered = [...sorted];
      reordered[fullIdxA] = otherKey;
      reordered[fullIdxB] = key;

      const next = { ...pagePrefs };
      reordered.forEach((k, position) => {
        next[k] = { ...next[k], position };
      });
      setPagePrefs(next);
      await saveUserPagePrefs(db, user.id, next);
    },
    [allowedFeatures, db, pagePrefs, user],
  );

  const applyMyPagePreset = useCallback(
    async (enabledKeys: readonly ControllableFeatureKey[]) => {
      if (!user || !db) return;
      const enabledSet = new Set<ControllableFeatureKey>(enabledKeys);
      const next = { ...pagePrefs };
      for (const key of CONTROLLABLE_FEATURE_KEYS) {
        next[key] = { ...next[key], enabled: enabledSet.has(key) };
      }
      setPagePrefs(next);
      await saveUserPagePrefs(db, user.id, next);
    },
    [db, pagePrefs, user],
  );

  const resetMyPagePrefsAction = useCallback(async () => {
    if (!user || !db) return;
    const defaults = buildDefaultUserPagePrefs();
    setPagePrefs(defaults);
    await resetUserPagePrefs(db, user.id);
  }, [db, user]);

  const canAccess = useCallback(
    (key: FeatureKey) => {
      if (status !== 'authenticated' || !user) {
        return false;
      }
      return Boolean(features[key]);
    },
    [features, status, user],
  );

  return (
    <AuthContext.Provider
      value={{
        status,
        user,
        allowedFeatures,
        pagePrefs,
        features,
        orderedControllableKeys,
        canAccess,
        setMyPageEnabled,
        moveMyPage,
        applyMyPagePreset,
        resetMyPagePrefs: resetMyPagePrefsAction,
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
