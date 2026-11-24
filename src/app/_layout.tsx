import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TopNav } from '@/components/top-nav';
import { useResolvedColorScheme } from '@/hooks/use-resolved-color-scheme';

const background = {
  light: '#F3F4F6',
  dark: '#111214',
} as const;

export default function RootLayout() {
  const scheme = useResolvedColorScheme();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: background[scheme] }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <TopNav />
      <View style={styles.content}>
        <Slot />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
