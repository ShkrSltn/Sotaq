import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { RipplePressable } from '@/components/ripple-pressable';
import { useDatabaseState } from '@/db/provider';
import { useAuth } from '@/features/auth/auth-context';
import { getActiveFeatures, getPlannedFeatures } from '@/features/registry';
import { useThemeColors, useViewport } from '@/theme/colors';

export default function HomeScreen() {
  const colors = useThemeColors();
  const { isDesktop } = useViewport();
  const { schemaVersion } = useDatabaseState();
  const { user, canAccess } = useAuth();

  const modules = getActiveFeatures().filter(
    (item) => item.key !== 'home' && canAccess(item.key),
  );
  const planned = getPlannedFeatures().filter((item) => canAccess(item.key));

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.container,
        isDesktop ? styles.containerDesktop : styles.containerMobile,
      ]}>
      <View style={styles.inner}>
        <View style={styles.hero}>
          <Text style={[styles.title, { color: colors.text }]}>
            {user ? `Привет, ${user.displayName}` : 'Sotaq'}
          </Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            Личное рабочее пространство — модули подключаются поэтапно
          </Text>
          <View style={styles.badgesRow}>
            {user ? (
              <View style={[styles.roleBadge, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                <Text style={[styles.roleBadgeText, { color: colors.text }]}>
                  {user.role === 'admin' ? 'Роль: Администратор' : 'Роль: Пользователь'}
                </Text>
              </View>
            ) : null}
            <View style={[styles.statusBadge, { backgroundColor: colors.successBg }]}>
              <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
              <Text style={[styles.statusLabel, { color: colors.success }]}>
                SQLite v{schemaVersion}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>Доступные модули</Text>
          {modules.length === 0 ? (
            <View
              style={[
                styles.emptyCard,
                { backgroundColor: colors.surface, borderColor: colors.line },
              ]}>
              <Text style={[styles.cardDetail, { color: colors.muted }]}>
                Для вашей роли пока не включён ни один модуль. Обратитесь к администратору.
              </Text>
            </View>
          ) : (
            <View style={[styles.grid, isDesktop ? styles.gridDesktop : null]}>
              {modules.map((item) => (
                <RipplePressable
                  key={item.key}
                  accessibilityLabel={item.title}
                  onPress={() => {
                    if (item.route) {
                      router.navigate(item.route);
                    }
                  }}
                  style={StyleSheet.flatten([
                    styles.card,
                    isDesktop ? styles.cardDesktop : null,
                    { backgroundColor: colors.surface, borderColor: colors.line },
                  ])}>
                  <View style={styles.cardHeader}>
                    <View style={[styles.badgeBox, { backgroundColor: colors.surfaceSubtle }]}>
                      <AppIcon name={item.icon} size="lg" color={colors.text} />
                    </View>
                    <AppIcon name="arrowRight" size="sm" color={colors.muted} />
                  </View>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{item.title}</Text>
                  <Text style={[styles.cardDetail, { color: colors.muted }]}>
                    {item.description}
                  </Text>
                </RipplePressable>
              ))}
            </View>
          )}
        </View>

        {planned.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.muted }]}>Следующие этапы</Text>
            <View style={[styles.grid, isDesktop ? styles.gridDesktop : null]}>
              {planned.map((item) => (
                <View
                  key={item.key}
                  style={[
                    styles.card,
                    styles.plannedCard,
                    isDesktop ? styles.cardDesktop : null,
                    { backgroundColor: colors.surface, borderColor: colors.line },
                  ]}>
                  <View style={styles.cardHeader}>
                    <View style={[styles.badgeBox, { backgroundColor: colors.surfaceSubtle }]}>
                      <AppIcon name={item.icon} size="lg" color={colors.muted} />
                    </View>
                    {item.stageLabel ? (
                      <View style={[styles.stageTag, { backgroundColor: colors.surfaceSubtle }]}>
                        <Text style={[styles.stageTagText, { color: colors.muted }]}>
                          {item.stageLabel}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{item.title}</Text>
                  <Text style={[styles.cardDetail, { color: colors.muted }]}>
                    {item.description}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    alignItems: 'center',
  },
  containerMobile: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  containerDesktop: {
    paddingHorizontal: 32,
    paddingVertical: 32,
  },
  inner: {
    width: '100%',
    maxWidth: 920,
    gap: 28,
  },
  hero: {
    gap: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  emptyCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
  },
  grid: {
    gap: 12,
  },
  gridDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 6,
  },
  cardDesktop: {
    width: '48.5%',
    minWidth: 260,
  },
  plannedCard: {
    opacity: 0.72,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  badgeBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeGlyph: {
    fontSize: 17,
  },
  cardArrow: {
    fontSize: 16,
  },
  stageTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  stageTagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  cardDetail: {
    fontSize: 13,
    lineHeight: 19,
  },
});
