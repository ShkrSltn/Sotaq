import { StyleSheet, Text, View } from 'react-native';

import { useResolvedColorScheme } from '@/hooks/use-resolved-color-scheme';

const palette = {
  light: {
    title: '#16181D',
    subtitle: '#8B909A',
  },
  dark: {
    title: '#F3F4F6',
    subtitle: '#9AA0A8',
  },
} as const;

export default function HomeScreen() {
  const colors = palette[useResolvedColorScheme()];

  return (
    <View style={styles.screen}>
      <Text style={[styles.title, { color: colors.title }]}>Sotaq</Text>
      <Text style={[styles.subtitle, { color: colors.subtitle }]}>Всё в одном месте</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  title: {
    fontSize: 48,
    fontWeight: '700',
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
  },
});
