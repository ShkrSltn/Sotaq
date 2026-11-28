import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { AppIcon } from '@/components/app-icon';
import { RipplePressable } from '@/components/ripple-pressable';
import type { ThemeColors } from '@/theme/colors';

type ButtonsProps = {
  canUndo: boolean;
  canRedo: boolean;
  colors: ThemeColors;
  compact?: boolean;
  onUndo: () => void;
  onRedo: () => void;
};

export function UndoRedoButtons({
  canUndo,
  canRedo,
  colors,
  compact = false,
  onUndo,
  onRedo,
}: ButtonsProps) {
  return (
    <View style={styles.group}>
      <RipplePressable
        accessibilityLabel="Отменить (Ctrl+Z)"
        disabled={!canUndo}
        onPress={onUndo}
        style={StyleSheet.flatten([
          compact ? styles.btnCompact : styles.btn,
          { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
          !canUndo ? styles.disabled : null,
        ])}>
        <AppIcon name="undo" size="xs" color={canUndo ? colors.text : colors.muted} />
      </RipplePressable>

      <RipplePressable
        accessibilityLabel="Повторить (Ctrl+Y)"
        disabled={!canRedo}
        onPress={onRedo}
        style={StyleSheet.flatten([
          compact ? styles.btnCompact : styles.btn,
          { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
          !canRedo ? styles.disabled : null,
        ])}>
        <AppIcon name="redo" size="xs" color={canRedo ? colors.text : colors.muted} />
      </RipplePressable>
    </View>
  );
}

type ToastProps = {
  message: string | null;
  colors: ThemeColors;
};

export function HistoryToast({ message, colors }: ToastProps) {
  if (!message) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.toastAnchor}>
      <Animated.View
        entering={FadeInDown.duration(140)}
        exiting={FadeOutDown.duration(140)}
        style={[
          styles.toastPill,
          { backgroundColor: colors.surface, borderColor: colors.line },
        ]}>
        <AppIcon name="undo" size="xs" color={colors.muted} />
        <Text style={[styles.toastText, { color: colors.text }]} numberOfLines={1}>
          {message}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  btn: {
    width: 32,
    height: 34,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCompact: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.35,
  },
  toastAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 20,
    alignItems: 'center',
    zIndex: 60,
  },
  toastPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 340,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 8px 24px rgba(0, 0, 0, 0.28)' } as object)
      : {
          elevation: 8,
          shadowColor: '#000',
          shadowOpacity: 0.22,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        }),
  },
  toastText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
