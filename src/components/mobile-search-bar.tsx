import { type ComponentRef, useRef } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputKeyPressEvent,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AppIcon } from '@/components/app-icon';
import { RipplePressable } from '@/components/ripple-pressable';
import type { ThemeColors } from '@/theme/colors';

type MobileSearchBarProps = {
  value: string;
  onChangeText: (text: string) => void;
  onCancel: () => void;
  placeholder: string;
  colors: ThemeColors;
  matchCount?: number;
};

/**
 * Native-style inline mobile search bar that morphs into the top toolbar
 * without pushing page content down. Includes autoFocus, clear (×) button,
 * optional match count badge, Escape handling on Web, and an explicit "Отмена" button.
 */
export function MobileSearchBar({
  value,
  onChangeText,
  onCancel,
  placeholder,
  colors,
  matchCount,
}: MobileSearchBarProps) {
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const hasQuery = value.trim().length > 0;

  function handleKeyPress(event: TextInputKeyPressEvent) {
    if (event.nativeEvent.key === 'Escape') {
      onChangeText('');
      onCancel();
    }
  }

  return (
    <Animated.View entering={FadeIn.duration(130)} style={styles.row}>
      <View
        style={[
          styles.inputBox,
          { backgroundColor: colors.surface, borderColor: colors.line },
        ]}>
        <AppIcon name="search" size="xs" color={colors.muted} />
        <TextInput
          ref={inputRef}
          autoFocus
          value={value}
          onChangeText={onChangeText}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          autoCorrect={false}
          clearButtonMode="never"
          style={[styles.input, { color: colors.text }]}
        />
        {hasQuery && matchCount !== undefined ? (
          <View style={[styles.countBadge, { backgroundColor: colors.surfaceSubtle }]}>
            <Text style={[styles.countText, { color: colors.muted }]}>{matchCount}</Text>
          </View>
        ) : null}
        {value.length > 0 ? (
          <RipplePressable
            accessibilityLabel="Очистить поиск"
            hitSlop={6}
            onPress={() => {
              onChangeText('');
              inputRef.current?.focus();
            }}
            style={StyleSheet.flatten([
              styles.clearBtn,
              { backgroundColor: colors.surfaceSubtle },
            ])}>
            <AppIcon name="close" size={11} color={colors.muted} />
          </RipplePressable>
        ) : null}
      </View>

      <Pressable
        accessibilityLabel="Закрыть поиск"
        hitSlop={6}
        onPress={() => {
          onChangeText('');
          onCancel();
        }}
        style={({ pressed }) => [styles.cancelBtn, pressed ? styles.cancelPressed : null]}>
        <Text style={[styles.cancelText, { color: colors.text }]}>Отмена</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 36,
    minWidth: 0,
  },
  inputBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 36,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 11,
    paddingRight: 6,
    minWidth: 0,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
    minWidth: 0,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  countBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  countText: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  clearBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    height: 36,
    paddingHorizontal: 4,
    justifyContent: 'center',
    flexShrink: 0,
  },
  cancelPressed: {
    opacity: 0.6,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
