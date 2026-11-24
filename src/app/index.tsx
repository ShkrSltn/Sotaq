import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { RipplePressable } from '@/components/ripple-pressable';
import { useResolvedColorScheme } from '@/hooks/use-resolved-color-scheme';

const palette = {
  light: {
    title: '#16181D',
    subtitle: '#8B909A',
    button: '#16181D',
    buttonText: '#F3F4F6',
  },
  dark: {
    title: '#F3F4F6',
    subtitle: '#9AA0A8',
    button: '#F3F4F6',
    buttonText: '#16181D',
  },
} as const;

export default function HomeScreen() {
  const colors = palette[useResolvedColorScheme()];

  return (
    <View style={styles.screen}>
      <Text style={[styles.title, { color: colors.title }]}>Sotaq</Text>
      <Text style={[styles.subtitle, { color: colors.subtitle }]}>Всё в одном месте</Text>
      <RipplePressable
        onPress={() => router.push('/board')}
        style={StyleSheet.flatten([styles.button, { backgroundColor: colors.button }])}>
        <Text style={[styles.buttonLabel, { color: colors.buttonText }]}>Открыть доску</Text>
      </RipplePressable>
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
    marginBottom: 8,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
});
