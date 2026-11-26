import { type ComponentRef, forwardRef, type ReactNode, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

import { useResolvedColorScheme } from '@/hooks/use-resolved-color-scheme';

type Ripple = {
  id: number;
  x: number;
  y: number;
  diameter: number;
  progress: Animated.Value;
};

type Props = Omit<PressableProps, 'android_ripple' | 'style' | 'children'> & {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

// Android uses the system ink ripple. Web draws the same wave from the press point.
export const RipplePressable = forwardRef<ComponentRef<typeof Pressable>, Props>(
  function RipplePressable(
    { children, style, disabled, onPress, onPressIn, onLayout, ...rest },
    ref,
  ) {
  const scheme = useResolvedColorScheme();
  const rippleColor = scheme === 'dark' ? 'rgba(255,255,255,0.22)' : 'rgba(22,24,29,0.14)';
  const nextId = useRef(0);
  const size = useRef({ width: 48, height: 36 });
  const [ripples, setRipples] = useState<Ripple[]>([]);

  function spawn(x: number, y: number) {
    const diameter = Math.ceil(Math.max(size.current.width, size.current.height) * 2.4);
    const progress = new Animated.Value(0);
    const id = nextId.current;
    nextId.current += 1;
    const ripple: Ripple = { id, x, y, diameter, progress };

    setRipples((current) => [...current, ripple]);
    Animated.timing(progress, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      setRipples((current) => current.filter((item) => item.id !== id));
    });
  }

  return (
    <Pressable
      ref={ref}
      disabled={disabled}
      android_ripple={disabled ? undefined : { color: rippleColor, foreground: true }}
      style={StyleSheet.flatten([styles.hit, style])}
      onLayout={(event) => {
        size.current = {
          width: event.nativeEvent.layout.width,
          height: event.nativeEvent.layout.height,
        };
        onLayout?.(event);
      }}
      onPress={(event) => {
        if (Platform.OS !== 'android' && !disabled) {
          const { locationX, locationY } = event.nativeEvent;
          spawn(locationX || size.current.width / 2, locationY || size.current.height / 2);
        }
        onPress?.(event);
      }}
      onPressIn={onPressIn}
      {...rest}>
      {children}
      {Platform.OS === 'android' ? null : (
        <View pointerEvents="none" style={styles.overlay}>
          {ripples.map((ripple) => (
            <Animated.View
              key={ripple.id}
              style={[
                styles.wave,
                {
                  width: ripple.diameter,
                  height: ripple.diameter,
                  borderRadius: ripple.diameter / 2,
                  backgroundColor: rippleColor,
                  left: ripple.x - ripple.diameter / 2,
                  top: ripple.y - ripple.diameter / 2,
                  opacity: ripple.progress.interpolate({
                    inputRange: [0, 0.55, 1],
                    outputRange: [0.45, 0.22, 0],
                  }),
                  transform: [
                    {
                      scale: ripple.progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.15, 1],
                      }),
                    },
                  ],
                },
              ]}
            />
          ))}
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  hit: {
    overflow: 'hidden',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
  },
  wave: {
    position: 'absolute',
  },
});
