import { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputKeyPressEvent,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import type { NotePageRecord } from '@/features/notes/types';
import { useThemeColors, useViewport } from '@/theme/colors';

type Props = {
  visible: boolean;
  pages: NotePageRecord[];
  onClose: () => void;
  onSelectPage: (pageId: string) => void;
  onCreatePageWithTitle: (title: string) => void;
};

export function QuickFindModal(props: Props) {
  if (!props.visible) {
    return null;
  }
  return <QuickFindModalContent {...props} />;
}

function QuickFindModalContent({
  pages,
  onClose,
  onSelectPage,
  onCreatePageWithTitle,
}: Props) {
  const colors = useThemeColors();
  const { isDesktop } = useViewport();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const pageById = useMemo(() => new Map(pages.map((p) => [p.id, p])), [pages]);

  const filtered = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (!clean) {
      return [...pages].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    return pages.filter((page) => page.title.toLowerCase().includes(clean));
  }, [pages, query]);

  const canCreateFromQuery = query.trim().length > 0;
  const totalOptions = filtered.length + (canCreateFromQuery ? 1 : 0);
  const clampedIndex = totalOptions > 0 ? Math.min(selectedIndex, totalOptions - 1) : 0;

  function getBreadcrumbPath(page: NotePageRecord): string {
    const parts: string[] = [];
    let parentId = page.parentId;
    const seen = new Set<string>([page.id]);
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = pageById.get(parentId);
      if (!parent) {
        break;
      }
      parts.unshift(parent.title.trim() || 'Без названия');
      parentId = parent.parentId;
    }
    return parts.join(' / ');
  }

  function confirmSelection(indexToRun: number) {
    if (indexToRun < filtered.length) {
      onSelectPage(filtered[indexToRun].id);
      onClose();
    } else if (canCreateFromQuery) {
      onCreatePageWithTitle(query.trim());
      onClose();
    }
  }

  function handleKeyPress(event: TextInputKeyPressEvent) {
    const key = event.nativeEvent.key;
    if (key === 'Escape') {
      onClose();
      return;
    }
    if (key === 'ArrowDown' && totalOptions > 0) {
      if (Platform.OS === 'web') event.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % totalOptions);
      return;
    }
    if (key === 'ArrowUp' && totalOptions > 0) {
      if (Platform.OS === 'web') event.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + totalOptions) % totalOptions);
      return;
    }
    if (key === 'Enter' && totalOptions > 0) {
      if (Platform.OS === 'web') event.preventDefault();
      confirmSelection(clampedIndex);
    }
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View
        style={[
          styles.root,
          !isDesktop
            ? { paddingTop: Math.max(insets.top + 10, 16), paddingHorizontal: 12 }
            : null,
        ]}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View
          entering={FadeIn.duration(130)}
          style={[
            styles.dialog,
            !isDesktop ? styles.dialogMobile : null,
            { backgroundColor: colors.surface, borderColor: colors.line },
          ]}>
          <View style={[styles.searchRow, { borderBottomColor: colors.line }]}>
            <AppIcon name="search" size="md" color={colors.muted} />
            <TextInput
              value={query}
              onChangeText={(value) => {
                setQuery(value);
                setSelectedIndex(0);
              }}
              onKeyPress={handleKeyPress}
              onSubmitEditing={() => confirmSelection(clampedIndex)}
              autoFocus
              returnKeyType="search"
              placeholder="Найти или создать страницу…"
              placeholderTextColor={colors.muted}
              style={[styles.searchInput, { color: colors.text }]}
            />
            {query.length > 0 ? (
              <Pressable
                accessibilityLabel="Очистить поиск"
                hitSlop={6}
                onPress={() => {
                  setQuery('');
                  setSelectedIndex(0);
                }}
                style={[styles.clearPill, { backgroundColor: colors.surfaceSubtle }]}>
                <AppIcon name="close" size={11} color={colors.muted} />
              </Pressable>
            ) : null}
            {isDesktop ? (
              <View style={[styles.kbdPill, { backgroundColor: colors.surfaceSubtle }]}>
                <Text style={[styles.kbdText, { color: colors.muted }]}>ESC</Text>
              </View>
            ) : (
              <Pressable
                accessibilityLabel="Закрыть поиск"
                hitSlop={6}
                onPress={onClose}
                style={styles.cancelBtn}>
                <Text style={[styles.cancelText, { color: colors.text }]}>Отмена</Text>
              </Pressable>
            )}
          </View>

          <ScrollView style={styles.results} keyboardShouldPersistTaps="always">
            {filtered.length === 0 && !canCreateFromQuery ? (
              <Text style={[styles.empty, { color: colors.muted }]}>Нет страниц</Text>
            ) : (
              <>
                {filtered.map((page, idx) => {
                  const active = idx === clampedIndex;
                  const path = getBreadcrumbPath(page);
                  return (
                    <Pressable
                      key={page.id}
                      onPress={() => confirmSelection(idx)}
                      onHoverIn={() => setSelectedIndex(idx)}
                      style={[
                        styles.resultRow,
                        active ? { backgroundColor: colors.surfaceActive } : null,
                      ]}>
                      <Text style={styles.resultIcon}>{page.icon}</Text>
                      <View style={styles.resultMeta}>
                        <Text style={[styles.resultTitle, { color: colors.text }]} numberOfLines={1}>
                          {page.title.trim() || 'Без названия'}
                        </Text>
                        {path ? (
                          <Text style={[styles.resultPath, { color: colors.muted }]} numberOfLines={1}>
                            {path}
                          </Text>
                        ) : null}
                      </View>
                      {page.isFavorite ? (
                        <AppIcon name="star" size="xs" color={colors.warning} fill={colors.warning} />
                      ) : null}
                    </Pressable>
                  );
                })}

                {canCreateFromQuery ? (
                  <Pressable
                    onPress={() => confirmSelection(filtered.length)}
                    onHoverIn={() => setSelectedIndex(filtered.length)}
                    style={[
                      styles.resultRow,
                      styles.createRow,
                      { borderTopColor: colors.line },
                      clampedIndex === filtered.length
                        ? { backgroundColor: colors.surfaceActive }
                        : null,
                    ]}>
                    <AppIcon name="plus" size="sm" color={colors.text} />
                    <Text style={[styles.resultTitle, { color: colors.text }]} numberOfLines={1}>
                      Создать страницу «{query.trim()}»
                    </Text>
                  </Pressable>
                ) : null}
              </>
            )}
          </ScrollView>

          {isDesktop ? (
            <View style={[styles.footer, { borderTopColor: colors.line }]}>
              <Text style={[styles.footerHint, { color: colors.muted }]}>
                ↑↓ навигация · Enter открыть · Esc закрыть
              </Text>
            </View>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 72,
    paddingHorizontal: 16,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 12, 16, 0.5)',
  },
  dialog: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '72%',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  dialogMobile: {
    maxHeight: '80%',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 2,
    minWidth: 0,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  clearPill: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    paddingLeft: 4,
    paddingVertical: 2,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  kbdPill: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
  },
  kbdText: {
    fontSize: 10,
    fontWeight: '700',
  },
  results: {
    maxHeight: 340,
    paddingVertical: 6,
  },
  empty: {
    fontSize: 13,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginHorizontal: 6,
    borderRadius: 9,
    ...(Platform.OS === 'web'
      ? ({ cursor: 'pointer', transition: 'background-color 110ms ease' } as object)
      : null),
  },
  resultIcon: {
    fontSize: 16,
  },
  resultMeta: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  resultPath: {
    fontSize: 11,
  },
  star: {
    fontSize: 13,
  },
  createRow: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  createPlus: {
    fontSize: 16,
    fontWeight: '700',
    width: 18,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerHint: {
    fontSize: 11,
  },
});
