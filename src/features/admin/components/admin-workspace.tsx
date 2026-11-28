import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import { AppIcon } from '@/components/app-icon';
import { RipplePressable } from '@/components/ripple-pressable';
import { WORKSPACE_PAGE_PRESETS } from '@/components/workspace-pages-modal';
import { useDatabase } from '@/db/provider';
import { UserEditorModal } from '@/features/admin/components/user-editor-modal';
import { useAuth } from '@/features/auth/auth-context';
import {
  createUserByAdmin,
  deleteUserByAdmin,
  getModuleDataCounts,
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
  type ModuleDataCounts,
  type RoleFeatureMatrix,
  type UserFeatureOverridesMap,
  type UserRecord,
  type UserRole,
} from '@/features/auth/types';
import { FEATURES } from '@/features/registry';
import { useThemeColors, useViewport } from '@/theme/colors';

type AdminTab = 'pages' | 'roles' | 'users';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return (parts[0]?.slice(0, 2) ?? 'U').toUpperCase();
}

export function AdminWorkspace() {
  const db = useDatabase();
  const {
    user: currentUser,
    allowedFeatures,
    pagePrefs,
    orderedControllableKeys,
    setMyPageEnabled,
    moveMyPage,
    applyMyPagePreset,
    resetMyPagePrefs,
    refreshAuth,
  } = useAuth();
  const colors = useThemeColors();
  const { isDesktop } = useViewport();

  const [tab, setTab] = useState<AdminTab>('pages');
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [matrix, setMatrix] = useState<RoleFeatureMatrix | null>(null);
  const [counts, setCounts] = useState<ModuleDataCounts | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<{
    user: UserRecord;
    overrides: UserFeatureOverridesMap;
  } | null>(null);

  const loadAdminData = useCallback(async () => {
    const [nextUsers, nextMatrix, nextCounts] = await Promise.all([
      listUsers(db),
      getRoleFeatureMatrix(db),
      currentUser ? getModuleDataCounts(db, currentUser.id) : Promise.resolve(null),
    ]);
    setUsers(nextUsers);
    setMatrix(nextMatrix);
    setCounts(nextCounts);
  }, [db, currentUser]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const [nextUsers, nextMatrix, nextCounts] = await Promise.all([
        listUsers(db),
        getRoleFeatureMatrix(db),
        currentUser ? getModuleDataCounts(db, currentUser.id) : Promise.resolve(null),
      ]);
      if (cancelled) {
        return;
      }
      setUsers(nextUsers);
      setMatrix(nextMatrix);
      setCounts(nextCounts);
      setLoading(false);
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [db, currentUser]);

  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.isActive).length;
    const admins = users.filter((u) => u.role === 'admin' && u.isActive).length;
    return { total, active, admins };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q),
    );
  }, [users, userSearch]);

  const enabledMyPagesCount = useMemo(
    () =>
      orderedControllableKeys.filter(
        (k) => allowedFeatures[k] && pagePrefs[k]?.enabled !== false,
      ).length,
    [allowedFeatures, orderedControllableKeys, pagePrefs],
  );

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

  async function handleBulkRolePreset(role: UserRole, enabledKeys: readonly ControllableFeatureKey[]) {
    const set = new Set<ControllableFeatureKey>(enabledKeys);
    for (const key of CONTROLLABLE_FEATURE_KEYS) {
      await setRoleFeatureEnabled(db, role, key, set.has(key));
    }
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
        {/* Header + Segmented Tabs */}
        <View style={styles.header}>
          {isDesktop ? (
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: colors.text }]}>Управление пространством</Text>
              <Text style={[styles.subtitle, { color: colors.muted }]}>
                Страницы, порядок разделов, доступ по ролям и пользователи
              </Text>
            </View>
          ) : null}

          <View
            style={[
              styles.tabBar,
              !isDesktop ? styles.tabBarMobile : null,
              { backgroundColor: colors.surface, borderColor: colors.line },
            ]}>
            {(
              [
                { key: 'pages', label: `Страницы (${enabledMyPagesCount})` },
                { key: 'roles', label: 'Роли' },
                { key: 'users', label: `Люди (${stats.total})` },
              ] as const
            ).map((item) => {
              const active = tab === item.key;
              return (
                <RipplePressable
                  key={item.key}
                  onPress={() => setTab(item.key)}
                  style={StyleSheet.flatten([
                    styles.tabBtn,
                    !isDesktop ? styles.tabBtnMobile : null,
                    active ? { backgroundColor: colors.surfaceActive } : null,
                  ])}>
                  <Text
                    style={[
                      styles.tabLabel,
                      { color: active ? colors.text : colors.muted },
                    ]}>
                    {item.label}
                  </Text>
                </RipplePressable>
              );
            })}
          </View>
        </View>

        {/* TAB 1: PAGES & WORKSPACE CUSTOMIZER */}
        {tab === 'pages' ? (
          <View style={styles.section}>
            <View
              style={[
                styles.panel,
                { backgroundColor: colors.surface, borderColor: colors.line },
              ]}>
              <View style={[styles.panelHeader, { borderBottomColor: colors.line }]}>
                <View style={styles.panelHeaderTexts}>
                  <Text style={[styles.panelTitle, { color: colors.text }]}>
                    Видимость и порядок страниц
                  </Text>
                  <Text style={[styles.panelSubtitle, { color: colors.muted }]}>
                    Отключай ненужные разделы (например, Доску, Привычки или Языки) и меняй их
                    порядок. Данные сохраняются в базе — страницу можно вернуть в любой момент.
                  </Text>
                </View>

                <View style={styles.presetsRow}>
                  {WORKSPACE_PAGE_PRESETS.map((preset) => (
                    <RipplePressable
                      key={preset.id}
                      onPress={() => applyMyPagePreset(preset.keys)}
                      style={StyleSheet.flatten([
                        styles.presetChip,
                        { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                      ])}>
                      <Text style={[styles.presetChipText, { color: colors.text }]}>
                        {preset.label}
                      </Text>
                    </RipplePressable>
                  ))}
                  <RipplePressable
                    onPress={resetMyPagePrefs}
                    style={StyleSheet.flatten([
                      styles.presetChip,
                      { backgroundColor: 'transparent', borderColor: colors.line },
                    ])}>
                    <Text style={[styles.presetChipText, { color: colors.muted }]}>
                      Сбросить
                    </Text>
                  </RipplePressable>
                </View>
              </View>

              {orderedControllableKeys.map((key, idx) => {
                const feature = FEATURES.find((item) => item.key === key);
                if (!feature) return null;

                const allowed = allowedFeatures[key];
                const enabled = allowed && pagePrefs[key]?.enabled !== false;
                const modCount = counts?.[key];

                return (
                  <View
                    key={key}
                    style={[
                      styles.pageRow,
                      idx < orderedControllableKeys.length - 1
                        ? {
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: colors.line,
                          }
                        : null,
                    ]}>
                    <View
                      style={[
                        styles.pageIconBox,
                        {
                          backgroundColor: enabled
                            ? colors.surfaceActive
                            : colors.surfaceSubtle,
                          opacity: enabled ? 1 : 0.45,
                        },
                      ]}>
                      <AppIcon name={feature.icon} size="md" color={colors.text} />
                    </View>

                    <View style={styles.pageInfo}>
                      <View style={styles.pageTitleRow}>
                        <Text
                          style={[
                            styles.pageTitle,
                            { color: colors.text, opacity: enabled ? 1 : 0.5 },
                          ]}>
                          {feature.title}
                        </Text>

                        {modCount ? (
                          <View
                            style={[styles.countPill, { backgroundColor: colors.surfaceSubtle }]}>
                            <Text style={[styles.countPillText, { color: colors.muted }]}>
                              {modCount.count} {modCount.label}
                            </Text>
                          </View>
                        ) : null}

                        {!allowed ? (
                          <View style={[styles.countPill, { backgroundColor: colors.dangerBg }]}>
                            <Text style={[styles.countPillText, { color: colors.danger }]}>
                              Откл. для роли
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      <Text
                        style={[styles.pageDesc, { color: colors.muted }]}
                        numberOfLines={1}>
                        {feature.description}
                      </Text>
                    </View>

                    <View style={styles.pageControls}>
                      {isDesktop && enabled && feature.route ? (
                        <RipplePressable
                          accessibilityLabel={`Открыть ${feature.title}`}
                          onPress={() => {
                            if (feature.route) router.navigate(feature.route);
                          }}
                          style={StyleSheet.flatten([
                            styles.openPageBtn,
                            { backgroundColor: colors.surfaceSubtle },
                          ])}>
                          <AppIcon name="arrowRight" size="xs" color={colors.muted} />
                        </RipplePressable>
                      ) : null}

                      <View style={styles.orderPair}>
                        <RipplePressable
                          disabled={idx === 0}
                          accessibilityLabel="Переместить выше"
                          onPress={() => moveMyPage(key, -1)}
                          style={StyleSheet.flatten([
                            styles.orderBtn,
                            { backgroundColor: colors.surfaceSubtle },
                            idx === 0 ? styles.disabled : null,
                          ])}>
                          <AppIcon name="arrowUp" size={11} color={colors.muted} />
                        </RipplePressable>

                        <RipplePressable
                          disabled={idx === orderedControllableKeys.length - 1}
                          accessibilityLabel="Переместить ниже"
                          onPress={() => moveMyPage(key, 1)}
                          style={StyleSheet.flatten([
                            styles.orderBtn,
                            { backgroundColor: colors.surfaceSubtle },
                            idx === orderedControllableKeys.length - 1 ? styles.disabled : null,
                          ])}>
                          <AppIcon name="arrowDown" size={11} color={colors.muted} />
                        </RipplePressable>
                      </View>

                      <Switch
                        disabled={!allowed}
                        value={enabled}
                        onValueChange={(value) => setMyPageEnabled(key, value)}
                        trackColor={{ false: colors.line, true: colors.success }}
                      />
                    </View>
                  </View>
                );
              })}

              <View style={[styles.panelNote, { backgroundColor: colors.surfaceSubtle }]}>
                <AppIcon name="filter" size="xs" color={colors.muted} />
                <Text style={[styles.panelNoteText, { color: colors.muted }]}>
                  Обычные пользователи тоже могут настраивать свои видимые страницы через кнопку
                  «Настроить страницы» в сайдбаре или меню «Ещё» (в рамках разрешённых ролью).
                </Text>
              </View>
            </View>
          </View>
        ) : tab === 'roles' ? (
          /* TAB 2: GLOBAL ROLE PERMISSIONS MATRIX */
          <View style={styles.section}>
            <View
              style={[
                styles.panel,
                { backgroundColor: colors.surface, borderColor: colors.line },
              ]}>
              <View style={[styles.panelHeader, { borderBottomColor: colors.line }]}>
                <View style={styles.panelHeaderTexts}>
                  <Text style={[styles.panelTitle, { color: colors.text }]}>
                    Доступ к страницам по ролям
                  </Text>
                  <Text style={[styles.panelSubtitle, { color: colors.muted }]}>
                    Определяет, какие модули вообще доступны ролям User и Admin. Индивидуальные
                    исключения можно задать во вкладке «Люди».
                  </Text>
                </View>

                <View style={styles.presetsRow}>
                  <RipplePressable
                    onPress={() => handleBulkRolePreset('user', CONTROLLABLE_FEATURE_KEYS)}
                    style={StyleSheet.flatten([
                      styles.presetChip,
                      { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                    ])}>
                    <Text style={[styles.presetChipText, { color: colors.text }]}>
                      User: открыть все
                    </Text>
                  </RipplePressable>
                  <RipplePressable
                    onPress={() => handleBulkRolePreset('user', ['todos', 'notes'])}
                    style={StyleSheet.flatten([
                      styles.presetChip,
                      { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                    ])}>
                    <Text style={[styles.presetChipText, { color: colors.text }]}>
                      User: только базовые
                    </Text>
                  </RipplePressable>
                </View>
              </View>

              <View style={[styles.matrixColumnsBar, { borderBottomColor: colors.line }]}>
                <Text style={[styles.colHeaderFeature, { color: colors.muted }]}>Страница</Text>
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
                        ? {
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: colors.line,
                          }
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
                      </View>
                      {feature?.description ? (
                        <Text
                          style={[styles.matrixFeatureDesc, { color: colors.muted }]}
                          numberOfLines={1}>
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

              <View style={[styles.panelNote, { backgroundColor: colors.surfaceSubtle }]}>
                <AppIcon name="admin" size="xs" color={colors.muted} />
                <Text style={[styles.panelNoteText, { color: colors.muted }]}>
                  Админ-панель всегда доступна только роли Admin и не может быть открыта роли User.
                </Text>
              </View>
            </View>
          </View>
        ) : (
          /* TAB 3: USERS MANAGEMENT */
          <View style={styles.section}>
            <View style={styles.barRow}>
              <View style={styles.statPills}>
                <View
                  style={[
                    styles.statPill,
                    { backgroundColor: colors.surface, borderColor: colors.line },
                  ]}>
                  <Text style={[styles.statText, { color: colors.muted }]}>
                    Активных: <Text style={{ color: colors.text }}>{stats.active}</Text>
                  </Text>
                </View>
                <View
                  style={[
                    styles.statPill,
                    { backgroundColor: colors.surface, borderColor: colors.line },
                  ]}>
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
                <AppIcon name="plus" size="xs" color={colors.accentText} />
                <Text style={[styles.primaryBtnText, { color: colors.accentText }]}>
                  Пользователь
                </Text>
              </RipplePressable>
            </View>

            {users.length > 3 ? (
              <View
                style={[
                  styles.userSearchBox,
                  { backgroundColor: colors.surface, borderColor: colors.line },
                ]}>
                <AppIcon name="search" size="xs" color={colors.muted} />
                <TextInput
                  value={userSearch}
                  onChangeText={setUserSearch}
                  placeholder="Поиск по имени или логину…"
                  placeholderTextColor={colors.muted}
                  style={[styles.userSearchInput, { color: colors.text }]}
                />
                {userSearch.length > 0 ? (
                  <RipplePressable onPress={() => setUserSearch('')} style={styles.clearSearchBtn}>
                    <AppIcon name="close" size={11} color={colors.muted} />
                  </RipplePressable>
                ) : null}
              </View>
            ) : null}

            <View
              style={[
                styles.panel,
                { backgroundColor: colors.surface, borderColor: colors.line },
              ]}>
              {filteredUsers.map((item, idx) => {
                const isSelf = item.id === currentUser?.id;
                return (
                  <Animated.View
                    key={item.id}
                    entering={FadeInDown.duration(150)}
                    layout={LinearTransition.springify().damping(24).stiffness(260)}
                    style={[
                      styles.userRow,
                      idx < filteredUsers.length - 1
                        ? {
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: colors.line,
                          }
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
                          <View
                            style={[styles.miniPill, { backgroundColor: colors.surfaceSubtle }]}>
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
    paddingBottom: 36,
  },
  containerDesktop: {
    paddingHorizontal: 32,
    paddingTop: 24,
  },
  containerMobile: {
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  inner: {
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  headerText: {
    gap: 2,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 13,
  },
  tabBar: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 3,
  },
  tabBarMobile: {
    width: '100%',
  },
  tabBtn: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabBtnMobile: {
    flex: 1,
    paddingHorizontal: 6,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    gap: 12,
  },
  panel: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  panelHeader: {
    padding: 16,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  panelHeaderTexts: {
    gap: 3,
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  panelSubtitle: {
    fontSize: 12,
    lineHeight: 17,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pageIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pageInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  pageTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  pageTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  countPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  countPillText: {
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  pageDesc: {
    fontSize: 12,
  },
  pageControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  openPageBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderPair: {
    flexDirection: 'row',
    gap: 4,
  },
  orderBtn: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.3,
  },
  panelNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  panelNoteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
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
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  colHeaderRole: {
    width: 66,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
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
    gap: 2,
  },
  matrixFeatureTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  matrixFeatureTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  matrixFeatureDesc: {
    fontSize: 12,
  },
  matrixToggleCell: {
    width: 66,
    alignItems: 'center',
    justifyContent: 'center',
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
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    height: 34,
    borderRadius: 9,
  },
  primaryBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  userSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 38,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
  userSearchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  clearSearchBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
    gap: 1,
  },
  userNameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  userName: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  userHandle: {
    fontSize: 12,
  },
  miniPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  miniPillText: {
    fontSize: 10,
    fontWeight: '700',
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
  editBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  editBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
