import { type ComponentRef, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import {
  AnchoredPopover,
  type AnchorRect,
  measureAnchor,
} from '@/components/anchored-popover';
import { AppIcon } from '@/components/app-icon';
import { RipplePressable } from '@/components/ripple-pressable';
import {
  DailyFocusBarChart,
  DisciplineDonutCard,
  FocusHeatmapCard,
  ProductivityBreakdownCard,
} from '@/features/focus/components/focus-charts';
import { TaskPickerModal } from '@/features/focus/components/focus-widget';
import { useFocus } from '@/features/focus/focus-context';
import {
  FOCUS_DURATION_PRESETS,
  FOCUS_GOAL_PRESETS,
  FOCUS_MODE_META,
  type FocusMode,
  type FocusSessionRecord,
  formatClock,
  formatDurationCompact,
} from '@/features/focus/types';
import { type ThemeColors, useThemeColors, useViewport } from '@/theme/colors';

const MODES: readonly FocusMode[] = ['focus', 'short_break', 'long_break'];
const SHORT_BREAK_PRESETS = [3, 5, 10] as const;
const LONG_BREAK_PRESETS = [10, 15, 20, 30] as const;

type FocusSectionTab = 'timer' | 'stats' | 'history';
type HistoryFilter = 'all' | 'completed' | 'abandoned';

function resolveStateColor(
  tone: 'success' | 'accent' | 'neutral' | 'warning' | 'danger',
  colors: ThemeColors,
): string {
  if (tone === 'success') return colors.success;
  if (tone === 'warning') return colors.warning;
  if (tone === 'danger') return colors.danger;
  if (tone === 'accent') return colors.text;
  return colors.muted;
}

function resolveStateBg(
  tone: 'success' | 'accent' | 'neutral' | 'warning' | 'danger',
  colors: ThemeColors,
): string {
  if (tone === 'success') return colors.successBg;
  if (tone === 'warning') return colors.warningBg;
  if (tone === 'danger') return colors.dangerBg;
  return colors.surfaceSubtle;
}

function formatSessionTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso.slice(0, 16);
  }
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dd}.${mm} · ${hh}:${min}`;
}

export function FocusWorkspace() {
  const colors = useThemeColors();
  const { isDesktop } = useViewport();
  const focus = useFocus();
  const { analytics } = focus;

  const [activeTab, setActiveTab] = useState<FocusSectionTab>('timer');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsAnchor, setSettingsAnchor] = useState<AnchorRect | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const settingsBtnRef = useRef<ComponentRef<typeof View>>(null);

  const stateColor = resolveStateColor(analytics.stateMeta.tone, colors);
  const stateBg = resolveStateBg(analytics.stateMeta.tone, colors);

  // Circular Timer Ring math
  const ringSize = isDesktop ? 228 : 194;
  const ringStroke = 9;
  const ringRadius = (ringSize - ringStroke) / 2;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const progressFraction =
    focus.totalSeconds > 0
      ? Math.max(0, Math.min(1, (focus.totalSeconds - focus.secondsLeft) / focus.totalSeconds))
      : 0;
  const dashOffset = ringCircumference * (1 - progressFraction);

  const ringColor =
    focus.mode !== 'focus'
      ? colors.success
      : analytics.state === 'broken'
        ? colors.danger
        : analytics.state === 'drifting'
          ? colors.warning
          : analytics.state === 'flow'
            ? colors.success
            : colors.accent;

  // Discipline mini gauge math
  const gaugeSize = 78;
  const gaugeStroke = 7;
  const gaugeRadius = (gaugeSize - gaugeStroke) / 2;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const gaugeDashOffset = gaugeCircumference * (1 - analytics.disciplineScore / 100);

  const filteredHistory = analytics.recentSessions.filter((s) => {
    if (historyFilter === 'completed') return s.completed;
    if (historyFilter === 'abandoned') return !s.completed;
    return true;
  });

  const timerHeroCard = (
    <View
      style={[
        styles.heroCard,
        isDesktop ? styles.heroCardDesktop : null,
        { backgroundColor: colors.surface, borderColor: colors.line },
      ]}>
      {/* Mode selector + settings gear */}
      <View style={styles.heroTopRow}>
        <View style={[styles.modeStrip, { backgroundColor: colors.surfaceSubtle }]}>
          {MODES.map((m) => {
            const active = focus.mode === m;
            return (
              <RipplePressable
                key={m}
                onPress={() => focus.setMode(m)}
                style={StyleSheet.flatten([
                  styles.modeBtn,
                  active ? { backgroundColor: colors.surface } : null,
                ])}>
                <Text
                  style={[
                    styles.modeBtnText,
                    { color: active ? colors.text : colors.muted },
                  ]}>
                  {FOCUS_MODE_META[m].shortLabel}
                </Text>
              </RipplePressable>
            );
          })}
        </View>

        <View ref={settingsBtnRef} collapsable={false}>
          <RipplePressable
            accessibilityLabel="Настройки таймера"
            onPress={() => {
              if (settingsOpen) {
                setSettingsOpen(false);
                return;
              }
              measureAnchor(settingsBtnRef.current, (rect) => {
                setSettingsAnchor(rect);
                setSettingsOpen(true);
              });
            }}
            style={StyleSheet.flatten([
              styles.settingsBtn,
              {
                backgroundColor: settingsOpen ? colors.surfaceActive : colors.surfaceSubtle,
                borderColor: settingsOpen ? colors.text : 'transparent',
              },
            ])}>
            <AppIcon name="admin" size="sm" color={settingsOpen ? colors.text : colors.muted} />
          </RipplePressable>
        </View>
      </View>

      {/* SVG Circular Timer */}
      <View style={styles.ringSection}>
        <View style={[styles.ringContainer, { width: ringSize, height: ringSize }]}>
          <Svg
            width={ringSize}
            height={ringSize}
            style={styles.svgRotateUp}>
            <Circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={ringRadius}
              stroke={colors.surfaceSubtle}
              strokeWidth={ringStroke}
              fill="none"
            />
            <Circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={ringRadius}
              stroke={ringColor}
              strokeWidth={ringStroke}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${ringCircumference} ${ringCircumference}`}
              strokeDashoffset={dashOffset}
            />
          </Svg>

          <View style={styles.ringCenter} pointerEvents="none">
            <View style={[styles.stateMiniPill, { backgroundColor: stateBg }]}>
              <Text style={[styles.stateMiniText, { color: stateColor }]}>
                {analytics.stateMeta.emoji} {analytics.stateMeta.shortLabel}
              </Text>
            </View>
            <Text style={[styles.heroClock, { color: colors.text }]}>
              {formatClock(focus.secondsLeft)}
            </Text>
            <View style={styles.cycleDotsRow}>
              {[0, 1, 2, 3].map((dotIdx) => (
                <View
                  key={dotIdx}
                  style={[
                    styles.cycleDot,
                    {
                      backgroundColor:
                        dotIdx < focus.completedInCycle ? ringColor : colors.line,
                    },
                  ]}
                />
              ))}
            </View>
          </View>
        </View>
      </View>

      {/* Linked Task */}
      <View style={styles.linkedWrap}>
        {focus.linkedTarget ? (
          <View
            style={[
              styles.linkedPill,
              { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
            ]}>
            <RipplePressable onPress={() => setPickerOpen(true)} style={styles.linkedMain}>
              <AppIcon
                name={focus.linkedTarget.type === 'todo' ? 'todos' : 'kanban'}
                size="xs"
                color={colors.muted}
              />
              <Text style={[styles.linkedTitle, { color: colors.text }]} numberOfLines={1}>
                {focus.linkedTarget.title}
              </Text>
            </RipplePressable>
            <RipplePressable
              accessibilityLabel="Отвязать задачу"
              onPress={() => focus.linkTarget(null)}
              style={styles.unlinkBtn}>
              <AppIcon name="close" size="xs" color={colors.muted} />
            </RipplePressable>
          </View>
        ) : (
          <RipplePressable
            onPress={() => setPickerOpen(true)}
            style={StyleSheet.flatten([
              styles.linkAddBtn,
              { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
            ])}>
            <AppIcon name="link" size="xs" color={colors.muted} />
            <Text style={[styles.linkAddText, { color: colors.muted }]}>
              Привязать задачу или карточку Канбана
            </Text>
          </RipplePressable>
        )}
      </View>

      {/* Primary Controls */}
      <View style={styles.controlsRow}>
        <RipplePressable
          accessibilityLabel="Сбросить таймер"
          onPress={focus.reset}
          style={StyleSheet.flatten([
            styles.ctrlCircleBtn,
            { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
          ])}>
          <AppIcon name="reset" size="md" color={colors.text} />
        </RipplePressable>

        <RipplePressable
          accessibilityLabel={focus.isRunning ? 'Пауза' : 'Начать фокус'}
          onPress={focus.toggle}
          style={StyleSheet.flatten([
            styles.ctrlPlayBtn,
            { backgroundColor: colors.accent },
          ])}>
          <AppIcon
            name={focus.isRunning ? 'pause' : 'play'}
            size="md"
            color={colors.accentText}
          />
          <Text style={[styles.ctrlPlayText, { color: colors.accentText }]}>
            {focus.isRunning ? 'Пауза' : focus.sessionStarted ? 'Продолжить' : 'Старт'}
          </Text>
        </RipplePressable>

        <RipplePressable
          accessibilityLabel="Пропустить интервал"
          onPress={focus.skip}
          style={StyleSheet.flatten([
            styles.ctrlCircleBtn,
            { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
          ])}>
          <AppIcon name="skip" size="md" color={colors.text} />
        </RipplePressable>
      </View>

      {/* Duration Presets */}
      {focus.mode === 'focus' ? (
        <View style={styles.presetsRow}>
          {FOCUS_DURATION_PRESETS.map((mins) => {
            const active = focus.focusMinutes === mins;
            return (
              <RipplePressable
                key={mins}
                onPress={() => focus.setFocusMinutes(mins)}
                style={StyleSheet.flatten([
                  styles.presetPill,
                  {
                    backgroundColor: active ? colors.surfaceActive : colors.surfaceSubtle,
                    borderColor: active ? colors.text : colors.line,
                  },
                ])}>
                <Text
                  style={[
                    styles.presetPillText,
                    { color: active ? colors.text : colors.muted },
                  ]}>
                  {mins} мин
                </Text>
              </RipplePressable>
            );
          })}
        </View>
      ) : null}

      {focus.bannerMessage ? (
        <View
          style={[
            styles.bannerBox,
            {
              backgroundColor:
                focus.bannerTone === 'danger'
                  ? colors.dangerBg
                  : focus.bannerTone === 'success'
                    ? colors.successBg
                    : colors.surfaceSubtle,
            },
          ]}>
          <Text
            style={[
              styles.bannerText,
              {
                color:
                  focus.bannerTone === 'danger'
                    ? colors.danger
                    : focus.bannerTone === 'success'
                      ? colors.success
                      : colors.text,
              },
            ]}>
            {focus.bannerMessage}
          </Text>
        </View>
      ) : null}
    </View>
  );

  const disciplineCard = (
    <View
      style={[
        styles.heroCard,
        isDesktop ? styles.heroCardDesktop : null,
        isDesktop ? styles.disciplineCardStretch : null,
        { backgroundColor: colors.surface, borderColor: colors.line },
      ]}>
      {/* Top Score Gauge + State */}
      <View style={styles.disciplineTop}>
        <View style={[styles.gaugeBox, { width: gaugeSize, height: gaugeSize }]}>
          <Svg
            width={gaugeSize}
            height={gaugeSize}
            style={styles.svgRotateUp}>
            <Circle
              cx={gaugeSize / 2}
              cy={gaugeSize / 2}
              r={gaugeRadius}
              stroke={colors.surfaceSubtle}
              strokeWidth={gaugeStroke}
              fill="none"
            />
            <Circle
              cx={gaugeSize / 2}
              cy={gaugeSize / 2}
              r={gaugeRadius}
              stroke={stateColor}
              strokeWidth={gaugeStroke}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${gaugeCircumference} ${gaugeCircumference}`}
              strokeDashoffset={gaugeDashOffset}
            />
          </Svg>
          <View style={styles.gaugeCenter} pointerEvents="none">
            <Text style={[styles.gaugeValue, { color: colors.text }]}>
              {analytics.disciplineScore}
            </Text>
            <Text style={[styles.gaugeCaption, { color: colors.muted }]}>индекс</Text>
          </View>
        </View>

        <View style={styles.disciplineInfo}>
          <View style={styles.disciplineBadgeRow}>
            <View style={[styles.stateBadge, { backgroundColor: stateBg }]}>
              <Text style={[styles.stateBadgeText, { color: stateColor }]}>
                {analytics.stateMeta.emoji} {analytics.stateMeta.label}
              </Text>
            </View>
            <View
              style={[
                styles.multiplierPill,
                {
                  backgroundColor:
                    analytics.xpMultiplier > 1
                      ? colors.successBg
                      : analytics.xpMultiplier < 1
                        ? colors.dangerBg
                        : colors.surfaceSubtle,
                },
              ]}>
              <Text
                style={[
                  styles.multiplierText,
                  {
                    color:
                      analytics.xpMultiplier > 1
                        ? colors.success
                        : analytics.xpMultiplier < 1
                          ? colors.danger
                          : colors.muted,
                  },
                ]}>
                ×{analytics.xpMultiplier} XP
              </Text>
            </View>
          </View>

          <Text style={[styles.stateDescription, { color: colors.muted }]}>
            {analytics.stateMeta.description}
          </Text>
        </View>
      </View>

      {/* Warning / Recovery Callout if drifting, broken, or idle decay */}
      {analytics.recoverySessionsNeeded > 0 || analytics.idleDecayDays > 0 ? (
        <View
          style={[
            styles.calloutBox,
            {
              backgroundColor:
                analytics.state === 'broken' ? colors.dangerBg : colors.warningBg,
              borderColor:
                analytics.state === 'broken' ? colors.danger : colors.warning,
            },
          ]}>
          <Text
            style={[
              styles.calloutTitle,
              {
                color: analytics.state === 'broken' ? colors.danger : colors.warning,
              },
            ]}>
            {analytics.state === 'broken'
              ? 'Сбой ритма из-за частых срывов'
              : analytics.idleDecayDays > 0
                ? 'Давно не было полных сессий'
                : 'Дисциплина просела'}
          </Text>
          <Text style={[styles.calloutText, { color: colors.text }]}>
            {analytics.recoverySessionsNeeded > 0
              ? `Доведи до конца ${analytics.recoverySessionsNeeded} ${analytics.recoverySessionsNeeded === 1 ? 'сессию' : analytics.recoverySessionsNeeded <= 4 ? 'сессии' : 'сессий'} подряд, чтобы вернуть нормальный ритм.`
              : 'Закрой сегодня хотя бы одну полную сессию, чтобы вернуть темп.'}
          </Text>
        </View>
      ) : null}

      {/* Key Metrics Row: Today Goal · Combo · Day Streak */}
      <View style={styles.kpiRow}>
        <View style={[styles.kpiTile, { backgroundColor: colors.surfaceSubtle }]}>
          <Text style={[styles.kpiVal, { color: colors.text }]}>
            {analytics.todayCompletedMinutes}/{analytics.dailyGoalMinutes}м
          </Text>
          <Text style={[styles.kpiLbl, { color: colors.muted }]}>Цель дня</Text>
          <View style={[styles.kpiBarTrack, { backgroundColor: colors.line }]}>
            <View
              style={[
                styles.kpiBarFill,
                {
                  width: `${analytics.todayGoalProgress}%`,
                  backgroundColor:
                    analytics.todayGoalProgress >= 100 ? colors.success : colors.accent,
                },
              ]}
            />
          </View>
        </View>

        <View style={[styles.kpiTile, { backgroundColor: colors.surfaceSubtle }]}>
          <Text
            style={[
              styles.kpiVal,
              {
                color:
                  analytics.currentCombo >= 3
                    ? colors.success
                    : analytics.consecutiveAbandons > 0
                      ? colors.danger
                      : colors.text,
              },
            ]}>
            {analytics.currentCombo > 0 ? `🔥 ×${analytics.currentCombo}` : '×0'}
          </Text>
          <Text style={[styles.kpiLbl, { color: colors.muted }]}>
            Комбо (рек. {analytics.bestCombo})
          </Text>
        </View>

        <View style={[styles.kpiTile, { backgroundColor: colors.surfaceSubtle }]}>
          <Text style={[styles.kpiVal, { color: colors.text }]}>
            {analytics.currentDayStreak} дн.
          </Text>
          <Text style={[styles.kpiLbl, { color: colors.muted }]}>
            Серия (рек. {analytics.bestDayStreak})
          </Text>
        </View>
      </View>

      {/* Rank & XP Progress */}
      <View style={[styles.rankBox, { backgroundColor: colors.surfaceSubtle }]}>
        <View style={styles.rankTopRow}>
          <Text style={[styles.rankTitle, { color: colors.text }]}>
            Ур. {analytics.rank.level} · {analytics.rank.title}
          </Text>
          <Text style={[styles.rankXp, { color: colors.muted }]}>
            {analytics.totalXp}
            {analytics.nextRank ? ` / ${analytics.nextRank.minXp} XP` : ' XP (MAX)'}
          </Text>
        </View>
        <View style={[styles.rankTrack, { backgroundColor: colors.line }]}>
          <View
            style={[
              styles.rankFill,
              { width: `${analytics.rankProgress}%`, backgroundColor: stateColor },
            ]}
          />
        </View>
        {analytics.nextRank ? (
          <Text style={[styles.rankNextHint, { color: colors.muted }]}>
            До ранга «{analytics.nextRank.title}»: {Math.max(0, analytics.nextRank.minXp - analytics.totalXp)} XP
          </Text>
        ) : null}
      </View>

      {/* Badges Strip */}
      <View style={styles.badgesWrap}>
        {analytics.badges.map((badge) => (
          <View
            key={badge.id}
            style={[
              styles.badgePill,
              {
                backgroundColor: badge.unlocked ? colors.surfaceActive : colors.surfaceSubtle,
                borderColor: badge.unlocked ? colors.line : 'transparent',
                opacity: badge.unlocked ? 1 : 0.45,
              },
            ]}>
            <AppIcon
              name={badge.unlocked ? 'sparkles' : 'circle'}
              size={11}
              color={badge.unlocked ? colors.warning : colors.muted}
            />
            <Text style={[styles.badgeText, { color: colors.text }]}>{badge.title}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const statsSummaryStrip = (
    <View style={[styles.statsSummaryGrid, isDesktop ? styles.statsSummaryDesktop : null]}>
      <View
        style={[
          styles.statsSummaryTile,
          isDesktop ? styles.statsSummaryTileDesktop : styles.statsSummaryTileMobile,
          { backgroundColor: colors.surface, borderColor: colors.line },
        ]}>
        <Text style={[styles.statsSummaryLabel, { color: colors.muted }]}>Сегодня</Text>
        <Text style={[styles.statsSummaryVal, { color: colors.text }]}>
          {analytics.todayCompletedMinutes}/{analytics.dailyGoalMinutes}м
        </Text>
        <Text style={[styles.statsSummarySub, { color: colors.muted }]}>
          {analytics.todayGoalProgress}% дневной цели
        </Text>
      </View>

      <View
        style={[
          styles.statsSummaryTile,
          isDesktop ? styles.statsSummaryTileDesktop : styles.statsSummaryTileMobile,
          { backgroundColor: colors.surface, borderColor: colors.line },
        ]}>
        <Text style={[styles.statsSummaryLabel, { color: colors.muted }]}>Дисциплина</Text>
        <Text style={[styles.statsSummaryVal, { color: stateColor }]}>
          {analytics.stateMeta.emoji} {analytics.disciplineScore}/100
        </Text>
        <Text style={[styles.statsSummarySub, { color: colors.muted }]}>
          {analytics.stateMeta.label} · ×{analytics.xpMultiplier} XP
        </Text>
      </View>

      <View
        style={[
          styles.statsSummaryTile,
          isDesktop ? styles.statsSummaryTileDesktop : styles.statsSummaryTileMobile,
          { backgroundColor: colors.surface, borderColor: colors.line },
        ]}>
        <Text style={[styles.statsSummaryLabel, { color: colors.muted }]}>Комбо</Text>
        <Text
          style={[
            styles.statsSummaryVal,
            {
              color:
                analytics.currentCombo >= 3
                  ? colors.success
                  : analytics.consecutiveAbandons > 0
                    ? colors.danger
                    : colors.text,
            },
          ]}>
          {analytics.currentCombo > 0 ? `🔥 ×${analytics.currentCombo}` : '×0'}
        </Text>
        <Text style={[styles.statsSummarySub, { color: colors.muted }]}>
          Рекорд: ×{analytics.bestCombo}
        </Text>
      </View>

      <View
        style={[
          styles.statsSummaryTile,
          isDesktop ? styles.statsSummaryTileDesktop : styles.statsSummaryTileMobile,
          { backgroundColor: colors.surface, borderColor: colors.line },
        ]}>
        <Text style={[styles.statsSummaryLabel, { color: colors.muted }]}>Серия дней</Text>
        <Text style={[styles.statsSummaryVal, { color: colors.text }]}>
          {analytics.currentDayStreak} дн.
        </Text>
        <Text style={[styles.statsSummarySub, { color: colors.muted }]}>
          Рекорд: {analytics.bestDayStreak} дн.
        </Text>
      </View>
    </View>
  );

  const chartsBlock = (
    <View style={styles.chartsSection}>
      {statsSummaryStrip}

      <View style={[styles.chartsGrid, isDesktop ? styles.chartsGridDesktop : null]}>
        <View style={isDesktop ? styles.chartCol : undefined}>
          <DailyFocusBarChart analytics={analytics} colors={colors} />
        </View>
        <View style={isDesktop ? styles.chartCol : undefined}>
          <DisciplineDonutCard analytics={analytics} colors={colors} />
        </View>
      </View>

      <View style={[styles.chartsGrid, isDesktop ? styles.chartsGridDesktop : null]}>
        <View style={isDesktop ? styles.chartCol : undefined}>
          <ProductivityBreakdownCard analytics={analytics} colors={colors} />
        </View>
        <View style={isDesktop ? styles.chartCol : undefined}>
          <FocusHeatmapCard analytics={analytics} colors={colors} />
        </View>
      </View>
    </View>
  );

  const historyBlock = (
    <View style={[styles.historyCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <View style={styles.historyHeader}>
        <View>
          <Text style={[styles.cardTitle, { color: colors.text }]}>История сессий</Text>
          <Text style={[styles.cardSubtitle, { color: colors.muted }]}>
            Всего: {formatDurationCompact(analytics.totalCompletedMinutes)} ·{' '}
            {analytics.totalCompletedSessions} зав. / {analytics.totalAbandonedSessions} срыв.
          </Text>
        </View>

        <View style={[styles.historyFilters, { backgroundColor: colors.surfaceSubtle }]}>
          {(
            [
              { key: 'all', label: 'Все' },
              { key: 'completed', label: 'Заверш.' },
              { key: 'abandoned', label: 'Срывы' },
            ] as const
          ).map((f) => {
            const active = historyFilter === f.key;
            return (
              <RipplePressable
                key={f.key}
                onPress={() => setHistoryFilter(f.key)}
                style={StyleSheet.flatten([
                  styles.historyFilterBtn,
                  active ? { backgroundColor: colors.surface } : null,
                ])}>
                <Text
                  style={[
                    styles.historyFilterText,
                    { color: active ? colors.text : colors.muted },
                  ]}>
                  {f.label}
                </Text>
              </RipplePressable>
            );
          })}
        </View>
      </View>

      {filteredHistory.length === 0 ? (
        <Text style={[styles.emptyHistory, { color: colors.muted }]}>
          {historyFilter === 'abandoned'
            ? 'Срывов нет — так держать!'
            : 'Записей пока нет. Запусти первую фокус-сессию.'}
        </Text>
      ) : (
        <View style={styles.historyList}>
          {filteredHistory.map((session: FocusSessionRecord) => {
            const elapsedMin = Math.max(1, Math.round(session.elapsedSeconds / 60));
            const targetMin = Math.max(1, Math.round(session.durationSeconds / 60));
            return (
              <View
                key={session.id}
                style={[styles.historyRow, { borderTopColor: colors.line }]}>
                <View
                  style={[
                    styles.historyStatusIcon,
                    {
                      backgroundColor: session.completed ? colors.successBg : colors.dangerBg,
                    },
                  ]}>
                  <AppIcon
                    name={session.completed ? 'check' : 'close'}
                    size={12}
                    color={session.completed ? colors.success : colors.danger}
                  />
                </View>

                <View style={styles.historyBody}>
                  <Text style={[styles.historyTitle, { color: colors.text }]} numberOfLines={1}>
                    {session.linkedTitle.trim() || 'Свободный фокус'}
                  </Text>
                  <Text style={[styles.historyMeta, { color: colors.muted }]}>
                    {formatSessionTime(session.endedAt)} ·{' '}
                    {session.completed
                      ? `${elapsedMin} мин`
                      : `брошено на ${elapsedMin} из ${targetMin} мин`}
                  </Text>
                </View>

                <View
                  style={[
                    styles.historyBadge,
                    {
                      backgroundColor: session.completed ? colors.successBg : colors.dangerBg,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.historyBadgeText,
                      { color: session.completed ? colors.success : colors.danger },
                    ]}>
                    {session.completed ? 'Завершено' : 'Срыв'}
                  </Text>
                </View>

                <RipplePressable
                  accessibilityLabel="Удалить запись"
                  onPress={() => focus.removeSession(session.id)}
                  style={styles.deleteSessionBtn}>
                  <AppIcon name="trash" size={13} color={colors.muted} />
                </RipplePressable>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );

  const sectionTabs: readonly { key: FocusSectionTab; label: string; badge?: number }[] = [
    { key: 'timer', label: 'Таймер' },
    { key: 'stats', label: 'Статистика' },
    {
      key: 'history',
      label: 'История',
      badge: analytics.recentSessions.length > 0 ? analytics.recentSessions.length : undefined,
    },
  ];

  return (
    <View style={styles.screen}>
      {/* Mobile Pinned Segmented Tabs */}
      {!isDesktop ? (
        <View style={[styles.mobileTabsBar, { borderBottomColor: colors.line }]}>
          <View style={[styles.mobileTabsTrack, { backgroundColor: colors.surfaceSubtle }]}>
            {sectionTabs.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <RipplePressable
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  style={StyleSheet.flatten([
                    styles.mobileTabBtn,
                    active ? { backgroundColor: colors.surface } : null,
                  ])}>
                  <Text
                    style={[
                      styles.mobileTabText,
                      { color: active ? colors.text : colors.muted },
                    ]}>
                    {tab.label}
                  </Text>
                </RipplePressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          isDesktop ? styles.contentDesktop : styles.contentMobile,
        ]}>
        <View style={styles.inner}>
          {/* Desktop Header + Unified Section Tabs */}
          {isDesktop ? (
            <View style={styles.desktopHeader}>
              <View>
                <Text style={[styles.pageTitle, { color: colors.text }]}>Фокус и Дисциплина</Text>
                <Text style={[styles.pageSubtitle, { color: colors.muted }]}>
                  Помодоро-таймер, аналитика концентрации и прогресс без срывов
                </Text>
              </View>

              <View
                style={[
                  styles.desktopTabsTrack,
                  { backgroundColor: colors.surface, borderColor: colors.line },
                ]}>
                {sectionTabs.map((tab) => {
                  const active = activeTab === tab.key;
                  return (
                    <RipplePressable
                      key={tab.key}
                      onPress={() => setActiveTab(tab.key)}
                      style={StyleSheet.flatten([
                        styles.desktopTabBtn,
                        active ? { backgroundColor: colors.surfaceActive } : null,
                      ])}>
                      <Text
                        style={[
                          styles.desktopTabText,
                          { color: active ? colors.text : colors.muted },
                        ]}>
                        {tab.label}
                      </Text>
                      {tab.badge !== undefined ? (
                        <Text style={[styles.desktopTabCount, { color: colors.muted }]}>
                          {tab.badge}
                        </Text>
                      ) : null}
                    </RipplePressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {activeTab === 'timer' ? (
            isDesktop ? (
              <View style={styles.heroGridDesktop}>
                <View style={styles.heroCol}>{timerHeroCard}</View>
                <View style={styles.heroCol}>{disciplineCard}</View>
              </View>
            ) : (
              <View style={styles.mobileStack}>
                {timerHeroCard}
                {disciplineCard}
              </View>
            )
          ) : activeTab === 'stats' ? (
            chartsBlock
          ) : (
            <View style={isDesktop ? styles.historyDesktopWrap : undefined}>{historyBlock}</View>
          )}
        </View>
      </ScrollView>

      <AnchoredPopover
        visible={settingsOpen}
        anchor={settingsAnchor}
        width={304}
        estimatedHeight={276}
        align="right"
        colors={colors}
        onClose={() => setSettingsOpen(false)}>
        <View style={styles.settingsPopover}>
          <View style={styles.settingBlock}>
            <Text style={[styles.settingLabel, { color: colors.muted }]}>
              Дневная цель фокуса
            </Text>
            <View style={styles.chipRow}>
              {FOCUS_GOAL_PRESETS.map((mins) => {
                const active = focus.settings.dailyGoalMinutes === mins;
                return (
                  <RipplePressable
                    key={mins}
                    onPress={() => focus.updateSettings({ dailyGoalMinutes: mins })}
                    style={StyleSheet.flatten([
                      styles.settingChip,
                      {
                        backgroundColor: active ? colors.accent : colors.surfaceSubtle,
                        borderColor: active ? colors.accent : colors.line,
                      },
                    ])}>
                    <Text
                      style={[
                        styles.settingChipText,
                        { color: active ? colors.accentText : colors.text },
                      ]}>
                      {mins}м
                    </Text>
                  </RipplePressable>
                );
              })}
            </View>
          </View>

          <View style={styles.settingBlock}>
            <Text style={[styles.settingLabel, { color: colors.muted }]}>Короткий перерыв</Text>
            <View style={styles.chipRow}>
              {SHORT_BREAK_PRESETS.map((mins) => {
                const active = focus.settings.shortBreakMinutes === mins;
                return (
                  <RipplePressable
                    key={mins}
                    onPress={() => focus.updateSettings({ shortBreakMinutes: mins })}
                    style={StyleSheet.flatten([
                      styles.settingChip,
                      {
                        backgroundColor: active ? colors.accent : colors.surfaceSubtle,
                        borderColor: active ? colors.accent : colors.line,
                      },
                    ])}>
                    <Text
                      style={[
                        styles.settingChipText,
                        { color: active ? colors.accentText : colors.text },
                      ]}>
                      {mins}м
                    </Text>
                  </RipplePressable>
                );
              })}
            </View>
          </View>

          <View style={styles.settingBlock}>
            <Text style={[styles.settingLabel, { color: colors.muted }]}>Длинный отдых</Text>
            <View style={styles.chipRow}>
              {LONG_BREAK_PRESETS.map((mins) => {
                const active = focus.settings.longBreakMinutes === mins;
                return (
                  <RipplePressable
                    key={mins}
                    onPress={() => focus.updateSettings({ longBreakMinutes: mins })}
                    style={StyleSheet.flatten([
                      styles.settingChip,
                      {
                        backgroundColor: active ? colors.accent : colors.surfaceSubtle,
                        borderColor: active ? colors.accent : colors.line,
                      },
                    ])}>
                    <Text
                      style={[
                        styles.settingChipText,
                        { color: active ? colors.accentText : colors.text },
                      ]}>
                      {mins}м
                    </Text>
                  </RipplePressable>
                );
              })}
            </View>
          </View>

          <View style={[styles.toggleRow, { borderTopColor: colors.line, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <RipplePressable
              onPress={() =>
                focus.updateSettings({ soundEnabled: !focus.settings.soundEnabled })
              }
              style={StyleSheet.flatten([
                styles.togglePill,
                {
                  backgroundColor: focus.settings.soundEnabled
                    ? colors.surfaceActive
                    : colors.surfaceSubtle,
                  borderColor: focus.settings.soundEnabled ? colors.text : colors.line,
                },
              ])}>
              <AppIcon
                name={focus.settings.soundEnabled ? 'volume' : 'volumeOff'}
                size="xs"
                color={colors.text}
              />
              <Text style={[styles.togglePillText, { color: colors.text }]}>
                Звук {focus.settings.soundEnabled ? 'вкл' : 'выкл'}
              </Text>
            </RipplePressable>

            <RipplePressable
              onPress={() =>
                focus.updateSettings({ autoStartBreaks: !focus.settings.autoStartBreaks })
              }
              style={StyleSheet.flatten([
                styles.togglePill,
                {
                  backgroundColor: focus.settings.autoStartBreaks
                    ? colors.surfaceActive
                    : colors.surfaceSubtle,
                  borderColor: focus.settings.autoStartBreaks ? colors.text : colors.line,
                },
              ])}>
              <AppIcon name="play" size="xs" color={colors.text} />
              <Text style={[styles.togglePillText, { color: colors.text }]}>
                Авто-перерыв: {focus.settings.autoStartBreaks ? 'да' : 'нет'}
              </Text>
            </RipplePressable>
          </View>
        </View>
      </AnchoredPopover>

      <TaskPickerModal
        visible={pickerOpen}
        selectedId={focus.linkedTarget?.id ?? null}
        onSelect={focus.linkTarget}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  mobileTabsBar: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mobileTabsTrack: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 10,
    gap: 3,
  },
  mobileTabBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
  },
  mobileTabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 36,
  },
  contentDesktop: {
    paddingHorizontal: 28,
    paddingTop: 22,
  },
  contentMobile: {
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  inner: {
    width: '100%',
    maxWidth: 1120,
    alignSelf: 'center',
    gap: 16,
  },
  desktopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  },
  desktopTabsTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 3,
  },
  desktopTabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  desktopTabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  desktopTabCount: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  pageSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  heroGridDesktop: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'stretch',
  },
  mobileStack: {
    gap: 14,
  },
  heroCol: {
    flex: 1,
    minWidth: 0,
  },
  heroCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    gap: 14,
  },
  heroCardDesktop: {
    flex: 1,
  },
  disciplineCardStretch: {
    justifyContent: 'space-between',
  },
  statsSummaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statsSummaryDesktop: {
    flexWrap: 'nowrap',
    gap: 12,
  },
  statsSummaryTile: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 13,
    gap: 3,
  },
  statsSummaryTileDesktop: {
    flex: 1,
    minWidth: 0,
  },
  statsSummaryTileMobile: {
    width: '48%',
    flexGrow: 1,
  },
  statsSummaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statsSummaryVal: {
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  statsSummarySub: {
    fontSize: 11,
  },
  historyDesktopWrap: {
    width: '100%',
    maxWidth: 880,
    alignSelf: 'center',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  modeStrip: {
    flex: 1,
    flexDirection: 'row',
    padding: 3,
    borderRadius: 10,
    gap: 3,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 7,
    alignItems: 'center',
  },
  modeBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  settingsBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsPopover: {
    padding: 9,
    gap: 11,
  },
  settingBlock: {
    gap: 6,
  },
  settingLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  settingChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  settingChipText: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  toggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  togglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  togglePillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  ringSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  ringContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  svgRotateUp: {
    transform: [{ rotate: '-90deg' }],
  },
  ringCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  stateMiniPill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  stateMiniText: {
    fontSize: 11,
    fontWeight: '700',
  },
  heroClock: {
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: -1.2,
    fontVariant: ['tabular-nums'],
  },
  cycleDotsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  cycleDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  linkedWrap: {
    width: '100%',
  },
  linkedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 12,
    paddingRight: 6,
    height: 38,
    gap: 6,
  },
  linkedMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  linkedTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  unlinkBtn: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    height: 38,
    paddingHorizontal: 12,
  },
  linkAddText: {
    fontSize: 12,
    fontWeight: '600',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  ctrlCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctrlPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 28,
    height: 46,
    borderRadius: 23,
    minWidth: 148,
  },
  ctrlPlayText: {
    fontSize: 15,
    fontWeight: '700',
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  presetPill: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  presetPillText: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  bannerBox: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  bannerText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  disciplineTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  gaugeBox: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  gaugeCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeValue: {
    fontSize: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  gaugeCaption: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  disciplineInfo: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  disciplineBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  stateBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  stateBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  multiplierPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  multiplierText: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  stateDescription: {
    fontSize: 12,
    lineHeight: 17,
  },
  calloutBox: {
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 11,
    gap: 3,
  },
  calloutTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  calloutText: {
    fontSize: 12,
    lineHeight: 17,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
  },
  kpiTile: {
    flex: 1,
    borderRadius: 11,
    padding: 10,
    gap: 3,
  },
  kpiVal: {
    fontSize: 15,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  kpiLbl: {
    fontSize: 11,
  },
  kpiBarTrack: {
    height: 4,
    borderRadius: 2,
    marginTop: 4,
    overflow: 'hidden',
  },
  kpiBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  rankBox: {
    borderRadius: 11,
    padding: 12,
    gap: 6,
  },
  rankTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rankTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  rankXp: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  rankTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  rankFill: {
    height: '100%',
    borderRadius: 3,
  },
  rankNextHint: {
    fontSize: 11,
  },
  badgesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  chartsSection: {
    gap: 16,
  },
  chartsGrid: {
    gap: 16,
  },
  chartsGridDesktop: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  chartCol: {
    flex: 1,
    minWidth: 0,
  },
  historyCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  cardSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  historyFilters: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 9,
    gap: 2,
  },
  historyFilterBtn: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
  },
  historyFilterText: {
    fontSize: 11,
    fontWeight: '600',
  },
  emptyHistory: {
    fontSize: 13,
    paddingVertical: 12,
  },
  historyList: {
    gap: 2,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  historyStatusIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  historyTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  historyMeta: {
    fontSize: 11,
  },
  historyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  historyBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  deleteSessionBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
