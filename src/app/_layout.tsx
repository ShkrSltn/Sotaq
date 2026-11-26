import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';

import { AppShell } from '@/components/app-shell';
import { DatabaseProvider } from '@/db/provider';
import { AuthProvider, useAuth } from '@/features/auth/auth-context';
import { useResolvedColorScheme } from '@/hooks/use-resolved-color-scheme';
import { useThemeColors } from '@/theme/colors';

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
          <Stack.Protected guard={canAccess('kanban')}>
            <Stack.Screen name="board" />
          </Stack.Protected>
          <Stack.Protected guard={canAccess('todos')}>
            <Stack.Screen name="todos" />
          </Stack.Protected>
          <Stack.Protected guard={canAccess('notes')}>
            <Stack.Screen name="notes" />
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
    <GestureHandlerRootView
      style={[styles.screen, { backgroundColor: colors.background }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <DatabaseProvider>
        <AuthProvider>
          <ProtectedNavigator />
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
