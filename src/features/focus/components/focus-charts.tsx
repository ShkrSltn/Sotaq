import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { AppIcon } from '@/components/app-icon';
import { RipplePressable } from '@/components/ripple-pressable';
import {
  type FocusAnalytics,
  type FocusDailyBucket,
  formatDurationCompact,
} from '@/features/focus/types';
import { type ThemeColors, useViewport } from '@/theme/colors';

type RangeDays = 7 | 14 | 30;
const RANGE_OPTIONS: readonly RangeDays[] = [7, 14, 30];

export function DailyFocusBarChart({
  analytics,
  colors,
}: {
  analytics: FocusAnalytics;
  colors: ThemeColors;
}) {
  const { isDesktop } = useViewport();
  const [range, setRange] = useState<RangeDays>(7);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [chartWidth, setChartWidth] = useState(300);

  const buckets = analytics.dailyBuckets.slice(-range);
  const goal = analytics.dailyGoalMinutes;
  const maxCompleted = Math.max(goal, ...buckets.map((b) => b.completedMinutes), 30);
  const yMax = Math.ceil(maxCompleted / 25) * 25;

  const activeBucket: FocusDailyBucket | null =
    buckets.find((b) => b.dateKey === selectedDateKey) ?? buckets[buckets.length - 1] ?? null;

  const chartHeight = 148;
  const padTop = 14;
  const padBottom = 6;
  const plotHeight = chartHeight - padTop - padBottom;
  const goalY = padTop + plotHeight * (1 - Math.min(1, goal / yMax));

  const barCount = Math.max(1, buckets.length);
  const slotWidth = chartWidth / barCount;
  const barWidth = Math.max(4, Math.min(range === 7 ? 26 : range === 14 ? 14 : 7, slotWidth * 0.58));

  const totalRangeMinutes = buckets.reduce((acc, b) => acc + b.completedMinutes, 0);
  const totalRangeAbandoned = buckets.reduce((acc, b) => acc + b.abandonedSessions, 0);

  return (
    <View
      style={[
        styles.card,
        isDesktop ? styles.cardDesktop : null,
        { backgroundColor: colors.surface, borderColor: colors.line },
      ]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleCol}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Фокус по дням</Text>
          <Text style={[styles.cardSubtitle, { color: colors.muted }]}>
            {formatDurationCompact(totalRangeMinutes)} за {range} дн.
            {totalRangeAbandoned > 0 ? ` · ${totalRangeAbandoned} срыв.` : ''}
          </Text>
        </View>

        <View style={[styles.rangePills, { backgroundColor: colors.surfaceSubtle }]}>
          {RANGE_OPTIONS.map((days) => {
            const active = range === days;
            return (
              <RipplePressable
                key={days}
                onPress={() => {
                  setRange(days);
                  setSelectedDateKey(null);
                }}
                style={StyleSheet.flatten([
                  styles.rangePill,
                  active ? { backgroundColor: colors.surface } : null,
                ])}>
                <Text
                  style={[
                    styles.rangePillText,
                    { color: active ? colors.text : colors.muted },
                  ]}>
                  {days}д
                </Text>
              </RipplePressable>
            );
          })}
        </View>
      </View>

      {/* Selected Day Summary Strip */}
      {activeBucket ? (
        <View style={[styles.dayInspectStrip, { backgroundColor: colors.surfaceSubtle }]}>
          <Text style={[styles.dayInspectDate, { color: colors.text }]}>
            {activeBucket.label}, {activeBucket.shortDate}
          </Text>
          <View style={styles.dayInspectMeta}>
            <Text style={[styles.dayInspectVal, { color: colors.text }]}>
              {activeBucket.completedMinutes}м
            </Text>
            <Text style={[styles.dayInspectSub, { color: colors.success }]}>
              ✓ {activeBucket.completedSessions}
            </Text>
            {activeBucket.abandonedSessions > 0 ? (
              <Text style={[styles.dayInspectSub, { color: colors.danger }]}>
                ✕ {activeBucket.abandonedSessions}
              </Text>
            ) : null}
            <Text style={[styles.dayInspectSub, { color: colors.muted }]}>
              ({Math.min(999, Math.round((activeBucket.completedMinutes / goal) * 100))}% цели)
            </Text>
          </View>
        </View>
      ) : null}

      {/* SVG Plot */}
      <View
        style={styles.svgWrap}
        onLayout={(e) => {
          const w = Math.floor(e.nativeEvent.layout.width);
          if (w > 40 && Math.abs(w - chartWidth) > 2) {
            setChartWidth(w);
          }
        }}>
        <Svg width={chartWidth} height={chartHeight}>
          {/* Horizontal grid lines */}
          {[0.25, 0.5, 0.75, 1].map((fraction) => {
            const y = padTop + plotHeight * (1 - fraction);
            return (
              <Line
                key={fraction}
                x1={0}
                y1={y}
                x2={chartWidth}
                y2={y}
                stroke={colors.line}
                strokeWidth={1}
                strokeOpacity={0.55}
              />
            );
          })}

          {/* Baseline */}
          <Line
            x1={0}
            y1={padTop + plotHeight}
            x2={chartWidth}
            y2={padTop + plotHeight}
            stroke={colors.line}
            strokeWidth={1}
          />

          {/* Daily Goal Dashed Line */}
          <Line
            x1={0}
            y1={goalY}
            x2={chartWidth}
            y2={goalY}
            stroke={colors.success}
            strokeWidth={1.25}
            strokeDasharray="4,4"
            strokeOpacity={0.8}
          />

          {/* Bars */}
          {buckets.map((bucket, idx) => {
            const xCenter = idx * slotWidth + slotWidth / 2;
            const x = xCenter - barWidth / 2;
            const isSelected = activeBucket?.dateKey === bucket.dateKey;

            const h =
              bucket.completedMinutes > 0
                ? Math.max(4, (bucket.completedMinutes / yMax) * plotHeight)
                : 0;
            const y = padTop + plotHeight - h;

            const barFill = bucket.goalReached
              ? colors.success
              : bucket.completedMinutes > 0
                ? colors.accent
                : colors.surfaceSubtle;

            return (
              <Rect
                key={bucket.dateKey}
                x={x}
                y={h > 0 ? y : padTop + plotHeight - 3}
                width={barWidth}
                height={h > 0 ? h : 3}
                rx={Math.min(4, barWidth / 2)}
                fill={barFill}
                fillOpacity={isSelected ? 1 : h > 0 ? 0.82 : 0.45}
              />
            );
          })}

          {/* Abandoned red dots above bars */}
          {buckets.map((bucket, idx) => {
            if (bucket.abandonedSessions <= 0) {
              return null;
            }
            const xCenter = idx * slotWidth + slotWidth / 2;
            const h =
              bucket.completedMinutes > 0
                ? Math.max(4, (bucket.completedMinutes / yMax) * plotHeight)
                : 4;
            const dotY = Math.max(5, padTop + plotHeight - h - 7);
            return (
              <Circle
                key={`ab-${bucket.dateKey}`}
                cx={xCenter}
                cy={dotY}
                r={range === 30 ? 2.5 : 3.5}
                fill={colors.danger}
              />
            );
          })}
        </Svg>

        {/* Interactive touch overlay per bar */}
        <View style={styles.touchOverlay} pointerEvents="box-none">
          {buckets.map((bucket) => (
            <Pressable
              key={bucket.dateKey}
              accessibilityLabel={`${bucket.shortDate}: ${bucket.completedMinutes} мин`}
              onPress={() => setSelectedDateKey(bucket.dateKey)}
              style={styles.barTouchCol}
            />
          ))}
        </View>
      </View>

      {/* X-Axis Labels */}
      <View style={styles.xAxisRow}>
        {buckets.map((bucket, idx) => {
          const showLabel =
            range === 7 ||
            (range === 14 && (idx % 2 === 0 || idx === buckets.length - 1)) ||
            (range === 30 && (idx % 5 === 0 || idx === buckets.length - 1));
          const isSelected = activeBucket?.dateKey === bucket.dateKey;
          return (
            <View key={bucket.dateKey} style={styles.xAxisCell}>
              {showLabel ? (
                <Text
                  style={[
                    styles.xAxisLabel,
                    { color: isSelected ? colors.text : colors.muted },
                  ]}
                  numberOfLines={1}>
                  {range === 7 ? bucket.label : bucket.shortDate.slice(0, 2)}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>

      {/* Legend */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
          <Text style={[styles.legendText, { color: colors.muted }]}>
            Цель ({goal}м)
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
          <Text style={[styles.legendText, { color: colors.muted }]}>Завершено</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.danger }]} />
          <Text style={[styles.legendText, { color: colors.muted }]}>Срыв</Text>
        </View>
      </View>
    </View>
  );
}

export function DisciplineDonutCard({
  analytics,
  colors,
}: {
  analytics: FocusAnalytics;
  colors: ThemeColors;
}) {
  const { isDesktop } = useViewport();
  const [sparkWidth, setSparkWidth] = useState(160);

  const totalAttempts = analytics.totalCompletedSessions + analytics.totalAbandonedSessions;
  const size = isDesktop ? 114 : 96;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const completedRatio =
    totalAttempts > 0 ? analytics.totalCompletedSessions / totalAttempts : 1;
  const completedLen = circumference * completedRatio;
  const abandonedLen = totalAttempts > 0 ? circumference - completedLen : 0;

  // Sparkline coordinates
  const points = analytics.disciplineTrend;
  const sparkH = 104;
  const padY = 10;
  const plotH = sparkH - padY * 2;
  const coords = points.map((pt, idx) => {
    const x =
      points.length <= 1
        ? sparkWidth / 2
        : 8 + (idx / (points.length - 1)) * Math.max(10, sparkWidth - 16);
    const y = padY + plotH * (1 - pt.score / 100);
    return { x, y, ...pt };
  });

  const pathD = coords
    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(' ');

  const flowLineY = padY + plotH * (1 - 0.85);
  const driftLineY = padY + plotH * (1 - 0.45);

  const avgMinutes =
    analytics.totalCompletedSessions > 0
      ? Math.round(analytics.totalCompletedMinutes / analytics.totalCompletedSessions)
      : 0;

  const trendColor =
    analytics.stateMeta.tone === 'success'
      ? colors.success
      : analytics.stateMeta.tone === 'danger'
        ? colors.danger
        : analytics.stateMeta.tone === 'warning'
          ? colors.warning
          : colors.accent;

  return (
    <View
      style={[
        styles.card,
        isDesktop ? styles.cardDesktop : null,
        { backgroundColor: colors.surface, borderColor: colors.line },
      ]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleCol}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Завершено vs Брошено</Text>
          <Text style={[styles.cardSubtitle, { color: colors.muted }]}>
            Надёжность и кривая индекса дисциплины
          </Text>
        </View>
      </View>

      <View style={styles.donutSplitRow}>
        {/* Left: Donut Ring */}
        <View style={styles.donutCol}>
          <View style={[styles.donutBox, { width: size, height: size }]}>
            <Svg width={size} height={size} style={styles.svgRotateUp}>
              {/* Track */}
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={colors.surfaceSubtle}
                strokeWidth={strokeWidth}
                fill="none"
              />
              {/* Red abandoned arc */}
              {abandonedLen > 0 ? (
                <Circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={colors.danger}
                  strokeWidth={strokeWidth}
                  fill="none"
                  strokeDasharray={`${circumference} ${circumference}`}
                />
              ) : null}
              {/* Green completed arc */}
              {totalAttempts > 0 ? (
                <Circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={colors.success}
                  strokeWidth={strokeWidth}
                  strokeLinecap={abandonedLen === 0 ? 'round' : 'butt'}
                  fill="none"
                  strokeDasharray={`${completedLen} ${circumference}`}
                />
              ) : null}
            </Svg>
            <View style={styles.donutCenter} pointerEvents="none">
              <Text style={[styles.donutPct, { color: colors.text }]}>
                {totalAttempts > 0 ? `${analytics.completionRate}%` : '—'}
              </Text>
              <Text style={[styles.donutSub, { color: colors.muted }]}>до конца</Text>
            </View>
          </View>

          <View style={styles.donutLegend}>
            <View style={styles.donutLegendRow}>
              <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
              <Text style={[styles.donutLegendText, { color: colors.text }]}>
                {analytics.totalCompletedSessions} зав.
              </Text>
            </View>
            <View style={styles.donutLegendRow}>
              <View style={[styles.legendDot, { backgroundColor: colors.danger }]} />
              <Text style={[styles.donutLegendText, { color: colors.text }]}>
                {analytics.totalAbandonedSessions} срыв.
              </Text>
            </View>
          </View>
        </View>

        {/* Right: Discipline Trend Sparkline */}
        <View style={styles.sparkCol}>
          <View style={styles.sparkHeaderRow}>
            <Text style={[styles.sparkTitle, { color: colors.muted }]}>Тренд дисциплины</Text>
            <Text style={[styles.sparkScoreNow, { color: trendColor }]}>
              {analytics.disciplineScore}/100
            </Text>
          </View>

          <View
            style={[styles.sparkBox, { height: sparkH, backgroundColor: colors.surfaceSubtle }]}
            onLayout={(e) => {
              const w = Math.floor(e.nativeEvent.layout.width);
              if (w > 40 && Math.abs(w - sparkWidth) > 2) {
                setSparkWidth(w);
              }
            }}>
            <Svg width={sparkWidth} height={sparkH}>
              {/* 85 threshold (Flow) */}
              <Line
                x1={0}
                y1={flowLineY}
                x2={sparkWidth}
                y2={flowLineY}
                stroke={colors.success}
                strokeWidth={1}
                strokeDasharray="3,3"
                strokeOpacity={0.45}
              />
              {/* 45 threshold (Drifting) */}
              <Line
                x1={0}
                y1={driftLineY}
                x2={sparkWidth}
                y2={driftLineY}
                stroke={colors.warning}
                strokeWidth={1}
                strokeDasharray="3,3"
                strokeOpacity={0.45}
              />
              {coords.length >= 2 ? (
                <Path
                  d={pathD}
                  fill="none"
                  stroke={trendColor}
                  strokeWidth={2.2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null}
              {coords.map((pt) => (
                <Circle
                  key={`${pt.index}-${pt.dateKey}`}
                  cx={pt.x}
                  cy={pt.y}
                  r={3.2}
                  fill={pt.completed ? colors.success : colors.danger}
                />
              ))}
            </Svg>
          </View>

          <Text style={[styles.sparkHint, { color: colors.muted }]}>
            {analytics.consecutiveAbandons >= 2
              ? `Серия срывов (${analytics.consecutiveAbandons} подряд) — прогрессивный штраф −18`
              : analytics.currentCombo >= 3
                ? `Отличный темп: комбо ×${analytics.currentCombo} без срывов`
                : 'Зелёные точки — завершённые, красные — брошенные'}
          </Text>
        </View>
      </View>

      {/* Bottom Summary Strip (balances card height cleanly with DailyFocusBarChart) */}
      <View style={[styles.donutFooterStrip, { borderTopColor: colors.line }]}>
        <View style={[styles.miniStatCell, { backgroundColor: colors.surfaceSubtle }]}>
          <Text style={[styles.miniStatVal, { color: colors.text }]}>
            {formatDurationCompact(analytics.totalCompletedMinutes)}
          </Text>
          <Text style={[styles.miniStatLbl, { color: colors.muted }]}>Всего фокуса</Text>
        </View>
        <View style={[styles.miniStatCell, { backgroundColor: colors.surfaceSubtle }]}>
          <Text style={[styles.miniStatVal, { color: colors.text }]}>
            {avgMinutes > 0 ? `${avgMinutes}м` : '—'}
          </Text>
          <Text style={[styles.miniStatLbl, { color: colors.muted }]}>Средняя сессия</Text>
        </View>
        <View style={[styles.miniStatCell, { backgroundColor: colors.surfaceSubtle }]}>
          <Text style={[styles.miniStatVal, { color: colors.text }]}>
            ×{analytics.bestCombo}
          </Text>
          <Text style={[styles.miniStatLbl, { color: colors.muted }]}>Лучшее комбо</Text>
        </View>
      </View>
    </View>
  );
}

export function ProductivityBreakdownCard({
  analytics,
  colors,
}: {
  analytics: FocusAnalytics;
  colors: ThemeColors;
}) {
  const { isDesktop } = useViewport();
  const maxHourMins = Math.max(1, ...analytics.hourBuckets.map((h) => h.minutes));
  const peakHour = analytics.hourBuckets.reduce(
    (best, cur) => (cur.minutes > best.minutes ? cur : best),
    analytics.hourBuckets[0],
  );
  const maxTaskMins = Math.max(1, ...analytics.topTasks.map((t) => t.minutes));

  return (
    <View
      style={[
        styles.card,
        isDesktop ? styles.cardDesktop : null,
        { backgroundColor: colors.surface, borderColor: colors.line },
      ]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleCol}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Пики времени и задачи</Text>
          <Text style={[styles.cardSubtitle, { color: colors.muted }]}>
            {peakHour && peakHour.minutes > 0
              ? `Лучше всего идёт: ${peakHour.label.toLowerCase()} (${peakHour.range})`
              : 'Появится после первых завершённых сессий'}
          </Text>
        </View>
      </View>

      {/* Time of Day Bars */}
      <View style={styles.breakdownSection}>
        {analytics.hourBuckets.map((bucket) => {
          const pct = Math.round((bucket.minutes / maxHourMins) * 100);
          const isPeak = bucket.minutes > 0 && bucket.key === peakHour?.key;
          return (
            <View key={bucket.key} style={styles.hBarRow}>
              <View style={styles.hBarLabelCol}>
                <Text style={[styles.hBarLabel, { color: colors.text }]}>{bucket.label}</Text>
                <Text style={[styles.hBarRange, { color: colors.muted }]}>{bucket.range}</Text>
              </View>
              <View style={[styles.hBarTrack, { backgroundColor: colors.surfaceSubtle }]}>
                <View
                  style={[
                    styles.hBarFill,
                    {
                      width: `${bucket.minutes > 0 ? Math.max(6, pct) : 0}%`,
                      backgroundColor: isPeak ? colors.success : colors.accent,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.hBarVal, { color: isPeak ? colors.text : colors.muted }]}>
                {bucket.minutes > 0 ? formatDurationCompact(bucket.minutes) : '0м'}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Top Linked Tasks */}
      <View style={[styles.tasksDivider, { borderTopColor: colors.line }]}>
        <Text style={[styles.subSectionLabel, { color: colors.muted }]}>
          ТОП ЗАДАЧ ПО ФОКУСУ
        </Text>
        {analytics.topTasks.length === 0 ? (
          <Text style={[styles.emptyHint, { color: colors.muted }]}>
            Привязывай задачи или карточки Канбана к таймеру — здесь появится распределение времени.
          </Text>
        ) : (
          <View style={styles.breakdownSection}>
            {analytics.topTasks.map((task) => {
              const pct = Math.max(8, Math.round((task.minutes / maxTaskMins) * 100));
              return (
                <View key={task.key} style={styles.taskBarItem}>
                  <View style={styles.taskBarTop}>
                    <View style={styles.taskTitleWrap}>
                      <AppIcon
                        name={task.type === 'kanban_card' ? 'kanban' : 'todos'}
                        size={12}
                        color={colors.muted}
                      />
                      <Text
                        style={[styles.taskBarTitle, { color: colors.text }]}
                        numberOfLines={1}>
                        {task.title}
                      </Text>
                    </View>
                    <Text style={[styles.taskBarMeta, { color: colors.muted }]}>
                      {formatDurationCompact(task.minutes)} · {task.sessions}
                    </Text>
                  </View>
                  <View style={[styles.taskBarTrack, { backgroundColor: colors.surfaceSubtle }]}>
                    <View
                      style={[
                        styles.taskBarFill,
                        { width: `${pct}%`, backgroundColor: colors.accent },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

export function FocusHeatmapCard({
  analytics,
  colors,
}: {
  analytics: FocusAnalytics;
  colors: ThemeColors;
}) {
  const { isDesktop } = useViewport();
  const days = analytics.heatmapDays;
  const goal = analytics.dailyGoalMinutes;
  const activeDaysCount = days.filter((d) => d.completedSessions > 0).length;

  // Group strictly into 4 rows of 7 days (clean calendar-like 4×7 grid)
  const weeks: FocusDailyBucket[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  function resolveCellBg(day: FocusDailyBucket): string {
    if (day.completedMinutes <= 0) {
      return colors.surfaceSubtle;
    }
    const ratio = day.completedMinutes / goal;
    if (ratio >= 1) return colors.success;
    if (ratio >= 0.5) return `${colors.success}99`;
    return `${colors.success}44`;
  }

  return (
    <View
      style={[
        styles.card,
        isDesktop ? styles.cardDesktop : null,
        { backgroundColor: colors.surface, borderColor: colors.line },
      ]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleCol}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Ритм за 28 дней</Text>
          <Text style={[styles.cardSubtitle, { color: colors.muted }]}>
            Активных дней: {activeDaysCount} из 28 · Лучшая серия: {analytics.bestDayStreak} дн.
          </Text>
        </View>
      </View>

      <View style={styles.heatmapRows}>
        {weeks.map((week, wIdx) => (
          <View key={wIdx} style={styles.heatmapRow}>
            {week.map((day) => (
              <View
                key={day.dateKey}
                style={[
                  styles.heatmapCell,
                  {
                    backgroundColor: resolveCellBg(day),
                    borderColor: day.goalReached ? colors.success : colors.line,
                  },
                ]}>
                <Text
                  style={[
                    styles.heatmapDayNum,
                    {
                      color:
                        day.completedMinutes >= goal * 0.5 ? '#FFFFFF' : colors.muted,
                    },
                  ]}>
                  {day.shortDate.slice(0, 2)}
                </Text>
                {day.abandonedSessions > 0 ? (
                  <View style={[styles.heatmapAbandonDot, { backgroundColor: colors.danger }]} />
                ) : null}
              </View>
            ))}
          </View>
        ))}
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSquare, { backgroundColor: colors.surfaceSubtle }]} />
          <Text style={[styles.legendText, { color: colors.muted }]}>0м</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSquare, { backgroundColor: `${colors.success}55` }]} />
          <Text style={[styles.legendText, { color: colors.muted }]}>Частично</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSquare, { backgroundColor: colors.success }]} />
          <Text style={[styles.legendText, { color: colors.muted }]}>Цель</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.danger }]} />
          <Text style={[styles.legendText, { color: colors.muted }]}>Были срывы</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },
  cardDesktop: {
    flex: 1,
    justifyContent: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardTitleCol: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  cardSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  rangePills: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 9,
    gap: 2,
  },
  rangePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  rangePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  dayInspectStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 9,
    gap: 8,
  },
  dayInspectDate: {
    fontSize: 12,
    fontWeight: '700',
  },
  dayInspectMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  dayInspectVal: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  dayInspectSub: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  svgWrap: {
    position: 'relative',
    width: '100%',
    height: 148,
  },
  touchOverlay: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
  },
  barTouchCol: {
    flex: 1,
    height: '100%',
  },
  xAxisRow: {
    flexDirection: 'row',
    marginTop: -6,
  },
  xAxisCell: {
    flex: 1,
    alignItems: 'center',
  },
  xAxisLabel: {
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  legendSquare: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '500',
  },
  donutSplitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  donutCol: {
    alignItems: 'center',
    gap: 10,
  },
  donutBox: {
    width: 104,
    height: 104,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  svgRotateUp: {
    transform: [{ rotate: '-90deg' }],
  },
  donutCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutPct: {
    fontSize: 20,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  donutSub: {
    fontSize: 10,
    fontWeight: '600',
  },
  donutLegend: {
    flexDirection: 'row',
    gap: 10,
  },
  donutLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  donutLegendText: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  sparkCol: {
    flex: 1,
    minWidth: 160,
    gap: 8,
  },
  sparkHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sparkTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sparkScoreNow: {
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  sparkBox: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  sparkHint: {
    fontSize: 11,
    lineHeight: 15,
  },
  donutFooterStrip: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  miniStatCell: {
    flex: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  miniStatVal: {
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  miniStatLbl: {
    fontSize: 10,
    fontWeight: '500',
  },
  breakdownSection: {
    gap: 8,
  },
  hBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hBarLabelCol: {
    width: 74,
  },
  hBarLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  hBarRange: {
    fontSize: 10,
  },
  hBarTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  hBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  hBarVal: {
    width: 44,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  tasksDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    gap: 8,
  },
  subSectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  emptyHint: {
    fontSize: 12,
    lineHeight: 17,
  },
  taskBarItem: {
    gap: 4,
  },
  taskBarTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  taskTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  taskBarTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  taskBarMeta: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  taskBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  taskBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  heatmapRows: {
    gap: 6,
  },
  heatmapRow: {
    flexDirection: 'row',
    gap: 6,
  },
  heatmapCell: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  heatmapDayNum: {
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  heatmapAbandonDot: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
});
