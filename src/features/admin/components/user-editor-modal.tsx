import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { KeyboardAvoidingModalView } from '@/components/keyboard-avoiding-modal-view';
import { RipplePressable } from '@/components/ripple-pressable';
import {
  CONTROLLABLE_FEATURE_KEYS,
  type ControllableFeatureKey,
  type UserFeatureOverridesMap,
  type UserFeatureOverrideState,
  type UserRecord,
  type UserRole,
} from '@/features/auth/types';
import { FEATURES } from '@/features/registry';
import { useThemeColors, useViewport } from '@/theme/colors';

type CreateProps = {
  mode: 'create';
  visible: boolean;
  onClose: () => void;
  onCreate: (input: {
    username: string;
    displayName: string;
    password: string;
    role: UserRole;
  }) => Promise<void>;
};

type EditProps = {
  mode: 'edit';
  visible: boolean;
  user: UserRecord | null;
  isSelf: boolean;
  overrides: UserFeatureOverridesMap;
  onClose: () => void;
  onUpdate: (
    userId: string,
    patch: {
      displayName: string;
      role: UserRole;
      isActive: boolean;
      newPassword?: string;
    },
    overrides: Partial<Record<ControllableFeatureKey, boolean | null>>,
  ) => Promise<void>;
  onDelete: (userId: string) => Promise<void>;
};

export type UserEditorModalProps = CreateProps | EditProps;

export function UserEditorModal(props: UserEditorModalProps) {
  if (!props.visible) {
    return null;
  }
  if (props.mode === 'edit' && !props.user) {
    return null;
  }

  const key = props.mode === 'edit' ? `edit-${props.user?.id}` : 'create-user';
  return <UserEditorModalContent key={key} {...props} />;
}

function toOverrideState(value: boolean | undefined): UserFeatureOverrideState {
  if (value === true) {
    return 'allow';
  }
  if (value === false) {
    return 'deny';
  }
  return 'inherit';
}

