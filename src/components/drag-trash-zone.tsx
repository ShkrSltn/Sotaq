import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';

import { AppIcon } from '@/components/app-icon';
import { WebDragBox, type WebDomDragEvent } from '@/components/web-drag-box';
import type { ThemeColors } from '@/theme/colors';

type Props = {
  visible: boolean;
  label?: string;
  colors: ThemeColors;
  onDropDelete: (event: WebDomDragEvent) => void;
};

export function DragTrashZone({ visible, label = 'Удалить', colors, onDropDelete }: Props) {
  if (Platform.OS !== 'web' || !visible) {
    return null;
  }
  return <DragTrashZoneInner label={label} colors={colors} onDropDelete={onDropDelete} />;
}

function DragTrashZoneInner({
  label,
  colors,
  onDropDelete,
}: Omit<Props, 'visible'> & { label: string }) {
  const [isOver, setIsOver] = useState(false);

  return (
    <Animated.View
      entering={FadeInUp.duration(140)}
      exiting={FadeOutDown.duration(120)}
      style={styles.anchor}>
      <WebDragBox
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
          }
          if (!isOver) {
            setIsOver(true);
          }
        }}
        onDragLeave={() => {
          setIsOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsOver(false);
          onDropDelete(event);
        }}
        style={[
          styles.zone,
          {
            backgroundColor: isOver ? colors.danger : colors.dangerBg,
            borderColor: colors.danger,
          },
          isOver ? styles.zoneActive : null,
        ]}>
        <View
          style={[
            styles.iconCircle,
            {
              backgroundColor: isOver
                ? 'rgba(255, 255, 255, 0.22)'
                : 'rgba(240, 106, 96, 0.16)',
            },
          ]}>
          <AppIcon name="trash" size="md" color={isOver ? '#FFFFFF' : colors.danger} />
        </View>
        <View style={styles.textCol}>
          <Text style={[styles.title, { color: isOver ? '#FFFFFF' : colors.danger }]}>
            {isOver ? 'Отпустите для удаления' : label}
          </Text>
          <Text
            style={[
              styles.hint,
              { color: isOver ? 'rgba(255, 255, 255, 0.85)' : colors.muted },
            ]}>
            Перетащите сюда
          </Text>
        </View>
      </WebDragBox>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    ...(Platform.OS === 'web'
      ? ({
          position: 'fixed',
          right: 24,
          bottom: 24,
          zIndex: 9999,
        } as object)
      : {
          position: 'absolute',
          right: 20,
          bottom: 20,
          zIndex: 999,
        }),
  },
  zone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1.75,
    borderStyle: 'dashed',
    minWidth: 196,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.34)',
          transition: 'background-color 120ms ease, transform 120ms ease, border-style 120ms ease',
        } as object)
      : null),
  },
  zoneActive: {
    borderStyle: 'solid',
    transform: [{ scale: 1.06 }],
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    gap: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
  },
  hint: {
    fontSize: 11,
    fontWeight: '500',
  },
});
