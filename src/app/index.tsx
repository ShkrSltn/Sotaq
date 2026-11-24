import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { RipplePressable } from '@/components/ripple-pressable';
import { useResolvedColorScheme } from '@/hooks/use-resolved-color-scheme';

const LINKS = [
  { href: '/board', label: 'Доска', detail: 'Канбан' },
  { href: '/todos', label: 'Список', detail: 'Задачи' },
  { href: '/chat', label: 'Чат', detail: 'Без ответов' },
] as const;

const palette = {
  light: {
    title: '#16181D',
    subtitle: '#8B909A',
    card: '#FFFFFF',
    line: '#E6E8EC',
  },
  dark: {
    title: '#F3F4F6',
    subtitle: '#9AA0A8',
    card: '#1C1D21',
    line: '#2C2E33',
  },
} as const;

export default function HomeScreen() {
  const colors = palette[useResolvedColorScheme()];

  return (
    <View style={styles.screen}>
      <Text style={[styles.title, { color: colors.title }]}>Sotaq</Text>
      <Text style={[styles.subtitle, { color: colors.subtitle }]}>Всё в одном месте</Text>
      <View style={styles.list}>
        {LINKS.map((item) => (
          <RipplePressable
            key={item.href}
            accessibilityLabel={item.label}
            onPress={() => router.push(item.href)}
            style={StyleSheet.flatten([
              styles.row,
              { backgroundColor: colors.card, borderColor: colors.line },
            ])}>
            <Text style={[styles.rowLabel, { color: colors.title }]}>{item.label}</Text>
            <Text style={[styles.rowDetail, { color: colors.subtitle }]}>{item.detail}</Text>
          </RipplePressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 8,
  },
  title: {
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 12,
  },
  list: {
    gap: 10,
  },
  row: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 4,
  },
  rowLabel: {
    fontSize: 17,
    fontWeight: '600',
  },
  rowDetail: {
    fontSize: 14,
  },
});
