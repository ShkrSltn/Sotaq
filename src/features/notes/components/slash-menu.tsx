import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AppIcon } from '@/components/app-icon';
import { RipplePressable } from '@/components/ripple-pressable';
import type { PopoverAnchor } from '@/features/notes/components/block-context-menu';
import {
  BLOCK_TYPE_CATALOG,
  type BlockTypeMeta,
  type NoteBlockType,
} from '@/features/notes/types';
import type { ThemeColors } from '@/theme/colors';

type Props = {
  query: string;
  mode?: 'slash' | 'insert';
  anchor?: PopoverAnchor | null;
  selectedIndex: number;
  colors: ThemeColors;
  onSelect: (type: NoteBlockType) => void;
  onHoverIndex?: (index: number) => void;
  onClose: () => void;
};

const MENU_WIDTH = 310;
const ESTIMATED_HEIGHT = 320;

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

export function SlashMenu({
  query,
  mode = 'slash',
  anchor,
  selectedIndex,
  colors,
  onSelect,
  onHoverIndex,
  onClose,
}: Props) {
  const { width: winW, height: winH } = useWindowDimensions();
  const items = filterBlockCatalog(query);
  const showGroups = query.trim().length === 0;
  const basicItems = showGroups ? items.filter((item) => item.group === 'basic') : [];
  const accentItems = showGroups ? items.filter((item) => item.group === 'accent') : [];

  function renderItem(item: BlockTypeMeta, flatIndex: number) {
    const active = mode === 'slash' && flatIndex === selectedIndex;
    return (
      <Pressable
        key={item.type}
        onPress={() => onSelect(item.type)}
        onHoverIn={() => onHoverIndex?.(flatIndex)}
        style={({ hovered }: { hovered?: boolean }) => [
          styles.row,
          active || hovered ? { backgroundColor: colors.surfaceActive } : null,
        ]}>
        {({ hovered }: { hovered?: boolean }) => (
          <>
            <View
              style={[
                styles.iconBox,
                { backgroundColor: active || hovered ? colors.surface : colors.surfaceSubtle },
              ]}>
              <AppIcon name={item.icon} size="sm" color={colors.text} />
            </View>
            <View style={styles.rowMeta}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>{item.label}</Text>
              <Text style={[styles.rowDesc, { color: colors.muted }]} numberOfLines={1}>
                {item.description}
              </Text>
            </View>
            {item.shortcut ? (
              <View style={[styles.shortcutPill, { backgroundColor: colors.surfaceSubtle }]}>
                <Text style={[styles.shortcutText, { color: colors.muted }]}>{item.shortcut}</Text>
              </View>
            ) : null}
          </>
        )}
      </Pressable>
    );
  }

  const menuBody = (
    <Animated.View
      entering={FadeIn.duration(100)}
      style={[
        styles.menu,
        mode === 'slash' ? styles.floatingInline : null,
        { backgroundColor: colors.surface, borderColor: colors.line },
      ]}>
      <View style={[styles.header, { borderBottomColor: colors.line }]}>
        <Text style={[styles.headerLabel, { color: colors.muted }]}>
          {mode === 'insert'
            ? 'Добавить блок ниже'
            : query.trim().length > 0
              ? `Команда: /${query}`
              : 'Выберите блок · ↑↓ Enter'}
        </Text>
        <RipplePressable onPress={onClose} style={styles.closeBtn}>
          <AppIcon name="close" size="xs" color={colors.muted} />
        </RipplePressable>
      </View>

      <ScrollView
        style={styles.list}
        keyboardShouldPersistTaps="always"
        nestedScrollEnabled>
        {items.length === 0 ? (
          <Text style={[styles.empty, { color: colors.muted }]}>Нет подходящих блоков</Text>
        ) : showGroups ? (
          <>
            <Text style={[styles.groupCaption, { color: colors.muted }]}>Базовые блоки</Text>
            {basicItems.map((item, idx) => renderItem(item, idx))}
            <Text style={[styles.groupCaption, styles.groupSpacer, { color: colors.muted }]}>
              Выделение и структура
            </Text>
            {accentItems.map((item, idx) => renderItem(item, basicItems.length + idx))}
          </>
        ) : (
          items.map((item, idx) => renderItem(item, idx))
        )}
      </ScrollView>
    </Animated.View>
  );

  // '+' insert mode floats in a transparent Modal anchored at the button — zero layout shift, click-outside closes
  if (mode === 'insert' && anchor) {
    const left = Math.max(10, Math.min(anchor.x, winW - MENU_WIDTH - 10));
    const preferBelow = anchor.y + anchor.height + 6;
    const top =
      preferBelow + ESTIMATED_HEIGHT > winH - 12
        ? Math.max(12, anchor.y - ESTIMATED_HEIGHT - 6)
        : preferBelow;

    return (
      <Modal visible transparent animationType="none" onRequestClose={onClose}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={onClose} />
          <View style={[styles.modalAnchorWrap, { left, top, width: MENU_WIDTH }]}>
            {menuBody}
          </View>
        </View>
      </Modal>
    );
  }

  // '/' inline command floats absolutely below the active TextInput so keyboard focus never drops
  return menuBody;
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
  },
  modalAnchorWrap: {
    position: 'absolute',
  },
  floatingInline: {
    position: 'absolute',
    top: '100%',
    left: 0,
    zIndex: 1000,
    marginTop: 4,
  },
  menu: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    width: MENU_WIDTH,
    maxWidth: '100%',
    elevation: 14,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.32), 0 2px 8px rgba(0, 0, 0, 0.16)',
        } as object)
      : {
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
        }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  closeBtn: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeGlyph: {
    fontSize: 16,
    lineHeight: 18,
  },
  list: {
    maxHeight: 280,
    paddingVertical: 4,
  },
  groupCaption: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 4,
  },
  groupSpacer: {
    marginTop: 4,
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
    paddingVertical: 7,
    marginHorizontal: 4,
    borderRadius: 8,
    ...(Platform.OS === 'web'
      ? ({ cursor: 'pointer', transition: 'background-color 110ms ease' } as object)
      : null),
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 7,
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
    paddingVertical: 2,
    borderRadius: 5,
  },
  shortcutText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
