import { router, usePathname } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { RipplePressable } from '@/components/ripple-pressable';
import { useResolvedColorScheme } from '@/hooks/use-resolved-color-scheme';

const ITEMS = [
  { href: '/', label: 'Главная' },
  { href: '/board', label: 'Доска' },
  { href: '/todos', label: 'Список' },
] as const;

const palette = {
  light: {
    text: '#16181D',
    muted: '#8B909A',
    line: '#E6E8EC',
    active: '#E7E8EC',
  },
  dark: {
    text: '#F3F4F6',
    muted: '#9AA0A8',
    line: '#2C2E33',
    active: '#26272C',
  },
} as const;

export function TopNav() {
  const colors = palette[useResolvedColorScheme()];
  const pathname = usePathname();

  return (
    <View style={[styles.bar, { borderBottomColor: colors.line }]}>
      <Text style={[styles.brand, { color: colors.text }]}>Sotaq</Text>
      <View style={styles.links}>
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <RipplePressable
              key={item.href}
              onPress={() => router.push(item.href)}
              style={StyleSheet.flatten([
                styles.link,
                active ? { backgroundColor: colors.active } : null,
              ])}>
              <Text
                style={StyleSheet.flatten([
                  styles.linkLabel,
                  { color: active ? colors.text : colors.muted },
                ])}>
                {item.label}
              </Text>
            </RipplePressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  brand: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  links: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  link: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  linkLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
});
