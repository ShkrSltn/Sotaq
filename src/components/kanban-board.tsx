import { useEffect, useRef, useState } from 'react';
import { ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { RipplePressable } from '@/components/ripple-pressable';
import { useResolvedColorScheme } from '@/hooks/use-resolved-color-scheme';

const COLUMNS = [
  { id: 'todo', title: 'Сделать' },
  { id: 'doing', title: 'В работе' },
  { id: 'done', title: 'Готово' },
] as const;

type ColumnId = (typeof COLUMNS)[number]['id'];

type Card = {
  id: string;
  title: string;
  columnId: ColumnId;
};

const INITIAL_CARDS: Card[] = [
  { id: '1', title: 'Открыть на телефоне', columnId: 'todo' },
  { id: '2', title: 'Собрать APK', columnId: 'todo' },
  { id: '3', title: 'Первый экран', columnId: 'doing' },
  { id: '4', title: 'Набросать доску', columnId: 'done' },
];

const palette = {
  light: {
    background: '#F3F4F6',
    column: '#FFFFFF',
    card: '#F6F7F8',
    text: '#16181D',
    muted: '#8B909A',
    line: '#E6E8EC',
    pressed: '#ECEEEF',
  },
  dark: {
    background: '#111214',
    column: '#1C1D21',
    card: '#26272C',
    text: '#F3F4F6',
    muted: '#9AA0A8',
    line: '#2C2E33',
    pressed: '#31333A',
  },
} as const;

type Colors = (typeof palette)['light'];

const WIDE_LAYOUT = 920;
const COLUMN_FALLBACK_WIDTH = 280;

export function KanbanBoard() {
  const colors = palette[useResolvedColorScheme()];
  const { width } = useWindowDimensions();
  const nextId = useRef(INITIAL_CARDS.length + 1);
  const [cards, setCards] = useState<Card[]>(INITIAL_CARDS);
  const [trackHeight, setTrackHeight] = useState(0);
  // Window size differs between the server and the browser. Measure after mount.
  const [viewportWidth, setViewportWidth] = useState<number | null>(null);

  useEffect(() => {
    setViewportWidth(width);
  }, [width]);

  const sideBySide = viewportWidth != null && viewportWidth >= WIDE_LAYOUT;
  const columnWidth = sideBySide
    ? undefined
    : viewportWidth == null
      ? COLUMN_FALLBACK_WIDTH
      : Math.min(300, Math.max(220, viewportWidth - 56));

  function addCard(columnId: ColumnId, title: string) {
    const trimmed = title.trim();
    if (!trimmed) {
      return;
    }

    const id = String(nextId.current);
    nextId.current += 1;
    setCards((current) => [...current, { id, title: trimmed, columnId }]);
  }

  function moveCard(id: string, direction: -1 | 1) {
    setCards((current) =>
      current.map((card) => {
        if (card.id !== id) {
          return card;
        }

        const index = COLUMNS.findIndex((column) => column.id === card.columnId);
        const next = COLUMNS[index + direction];
        if (!next) {
          return card;
        }

        return { ...card, columnId: next.id };
      }),
    );
  }

  function removeCard(id: string) {
    setCards((current) => current.filter((card) => card.id !== id));
  }

  const columns = COLUMNS.map((column) => (
    <Column
      key={column.id}
      title={column.title}
      columnId={column.id}
      width={columnWidth}
      height={sideBySide ? undefined : trackHeight || undefined}
      colors={colors}
      cards={cards.filter((card) => card.columnId === column.id)}
      onAdd={addCard}
      onMove={moveCard}
      onRemove={removeCard}
    />
  ));

  return (
    <View style={styles.board}>
      {sideBySide ? (
        <View style={styles.row}>{columns}</View>
      ) : (
        <GestureScrollView
          horizontal
          nestedScrollEnabled
          directionalLockEnabled
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          style={styles.scroller}
          contentContainerStyle={styles.scrollRow}
          onLayout={(event) => {
            const nextHeight = event.nativeEvent.layout.height;
            setTrackHeight((current) => (current === nextHeight ? current : nextHeight));
          }}>
          {columns}
        </GestureScrollView>
      )}
    </View>
  );
}

function Column({
  title,
  columnId,
  width,
  height,
  colors,
  cards,
  onAdd,
  onMove,
  onRemove,
}: {
  title: string;
  columnId: ColumnId;
  width: number | undefined;
  height: number | undefined;
  colors: Colors;
  cards: Card[];
  onAdd: (columnId: ColumnId, title: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const index = COLUMNS.findIndex((column) => column.id === columnId);

  function submit() {
    onAdd(columnId, draft);
    setDraft('');
  }

  return (
    <View
      style={[
        styles.column,
        { backgroundColor: colors.column, width, height },
        width == null ? styles.columnFlex : styles.columnFixed,
      ]}>
      <View style={styles.columnHeader}>
        <Text style={[styles.columnTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.count, { color: colors.muted }]}>{cards.length}</Text>
      </View>

      <ScrollView
        nestedScrollEnabled
        style={styles.cardList}
        contentContainerStyle={styles.cardListContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {cards.length === 0 ? (
          <Text style={[styles.empty, { color: colors.muted }]}>Пока пусто</Text>
        ) : (
          cards.map((card) => (
            <View key={card.id} style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{card.title}</Text>
              <View style={styles.cardActions}>
                {index > 0 ? (
                  <CardButton
                    label="‹"
                    accessibilityLabel="Перенести назад"
                    colors={colors}
                    onPress={() => onMove(card.id, -1)}
                  />
                ) : null}
                {index < COLUMNS.length - 1 ? (
                  <CardButton
                    label="›"
                    accessibilityLabel="Перенести дальше"
                    colors={colors}
                    onPress={() => onMove(card.id, 1)}
                  />
                ) : null}
                <CardButton
                  label="×"
                  accessibilityLabel="Удалить"
                  colors={colors}
                  onPress={() => onRemove(card.id)}
                />
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <View style={[styles.composer, { borderTopColor: colors.line }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submit}
          placeholder="Новая карточка"
          placeholderTextColor={colors.muted}
          returnKeyType="done"
          style={[styles.input, { color: colors.text }]}
        />
        <RipplePressable
          accessibilityLabel={`Добавить в «${title}»`}
          disabled={draft.trim().length === 0}
          onPress={submit}
          style={StyleSheet.flatten([
            styles.addButton,
            { backgroundColor: colors.card },
            draft.trim().length === 0 ? styles.addButtonDisabled : null,
          ])}>
          <Text style={[styles.addLabel, { color: colors.text }]}>+</Text>
        </RipplePressable>
      </View>
    </View>
  );
}

function CardButton({
  label,
  accessibilityLabel,
  colors,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  colors: Colors;
  onPress: () => void;
}) {
  return (
    <RipplePressable
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      onPress={onPress}
      style={styles.iconButton}>
      <Text style={[styles.iconLabel, { color: colors.muted }]}>{label}</Text>
    </RipplePressable>
  );
}

const styles = StyleSheet.create({
  board: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  scroller: {
    flex: 1,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  scrollRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  column: {
    borderRadius: 16,
    paddingTop: 14,
    overflow: 'hidden',
  },
  columnFlex: {
    flex: 1,
    minWidth: 0,
  },
  columnFixed: {
    flexGrow: 0,
    flexShrink: 0,
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  columnTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  count: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  cardList: {
    flex: 1,
  },
  cardListContent: {
    paddingHorizontal: 10,
    paddingBottom: 10,
    gap: 8,
  },
  empty: {
    fontSize: 13,
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  card: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLabel: {
    fontSize: 16,
    lineHeight: 18,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: {
    opacity: 0.4,
  },
  addLabel: {
    fontSize: 20,
    lineHeight: 22,
  },
});
