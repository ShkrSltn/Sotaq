import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AppIcon } from '@/components/app-icon';
import { RipplePressable } from '@/components/ripple-pressable';
import { LANGUAGE_PRESETS, type LanguageRecord } from '@/features/language/types';
import { useThemeColors } from '@/theme/colors';

type Props = {
  visible: boolean;
  mode: 'create' | 'edit';
  language?: LanguageRecord | null;
  canDelete?: boolean;
  existingCodes: Set<string>;
  onClose: () => void;
  onCreate: (input: { code: string; name: string }) => Promise<void>;
  onUpdate?: (languageId: string, input: { code: string; name: string }) => Promise<void>;
  onDelete?: (languageId: string) => Promise<void>;
};

export function AddLanguageDialog(props: Props) {
  if (!props.visible) {
    return null;
  }
  const key = `${props.mode}-${props.language?.id ?? 'new'}`;
  return <AddLanguageDialogContent key={key} {...props} />;
}

function AddLanguageDialogContent({
  mode,
  language,
  canDelete = false,
  existingCodes,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: Props) {
  const colors = useThemeColors();
  const [name, setName] = useState(mode === 'edit' && language ? language.name : '');
  const [code, setCode] = useState(mode === 'edit' && language ? language.code : '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }
    const resolvedCode = code.trim().toLowerCase() || trimmedName.slice(0, 2).toLowerCase();
    if (mode === 'edit' && language && onUpdate) {
      await onUpdate(language.id, { code: resolvedCode, name: trimmedName });
    } else {
      await onCreate({ code: resolvedCode, name: trimmedName });
    }
    onClose();
  }

  async function handlePreset(preset: { code: string; name: string }) {
    await onCreate(preset);
    onClose();
  }

  async function handleDelete() {
    if (!language || !onDelete || !canDelete) {
      return;
    }
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await onDelete(language.id);
    onClose();
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View
          entering={FadeIn.duration(140)}
          style={[styles.dialog, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: colors.text }]}>
              {mode === 'edit' ? 'Настройки языка' : 'Добавить язык'}
            </Text>
            <RipplePressable
              accessibilityLabel="Закрыть"
              onPress={onClose}
              style={StyleSheet.flatten([
                styles.closeBtn,
                { backgroundColor: colors.surfaceSubtle },
              ])}>
              <AppIcon name="close" size="xs" color={colors.muted} />
            </RipplePressable>
          </View>

          {mode === 'create' ? (
            <>
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
                      <Text style={[styles.presetName, { color: colors.text }]}>
                        {preset.name}
                      </Text>
                    </RipplePressable>
                  );
                })}
              </View>

              <View style={[styles.divider, { backgroundColor: colors.line }]} />
              <Text style={[styles.caption, { color: colors.muted }]}>Или свой вариант</Text>
            </>
          ) : null}

          <View style={styles.customRow}>
            <TextInput
              autoFocus={mode === 'edit'}
              value={name}
              onChangeText={setName}
              onSubmitEditing={handleSubmit}
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

          <View style={styles.footerRow}>
            {mode === 'edit' && canDelete && onDelete ? (
              <RipplePressable
                onPress={handleDelete}
                style={StyleSheet.flatten([
                  styles.deleteBtn,
                  { backgroundColor: confirmDelete ? colors.danger : colors.dangerBg },
                ])}>
                <AppIcon
                  name="trash"
                  size="xs"
                  color={confirmDelete ? '#FFFFFF' : colors.danger}
                />
                <Text
                  style={[
                    styles.btnLabel,
                    { color: confirmDelete ? '#FFFFFF' : colors.danger },
                  ]}>
                  {confirmDelete ? 'Точно удалить?' : 'Удалить'}
                </Text>
              </RipplePressable>
            ) : (
              <View />
            )}

            <View style={styles.actions}>
              <RipplePressable
                onPress={onClose}
                style={StyleSheet.flatten([styles.btn, { backgroundColor: colors.surfaceSubtle }])}>
                <Text style={[styles.btnLabel, { color: colors.muted }]}>Отмена</Text>
              </RipplePressable>
              <RipplePressable
                disabled={name.trim().length === 0}
                onPress={handleSubmit}
                style={StyleSheet.flatten([
                  styles.btn,
                  { backgroundColor: colors.accent },
                  name.trim().length === 0 ? styles.disabled : null,
                ])}>
                <Text style={[styles.btnLabel, { color: colors.accentText }]}>
                  {mode === 'edit' ? 'Сохранить' : 'Добавить'}
                </Text>
              </RipplePressable>
            </View>
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
    backgroundColor: 'rgba(10, 12, 16, 0.5)',
  },
  dialog: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
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
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
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
