import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { RipplePressable } from '@/components/ripple-pressable';
import {
  BLOCK_TYPE_CATALOG,
  type BlockTypeMeta,
  type NoteBlockType,
} from '@/features/notes/types';
import type { ThemeColors } from '@/theme/colors';

type Props = {
  query: string;
  colors: ThemeColors;
  onSelect: (type: NoteBlockType) => void;
  onClose: () => void;
};

export function filterBlockCatalog(query: string): BlockTypeMeta[] {
  const clean = query.trim().toLowerCase();
  if (!clean) {
    return [...BLOCK_TYPE_CATALOG];
  }
  return BLOCK_TYPE_CATALOG.filter((item) => {
    if (item.label.toLowerCase().includes(clean)) {
      return true;
    }
    if (item.description.toLowerCase().includes(clean)) {
      return true;
    }
    return item.keywords.some((kw) => kw.includes(clean));
  });
}

export function SlashMenu({ query, colors, onSelect, onClose }: Props) {
  const items = filterBlockCatalog(query);

  return (
    <Animated.View
      entering={FadeInDown.duration(130)}
      style={[
        styles.menu,
        { backgroundColor: colors.surface, borderColor: colors.line },
      ]}>
      <View style={[styles.header, { borderBottomColor: colors.line }]}>
        <Text style={[styles.headerLabel, { color: colors.muted }]}>
          {query.trim().length > 0 ? `Блоки: /${query}` : 'Выберите тип блока'}
        </Text>
        <RipplePressable onPress={onClose} style={styles.closeBtn}>
          <Text style={[styles.closeGlyph, { color: colors.muted }]}>×</Text>
        </RipplePressable>
      </View>

      <ScrollView
        style={styles.list}
        keyboardShouldPersistTaps="always"
        nestedScrollEnabled>
        {items.length === 0 ? (
          <Text style={[styles.empty, { color: colors.muted }]}>Нет подходящих блоков</Text>
        ) : (
          items.map((item) => (
            <RipplePressable
              key={item.type}
              onPress={() => onSelect(item.type)}
              style={styles.row}>
              <View style={[styles.iconBox, { backgroundColor: colors.surfaceSubtle }]}>
                <Text style={[styles.iconText, { color: colors.text }]}>{item.icon}</Text>
              </View>
              <View style={styles.rowMeta}>
                <Text style={[styles.rowLabel, { color: colors.text }]}>{item.label}</Text>
                <Text style={[styles.rowDesc, { color: colors.muted }]} numberOfLines={1}>
                  {item.description}
                </Text>
              </View>
              {item.shortcut ? (
                <View style={[styles.shortcutPill, { backgroundColor: colors.surfaceSubtle }]}>
                  <Text style={[styles.shortcutText, { color: colors.muted }]}>
                    {item.shortcut}
                  </Text>
                </View>
              ) : null}
            </RipplePressable>
          ))
        )}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  menu: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    maxWidth: 340,
    width: '100%',
    marginTop: 6,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  closeBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeGlyph: {
    fontSize: 16,
    lineHeight: 18,
  },
  list: {
    maxHeight: 260,
  },
  empty: {
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 12,
    fontWeight: '700',
  },
  rowMeta: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  rowDesc: {
    fontSize: 11,
  },
  shortcutPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  shortcutText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
