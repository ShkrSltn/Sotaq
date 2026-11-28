import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { RipplePressable } from '@/components/ripple-pressable';
import type { HabitWithStats } from '@/features/habits/types';
import type { ThemeColors } from '@/theme/colors';

type Props = {
  habits: HabitWithStats[];
  todayKey: string;
  isDesktop: boolean;
  colors: ThemeColors;
  onToggleToday: (habitId: string, dateKey: string) => void;
  onEditHabit: (habit: HabitWithStats) => void;
};

export function HabitTodayList({
  habits,
  todayKey,
  isDesktop,
  colors,
  onToggleToday,
  onEditHabit,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const doneCount = habits.filter((h) => h.completedToday).length;
  const allDone = habits.length > 0 && doneCount === habits.length;
  const pct = habits.length > 0 ? Math.round((doneCount / habits.length) * 100) : 0;
  const useTwoCols = isDesktop && habits.length >= 2;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <RipplePressable
        onPress={() => setCollapsed((v) => !v)}
        style={styles.header}>
        <View style={styles.headerLeft}>
          <AppIcon
            name="checkCircle"
            size="sm"
            color={allDone ? colors.success : colors.muted}
          />
          <Text style={[styles.title, { color: colors.text }]}>Сегодня</Text>
          {allDone ? (
            <View style={[styles.donePill, { backgroundColor: colors.successBg }]}>
              <Text style={[styles.donePillText, { color: colors.success }]}>Всё закрыто</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.headerRight}>
          <View style={[styles.progressTrack, { backgroundColor: colors.surfaceSubtle }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${pct}%`,
                  backgroundColor: allDone ? colors.success : colors.accent,
                },
              ]}
            />
          </View>
          <Text
            style={[
              styles.counter,
              { color: allDone ? colors.success : colors.muted },
            ]}>
            {doneCount}/{habits.length}
          </Text>
          <AppIcon
            name={collapsed ? 'chevronDown' : 'chevronUp'}
            size="xs"
            color={colors.muted}
          />
        </View>
      </RipplePressable>

      {!collapsed ? (
        <View
          style={[
            styles.body,
            { borderTopColor: colors.line },
            useTwoCols ? styles.gridDesktop : styles.listMobile,
          ]}>
          {habits.map((habit, idx) => {
            const done = habit.completedToday;
            return (
              <View
                key={habit.id}
                style={[
                  useTwoCols ? styles.tileDesktop : styles.rowMobile,
                  useTwoCols
                    ? {
                        backgroundColor: done ? `${habit.color}12` : colors.surfaceSubtle,
                        borderColor: done ? `${habit.color}55` : colors.line,
                      }
                    : idx > 0
                      ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }
                      : null,
                ]}>
                <RipplePressable
                  accessibilityLabel={`Отметить ${habit.title} за сегодня`}
                  onPress={() => onToggleToday(habit.id, todayKey)}
                  style={styles.itemMain}>
                  <View
                    style={[
                      styles.checkbox,
                      {
                        backgroundColor: done ? habit.color : 'transparent',
                        borderColor: done ? habit.color : colors.muted,
                      },
                    ]}>
                    {done ? (
                      <AppIcon name="check" size={12} color="#FFFFFF" strokeWidth={2.6} />
                    ) : null}
                  </View>

                  <View style={[styles.iconBadge, { backgroundColor: `${habit.color}1E` }]}>
                    <AppIcon name={habit.icon} size="xs" color={habit.color} />
                  </View>

                  <Text
                    style={[
                      styles.habitTitle,
                      {
                        color: colors.text,
                        textDecorationLine: done ? 'line-through' : 'none',
                        opacity: done ? 0.68 : 1,
                      },
                    ]}
                    numberOfLines={1}>
                    {habit.title}
                  </Text>

                  {habit.currentStreak > 0 ? (
                    <View style={[styles.streakPill, { backgroundColor: colors.surface }]}>
                      <AppIcon name="flame" size={11} color={colors.warning} />
                      <Text style={[styles.streakText, { color: colors.text }]}>
                        {habit.currentStreak}
                      </Text>
                    </View>
                  ) : null}
                </RipplePressable>

                <RipplePressable
                  accessibilityLabel={`Настроить ${habit.title}`}
                  onPress={() => onEditHabit(habit)}
                  style={styles.editBtn}>
                  <AppIcon name="more" size="xs" color={colors.muted} />
                </RipplePressable>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexShrink: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  donePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  donePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressTrack: {
    width: 56,
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  counter: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  body: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  gridDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 10,
    gap: 8,
  },
  tileDesktop: {
    width: '49.2%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    paddingRight: 6,
  },
  listMobile: {},
  rowMobile: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
  },
  itemMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minWidth: 0,
  },
  checkbox: {
    width: 21,
    height: 21,
    borderRadius: 7,
    borderWidth: 1.8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconBadge: {
    width: 25,
    height: 25,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  habitTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  streakText: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  editBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
