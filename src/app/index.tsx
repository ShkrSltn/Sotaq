import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { AppIcon } from '@/components/app-icon';
import { RipplePressable } from '@/components/ripple-pressable';
import { useDatabase } from '@/db/provider';
import { useAuth } from '@/features/auth/auth-context';
import { useFocus } from '@/features/focus/focus-context';
import { formatClock } from '@/features/focus/types';
import { toggleHabitLog } from '@/features/habits/habits-repository';
import {
  type HomeDashboardData,
  type HomePlanItem,
  loadHomeDashboard,
} from '@/features/home/home-repository';
import { PRIORITY_META } from '@/features/kanban/types';
import { createNotePage } from '@/features/notes/notes-repository';
import { resolveNotePageIcon } from '@/features/notes/types';
import { getActiveFeatures } from '@/features/registry';
import { createTodo, toggleTodoDone } from '@/features/todos/todos-repository';
import { useThemeColors, useViewport } from '@/theme/colors';
import { formatDateKeyRu, todayKey } from '@/utils/date-key';

const WEEKDAYS_FULL_RU = [
  'Воскресенье',
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
] as const;

function getGreetingByHour(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Доброе утро';
  if (hour >= 12 && hour < 18) return 'Добрый день';
  if (hour >= 18 && hour < 23) return 'Добрый вечер';
  return 'Доброй ночи';
}

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffMin = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return `${diffMin} мин`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} ч`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'вчера';
  return `${diffD} дн.`;
}

const EMPTY_DASHBOARD: HomeDashboardData = {
  planItems: [],
  overdueCount: 0,
  todayCompletedTasks: 0,
  todayTotalTasks: 0,
  defaultTodoListId: null,
  habits: [],
  recentNotes: [],
  languageSummary: null,
};

export default function HomeScreen() {
  const db = useDatabase();
  const colors = useThemeColors();
  const { isDesktop } = useViewport();
  const { user, canAccess, orderedControllableKeys } = useAuth();
  const focus = useFocus();

  const userId = user?.id ?? '';
  const [data, setData] = useState<HomeDashboardData>(EMPTY_DASHBOARD);
  const [quickTask, setQuickTask] = useState('');
  const [submittingTask, setSubmittingTask] = useState(false);

  const canTodos = canAccess('todos');
  const canKanban = canAccess('kanban');
  const canHabits = canAccess('habits');
  const canFocus = canAccess('focus');
  const canNotes = canAccess('notes');
  const canLanguage = canAccess('language');
  const canCalendar = canAccess('calendar');

  const refreshHome = useCallback(async () => {
    if (!userId) {
      setData(EMPTY_DASHBOARD);
      return;
    }
    const next = await loadHomeDashboard(db, userId, {
      todos: canTodos,
      kanban: canKanban,
      habits: canHabits,
      notes: canNotes,
      language: canLanguage,
    });
    setData(next);
  }, [db, userId, canTodos, canKanban, canHabits, canNotes, canLanguage]);

  useFocusEffect(
    useCallback(() => {
      refreshHome();
      focus.refreshStats();
    }, [refreshHome, focus]),
  );

  async function handleQuickAddTask() {
    const trimmed = quickTask.trim();
    if (!trimmed || !userId || !canTodos || submittingTask) {
      return;
    }
    setSubmittingTask(true);
    try {
      setQuickTask('');
      await createTodo(db, userId, {
        title: trimmed,
        listId: data.defaultTodoListId,
        dueDate: todayKey(),
        priority: 'medium',
      });
      await refreshHome();
    } finally {
      setSubmittingTask(false);
    }
  }

  async function handleQuickCreateNote() {
    if (!userId || !canNotes) {
      return;
    }
    await createNotePage(db, userId, { title: '', icon: 'notes' });
    router.navigate('/notes' as never);
  }

  async function handleTogglePlanItem(item: HomePlanItem) {
    if (item.kind !== 'todo') {
      router.navigate('/board' as never);
      return;
    }
    await toggleTodoDone(db, item.id, !item.isDone);
    await refreshHome();
  }

  function handleFocusPlanItem(item: HomePlanItem) {
    focus.linkTarget({
      type: item.kind === 'kanban_card' ? 'kanban_card' : 'todo',
      id: item.id,
      title: item.title,
      subtitle: item.subtitle,
    });
    if (focus.mode !== 'focus') {
      focus.setMode('focus');
    }
    if (!focus.isRunning) {
      focus.start();
    }
  }

  async function handleToggleHabitToday(habitId: string) {
    if (!userId) {
      return;
    }
    await toggleHabitLog(db, userId, habitId, todayKey());
    await refreshHome();
  }

  const now = new Date();
  const greeting = getGreetingByHour(now.getHours());
  const dateLabel = `${WEEKDAYS_FULL_RU[now.getDay()]}, ${formatDateKeyRu(todayKey())}`;

  const habitsDoneCount = data.habits.filter((h) => h.completedToday).length;
  const habitsTotal = data.habits.length;

  // Overall Day Pulse % across active signals (tasks, habits, focus)
  const dayScores: number[] = [];
  if (data.todayTotalTasks > 0) {
    dayScores.push(data.todayCompletedTasks / data.todayTotalTasks);
  }
  if (habitsTotal > 0) {
    dayScores.push(habitsDoneCount / habitsTotal);
  }
  if (canFocus && focus.analytics.dailyGoalMinutes > 0) {
    dayScores.push(Math.min(1, focus.analytics.todayGoalProgress / 100));
  }
  const dayPulsePct =
    dayScores.length > 0
      ? Math.round((dayScores.reduce((acc, s) => acc + s, 0) / dayScores.length) * 100)
      : 0;

  // Day Pulse ring geometry
  const pulseSize = 46;
  const pulseStroke = 4.5;
  const pulseRadius = (pulseSize - pulseStroke) / 2;
  const pulseCirc = 2 * Math.PI * pulseRadius;
  const pulseOffset = pulseCirc * (1 - dayPulsePct / 100);

  // Focus mini ring geometry
  const focusRingSize = 54;
  const focusRingStroke = 5;
  const focusRingRadius = (focusRingSize - focusRingStroke) / 2;
  const focusRingCirc = 2 * Math.PI * focusRingRadius;
  const focusProgress =
    focus.totalSeconds > 0
      ? Math.max(0, Math.min(1, (focus.totalSeconds - focus.secondsLeft) / focus.totalSeconds))
      : 0;
  const focusDashOffset = focusRingCirc * (1 - focusProgress);
  const focusRingColor =
    focus.mode !== 'focus'
      ? colors.success
      : focus.analytics.state === 'broken'
        ? colors.danger
        : focus.analytics.state === 'drifting'
          ? colors.warning
          : focus.analytics.state === 'flow'
            ? colors.success
            : colors.accent;

  const quickNavOrder = new Map<string, number>();
  orderedControllableKeys.forEach((k, i) => quickNavOrder.set(k, i));
  quickNavOrder.set('admin', 999);

  const quickNavModules = getActiveFeatures()
    .filter((item) => item.key !== 'home' && canAccess(item.key))
    .sort((a, b) => (quickNavOrder.get(a.key) ?? 500) - (quickNavOrder.get(b.key) ?? 500));

  // --- Reusable Bento Cards ---
  const todayPlanCard =
    canTodos || canKanban ? (
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.line },
        ]}>
        <View style={styles.cardHeader}>
          <RipplePressable
            onPress={() => router.navigate((canCalendar ? '/calendar' : '/todos') as never)}
            style={styles.cardHeaderLeft}>
            <AppIcon name="todos" size="sm" color={colors.text} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>План на сегодня</Text>
            {data.overdueCount > 0 ? (
              <View style={[styles.overduePill, { backgroundColor: colors.dangerBg }]}>
                <Text style={[styles.overduePillText, { color: colors.danger }]}>
                  Просрочено: {data.overdueCount}
                </Text>
              </View>
            ) : null}
          </RipplePressable>

          <RipplePressable
            onPress={() => router.navigate((canTodos ? '/todos' : '/board') as never)}
            style={styles.cardActionLink}>
            <Text style={[styles.cardActionText, { color: colors.muted }]}>Все</Text>
            <AppIcon name="arrowRight" size="xs" color={colors.muted} />
          </RipplePressable>
        </View>

        {data.planItems.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: colors.surfaceSubtle }]}>
            <AppIcon name="checkCircle" size="md" color={colors.success} />
            <Text style={[styles.emptyBoxTitle, { color: colors.text }]}>
              На сегодня всё чисто
            </Text>
            <Text style={[styles.emptyBoxSub, { color: colors.muted }]}>
              Добавь задачу в поле выше или запланируй дела в календаре
            </Text>
          </View>
        ) : (
          <View style={styles.planList}>
            {data.planItems.map((item, idx) => {
              const isLinkedToFocus = focus.linkedTarget?.id === item.id;
              return (
                <View
                  key={item.key}
                  style={[
                    styles.planRow,
                    idx > 0
                      ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }
                      : null,
                  ]}>
                  <RipplePressable
                    onPress={() => handleTogglePlanItem(item)}
                    style={styles.planRowMain}>
                    {item.kind === 'todo' ? (
                      <View
                        style={[
                          styles.todoCheckbox,
                          { borderColor: item.isOverdue ? colors.danger : colors.muted },
                        ]}
                      />
                    ) : (
                      <View
                        style={[
                          styles.kanbanTagIcon,
                          { backgroundColor: colors.surfaceSubtle },
                        ]}>
                        <AppIcon name="kanban" size={12} color={colors.muted} />
                      </View>
                    )}

                    <View style={styles.planRowTexts}>
                      <Text
                        style={[styles.planRowTitle, { color: colors.text }]}
                        numberOfLines={1}>
                        {item.title}
                      </Text>
                      <View style={styles.planRowMeta}>
                        <View
                          style={[
                            styles.priorityDot,
                            { backgroundColor: PRIORITY_META[item.priority].dotColor },
                          ]}
                        />
                        <Text style={[styles.planRowSub, { color: colors.muted }]} numberOfLines={1}>
                          {item.subtitle}
                        </Text>
                        {item.isOverdue && item.dueDate ? (
                          <Text style={[styles.planOverdueDate, { color: colors.danger }]}>
                            · {formatDateKeyRu(item.dueDate)}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </RipplePressable>

                  <RipplePressable
                    accessibilityLabel={`Запустить фокус на «${item.title}»`}
                    onPress={() => handleFocusPlanItem(item)}
                    style={StyleSheet.flatten([
                      styles.focusLaunchBtn,
                      {
                        backgroundColor: isLinkedToFocus
                          ? colors.accent
                          : colors.surfaceSubtle,
                      },
                    ])}>
                    <AppIcon
                      name={isLinkedToFocus && focus.isRunning ? 'pause' : 'play'}
                      size={11}
                      color={isLinkedToFocus ? colors.accentText : colors.muted}
                    />
                  </RipplePressable>
                </View>
              );
            })}
          </View>
        )}
      </View>
    ) : null;

  const habitsCard = canHabits ? (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.line },
      ]}>
      <View style={styles.cardHeader}>
        <RipplePressable
          onPress={() => router.navigate('/habits' as never)}
          style={styles.cardHeaderLeft}>
          <AppIcon name="flame" size="sm" color={colors.warning} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>Привычки</Text>
          {habitsTotal > 0 ? (
            <Text
              style={[
                styles.cardCounter,
                { color: habitsDoneCount === habitsTotal ? colors.success : colors.muted },
              ]}>
              {habitsDoneCount}/{habitsTotal}
            </Text>
          ) : null}
        </RipplePressable>

        <RipplePressable
          onPress={() => router.navigate('/habits' as never)}
          style={styles.cardActionLink}>
          <Text style={[styles.cardActionText, { color: colors.muted }]}>Карта</Text>
          <AppIcon name="arrowRight" size="xs" color={colors.muted} />
        </RipplePressable>
      </View>

      {habitsTotal === 0 ? (
        <RipplePressable
          onPress={() => router.navigate('/habits' as never)}
          style={StyleSheet.flatten([
            styles.emptyInlineBtn,
            { backgroundColor: colors.surfaceSubtle },
          ])}>
          <AppIcon name="plus" size="xs" color={colors.muted} />
          <Text style={[styles.emptyInlineText, { color: colors.muted }]}>
            Добавить первую привычку
          </Text>
        </RipplePressable>
      ) : (
        <>
          <View style={[styles.thinTrack, { backgroundColor: colors.surfaceSubtle }]}>
            <View
              style={[
                styles.thinFill,
                {
                  width: `${Math.round((habitsDoneCount / habitsTotal) * 100)}%`,
                  backgroundColor:
                    habitsDoneCount === habitsTotal ? colors.success : colors.accent,
                },
              ]}
            />
          </View>

          <View style={styles.habitsChips}>
            {data.habits.map((habit) => (
              <RipplePressable
                key={habit.id}
                onPress={() => handleToggleHabitToday(habit.id)}
                style={StyleSheet.flatten([
                  styles.habitPill,
                  {
                    backgroundColor: habit.completedToday
                      ? `${habit.color}20`
                      : colors.surfaceSubtle,
                    borderColor: habit.completedToday ? habit.color : colors.line,
                  },
                ])}>
                <View
                  style={[
                    styles.habitCheck,
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
                    styles.habitTitle,
                    {
                      color: colors.text,
                      textDecorationLine: habit.completedToday ? 'line-through' : 'none',
                      opacity: habit.completedToday ? 0.68 : 1,
                    },
                  ]}
                  numberOfLines={1}>
                  {habit.title}
                </Text>
                {habit.currentStreak > 0 ? (
                  <View style={styles.streakWrap}>
                    <AppIcon name="flame" size={11} color={colors.warning} />
                    <Text style={[styles.streakNum, { color: colors.warning }]}>
                      {habit.currentStreak}
                    </Text>
                  </View>
                ) : null}
              </RipplePressable>
            ))}
          </View>
        </>
      )}
    </View>
  ) : null;

  const focusCard = (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.line },
      ]}>
      <View style={styles.cardHeader}>
        <RipplePressable
          onPress={() => {
            if (canFocus) router.navigate('/focus' as never);
          }}
          style={styles.cardHeaderLeft}>
          <AppIcon name="timer" size="sm" color={colors.text} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>Фокус</Text>
        </RipplePressable>

        {canFocus ? (
          <RipplePressable
            onPress={() => router.navigate('/focus' as never)}
            style={styles.cardActionLink}>
            <Text style={[styles.cardActionText, { color: colors.muted }]}>Открыть</Text>
            <AppIcon name="arrowRight" size="xs" color={colors.muted} />
          </RipplePressable>
        ) : null}
      </View>

      <View style={styles.focusHeroRow}>
        <View style={styles.focusRingBox}>
          <Svg
            width={focusRingSize}
            height={focusRingSize}
            style={styles.svgRotateUp}>
            <Circle
              cx={focusRingSize / 2}
              cy={focusRingSize / 2}
              r={focusRingRadius}
              stroke={colors.surfaceSubtle}
              strokeWidth={focusRingStroke}
              fill="none"
            />
            <Circle
              cx={focusRingSize / 2}
              cy={focusRingSize / 2}
              r={focusRingRadius}
              stroke={focusRingColor}
              strokeWidth={focusRingStroke}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${focusRingCirc} ${focusRingCirc}`}
              strokeDashoffset={focusDashOffset}
            />
          </Svg>
          <View style={styles.focusRingCenter} pointerEvents="none">
            <Text style={[styles.focusRingPct, { color: colors.text }]}>
              {focus.analytics.disciplineScore}
            </Text>
          </View>
        </View>

        <View style={styles.focusClockCol}>
          <Text style={[styles.focusClockText, { color: colors.text }]}>
            {formatClock(focus.secondsLeft)}
          </Text>
          <Text style={[styles.focusSubMeta, { color: colors.muted }]} numberOfLines={1}>
            {focus.linkedTarget
              ? focus.linkedTarget.title
              : `${focus.analytics.stateMeta.emoji} ${focus.analytics.stateMeta.label}`}
          </Text>
        </View>

        <RipplePressable
          accessibilityLabel={focus.isRunning ? 'Пауза' : 'Старт'}
          onPress={focus.toggle}
          style={StyleSheet.flatten([
            styles.focusPlayCircle,
            { backgroundColor: colors.accent },
          ])}>
          <AppIcon
            name={focus.isRunning ? 'pause' : 'play'}
            size="sm"
            color={colors.accentText}
          />
        </RipplePressable>
      </View>

      <View style={[styles.focusGoalBox, { backgroundColor: colors.surfaceSubtle }]}>
        <View style={styles.focusGoalTop}>
          <Text style={[styles.focusGoalLabel, { color: colors.muted }]}>
            Цель дня: {focus.stats.todayMinutes}/{focus.analytics.dailyGoalMinutes}м
          </Text>
          <Text style={[styles.focusGoalLabel, { color: colors.text }]}>
            {focus.analytics.todayGoalProgress}%
          </Text>
        </View>
        <View style={[styles.thinTrack, { backgroundColor: colors.line }]}>
          <View
            style={[
              styles.thinFill,
              {
                width: `${focus.analytics.todayGoalProgress}%`,
                backgroundColor:
                  focus.analytics.todayGoalProgress >= 100 ? colors.success : colors.accent,
              },
            ]}
          />
        </View>
      </View>
    </View>
  );

  const languageCard =
    canLanguage && data.languageSummary ? (
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.line },
        ]}>
        <View style={styles.cardHeader}>
          <RipplePressable
            onPress={() => router.navigate('/language' as never)}
            style={styles.cardHeaderLeft}>
            <AppIcon name="study" size="sm" color={colors.text} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Словарь</Text>
            <View style={[styles.langCodeBadge, { backgroundColor: colors.surfaceSubtle }]}>
              <Text style={[styles.langCodeText, { color: colors.muted }]}>
                {data.languageSummary.languageCode.toUpperCase()}
              </Text>
            </View>
          </RipplePressable>

          <RipplePressable
            onPress={() => router.navigate('/language' as never)}
            style={styles.cardActionLink}>
            <Text style={[styles.cardActionText, { color: colors.muted }]}>Тренировка</Text>
            <AppIcon name="arrowRight" size="xs" color={colors.muted} />
          </RipplePressable>
        </View>

        <View style={styles.langStatsRow}>
          <View style={[styles.langStatBox, { backgroundColor: colors.surfaceSubtle }]}>
            <Text
              style={[
                styles.langStatVal,
                {
                  color:
                    data.languageSummary.dueReviewCount > 0 ? colors.warning : colors.success,
                },
              ]}>
              {data.languageSummary.dueReviewCount}
            </Text>
            <Text style={[styles.langStatLbl, { color: colors.muted }]}>на повторение</Text>
          </View>

          <View style={[styles.langStatBox, { backgroundColor: colors.surfaceSubtle }]}>
            <Text style={[styles.langStatVal, { color: colors.text }]}>
              {data.languageSummary.knownCount}/{data.languageSummary.totalWords}
            </Text>
            <Text style={[styles.langStatLbl, { color: colors.muted }]}>выучено слов</Text>
          </View>
        </View>
      </View>
    ) : null;

  const recentNotesCard = canNotes ? (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.line },
      ]}>
      <View style={styles.cardHeader}>
        <RipplePressable
          onPress={() => router.navigate('/notes' as never)}
          style={styles.cardHeaderLeft}>
          <AppIcon name="notes" size="sm" color={colors.text} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>Заметки</Text>
        </RipplePressable>

        <RipplePressable
          onPress={() => router.navigate('/notes' as never)}
          style={styles.cardActionLink}>
          <Text style={[styles.cardActionText, { color: colors.muted }]}>Все</Text>
          <AppIcon name="arrowRight" size="xs" color={colors.muted} />
        </RipplePressable>
      </View>

      {data.recentNotes.length === 0 ? (
        <RipplePressable
          onPress={handleQuickCreateNote}
          style={StyleSheet.flatten([
            styles.emptyInlineBtn,
            { backgroundColor: colors.surfaceSubtle },
          ])}>
          <AppIcon name="plus" size="xs" color={colors.muted} />
          <Text style={[styles.emptyInlineText, { color: colors.muted }]}>
            Создать первую заметку
          </Text>
        </RipplePressable>
      ) : (
        <View style={styles.notesList}>
          {data.recentNotes.map((note, idx) => (
            <RipplePressable
              key={note.id}
              onPress={() => router.navigate('/notes' as never)}
              style={StyleSheet.flatten([
                styles.noteRow,
                idx > 0
                  ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }
                  : null,
              ])}>
              <AppIcon
                name={resolveNotePageIcon(note.icon)}
                size={15}
                color={colors.muted}
              />
              <Text style={[styles.noteTitle, { color: colors.text }]} numberOfLines={1}>
                {note.title.trim() || 'Без названия'}
              </Text>
              {note.isFavorite ? (
                <AppIcon name="star" size={11} color={colors.warning} fill={colors.warning} />
              ) : null}
              <Text style={[styles.noteTime, { color: colors.muted }]}>
                {formatRelativeDate(note.updatedAt)}
              </Text>
            </RipplePressable>
          ))}
        </View>
      )}
    </View>
  ) : null;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.container,
        isDesktop ? styles.containerDesktop : styles.containerMobile,
      ]}
      keyboardShouldPersistTaps="handled">
      <View style={styles.inner}>
        {/* Clean Hero Header + Day Pulse Ring */}
        <View style={styles.heroRow}>
          <View style={styles.heroTexts}>
            <Text style={[styles.dateLabel, { color: colors.muted }]}>{dateLabel}</Text>
            <Text style={[isDesktop ? styles.title : styles.titleMobile, { color: colors.text }]}>
              {user ? `${greeting}, ${user.displayName}` : greeting}
            </Text>
          </View>

          <View
            style={[
              styles.pulseBadge,
              { backgroundColor: colors.surface, borderColor: colors.line },
            ]}>
            <View style={styles.pulseRingWrap}>
              <Svg width={pulseSize} height={pulseSize} style={styles.svgRotateUp}>
                <Circle
                  cx={pulseSize / 2}
                  cy={pulseSize / 2}
                  r={pulseRadius}
                  stroke={colors.surfaceSubtle}
                  strokeWidth={pulseStroke}
                  fill="none"
                />
                <Circle
                  cx={pulseSize / 2}
                  cy={pulseSize / 2}
                  r={pulseRadius}
                  stroke={dayPulsePct >= 80 ? colors.success : colors.accent}
                  strokeWidth={pulseStroke}
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray={`${pulseCirc} ${pulseCirc}`}
                  strokeDashoffset={pulseOffset}
                />
              </Svg>
              <View style={styles.pulseCenter} pointerEvents="none">
                <Text style={[styles.pulsePctText, { color: colors.text }]}>{dayPulsePct}%</Text>
              </View>
            </View>
            {isDesktop ? (
              <View style={styles.pulseMeta}>
                <Text style={[styles.pulseTitle, { color: colors.text }]}>Ритм дня</Text>
                <Text style={[styles.pulseSub, { color: colors.muted }]}>
                  Задачи · Привычки · Фокус
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Mobile Compact Quick Navigation Strip (replaces giant 8-card wall!) */}
        {!isDesktop && quickNavModules.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickNavRow}>
            {quickNavModules.map((item) => (
              <RipplePressable
                key={item.key}
                onPress={() => {
                  if (item.route) router.navigate(item.route);
                }}
                style={StyleSheet.flatten([
                  styles.quickNavPill,
                  { backgroundColor: colors.surface, borderColor: colors.line },
                ])}>
                <AppIcon name={item.icon} size={13} color={colors.muted} />
                <Text style={[styles.quickNavText, { color: colors.text }]}>
                  {item.shortTitle}
                </Text>
              </RipplePressable>
            ))}
          </ScrollView>
        ) : null}

        {/* Quick Capture Bar */}
        {canTodos || canNotes ? (
          <View
            style={[
              styles.captureBar,
              { backgroundColor: colors.surface, borderColor: colors.line },
            ]}>
            {canTodos ? (
              <View style={styles.captureInputWrap}>
                <AppIcon name="plus" size="xs" color={colors.muted} />
                <TextInput
                  value={quickTask}
                  onChangeText={setQuickTask}
                  onSubmitEditing={handleQuickAddTask}
                  placeholder="Быстрая задача на сегодня…"
                  placeholderTextColor={colors.muted}
                  returnKeyType="done"
                  style={[styles.captureInput, { color: colors.text }]}
                />
                {quickTask.trim().length > 0 ? (
                  <RipplePressable
                    onPress={handleQuickAddTask}
                    style={StyleSheet.flatten([
                      styles.captureSubmitBtn,
                      { backgroundColor: colors.accent },
                    ])}>
                    <Text style={[styles.captureSubmitText, { color: colors.accentText }]}>
                      Добавить
                    </Text>
                  </RipplePressable>
                ) : null}
              </View>
            ) : null}

            {canNotes && quickTask.trim().length === 0 ? (
              <RipplePressable
                onPress={handleQuickCreateNote}
                style={StyleSheet.flatten([
                  styles.captureNoteBtn,
                  { backgroundColor: colors.surfaceSubtle },
                ])}>
                <AppIcon name="filePlus" size="xs" color={colors.text} />
                {isDesktop ? (
                  <Text style={[styles.captureNoteText, { color: colors.text }]}>Заметка</Text>
                ) : null}
              </RipplePressable>
            ) : null}
          </View>
        ) : null}

        {/* Live Bento Dashboard */}
        {isDesktop ? (
          <View style={styles.bentoDesktop}>
            <View style={styles.bentoLeftCol}>
              {todayPlanCard}
              {habitsCard}
            </View>
            <View style={styles.bentoRightCol}>
              {focusCard}
              {languageCard}
              {recentNotesCard}
            </View>
          </View>
        ) : (
          <View style={styles.bentoMobile}>
            {todayPlanCard}
            {habitsCard}
            {focusCard}
            {languageCard}
            {recentNotesCard}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    paddingBottom: 36,
  },
  containerDesktop: {
    paddingHorizontal: 32,
    paddingTop: 26,
  },
  containerMobile: {
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  inner: {
    width: '100%',
    maxWidth: 1060,
    alignSelf: 'center',
    gap: 16,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroTexts: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  dateLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  titleMobile: {
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  pulseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 6,
    paddingRight: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pulseRingWrap: {
    width: 46,
    height: 46,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  svgRotateUp: {
    transform: [{ rotate: '-90deg' }],
  },
  pulseCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulsePctText: {
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  pulseMeta: {
    gap: 1,
  },
  pulseTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  pulseSub: {
    fontSize: 11,
  },
  quickNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 1,
  },
  quickNavPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  quickNavText: {
    fontSize: 12,
    fontWeight: '600',
  },
  captureBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 14,
    paddingRight: 7,
    height: 46,
  },
  captureInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    minWidth: 0,
  },
  captureInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
    minWidth: 0,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  captureSubmitBtn: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureSubmitText: {
    fontSize: 12,
    fontWeight: '700',
  },
  captureNoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    height: 32,
    borderRadius: 9,
  },
  captureNoteText: {
    fontSize: 12,
    fontWeight: '600',
  },
  bentoDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  bentoLeftCol: {
    flex: 1.35,
    minWidth: 0,
    gap: 16,
  },
  bentoRightCol: {
    flex: 1,
    minWidth: 0,
    gap: 16,
  },
  bentoMobile: {
    gap: 12,
  },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  cardCounter: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  cardActionLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  cardActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  overduePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  overduePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptyBox: {
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    gap: 5,
  },
  emptyBoxTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  emptyBoxSub: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
  planList: {
    gap: 0,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
  },
  planRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  todoCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.8,
    flexShrink: 0,
  },
  kanbanTagIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  planRowTexts: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  planRowTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  planRowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  planRowSub: {
    fontSize: 11,
    flexShrink: 1,
  },
  planOverdueDate: {
    fontSize: 11,
    fontWeight: '600',
  },
  focusLaunchBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  thinTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  thinFill: {
    height: '100%',
    borderRadius: 2,
  },
  emptyInlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 10,
  },
  emptyInlineText: {
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
  habitCheck: {
    width: 17,
    height: 17,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  habitTitle: {
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  streakWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  streakNum: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  focusHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  focusRingBox: {
    width: 54,
    height: 54,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusRingCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusRingPct: {
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  focusClockCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  focusClockText: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },
  focusSubMeta: {
    fontSize: 12,
    fontWeight: '500',
  },
  focusPlayCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusGoalBox: {
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  focusGoalTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  focusGoalLabel: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  langCodeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  langCodeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  langStatsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  langStatBox: {
    flex: 1,
    borderRadius: 10,
    padding: 11,
    gap: 2,
  },
  langStatVal: {
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  langStatLbl: {
    fontSize: 11,
    fontWeight: '500',
  },
  notesList: {
    gap: 0,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 9,
  },
  noteTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  noteTime: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
});
