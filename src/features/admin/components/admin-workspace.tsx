import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import { AppIcon } from '@/components/app-icon';
import { RipplePressable } from '@/components/ripple-pressable';
import { useDatabase } from '@/db/provider';
import { UserEditorModal } from '@/features/admin/components/user-editor-modal';
import { useAuth } from '@/features/auth/auth-context';
import {
  createUserByAdmin,
  deleteUserByAdmin,
  getRoleFeatureMatrix,
  getUserFeatureOverrides,
  listUsers,
  setRoleFeatureEnabled,
  setUserFeatureOverride,
  updateUserByAdmin,
} from '@/features/auth/auth-repository';
import {
  CONTROLLABLE_FEATURE_KEYS,
  type ControllableFeatureKey,
  type RoleFeatureMatrix,
  type UserFeatureOverridesMap,
  type UserRecord,
  type UserRole,
} from '@/features/auth/types';
import { FEATURES } from '@/features/registry';
import { useThemeColors, useViewport } from '@/theme/colors';

type AdminTab = 'users' | 'roles';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return (parts[0]?.slice(0, 2) ?? 'U').toUpperCase();
}

export function AdminWorkspace() {
  const db = useDatabase();
  const { user: currentUser, refreshAuth } = useAuth();
  const colors = useThemeColors();
  const { isDesktop } = useViewport();

  const [tab, setTab] = useState<AdminTab>('users');
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [matrix, setMatrix] = useState<RoleFeatureMatrix | null>(null);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<{
    user: UserRecord;
    overrides: UserFeatureOverridesMap;
  } | null>(null);

  const loadAdminData = useCallback(async () => {
    const [nextUsers, nextMatrix] = await Promise.all([
      listUsers(db),
      getRoleFeatureMatrix(db),
    ]);
    setUsers(nextUsers);
    setMatrix(nextMatrix);
  }, [db]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const [nextUsers, nextMatrix] = await Promise.all([
        listUsers(db),
        getRoleFeatureMatrix(db),
      ]);
      if (cancelled) {
        return;
      }
      setUsers(nextUsers);
      setMatrix(nextMatrix);
      setLoading(false);
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [db]);

  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.isActive).length;
    const admins = users.filter((u) => u.role === 'admin' && u.isActive).length;
    return { total, active, admins };
  }, [users]);

  async function openEditUser(target: UserRecord) {
    const overrides = await getUserFeatureOverrides(db, target.id);
    setEditingUser({ user: target, overrides });
  }

  async function handleCreateUser(input: {
    username: string;
    displayName: string;
    password: string;
    role: UserRole;
  }) {
    await createUserByAdmin(db, input);
    await loadAdminData();
  }

  async function handleUpdateUser(
    userId: string,
    patch: {
      displayName: string;
      role: UserRole;
      isActive: boolean;
      newPassword?: string;
    },
    overrides: Partial<Record<ControllableFeatureKey, boolean | null>>,
  ) {
    await updateUserByAdmin(db, userId, patch);
    for (const key of CONTROLLABLE_FEATURE_KEYS) {
      if (key in overrides) {
        await setUserFeatureOverride(db, userId, key, overrides[key] ?? null);
      }
    }
    await loadAdminData();
    await refreshAuth();
  }

  async function handleDeleteUser(userId: string) {
    if (!currentUser) {
      return;
    }
    await deleteUserByAdmin(db, userId, currentUser.id);
    await loadAdminData();
  }

  async function handleToggleRoleFeature(
    role: UserRole,
    featureKey: ControllableFeatureKey,
    enabled: boolean,
  ) {
    await setRoleFeatureEnabled(db, role, featureKey, enabled);
    await loadAdminData();
    await refreshAuth();
  }

  if (loading || !matrix) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator size="small" color={colors.text} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.container,
        isDesktop ? styles.containerDesktop : styles.containerMobile,
      ]}>
      <View style={styles.inner}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: colors.text }]}>Админ-панель</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              Пользователи, роли и матрица доступа к фичам
            </Text>
          </View>

          <View style={styles.tabRow}>
            {(
              [
                { key: 'users', label: `Пользователи (${stats.total})` },
                { key: 'roles', label: 'Доступ по ролям' },
              ] as const
            ).map((item) => {
              const active = tab === item.key;
              return (
                <RipplePressable
                  key={item.key}
                  onPress={() => setTab(item.key)}
                  style={StyleSheet.flatten([
                    styles.tabBtn,
                    {
                      backgroundColor: active ? colors.accent : colors.surface,
                      borderColor: active ? colors.accent : colors.line,
                    },
                  ])}>
                  <Text
                    style={[
                      styles.tabLabel,
                      { color: active ? colors.accentText : colors.text },
                    ]}>
                    {item.label}
                  </Text>
                </RipplePressable>
              );
            })}
          </View>
        </View>

        {tab === 'users' ? (
          <View style={styles.section}>
            <View style={styles.barRow}>
              <View style={styles.statPills}>
                <View style={[styles.statPill, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                  <Text style={[styles.statText, { color: colors.muted }]}>
                    Активных: <Text style={{ color: colors.text }}>{stats.active}</Text>
                  </Text>
                </View>
                <View style={[styles.statPill, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                  <Text style={[styles.statText, { color: colors.muted }]}>
                    Админов: <Text style={{ color: colors.text }}>{stats.admins}</Text>
                  </Text>
                </View>
              </View>

              <RipplePressable
                onPress={() => setCreateOpen(true)}
                style={StyleSheet.flatten([
                  styles.primaryBtn,
                  { backgroundColor: colors.accent },
                ])}>
                <Text style={[styles.primaryBtnText, { color: colors.accentText }]}>
                  + Пользователь
                </Text>
              </RipplePressable>
            </View>

            <View
              style={[
                styles.panel,
                { backgroundColor: colors.surface, borderColor: colors.line },
              ]}>
              {users.map((item, idx) => {
                const isSelf = item.id === currentUser?.id;
                return (
                  <Animated.View
                    key={item.id}
                    entering={FadeInDown.duration(150)}
                    layout={LinearTransition.springify().damping(24).stiffness(260)}
                    style={[
                      styles.userRow,
                      idx < users.length - 1
                        ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }
                        : null,
                    ]}>
                    <View
                      style={[
                        styles.avatar,
                        {
                          backgroundColor:
                            item.role === 'admin' ? colors.accent : colors.surfaceSubtle,
                        },
                      ]}>
                      <Text
                        style={[
                          styles.avatarText,
                          {
                            color: item.role === 'admin' ? colors.accentText : colors.text,
                          },
                        ]}>
                        {getInitials(item.displayName)}
                      </Text>
                    </View>

                    <View style={styles.userMeta}>
                      <View style={styles.userNameLine}>
                        <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>
                          {item.displayName}
                        </Text>
                        {isSelf ? (
                          <View style={[styles.miniPill, { backgroundColor: colors.surfaceSubtle }]}>
                            <Text style={[styles.miniPillText, { color: colors.muted }]}>Вы</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={[styles.userHandle, { color: colors.muted }]}>
                        @{item.username}
                      </Text>
                    </View>

                    <View style={styles.userRight}>
                      <View
                        style={[
                          styles.rolePill,
                          {
                            backgroundColor:
                              item.role === 'admin' ? colors.surfaceActive : colors.surfaceSubtle,
                          },
                        ]}>
                        <Text style={[styles.rolePillText, { color: colors.text }]}>
                          {item.role === 'admin' ? 'Admin' : 'User'}
                        </Text>
                      </View>

                      {!item.isActive ? (
                        <View style={[styles.rolePill, { backgroundColor: colors.dangerBg }]}>
                          <Text style={[styles.rolePillText, { color: colors.danger }]}>
                            Откл.
                          </Text>
                        </View>
                      ) : null}

                      <RipplePressable
                        onPress={() => openEditUser(item)}
                        style={StyleSheet.flatten([
                          styles.editBtn,
                          { backgroundColor: colors.surfaceSubtle },
                        ])}>
                        <Text style={[styles.editBtnText, { color: colors.text }]}>Права</Text>
                      </RipplePressable>
                    </View>
                  </Animated.View>
                );
              })}
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <View
              style={[
                styles.panel,
                { backgroundColor: colors.surface, borderColor: colors.line },
              ]}>
              <View style={[styles.matrixHeader, { borderBottomColor: colors.line }]}>
                <Text style={[styles.matrixTitle, { color: colors.text }]}>
                  Матрица модулей по ролям
                </Text>
                <Text style={[styles.matrixSubtitle, { color: colors.muted }]}>
                  Включайте и отключайте доступ к фичам для каждой роли. Индивидуальные исключения
                  можно задать в карточке пользователя.
                </Text>
              </View>

              <View style={[styles.matrixColumnsBar, { borderBottomColor: colors.line }]}>
                <Text style={[styles.colHeaderFeature, { color: colors.muted }]}>Модуль</Text>
                <Text style={[styles.colHeaderRole, { color: colors.muted }]}>User</Text>
                <Text style={[styles.colHeaderRole, { color: colors.muted }]}>Admin</Text>
              </View>

              {CONTROLLABLE_FEATURE_KEYS.map((key, idx) => {
                const feature = FEATURES.find((item) => item.key === key);
                return (
                  <View
                    key={key}
                    style={[
                      styles.matrixRow,
                      idx < CONTROLLABLE_FEATURE_KEYS.length - 1
                        ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }
                        : null,
                    ]}>
                    <View style={styles.matrixFeatureInfo}>
                      <View style={styles.matrixFeatureTitleRow}>
                        {feature ? (
                          <AppIcon name={feature.icon} size="sm" color={colors.text} />
                        ) : null}
                        <Text style={[styles.matrixFeatureTitle, { color: colors.text }]}>
                          {feature?.title ?? key}
                        </Text>
                        {feature?.stageLabel ? (
                          <View style={[styles.miniPill, { backgroundColor: colors.surfaceSubtle }]}>
                            <Text style={[styles.miniPillText, { color: colors.muted }]}>
                              {feature.stageLabel}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      {feature?.description ? (
                        <Text style={[styles.matrixFeatureDesc, { color: colors.muted }]}>
                          {feature.description}
                        </Text>
                      ) : null}
                    </View>

                    <View style={styles.matrixToggleCell}>
                      <Switch
                        value={matrix.user[key]}
                        onValueChange={(value) => handleToggleRoleFeature('user', key, value)}
                        trackColor={{ false: colors.line, true: colors.success }}
                      />
                    </View>

                    <View style={styles.matrixToggleCell}>
                      <Switch
                        value={matrix.admin[key]}
                        onValueChange={(value) => handleToggleRoleFeature('admin', key, value)}
                        trackColor={{ false: colors.line, true: colors.success }}
                      />
                    </View>
                  </View>
                );
              })}

              <View style={[styles.matrixNote, { backgroundColor: colors.surfaceSubtle }]}>
                <AppIcon name="admin" size="xs" color={colors.muted} />
                <Text style={[styles.matrixNoteText, { color: colors.muted }]}>
                  Админ-панель всегда доступна только роли Admin и не может быть открыта роли User.
                </Text>
              </View>
            </View>
          </View>
        )}
      </View>

      <UserEditorModal
        mode="create"
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreateUser}
      />

      <UserEditorModal
        mode="edit"
        visible={editingUser !== null}
        user={editingUser?.user ?? null}
        isSelf={editingUser?.user.id === currentUser?.id}
        overrides={editingUser?.overrides ?? {}}
        onClose={() => setEditingUser(null)}
        onUpdate={handleUpdateUser}
        onDelete={handleDeleteUser}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    alignItems: 'center',
  },
  containerDesktop: {
    paddingHorizontal: 28,
    paddingVertical: 24,
  },
  containerMobile: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  inner: {
    width: '100%',
    maxWidth: 920,
    gap: 18,
  },
  header: {
    gap: 14,
  },
  headerText: {
    gap: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  section: {
    gap: 12,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  statPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statPill: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statText: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  primaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  panel: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '700',
  },
  userMeta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  userNameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  userHandle: {
    fontSize: 12,
  },
  userRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rolePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
  },
  rolePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  miniPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  miniPillText: {
    fontSize: 10,
    fontWeight: '600',
  },
  editBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  editBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  matrixHeader: {
    padding: 16,
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  matrixTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  matrixSubtitle: {
    fontSize: 13,
    lineHeight: 19,
  },
  matrixColumnsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  colHeaderFeature: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  colHeaderRole: {
    width: 68,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  matrixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  matrixFeatureInfo: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  matrixFeatureTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  matrixFeatureTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  matrixFeatureDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  matrixToggleCell: {
    width: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matrixNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  matrixNoteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
});
