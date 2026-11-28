import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Platform, StyleSheet, View } from 'react-native';

import { AppShell } from '@/components/app-shell';
import { BootScreen } from '@/components/boot-screen';
import { DatabaseProvider, useDatabaseState } from '@/db/provider';
import { AuthProvider, useAuth } from '@/features/auth/auth-context';
import { FocusProvider } from '@/features/focus/focus-context';
import { useIsClient } from '@/hooks/use-is-client';
import { useResolvedColorScheme } from '@/hooks/use-resolved-color-scheme';
import { useThemeColors } from '@/theme/colors';

SplashScreen.preventAutoHideAsync().catch(() => {});

const SHOW_BOOT_AFTER_MS = 200;
const MIN_BOOT_VISIBLE_MS = 400;

function BootGate({ children }: { children: ReactNode }) {
  const { status: dbStatus } = useDatabaseState();
  const { status: authStatus } = useAuth();
  const isClient = useIsClient();
  const pending =
    dbStatus === 'loading' ||
    authStatus === 'loading' ||
    (Platform.OS === 'web' && !isClient);

  const [shown, setShown] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    if (!pending || shown || dismissed) {
      return;
    }
    const timer = setTimeout(() => {
      shownAt.current = Date.now();
      setShown(true);
    }, SHOW_BOOT_AFTER_MS);
    return () => clearTimeout(timer);
  }, [dismissed, pending, shown]);

  useEffect(() => {
    if (pending || !shown || dismissed) {
      return;
    }
    const elapsed = Date.now() - (shownAt.current ?? Date.now());
    const remain = Math.max(0, MIN_BOOT_VISIBLE_MS - elapsed);
    const timer = setTimeout(() => setDismissed(true), remain);
    return () => clearTimeout(timer);
  }, [dismissed, pending, shown]);

  const reveal = !pending && (!shown || dismissed);

  useEffect(() => {
    if (!reveal) {
      return;
    }
    SplashScreen.hideAsync().catch(() => {});
  }, [reveal]);

  return (
    <View style={styles.screen}>
      {dbStatus === 'ready' ? children : null}
      {shown && !dismissed ? (
        <BootScreen phase={dbStatus === 'loading' ? 'database' : 'session'} />
      ) : null}
    </View>
  );
}

function ProtectedNavigator() {
  const { status, canAccess } = useAuth();
  const colors = useThemeColors();

  return (
    <AppShell>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Protected guard={status === 'needs_setup'}>
          <Stack.Screen name="setup" />
        </Stack.Protected>

        <Stack.Protected guard={status === 'unauthenticated'}>
          <Stack.Screen name="login" />
        </Stack.Protected>

        <Stack.Protected guard={status === 'authenticated'}>
          <Stack.Screen name="index" />
          <Stack.Protected guard={canAccess('calendar')}>
            <Stack.Screen name="calendar" />
          </Stack.Protected>
          <Stack.Protected guard={canAccess('kanban')}>
            <Stack.Screen name="board" />
          </Stack.Protected>
          <Stack.Protected guard={canAccess('todos')}>
            <Stack.Screen name="todos" />
          </Stack.Protected>
          <Stack.Protected guard={canAccess('habits')}>
            <Stack.Screen name="habits" />
          </Stack.Protected>
          <Stack.Protected guard={canAccess('focus')}>
            <Stack.Screen name="focus" />
          </Stack.Protected>
          <Stack.Protected guard={canAccess('notes')}>
            <Stack.Screen name="notes" />
          </Stack.Protected>
          <Stack.Protected guard={canAccess('language')}>
            <Stack.Screen name="language" />
          </Stack.Protected>
          <Stack.Protected guard={canAccess('admin')}>
            <Stack.Screen name="admin" />
          </Stack.Protected>
        </Stack.Protected>
      </Stack>
    </AppShell>
  );
}

export default function RootLayout() {
  const scheme = useResolvedColorScheme();
  const colors = useThemeColors();

  return (
    <GestureHandlerRootView style={[styles.screen, { backgroundColor: colors.background }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <DatabaseProvider>
        <AuthProvider>
          <BootGate>
            <FocusProvider>
              <ProtectedNavigator />
            </FocusProvider>
          </BootGate>
        </AuthProvider>
      </DatabaseProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});
