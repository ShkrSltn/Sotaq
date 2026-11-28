import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { RipplePressable } from '@/components/ripple-pressable';
import { useAuth } from '@/features/auth/auth-context';
import {
  CONTROLLABLE_FEATURE_KEYS,
  type ControllableFeatureKey,
} from '@/features/auth/types';
import { FEATURES } from '@/features/registry';
import { useThemeColors, useViewport } from '@/theme/colors';

type PresetDef = {
  id: string;
  label: string;
  keys: readonly ControllableFeatureKey[];
};

export const WORKSPACE_PAGE_PRESETS: readonly PresetDef[] = [
  {
    id: 'all',
    label: 'Все страницы',
    keys: CONTROLLABLE_FEATURE_KEYS,
  },
  {
    id: 'productivity',
    label: 'Продуктивность',
    keys: ['calendar', 'todos', 'habits', 'focus'],
  },
  {
    id: 'minimal',
    label: 'Минимализм',
    keys: ['todos', 'notes'],
  },
];

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function WorkspacePagesModal({ visible, onClose }: Props) {
  const colors = useThemeColors();
  const { isDesktop } = useViewport();
  const insets = useSafeAreaInsets();
  const {
    allowedFeatures,
    pagePrefs,
    orderedControllableKeys,
    setMyPageEnabled,
    moveMyPage,
    applyMyPagePreset,
    resetMyPagePrefs,
  } = useAuth();

  if (!visible) {
    return null;
  }

  const allowedKeys = orderedControllableKeys.filter((k) => allowedFeatures[k]);
  const enabledCount = allowedKeys.filter((k) => pagePrefs[k]?.enabled !== false).length;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={[styles.root, isDesktop ? styles.rootDesktop : styles.rootMobile]}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View
          entering={FadeIn.duration(110)}
          style={[
            styles.card,
            isDesktop ? styles.cardDesktop : styles.cardMobile,
            {
              backgroundColor: colors.surface,
              borderColor: colors.line,
              paddingBottom: isDesktop ? 16 : Math.max(insets.bottom, 16),
            },
          ]}>
          <View style={[styles.header, { borderBottomColor: colors.line }]}>
            <View style={styles.headerTexts}>
              <Text style={[styles.title, { color: colors.text }]}>Мои страницы</Text>
              <Text style={[styles.subtitle, { color: colors.muted }]}>
                Включи только нужные разделы · активно {enabledCount} из {allowedKeys.length}
              </Text>
            </View>
            <RipplePressable
              onPress={onClose}
              style={StyleSheet.flatten([
                styles.closeBtn,
                { backgroundColor: colors.surfaceSubtle },
              ])}>
              <AppIcon name="close" size="xs" color={colors.muted} />
            </RipplePressable>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {/* Presets */}
            <View style={styles.presetsRow}>
              {WORKSPACE_PAGE_PRESETS.map((preset) => (
                <RipplePressable
                  key={preset.id}
                  onPress={() => applyMyPagePreset(preset.keys)}
                  style={StyleSheet.flatten([
                    styles.presetPill,
                    { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                  ])}>
                  <Text style={[styles.presetText, { color: colors.text }]}>{preset.label}</Text>
                </RipplePressable>
              ))}
              <RipplePressable
                onPress={resetMyPagePrefs}
                style={StyleSheet.flatten([
                  styles.presetPill,
                  { backgroundColor: 'transparent', borderColor: colors.line },
                ])}>
                <Text style={[styles.presetText, { color: colors.muted }]}>Сбросить</Text>
              </RipplePressable>
            </View>

            {/* Controllable Pages List */}
            <View style={[styles.listCard, { borderColor: colors.line }]}>
              {allowedKeys.map((key, idx) => {
                const feature = FEATURES.find((f) => f.key === key);
                if (!feature) return null;
                const enabled = pagePrefs[key]?.enabled !== false;

                return (
                  <View
                    key={key}
                    style={[
                      styles.row,
                      idx > 0
                        ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }
                        : null,
                    ]}>
                    <View
                      style={[
                        styles.iconBox,
                        {
                          backgroundColor: enabled ? colors.surfaceActive : colors.surfaceSubtle,
                          opacity: enabled ? 1 : 0.5,
                        },
                      ]}>
                      <AppIcon name={feature.icon} size="sm" color={colors.text} />
                    </View>

                    <View style={styles.rowTexts}>
                      <Text
                        style={[
                          styles.rowTitle,
                          { color: colors.text, opacity: enabled ? 1 : 0.55 },
                        ]}>
                        {feature.title}
                      </Text>
                      <Text
                        style={[styles.rowDesc, { color: colors.muted }]}
                        numberOfLines={1}>
                        {feature.description}
                      </Text>
                    </View>

                    <View style={styles.orderControls}>
                      <RipplePressable
                        disabled={idx === 0}
                        accessibilityLabel="Выше"
                        onPress={() => moveMyPage(key, -1)}
                        style={StyleSheet.flatten([
                          styles.orderBtn,
                          { backgroundColor: colors.surfaceSubtle },
                          idx === 0 ? styles.disabled : null,
                        ])}>
                        <AppIcon name="arrowUp" size={11} color={colors.muted} />
                      </RipplePressable>
                      <RipplePressable
                        disabled={idx === allowedKeys.length - 1}
                        accessibilityLabel="Ниже"
                        onPress={() => moveMyPage(key, 1)}
                        style={StyleSheet.flatten([
                          styles.orderBtn,
                          { backgroundColor: colors.surfaceSubtle },
                          idx === allowedKeys.length - 1 ? styles.disabled : null,
                        ])}>
                        <AppIcon name="arrowDown" size={11} color={colors.muted} />
                      </RipplePressable>
                    </View>

                    <Switch
                      value={enabled}
                      onValueChange={(val) => setMyPageEnabled(key, val)}
                      trackColor={{ false: colors.line, true: colors.success }}
                    />
                  </View>
                );
              })}
            </View>

            <Text style={[styles.hint, { color: colors.muted }]}>
              Скрытые страницы не удаляют данные — их можно вернуть в любой момент. Порядок
              применяется к сайдбару и мобильной панели.
            </Text>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  rootDesktop: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  rootMobile: {
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 12, 16, 0.52)',
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  cardDesktop: {
    width: '100%',
    maxWidth: 490,
    maxHeight: '85%',
    borderRadius: 18,
  },
  cardMobile: {
    width: '100%',
    maxHeight: '86%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  headerTexts: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: 16,
    gap: 12,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  presetPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  presetText: {
    fontSize: 12,
    fontWeight: '600',
  },
  listCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowTexts: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  rowDesc: {
    fontSize: 11,
  },
  orderControls: {
    flexDirection: 'row',
    gap: 4,
  },
  orderBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.3,
  },
  hint: {
    fontSize: 11,
    lineHeight: 16,
  },
});
