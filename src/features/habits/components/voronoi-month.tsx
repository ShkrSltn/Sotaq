import { memo, useMemo, useState } from 'react';
import {
  type GestureResponderEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';

import { AppIcon } from '@/components/app-icon';
import { RipplePressable } from '@/components/ripple-pressable';
import { type HabitWithStats, MONTH_NAMES_RU } from '@/features/habits/types';
import { findDayCellAtPoint, getMonthVoronoi } from '@/features/habits/voronoi';
import type { ThemeColors } from '@/theme/colors';
import { daysInMonth } from '@/utils/date-key';

type Props = {
  year: number;
  monthIndex: number; // 0..11
  size: number;
  todayKey: string;
  currentMonthIndex: number;
  currentYear: number;
  habits: HabitWithStats[];
  selectedHabit: HabitWithStats | null; // null => 'all' mode
  colors: ThemeColors;
  zoomMode?: boolean;
  large?: boolean;
  onPressDay: (dateKey: string) => void;
  onOpenZoom?: (monthIndex: number) => void;
  onHoverDayChange?: (info: { dateKey: string; doneCount: number; totalCount: number } | null) => void;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export const VoronoiMonth = memo(function VoronoiMonth({
  year,
  monthIndex,
  size,
  todayKey,
  currentMonthIndex,
  currentYear,
  habits,
  selectedHabit,
  colors,
  zoomMode = false,
  large = false,
  onPressDay,
  onOpenZoom,
  onHoverDayChange,
}: Props) {
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);

  const dayCount = daysInMonth(year, monthIndex);
  const cells = useMemo(
    () => getMonthVoronoi(year, monthIndex, dayCount),
    [year, monthIndex, dayCount],
  );

  const monthPrefix = `${year}-${pad2(monthIndex + 1)}-`;
  const isCurrentMonth = year === currentYear && monthIndex === currentMonthIndex;
  const totalHabits = habits.length;
  const singleFallbackColor =
    !selectedHabit && totalHabits === 1 ? habits[0].color : colors.success;

  // Precompute day states for fast render + streak chain lines
  const dayStates = useMemo(() => {
    let activeCount = 0;

    const map = cells.map((cell) => {
      const key = `${monthPrefix}${pad2(cell.day)}`;
      const isToday = key === todayKey;
      const isFuture = key > todayKey;

      let doneCount = 0;
      const totalCount = selectedHabit ? 1 : totalHabits;
      let fill: string = colors.surfaceSubtle;
      let fillOpacity = 1;
      let isMarked = false;
      const completedColors: string[] = [];

      if (selectedHabit) {
        if (selectedHabit.completedDates.has(key)) {
          doneCount = 1;
          isMarked = true;
          fill = selectedHabit.color;
          completedColors.push(selectedHabit.color);
        }
      } else if (totalHabits > 0) {
        for (let i = 0; i < totalHabits; i += 1) {
          if (habits[i].completedDates.has(key)) {
            doneCount += 1;
            completedColors.push(habits[i].color);
          }
        }
        if (doneCount > 0) {
          isMarked = true;
          const ratio = doneCount / totalHabits;
          if (doneCount === 1) {
            fill = completedColors[0];
            fillOpacity = totalHabits === 1 ? 1 : 0.72;
          } else {
            fill = singleFallbackColor;
            fillOpacity = ratio >= 1 ? 1 : ratio >= 0.66 ? 0.84 : 0.68;
          }
        }
      }

      if (isMarked) {
        activeCount += 1;
      } else if (isFuture) {
        fillOpacity = 0.38;
      }

      return {
        cell,
        key,
        isToday,
        isFuture,
        isMarked,
        doneCount,
        totalCount,
        completedColors,
        fill,
        fillOpacity,
      };
    });

    return { items: map, activeCount };
  }, [cells, monthPrefix, todayKey, selectedHabit, totalHabits, habits, colors.surfaceSubtle, singleFallbackColor]);

  const innerPadding = zoomMode ? 12 : 10;
  const svgSize = Math.max(80, size - innerPadding * 2);
  const progressPct = Math.min(100, Math.round((dayStates.activeCount / dayCount) * 100));
  const barColor = selectedHabit ? selectedHabit.color : singleFallbackColor;

  function resolveCellFromCoords(lx: number | undefined, ly: number | undefined) {
    if (lx === undefined || ly === undefined || svgSize <= 0) {
      return null;
    }
    const vx = (lx / svgSize) * 100;
    const vy = (ly / svgSize) * 100;
    if (vx < 0 || vx > 100 || vy < 0 || vy > 100) {
      return null;
    }
    return findDayCellAtPoint(cells, vx, vy);
  }

  function handleSvgPress(event: GestureResponderEvent) {
    const ne = event.nativeEvent as {
      locationX?: number;
      locationY?: number;
      offsetX?: number;
      offsetY?: number;
    };
    const hit = resolveCellFromCoords(ne.locationX ?? ne.offsetX, ne.locationY ?? ne.offsetY);
    if (!hit) {
      return;
    }
    const key = `${monthPrefix}${pad2(hit.day)}`;
    if (key > todayKey) {
      return;
    }
    onPressDay(key);
  }

  const webHoverProps =
    Platform.OS === 'web'
      ? {
          onPointerMove: (e: { nativeEvent?: { offsetX?: number; offsetY?: number } }) => {
            const hit = resolveCellFromCoords(
              e.nativeEvent?.offsetX,
              e.nativeEvent?.offsetY,
            );
            if (!hit) {
              if (hoveredDay !== null) {
                setHoveredDay(null);
                onHoverDayChange?.(null);
              }
              return;
            }
            if (hit.day !== hoveredDay) {
              setHoveredDay(hit.day);
              const st = dayStates.items[hit.day - 1];
              if (st) {
                onHoverDayChange?.({
                  dateKey: st.key,
                  doneCount: st.doneCount,
                  totalCount: st.totalCount,
                });
              }
            }
          },
          onPointerLeave: () => {
            if (hoveredDay !== null) {
              setHoveredDay(null);
              onHoverDayChange?.(null);
            }
          },
        }
      : {};

  const todayItem = dayStates.items.find((d) => d.isToday) ?? null;

  return (
    <View
      style={[
        styles.card,
        zoomMode ? styles.cardZoom : null,
        {
          width: size,
          backgroundColor: colors.surface,
          borderColor: colors.line,
          padding: innerPadding,
        },
      ]}>
      {!zoomMode ? (
        <View style={styles.headerBlock}>
          <RipplePressable
            disabled={!onOpenZoom}
            onPress={() => onOpenZoom?.(monthIndex)}
            style={styles.headerRow}>
            <View style={styles.monthTitleWrap}>
              {isCurrentMonth ? (
                <View style={[styles.currentDot, { backgroundColor: barColor }]} />
              ) : null}
              <Text
                style={[
                  styles.monthTitle,
                  { color: isCurrentMonth ? colors.text : colors.muted },
                ]}
                numberOfLines={1}>
                {MONTH_NAMES_RU[monthIndex]}
              </Text>
            </View>

            <View style={styles.headerRight}>
              <Text
                style={[
                  styles.monthCount,
                  { color: dayStates.activeCount > 0 ? colors.text : colors.muted },
                ]}>
                {dayStates.activeCount}/{dayCount}
              </Text>
              {onOpenZoom ? (
                <AppIcon name="maximize" size={10} color={colors.muted} />
              ) : null}
            </View>
          </RipplePressable>

          <View style={[styles.progressTrack, { backgroundColor: colors.surfaceSubtle }]}>
            {progressPct > 0 ? (
              <View
                style={[
                  styles.progressFill,
                  { width: `${progressPct}%`, backgroundColor: barColor },
                ]}
              />
            ) : null}
          </View>
        </View>
      ) : null}

      <Pressable
        onPress={handleSvgPress}
        {...(webHoverProps as object)}
        style={[
          styles.svgBox,
          {
            width: svgSize,
            height: svgSize,
            backgroundColor: colors.background,
          },
          Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null,
        ]}>
        <Svg width={svgSize} height={svgSize} viewBox="0 0 100 100" pointerEvents="none">
          {/* Layer 1: Rounded Voronoi Pebbles */}
          {dayStates.items.map((item) => {
            const isHovered = hoveredDay === item.cell.day && !item.isFuture;
            return (
              <Path
                key={item.cell.day}
                d={item.cell.pathD}
                fill={item.fill}
                fillOpacity={
                  isHovered && !item.isMarked
                    ? Math.min(1, item.fillOpacity + 0.35)
                    : item.fillOpacity
                }
                stroke={isHovered ? colors.muted : 'none'}
                strokeWidth={isHovered ? 0.7 : 0}
              />
            );
          })}

          {/* Layer 2: Subtle Constellation Chain connecting consecutive completed days */}
          {dayStates.items.map((item, idx) => {
            if (idx === 0 || !item.isMarked) {
              return null;
            }
            const prev = dayStates.items[idx - 1];
            if (!prev.isMarked) {
              return null;
            }
            return (
              <Line
                key={`chain-${item.cell.day}`}
                x1={prev.cell.center.x}
                y1={prev.cell.center.y - 2.4}
                x2={item.cell.center.x}
                y2={item.cell.center.y - 2.4}
                stroke="#FFFFFF"
                strokeWidth={0.75}
                strokeOpacity={0.5}
                strokeDasharray="1.6,1.4"
              />
            );
          })}

          {/* Layer 3: Uninterrupted Today Highlight Ring on top of neighbors */}
          {todayItem ? (
            <Path
              d={todayItem.cell.pathD}
              fill="none"
              stroke={todayItem.isMarked ? '#FFFFFF' : colors.text}
              strokeWidth={1.35}
              strokeOpacity={0.95}
            />
          ) : null}

          {/* Layer 4: Centered Seed Dots (multi-habit color dots in 'All' mode) & Crisp Day Numbers */}
          {dayStates.items.map((item) => {
            const dotFill = item.isMarked ? '#FFFFFF' : colors.muted;
            const textColor = item.isMarked ? '#FFFFFF' : item.isToday ? colors.text : colors.muted;
            const cx = item.cell.center.x;
            const cy = item.cell.center.y;
            const showMultiDots = !selectedHabit && item.completedColors.length > 1;
            const visibleDots = showMultiDots ? item.completedColors.slice(0, 4) : [];
            const dotSpacing = zoomMode || large ? 2.6 : 2.3;
            const dotsStartX = cx - ((visibleDots.length - 1) * dotSpacing) / 2;

            return (
              <G key={`lbl-${item.cell.day}`}>
                {showMultiDots ? (
                  visibleDots.map((dotColor, dotIdx) => (
                    <Circle
                      key={`d-${dotIdx}`}
                      cx={dotsStartX + dotIdx * dotSpacing}
                      cy={cy - 2.6}
                      r={zoomMode || large ? 1.0 : 0.9}
                      fill={dotColor}
                      stroke="#FFFFFF"
                      strokeWidth={0.45}
                    />
                  ))
                ) : (
                  <Circle
                    cx={cx}
                    cy={cy - 2.4}
                    r={item.isToday ? 1.25 : 0.95}
                    fill={item.isToday && !item.isMarked ? barColor : dotFill}
                    fillOpacity={item.isMarked ? 0.95 : item.isFuture ? 0.25 : 0.6}
                  />
                )}
                <SvgText
                  x={cx}
                  y={cy + 3.1}
                  fontSize={zoomMode || large ? 4.3 : 5.0}
                  fontWeight={item.isToday || item.isMarked ? '700' : '500'}
                  fill={textColor}
                  fillOpacity={item.isMarked ? 0.98 : item.isFuture ? 0.32 : 0.8}
                  textAnchor="middle">
                  {item.cell.day}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  cardZoom: {
    borderWidth: 0,
    padding: 0,
  },
  headerBlock: {
    gap: 5,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    borderRadius: 6,
  },
  monthTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  currentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  monthTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  monthCount: {
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 2,
    borderRadius: 1,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 1,
  },
  svgBox: {
    borderRadius: 11,
    overflow: 'hidden',
  },
});
