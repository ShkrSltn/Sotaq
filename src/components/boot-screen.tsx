import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '@/theme/colors';

type BootPhase = 'database' | 'session';

export function BootScreen({ phase }: { phase: BootPhase }) {
  const colors = useThemeColors();
  const pulse = useRef(new Animated.Value(0.45)).current;
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [enter, pulse]);

  return (
    <Animated.View
      style={[
        styles.screen,
        {
          backgroundColor: colors.background,
          opacity: enter,
        },
      ]}>
      <Animated.Text
        style={[
          styles.mark,
          {
            color: colors.text,
            opacity: pulse,
            transform: [
              {
                scale: pulse.interpolate({
                  inputRange: [0.45, 1],
                  outputRange: [0.98, 1],
                }),
              },
            ],
          },
        ]}>
        Sotaq
      </Animated.Text>
      <Text style={[styles.status, { color: colors.muted }]}>
        {phase === 'database' ? 'Открываем базу' : 'Входим'}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  mark: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  status: {
    fontSize: 14,
  },
});
