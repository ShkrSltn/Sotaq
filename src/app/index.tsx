import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { RipplePressable } from '@/components/ripple-pressable';
import { useDatabase, useDatabaseState } from '@/db/provider';
import { useAuth } from '@/features/auth/auth-context';
import { useFocus } from '@/features/focus/focus-context';
import { formatClock } from '@/features/focus/types';
import { listHabitsWithStats, toggleHabitLog } from '@/features/habits/habits-repository';
import type { HabitWithStats } from '@/features/habits/types';
import { toDateKey } from '@/features/kanban/types';
import { getActiveFeatures, getPlannedFeatures } from '@/features/registry';
import { useThemeColors, useViewport } from '@/theme/colors';

export default function HomeScreen() {
  const db = useDatabase();
  const colors = useThemeColors();
  const { isDesktop } = useViewport();
  const { schemaVersion } = useDatabaseState();
  const { user, canAccess } = useAuth();
  const focus = useFocus();

  const [habits, setHabits] = useState<HabitWithStats[]>([]);
  const userId = user?.id ?? '';

  const loadHabits = useCallback(async () => {
    if (!userId || !canAccess('habits')) {
      setHabits([]);
      return;
    }
    const items = await listHabitsWithStats(db, userId);
    setHabits(items);
  }, [db, userId, canAccess]);

  useFocusEffect(
    useCallback(() => {
      loadHabits();
      focus.refreshStats();
    }, [loadHabits, focus]),
  );

  async function handleToggleHabitToday(habitId: string) {
    if (!userId) {
      return;
    }
    await toggleHabitLog(db, userId, habitId, toDateKey(new Date()));
    await loadHabits();
  }

  const modules = getActiveFeatures().filter(
    (item) => item.key !== 'home' && canAccess(item.key),
  );
  const planned = getPlannedFeatures().filter((item) => canAccess(item.key));

  const habitsDoneCount = habits.filter((h) => h.completedToday).length;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.container,
        isDesktop ? styles.containerDesktop : styles.containerMobile,
      ]}>
      <View style={styles.inner}>
        <View style={styles.hero}>
          <Text style={[isDesktop ? styles.title : styles.titleMobile, { color: colors.text }]}>
            {user ? `Привет, ${user.displayName}` : 'Sotaq'}
          </Text>
          {isDesktop ? (
            <>
              <Text style={[styles.subtitle, { color: colors.muted }]}>
                Личное рабочее пространство
              </Text>
              <View style={styles.badgesRow}>
                {user ? (
                  <View
                    style={[
                      styles.roleBadge,
                      { backgroundColor: colors.surface, borderColor: colors.line },
                    ]}>
                    <Text style={[styles.roleBadgeText, { color: colors.text }]}>
                      {user.role === 'admin' ? 'Администратор' : 'Пользователь'}
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
            </>
          ) : null}
        </View>

        {/* Live Today Strip: Habits + Focus */}
        <View style={[styles.todayGrid, isDesktop ? styles.todayGridDesktop : null]}>
          {canAccess('habits') ? (
            <View
              style={[
                styles.todayCard,
                isDesktop ? styles.todayCardHabits : null,
                { backgroundColor: colors.surface, borderColor: colors.line },
              ]}>
              <View style={styles.todayCardHeader}>
                <View style={styles.todayHeaderLeft}>
                  <AppIcon name="flame" size="sm" color={colors.warning} />
                  <Text style={[styles.todayCardTitle, { color: colors.text }]}>
                    Привычки на сегодня
                  </Text>
                  {habits.length > 0 ? (
                    <Text style={[styles.todayCounter, { color: colors.muted }]}>
                      {habitsDoneCount}/{habits.length}
                    </Text>
                  ) : null}
                </View>

                <RipplePressable
                  onPress={() => router.navigate('/habits' as never)}
                  style={styles.openLinkBtn}>
                  <Text style={[styles.openLinkText, { color: colors.muted }]}>Все</Text>
                  <AppIcon name="arrowRight" size="xs" color={colors.muted} />
                </RipplePressable>
              </View>

              {habits.length === 0 ? (
                <RipplePressable
                  onPress={() => router.navigate('/habits' as never)}
                  style={StyleSheet.flatten([
                    styles.emptyTodayHint,
                    { backgroundColor: colors.surfaceSubtle },
                  ])}>
                  <AppIcon name="plus" size="xs" color={colors.muted} />
                  <Text style={[styles.emptyTodayText, { color: colors.muted }]}>
                    Добавить привычки для ежедневного трекинга
                  </Text>
                </RipplePressable>
              ) : (
                <View style={styles.habitsChips}>
                  {habits.map((habit) => (
                    <RipplePressable
                      key={habit.id}
                      onPress={() => handleToggleHabitToday(habit.id)}
                      style={StyleSheet.flatten([
                        styles.habitPill,
                        {
                          backgroundColor: habit.completedToday
                            ? `${habit.color}22`
                            : colors.surfaceSubtle,
                          borderColor: habit.completedToday ? habit.color : colors.line,
                        },
                      ])}>
                      <View
                        style={[
                          styles.habitPillCheck,
                          {
                            backgroundColor: habit.completedToday ? habit.color : 'transparent',
                            borderColor: habit.completedToday ? habit.color : colors.muted,
                          },
                        ]}>
                        {habit.completedToday ? (
                          <AppIcon name="check" size={10} color="#FFFFFF" strokeWidth={2.6} />
                        ) : null}
                      </View>
                      <Text
                        style={[
                          styles.habitPillTitle,
                          {
                            color: colors.text,
                            textDecorationLine: habit.completedToday ? 'line-through' : 'none',
                            opacity: habit.completedToday ? 0.72 : 1,
                          },
                        ]}
                        numberOfLines={1}>
                        {habit.title}
                      </Text>
                      {habit.currentStreak > 0 ? (
                        <Text style={[styles.habitPillStreak, { color: colors.warning }]}>
                          🔥 {habit.currentStreak}
                        </Text>
                      ) : null}
                    </RipplePressable>
                  ))}
                </View>
              )}
            </View>
          ) : null}

          <View
            style={[
              styles.todayCard,
              isDesktop ? styles.todayCardFocus : null,
              { backgroundColor: colors.surface, borderColor: colors.line },
            ]}>
            <View style={styles.todayCardHeader}>
              <RipplePressable
                onPress={() => {
                  if (canAccess('focus')) {
                    router.navigate('/focus' as never);
                  }
                }}
                style={styles.todayHeaderLeft}>
                <AppIcon name="timer" size="sm" color={colors.muted} />
                <Text style={[styles.todayCardTitle, { color: colors.text }]}>Фокус сегодня</Text>
                {canAccess('focus') ? (
                  <AppIcon name="chevronRight" size="xs" color={colors.muted} />
                ) : null}
              </RipplePressable>
              <RipplePressable
                onPress={focus.toggle}
                style={StyleSheet.flatten([
                  styles.focusQuickPlay,
                  { backgroundColor: colors.accent },
                ])}>
                <AppIcon
                  name={focus.isRunning ? 'pause' : 'play'}
                  size={11}
                  color={colors.accentText}
                />
                <Text style={[styles.focusQuickPlayText, { color: colors.accentText }]}>
                  {formatClock(focus.secondsLeft)}
                </Text>
              </RipplePressable>
            </View>

            <View style={styles.focusStatsRow}>
              <View style={[styles.focusStatBox, { backgroundColor: colors.surfaceSubtle }]}>
                <Text style={[styles.focusStatNum, { color: colors.text }]}>
                  {focus.stats.todayMinutes}/{focus.analytics.dailyGoalMinutes}м
                </Text>
                <Text style={[styles.focusStatLabel, { color: colors.muted }]}>
                  сегодня · {focus.stats.todaySessions} сес.
                </Text>
                <View style={[styles.focusGoalTrack, { backgroundColor: colors.line }]}>
                  <View
                    style={[
                      styles.focusGoalFill,
                      {
                        width: `${focus.analytics.todayGoalProgress}%`,
                        backgroundColor:
                          focus.analytics.todayGoalProgress >= 100
                            ? colors.success
                            : colors.accent,
                      },
                    ]}
                  />
                </View>
              </View>
              <View style={[styles.focusStatBox, { backgroundColor: colors.surfaceSubtle }]}>
                <Text
                  style={[
                    styles.focusStatNum,
                    {
                      color:
                        focus.analytics.state === 'broken'
                          ? colors.danger
                          : focus.analytics.state === 'drifting'
                            ? colors.warning
                            : focus.analytics.state === 'flow'
                              ? colors.success
                              : colors.text,
                    },
                  ]}>
                  {focus.analytics.stateMeta.emoji} {focus.analytics.disciplineScore}
                </Text>
                <Text style={[styles.focusStatLabel, { color: colors.muted }]} numberOfLines={1}>
                  {focus.analytics.stateMeta.shortLabel} · 7д: {focus.stats.weekMinutes}м
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>Разделы</Text>
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
            <View style={[styles.grid, isDesktop ? styles.gridDesktop : styles.gridMobile]}>
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
                    isDesktop ? styles.cardDesktop : styles.cardMobile,
                    { backgroundColor: colors.surface, borderColor: colors.line },
                  ])}>
                  <View style={styles.cardHeader}>
                    <View style={[styles.badgeBox, { backgroundColor: colors.surfaceSubtle }]}>
                      <AppIcon name={item.icon} size={isDesktop ? 'lg' : 'md'} color={colors.text} />
                    </View>
                    <AppIcon name="arrowRight" size="xs" color={colors.muted} />
                  </View>
                  <Text
                    style={[isDesktop ? styles.cardTitle : styles.cardTitleMobile, { color: colors.text }]}
                    numberOfLines={1}>
                    {isDesktop ? item.title : item.shortTitle}
                  </Text>
                  <Text
                    style={[styles.cardDetail, { color: colors.muted }]}
                    numberOfLines={isDesktop ? 2 : 2}>
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
    paddingVertical: 28,
  },
  inner: {
    width: '100%',
    maxWidth: 940,
    gap: 24,
  },
  hero: {
    gap: 6,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.7,
  },
  titleMobile: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
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
  todayGrid: {
    gap: 12,
  },
  todayGridDesktop: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  todayCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 15,
    gap: 12,
  },
  todayCardHabits: {
    flex: 1.5,
  },
  todayCardFocus: {
    flex: 1,
  },
  todayCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  todayHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  todayCardTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  todayCounter: {
    fontSize: 12,
    fontWeight: '600',
  },
  openLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  openLinkText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyTodayHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 11,
    borderRadius: 10,
  },
  emptyTodayText: {
    fontSize: 13,
    fontWeight: '500',
  },
  habitsChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  habitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '100%',
  },
  habitPillCheck: {
    width: 16,
    height: 16,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  habitPillTitle: {
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  habitPillStreak: {
    fontSize: 11,
    fontWeight: '700',
  },
  focusQuickPlay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  focusQuickPlayText: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  focusStatsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  focusStatBox: {
    flex: 1,
    borderRadius: 11,
    padding: 11,
    gap: 2,
  },
  focusStatNum: {
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  focusStatLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  focusGoalTrack: {
    height: 4,
    borderRadius: 2,
    marginTop: 4,
    overflow: 'hidden',
  },
  focusGoalFill: {
    height: '100%',
    borderRadius: 2,
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
  gridMobile: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 6,
  },
  cardDesktop: {
    width: '32%',
    minWidth: 240,
  },
  cardMobile: {
    width: '48.2%',
    padding: 13,
    borderRadius: 14,
    gap: 5,
  },
  cardTitleMobile: {
    fontSize: 15,
    fontWeight: '700',
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
