import type { ReactNode } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { ThemeColors } from '@/theme/colors';

export type AnchorRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type MeasurableNode = {
  measureInWindow?: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
};

export function measureAnchor(
  node: MeasurableNode | null | undefined,
  onMeasured: (rect: AnchorRect) => void,
  fallback: AnchorRect = { x: 120, y: 120, width: 30, height: 30 },
) {
  if (node && typeof node.measureInWindow === 'function') {
    node.measureInWindow((x, y, width, height) => {
      onMeasured({ x, y, width, height });
    });
  } else {
    onMeasured(fallback);
  }
}

type Props = {
  visible: boolean;
  anchor: AnchorRect | null;
  width: number;
  estimatedHeight?: number;
  align?: 'left' | 'right';
  offsetY?: number;
  colors: ThemeColors;
  onClose: () => void;
  children: ReactNode;
};

export function AnchoredPopover({
  visible,
  anchor,
  width,
  estimatedHeight = 220,
  align = 'left',
  offsetY = 6,
  colors,
  onClose,
  children,
}: Props) {
  const { width: winW, height: winH } = useWindowDimensions();

  if (!visible || !anchor) {
    return null;
  }

  const resolvedWidth = Math.min(width, Math.max(180, winW - 20));
  const rawLeft =
    align === 'right' ? anchor.x + anchor.width - resolvedWidth : anchor.x;
  const left = Math.max(10, Math.min(rawLeft, winW - resolvedWidth - 10));

  const preferBelow = anchor.y + anchor.height + offsetY;
  const maxAllowedH = Math.min(estimatedHeight, winH - 24);
  const top =
    preferBelow + maxAllowedH > winH - 12
      ? Math.max(12, anchor.y - maxAllowedH - offsetY)
      : preferBelow;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View
          entering={FadeIn.duration(90)}
          style={[
            styles.card,
            {
              left,
              top,
              width: resolvedWidth,
              maxHeight: winH - 24,
              backgroundColor: colors.surface,
              borderColor: colors.line,
            },
          ]}>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
  },
  card: {
    position: 'absolute',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 5,
    overflow: 'hidden',
    elevation: 16,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.32), 0 2px 8px rgba(0, 0, 0, 0.16)',
        } as object)
      : {
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
        }),
  },
});
