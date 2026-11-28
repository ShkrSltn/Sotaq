import { router, usePathname } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { RipplePressable } from '@/components/ripple-pressable';
import { useDatabaseState } from '@/db/provider';
import { useAuth } from '@/features/auth/auth-context';
import {
  FocusMobileTrigger,
  FocusSidebarWidget,
} from '@/features/focus/components/focus-widget';
import {
  type FeatureDefinition,
  findFeatureByPathname,
  getActiveFeatures,
  getPlannedFeatures,
} from '@/features/registry';
import { useThemeColors, useViewport } from '@/theme/colors';

const MAX_MOBILE_BAR_ITEMS = 4;

export function AppShell({ children }: { children: ReactNode }) {
  const colors = useThemeColors();
  const { isDesktop } = useViewport();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { schemaVersion } = useDatabaseState();
  const { status, user, canAccess, logout } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  if (status !== 'authenticated' || !user) {
    return <View style={[styles.authContainer, { backgroundColor: colors.background }]}>{children}</View>;
  }

  const activeFeatures = getActiveFeatures().filter((item) => canAccess(item.key));
  const plannedFeatures = getPlannedFeatures().filter((item) => canAccess(item.key));
  const currentFeature = findFeatureByPathname(pathname);

  const mobileBarCandidates = activeFeatures.filter((item) => item.showInMobileBar !== false);
  const hasOverflow = mobileBarCandidates.length > MAX_MOBILE_BAR_ITEMS;
  const visibleMobileTabs = hasOverflow
    ? mobileBarCandidates.slice(0, MAX_MOBILE_BAR_ITEMS - 1)
    : mobileBarCandidates;
  const overflowTabs = hasOverflow ? mobileBarCandidates.slice(MAX_MOBILE_BAR_ITEMS - 1) : [];

  function isActiveRoute(feature: FeatureDefinition): boolean {
    if (!feature.route || typeof feature.route !== 'string') {
      return false;
    }
    if (feature.route === '/') {
      return pathname === '/';
    }
    return pathname === feature.route || pathname.startsWith(`${feature.route}/`);
  }

  function navigateTo(feature: FeatureDefinition) {
    if (!feature.route) {
      return;
    }
    setMoreOpen(false);
    router.navigate(feature.route);
  }

  if (isDesktop) {
    return (
      <View
        style={[
          styles.desktopRoot,
          {
            backgroundColor: colors.background,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}>
        <View
          style={[
            styles.sidebar,
            { backgroundColor: colors.surface, borderRightColor: colors.line },
          ]}>
          <View style={[styles.brandBlock, { borderBottomColor: colors.line }]}>
            <Text style={[styles.brandTitle, { color: colors.text }]}>Sotaq</Text>
            <Text style={[styles.brandSubtitle, { color: colors.muted }]}>Личное пространство</Text>
          </View>

          <ScrollView style={styles.sidebarScroll} contentContainerStyle={styles.sidebarContent}>
            <Text style={[styles.sectionCaption, { color: colors.muted }]}>Разделы</Text>
            {activeFeatures.map((feature) => {
              const active = isActiveRoute(feature);
              return (
                <RipplePressable
                  key={feature.key}
                  accessibilityLabel={feature.title}
                  onPress={() => navigateTo(feature)}
                  style={StyleSheet.flatten([
                    styles.navItem,
                    active ? { backgroundColor: colors.surfaceActive } : null,
                  ])}>
                  <AppIcon
                    name={feature.icon}
                    size="md"
                    color={active ? colors.text : colors.muted}
                  />
                  <Text
                    style={[
                      styles.navLabel,
                      { color: active ? colors.text : colors.muted },
                    ]}>
                    {feature.title}
                  </Text>
                </RipplePressable>
              );
            })}

            {plannedFeatures.length > 0 ? (
              <>
                <Text style={[styles.sectionCaption, styles.sectionSpacer, { color: colors.muted }]}>
                  В плане
                </Text>
                {plannedFeatures.map((feature) => (
                  <View key={feature.key} style={[styles.navItem, styles.navItemDisabled]}>
                    <AppIcon name={feature.icon} size="md" color={colors.muted} />
                    <Text style={[styles.navLabel, { color: colors.muted }]} numberOfLines={1}>
                      {feature.title}
                    </Text>
                    {feature.stageLabel ? (
                      <Text style={[styles.stagePill, { color: colors.muted }]}>
                        {feature.stageLabel}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </>
            ) : null}
          </ScrollView>

          <FocusSidebarWidget />

          <View style={[styles.sidebarFooter, { borderTopColor: colors.line }]}>
            <View style={styles.profileRow}>
              <View style={styles.profileInfo}>
                <View style={styles.profileNameRow}>
                  <Text style={[styles.profileName, { color: colors.text }]} numberOfLines={1}>
                    {user.displayName}
                  </Text>
                  <View style={[styles.roleBadge, { backgroundColor: colors.surfaceSubtle }]}>
                    <Text style={[styles.roleBadgeText, { color: colors.muted }]}>
                      {user.role === 'admin' ? 'Admin' : 'User'}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.profileHandle, { color: colors.muted }]} numberOfLines={1}>
                  @{user.username} · SQLite v{schemaVersion}
                </Text>
              </View>

              <RipplePressable
                accessibilityLabel="Выйти из аккаунта"
                onPress={logout}
                style={StyleSheet.flatten([
                  styles.logoutBtn,
                  { backgroundColor: colors.surfaceSubtle },
                ])}>
                <AppIcon name="logout" size="sm" color={colors.muted} />
              </RipplePressable>
            </View>
          </View>
        </View>

        <View style={styles.desktopMain}>{children}</View>
      </View>
    );
  }

  return (
    <View style={[styles.mobileRoot, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.mobileHeader,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.line,
            paddingTop: Math.max(insets.top, 8),
          },
        ]}>
        <View style={styles.mobileHeaderLeft}>
          <Text style={[styles.mobileBrand, { color: colors.text }]}>Sotaq</Text>
          {currentFeature && currentFeature.key !== 'home' ? (
            <>
              <Text style={[styles.mobileSeparator, { color: colors.muted }]}>/</Text>
              <Text style={[styles.mobileSection, { color: colors.muted }]} numberOfLines={1}>
                {currentFeature.shortTitle}
              </Text>
            </>
          ) : null}
        </View>

        <View style={styles.mobileHeaderRight}>
          <FocusMobileTrigger />
          <View style={[styles.dbChip, { backgroundColor: colors.surfaceSubtle }]}>
            <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
            <Text style={[styles.dbChipText, { color: colors.text }]} numberOfLines={1}>
              @{user.username}
            </Text>
          </View>
          <RipplePressable
            accessibilityLabel="Выйти"
            onPress={logout}
            style={StyleSheet.flatten([
              styles.mobileLogoutBtn,
              { backgroundColor: colors.surfaceSubtle },
            ])}>
            <AppIcon name="logout" size="sm" color={colors.muted} />
          </RipplePressable>
        </View>
      </View>

      <View style={styles.mobileContent}>{children}</View>

      <View
        style={[
          styles.mobileTabBar,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.line,
            paddingBottom: Math.max(insets.bottom, 8),
          },
        ]}>
        {visibleMobileTabs.map((feature) => {
          const active = isActiveRoute(feature);
          return (
            <RipplePressable
              key={feature.key}
              accessibilityLabel={feature.title}
              onPress={() => navigateTo(feature)}
              style={StyleSheet.flatten([
                styles.mobileTab,
                active ? { backgroundColor: colors.surfaceActive } : null,
              ])}>
              <AppIcon
                name={feature.icon}
                size="md"
                color={active ? colors.text : colors.muted}
              />
              <Text
                style={[styles.mobileTabLabel, { color: active ? colors.text : colors.muted }]}
                numberOfLines={1}>
                {feature.shortTitle}
              </Text>
            </RipplePressable>
          );
        })}

        {hasOverflow ? (
          <RipplePressable
            accessibilityLabel="Ещё разделы"
            onPress={() => setMoreOpen(true)}
            style={styles.mobileTab}>
            <AppIcon name="more" size="md" color={colors.muted} />
            <Text style={[styles.mobileTabLabel, { color: colors.muted }]}>Ещё</Text>
          </RipplePressable>
        ) : null}
      </View>

      <Modal
        visible={moreOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMoreOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setMoreOpen(false)}>
          <View
            style={[
              styles.moreSheet,
              {
                backgroundColor: colors.surface,
                borderColor: colors.line,
                paddingBottom: Math.max(insets.bottom, 16),
              },
            ]}>
            <Text style={[styles.moreTitle, { color: colors.text }]}>Другие разделы</Text>
            {overflowTabs.map((feature) => (
              <RipplePressable
                key={feature.key}
                onPress={() => navigateTo(feature)}
                style={styles.navItem}>
                <AppIcon name={feature.icon} size="md" color={colors.text} />
                <Text style={[styles.navLabel, { color: colors.text }]}>{feature.title}</Text>
              </RipplePressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  authContainer: {
    flex: 1,
  },
  desktopRoot: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: 248,
    borderRightWidth: StyleSheet.hairlineWidth,
    flexDirection: 'column',
  },
  brandBlock: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  brandSubtitle: {
    fontSize: 12,
  },
  sidebarScroll: {
    flex: 1,
  },
  sidebarContent: {
    padding: 12,
    gap: 4,
  },
  sectionCaption: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sectionSpacer: {
    marginTop: 12,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 10,
  },
  navItemDisabled: {
    opacity: 0.55,
  },
  navBadge: {
    width: 20,
    textAlign: 'center',
    fontSize: 15,
  },
  navLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  stagePill: {
    fontSize: 11,
    fontWeight: '500',
  },
  sidebarFooter: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  profileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  profileName: {
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  profileHandle: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  logoutBtn: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
  },
  logoutLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  desktopMain: {
    flex: 1,
    minWidth: 0,
  },
  mobileRoot: {
    flex: 1,
  },
  mobileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  mobileHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
    minWidth: 0,
  },
  mobileBrand: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  mobileSeparator: {
    fontSize: 15,
  },
  mobileSection: {
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 1,
  },
  mobileHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dbChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    maxWidth: 110,
  },
  dbChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  mobileLogoutBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  mobileLogoutText: {
    fontSize: 11,
    fontWeight: '600',
  },
  mobileContent: {
    flex: 1,
    minHeight: 0,
  },
  mobileTabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 6,
    paddingHorizontal: 8,
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  mobileTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 10,
    gap: 2,
  },
  mobileTabBadge: {
    fontSize: 16,
    lineHeight: 18,
  },
  mobileTabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  moreSheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 14,
    paddingHorizontal: 14,
    gap: 6,
  },
  moreTitle: {
    fontSize: 15,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingBottom: 6,
  },
});
