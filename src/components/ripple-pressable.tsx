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
  disableHover?: boolean;
};

const LIGHT_FILL_COLORS = new Set(['#F3F4F6', '#FFFFFF', '#FFF', '#F8F9FA', 'white']);
const DARK_FILL_COLORS = new Set(['#16181D', '#111214', '#000000', '#000', 'black']);

function resolveStateLayerColors(
  scheme: 'light' | 'dark',
  backgroundColor: unknown,
): { hover: string; press: string } {
  const bg = typeof backgroundColor === 'string' ? backgroundColor.trim().toUpperCase() : '';

  if (scheme === 'dark' && LIGHT_FILL_COLORS.has(bg)) {
    return { hover: 'rgba(0, 0, 0, 0.11)', press: 'rgba(0, 0, 0, 0.20)' };
  }
  if (scheme === 'light' && DARK_FILL_COLORS.has(bg)) {
    return { hover: 'rgba(255, 255, 255, 0.15)', press: 'rgba(255, 255, 255, 0.24)' };
  }
  if (scheme === 'dark') {
    return { hover: 'rgba(255, 255, 255, 0.08)', press: 'rgba(255, 255, 255, 0.14)' };
  }
  return { hover: 'rgba(22, 24, 29, 0.06)', press: 'rgba(22, 24, 29, 0.11)' };
}

function supportsWebHover(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

// Android uses the system ink ripple. Web draws hover/press state layers + press wave.
export const RipplePressable = forwardRef<ComponentRef<typeof Pressable>, Props>(
  function RipplePressable(
    { children, style, disabled, disableHover = false, onPress, onPressIn, onLayout, ...rest },
    ref,
  ) {
    const scheme = useResolvedColorScheme();
    const rippleColor = scheme === 'dark' ? 'rgba(255,255,255,0.22)' : 'rgba(22,24,29,0.14)';
    const nextId = useRef(0);
    const size = useRef({ width: 48, height: 36 });
    const [ripples, setRipples] = useState<Ripple[]>([]);

    const resolvedStyle = StyleSheet.flatten(style) as ViewStyle | undefined;
    const stateColors = resolveStateLayerColors(scheme, resolvedStyle?.backgroundColor);

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

    const webCursorStyle =
      Platform.OS === 'web'
        ? ({
            cursor: disabled ? 'not-allowed' : 'pointer',
            userSelect: 'none',
          } as unknown as ViewStyle)
        : null;

    return (
      <Pressable
        ref={ref}
        disabled={disabled}
        android_ripple={disabled ? undefined : { color: rippleColor, foreground: true }}
        style={[styles.hit, style, webCursorStyle]}
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
        {(pressState) => {
          const hovered =
            supportsWebHover() &&
            !disabled &&
            !disableHover &&
            (pressState as { hovered?: boolean }).hovered === true;
          const pressed = !disabled && pressState.pressed;
          const layerBg = pressed
            ? stateColors.press
            : hovered
              ? stateColors.hover
              : 'transparent';

          return (
            <>
              {children}
              {Platform.OS === 'android' ? null : (
                <View
                  pointerEvents="none"
                  style={[styles.overlay, styles.stateLayer, { backgroundColor: layerBg }]}>
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
            </>
          );
        }}
      </Pressable>
    );
  },
);

const styles = StyleSheet.create({
  hit: {
    overflow: 'hidden',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
  },
  stateLayer: {
    ...(Platform.OS === 'web'
      ? ({ transition: 'background-color 120ms ease' } as object)
      : null),
  },
  wave: {
    position: 'absolute',
  },
});
