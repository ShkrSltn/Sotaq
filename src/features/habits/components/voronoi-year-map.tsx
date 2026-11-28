import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { VoronoiMonth } from '@/features/habits/components/voronoi-month';
import type { HabitWithStats } from '@/features/habits/types';
import type { ThemeColors } from '@/theme/colors';
import { formatDateKeyRu } from '@/utils/date-key';

const MONTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

type HoverInfo = {
  dateKey: string;
  doneCount: number;
  totalCount: number;
};

type Props = {
  year: number;
  todayKey: string;
  isDesktop: boolean;
  habits: HabitWithStats[];
  selectedHabit: HabitWithStats | null;
  colors: ThemeColors;
  onPressDay: (dateKey: string) => void;
  onOpenMonthZoom: (monthIndex: number) => void;
};

export function VoronoiYearMap({
  year,
  todayKey,
  isDesktop,
  habits,
  selectedHabit,
  colors,
  onPressDay,
  onOpenMonthZoom,
}: Props) {
  const [containerWidth, setContainerWidth] = useState(isDesktop ? 860 : 340);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);

  const cols = isDesktop ? 3 : 2;
  const gap = isDesktop ? 14 : 10;
  const monthSize = Math.max(132, Math.floor((containerWidth - gap * (cols - 1)) / cols));

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIndex = now.getMonth();

  return (
    <View style={styles.wrap}>
      {/* Subtle top caption + live Web hover readout (fixed height — zero layout jump) */}
      <View style={styles.captionRow}>
        <Text style={[styles.captionLabel, { color: colors.muted }]}>
          {selectedHabit
            ? `Карта привычки «${selectedHabit.title}»`
            : 'Годовая карта всех привычек'}
        </Text>

        {isDesktop ? (
          <Text style={[styles.hoverHint, { color: hoverInfo ? colors.text : colors.muted }]}>
            {hoverInfo
              ? `${formatDateKeyRu(hoverInfo.dateKey)} · ${
                  selectedHabit
                    ? hoverInfo.doneCount > 0
                      ? 'Выполнено ✓'
                      : 'Не отмечено'
                    : `Выполнено ${hoverInfo.doneCount} из ${hoverInfo.totalCount}`
                }`
              : 'Нажми на заголовок месяца, чтобы открыть его крупно'}
          </Text>
        ) : (
          <Text style={[styles.hoverHint, { color: colors.muted }]}>
            Тап по месяцу — открыть
          </Text>
        )}
      </View>

      <View
        style={[styles.grid, { gap }]}
        onLayout={(event) => {
          const nextW = Math.floor(event.nativeEvent.layout.width);
          if (nextW > 120 && Math.abs(nextW - containerWidth) > 2) {
            setContainerWidth(nextW);
          }
        }}>
        {MONTHS.map((monthIndex) => (
          <VoronoiMonth
            key={`${year}-${monthIndex}`}
            year={year}
            monthIndex={monthIndex}
            size={monthSize}
            todayKey={todayKey}
            currentMonthIndex={currentMonthIndex}
            currentYear={currentYear}
            habits={habits}
            selectedHabit={selectedHabit}
            colors={colors}
            onPressDay={onPressDay}
            onOpenZoom={onOpenMonthZoom}
            onHoverDayChange={isDesktop ? setHoverInfo : undefined}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  captionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 20,
    paddingHorizontal: 2,
    gap: 8,
  },
  captionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hoverHint: {
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
});
