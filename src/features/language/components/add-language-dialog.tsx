import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { RipplePressable } from '@/components/ripple-pressable';
import { LANGUAGE_PRESETS } from '@/features/language/types';
import { useThemeColors } from '@/theme/colors';

type Props = {
  visible: boolean;
  existingCodes: Set<string>;
  onClose: () => void;
  onCreate: (input: { code: string; name: string }) => Promise<void>;
};

export function AddLanguageDialog(props: Props) {
  if (!props.visible) {
    return null;
  }
  return <AddLanguageDialogContent {...props} />;
}

function AddLanguageDialogContent({ existingCodes, onClose, onCreate }: Props) {
  const colors = useThemeColors();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  async function handleCustomSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }
    const resolvedCode = code.trim().toLowerCase() || trimmedName.slice(0, 2).toLowerCase();
    await onCreate({ code: resolvedCode, name: trimmedName });
    onClose();
  }

  async function handlePreset(preset: { code: string; name: string }) {
    await onCreate(preset);
    onClose();
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View
          entering={FadeIn.duration(140)}
          style={[styles.dialog, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.title, { color: colors.text }]}>Добавить язык</Text>

          <View style={styles.presetsGrid}>
            {LANGUAGE_PRESETS.map((preset) => {
              const alreadyAdded = existingCodes.has(preset.code);
              return (
                <RipplePressable
                  key={preset.code}
                  disabled={alreadyAdded}
                  onPress={() => handlePreset(preset)}
                  style={StyleSheet.flatten([
                    styles.presetChip,
                    { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                    alreadyAdded ? styles.disabled : null,
                  ])}>
                  <Text style={[styles.presetCode, { color: colors.muted }]}>
                    {preset.code.toUpperCase()}
                  </Text>
                  <Text style={[styles.presetName, { color: colors.text }]}>{preset.name}</Text>
                </RipplePressable>
              );
            })}
          </View>

          <View style={[styles.divider, { backgroundColor: colors.line }]} />

          <Text style={[styles.caption, { color: colors.muted }]}>Или свой вариант</Text>
          <View style={styles.customRow}>
            <TextInput
              value={name}
              onChangeText={setName}
              onSubmitEditing={handleCustomSubmit}
              placeholder="Название (напр. Сербский)"
              placeholderTextColor={colors.muted}
              style={[
                styles.input,
                styles.nameInput,
                {
                  color: colors.text,
                  backgroundColor: colors.surfaceSubtle,
                  borderColor: colors.line,
                },
              ]}
            />
            <TextInput
              value={code}
              onChangeText={setCode}
              autoCapitalize="none"
              maxLength={6}
              placeholder="sr"
              placeholderTextColor={colors.muted}
              style={[
                styles.input,
                styles.codeInput,
                {
                  color: colors.text,
                  backgroundColor: colors.surfaceSubtle,
                  borderColor: colors.line,
                },
              ]}
            />
          </View>

          <View style={styles.actions}>
            <RipplePressable
              onPress={onClose}
              style={StyleSheet.flatten([styles.btn, { backgroundColor: colors.surfaceSubtle }])}>
              <Text style={[styles.btnLabel, { color: colors.muted }]}>Отмена</Text>
            </RipplePressable>
            <RipplePressable
              disabled={name.trim().length === 0}
              onPress={handleCustomSubmit}
              style={StyleSheet.flatten([
                styles.btn,
                { backgroundColor: colors.accent },
                name.trim().length === 0 ? styles.disabled : null,
              ])}>
              <Text style={[styles.btnLabel, { color: colors.accentText }]}>Добавить</Text>
            </RipplePressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 12, 16, 0.48)',
  },
  dialog: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    gap: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  presetCode: {
    fontSize: 10,
    fontWeight: '700',
  },
  presetName: {
    fontSize: 13,
    fontWeight: '600',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 2,
  },
  caption: {
    fontSize: 12,
    fontWeight: '600',
  },
  customRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 14,
  },
  nameInput: {
    flex: 1,
  },
  codeInput: {
    width: 68,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  btnLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.35,
  },
});