function UserEditorModalContent(props: UserEditorModalProps) {
  const colors = useThemeColors();
  const { isDesktop } = useViewport();
  const insets = useSafeAreaInsets();

  const editUser = props.mode === 'edit' ? props.user : null;

  const [username, setUsername] = useState(editUser?.username ?? '');
  const [displayName, setDisplayName] = useState(editUser?.displayName ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>(editUser?.role ?? 'user');
  const [isActive, setIsActive] = useState(editUser?.isActive ?? true);
  const [overrideDraft, setOverrideDraft] = useState<
    Record<ControllableFeatureKey, UserFeatureOverrideState>
  >(() => {
    const initial = props.mode === 'edit' ? props.overrides : {};
    return {
      calendar: toOverrideState(initial.calendar),
      kanban: toOverrideState(initial.kanban),
      todos: toOverrideState(initial.todos),
      habits: toOverrideState(initial.habits),
      focus: toOverrideState(initial.focus),
      notes: toOverrideState(initial.notes),
      language: toOverrideState(initial.language),
    };
  });

  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (submitting) {
      return;
    }
    setError(null);
    setSubmitting(true);

    try {
      if (props.mode === 'create') {
        await props.onCreate({
          username,
          displayName,
          password,
          role,
        });
      } else if (editUser) {
        const nextOverrides: Partial<Record<ControllableFeatureKey, boolean | null>> = {};
        for (const key of CONTROLLABLE_FEATURE_KEYS) {
          const state = overrideDraft[key];
          nextOverrides[key] = state === 'inherit' ? null : state === 'allow';
        }
        await props.onUpdate(
          editUser.id,
          {
            displayName,
            role,
            isActive,
            newPassword: password.trim().length > 0 ? password : undefined,
          },
          nextOverrides,
        );
      }
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить изменения');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (props.mode !== 'edit' || !editUser) {
      return;
    }
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await props.onDelete(editUser.id);
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить пользователя');
      setConfirmDelete(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={props.onClose}>
      <KeyboardAvoidingModalView style={styles.root}>
        <Pressable style={styles.backdrop} onPress={props.onClose} />

        <Animated.View
          entering={FadeIn.duration(110)}
          style={[
            styles.sheet,
            isDesktop ? styles.sheetDesktop : styles.sheetMobile,
            {
              backgroundColor: colors.surface,
              borderColor: colors.line,
              paddingBottom: isDesktop ? 16 : Math.max(insets.bottom, 16),
            },
          ]}>
          {!isDesktop ? (
            <View style={styles.grabberRow}>
              <View style={[styles.grabber, { backgroundColor: colors.line }]} />
            </View>
          ) : null}

          <View style={[styles.header, { borderBottomColor: colors.line }]}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {props.mode === 'create' ? 'Новый пользователь' : `@${editUser?.username}`}
            </Text>
            <RipplePressable
              onPress={props.onClose}
              style={StyleSheet.flatten([
                styles.closeBtn,
                { backgroundColor: colors.surfaceSubtle },
              ])}>
              <Text style={[styles.closeLabel, { color: colors.muted }]}>Закрыть</Text>
            </RipplePressable>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled">
            {props.mode === 'create' ? (
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.muted }]}>Логин</Text>
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="username"
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      backgroundColor: colors.surfaceSubtle,
                      borderColor: colors.line,
                    },
                  ]}
                />
              </View>
            ) : null}

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]}>Имя</Text>
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Отображаемое имя"
                placeholderTextColor={colors.muted}
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.line,
                  },
                ]}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]}>
                {props.mode === 'create' ? 'Пароль' : 'Новый пароль (необязательно)'}
              </Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder={
                  props.mode === 'create' ? 'Минимум 4 символа' : 'Оставьте пустым, чтобы не менять'
                }
                placeholderTextColor={colors.muted}
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.line,
                  },
                ]}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]}>Роль</Text>
              <View style={styles.pillRow}>
                {(
                  [
                    { key: 'user', label: 'Пользователь' },
                    { key: 'admin', label: 'Администратор' },
                  ] as const
                ).map((item) => {
                  const selected = role === item.key;
                  return (
                    <RipplePressable
                      key={item.key}
                      onPress={() => setRole(item.key)}
                      style={StyleSheet.flatten([
                        styles.pill,
                        {
                          backgroundColor: selected ? colors.accent : colors.surfaceSubtle,
                          borderColor: selected ? colors.accent : colors.line,
                        },
                      ])}>
                      <Text
                        style={[
                          styles.pillText,
                          { color: selected ? colors.accentText : colors.text },
                        ]}>
                        {item.label}
                      </Text>
                    </RipplePressable>
                  );
                })}
              </View>
            </View>

            {props.mode === 'edit' ? (
              <>
                <View style={styles.field}>
                  <Text style={[styles.label, { color: colors.muted }]}>Статус аккаунта</Text>
                  <View style={styles.pillRow}>
                    {(
                      [
                        { value: true, label: 'Активен' },
                        { value: false, label: 'Отключён' },
                      ] as const
                    ).map((opt) => {
                      const selected = isActive === opt.value;
                      return (
                        <RipplePressable
                          key={opt.label}
                          onPress={() => setIsActive(opt.value)}
                          style={StyleSheet.flatten([
                            styles.pill,
                            {
                              backgroundColor: selected
                                ? opt.value
                                  ? colors.successBg
                                  : colors.dangerBg
                                : colors.surfaceSubtle,
                              borderColor: selected
                                ? opt.value
                                  ? colors.success
                                  : colors.danger
                                : colors.line,
                            },
                          ])}>
                          <Text
                            style={[
                              styles.pillText,
                              {
                                color: selected
                                  ? opt.value
                                    ? colors.success
                                    : colors.danger
                                  : colors.muted,
                              },
                            ]}>
                            {opt.label}
                          </Text>
                        </RipplePressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.field}>
                  <Text style={[styles.label, { color: colors.muted }]}>
                    Индивидуальные права на фичи
                  </Text>
                  <View style={styles.overrideList}>
                    {CONTROLLABLE_FEATURE_KEYS.map((key) => {
                      const feature = FEATURES.find((item) => item.key === key);
                      const state = overrideDraft[key];
                      return (
                        <View
                          key={key}
                          style={[
                            styles.overrideRow,
                            { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                          ]}>
                          <View style={styles.overrideInfo}>
                            <View style={styles.overrideTitleRow}>
                              {feature ? (
                                <AppIcon name={feature.icon} size="xs" color={colors.text} />
                              ) : null}
                              <Text style={[styles.overrideTitle, { color: colors.text }]}>
                                {feature?.title ?? key}
                              </Text>
                            </View>
                            {feature?.stageLabel ? (
                              <Text style={[styles.overrideStage, { color: colors.muted }]}>
                                {feature.stageLabel}
                              </Text>
                            ) : null}
                          </View>

                          <View style={styles.overrideSegment}>
                            {(
                              [
                                { value: 'inherit', label: 'Роль' },
                                { value: 'allow', label: 'Вкл' },
                                { value: 'deny', label: 'Выкл' },
                              ] as const
                            ).map((choice) => {
                              const active = state === choice.value;
                              return (
                                <RipplePressable
                                  key={choice.value}
                                  onPress={() =>
                                    setOverrideDraft((prev) => ({
                                      ...prev,
                                      [key]: choice.value,
                                    }))
                                  }
                                  style={StyleSheet.flatten([
                                    styles.segBtn,
                                    {
                                      backgroundColor: active
                                        ? choice.value === 'deny'
                                          ? colors.dangerBg
                                          : choice.value === 'allow'
                                            ? colors.successBg
                                            : colors.accent
                                        : 'transparent',
                                    },
                                  ])}>
                                  <Text
                                    style={[
                                      styles.segLabel,
                                      {
                                        color: active
                                          ? choice.value === 'deny'
                                            ? colors.danger
                                            : choice.value === 'allow'
                                              ? colors.success
                                              : colors.accentText
                                          : colors.muted,
                                      },
                                    ]}>
                                    {choice.label}
                                  </Text>
                                </RipplePressable>
                              );
                            })}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              </>
            ) : null}

            {error ? (
              <View style={[styles.errorBox, { backgroundColor: colors.dangerBg }]}>
                <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.line }]}>
            {props.mode === 'edit' && !props.isSelf ? (
              <RipplePressable
                disabled={submitting}
                onPress={handleDelete}
                style={StyleSheet.flatten([
                  styles.deleteBtn,
                  { backgroundColor: confirmDelete ? colors.danger : colors.dangerBg },
                ])}>
                <Text
                  style={[
                    styles.deleteLabel,
                    { color: confirmDelete ? '#FFFFFF' : colors.danger },
                  ]}>
                  {confirmDelete ? 'Точно удалить?' : 'Удалить'}
                </Text>
              </RipplePressable>
            ) : (
              <View />
            )}

            <RipplePressable
              disabled={submitting}
              onPress={handleSave}
              style={StyleSheet.flatten([
                styles.saveBtn,
                { backgroundColor: colors.accent },
                submitting ? styles.disabled : null,
              ])}>
              {submitting ? (
                <ActivityIndicator size="small" color={colors.accentText} />
              ) : (
                <Text style={[styles.saveLabel, { color: colors.accentText }]}>
                  {props.mode === 'create' ? 'Создать' : 'Сохранить'}
                </Text>
              )}
            </RipplePressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingModalView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 12, 16, 0.48)',
  },
  sheet: {
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  sheetDesktop: {
    maxWidth: 520,
    maxHeight: '88%',
    borderRadius: 18,
  },
  sheetMobile: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '90%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomWidth: 0,
  },
  grabberRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 2,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  closeBtn: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
  },
  closeLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    padding: 18,
    gap: 15,
  },
  field: {
    gap: 7,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  overrideList: {
    gap: 8,
  },
  overrideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
  },
  overrideInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  overrideTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  overrideTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  overrideStage: {
    fontSize: 11,
  },
  overrideSegment: {
    flexDirection: 'row',
    gap: 4,
  },
  segBtn: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 7,
  },
  segLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  errorBox: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deleteBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  deleteLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  saveBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 110,
    alignItems: 'center',
  },
  saveLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.45,
  },
});
