import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { RipplePressable } from '@/components/ripple-pressable';
import type { NotePageRecord } from '@/features/notes/types';
import type { ThemeColors } from '@/theme/colors';

type Props = {
  pages: NotePageRecord[];
  activePageId: string | null;
  searchQuery: string;
  matchingPageIds: Set<string>;
  colors: ThemeColors;
  onSearchChange: (value: string) => void;
  onSelectPage: (pageId: string) => void;
  onCreatePage: (parentId?: string | null) => void;
};

export function PageTree({
  pages,
  activePageId,
  searchQuery,
  matchingPageIds,
  colors,
  onSearchChange,
  onSelectPage,
  onCreatePage,
}: Props) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, NotePageRecord[]>();
    for (const page of pages) {
      const list = map.get(page.parentId) ?? [];
      list.push(page);
      map.set(page.parentId, list);
    }
    return map;
  }, [pages]);

  const favorites = useMemo(() => pages.filter((page) => page.isFavorite), [pages]);

  const isSearching = searchQuery.trim().length > 0;
  const searchResults = useMemo(() => {
    if (!isSearching) {
      return [];
    }
    return pages.filter((page) => matchingPageIds.has(page.id));
  }, [isSearching, pages, matchingPageIds]);

  function toggleCollapse(pageId: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  }

  function renderTreeBranch(parentId: string | null, depth: number) {
    const branch = childrenByParent.get(parentId) ?? [];
    return branch.map((page) => {
      const children = childrenByParent.get(page.id) ?? [];
      const hasChildren = children.length > 0;
      const isCollapsed = collapsedIds.has(page.id);
      const isActive = page.id === activePageId;

      return (
        <View key={page.id}>
          <View
            style={[
              styles.treeRow,
              { paddingLeft: 6 + depth * 16 },
              isActive ? { backgroundColor: colors.surfaceActive } : null,
            ]}>
            <RipplePressable
              accessibilityLabel={isCollapsed ? 'Раскрыть' : 'Свернуть'}
              disabled={!hasChildren}
              onPress={() => toggleCollapse(page.id)}
              style={StyleSheet.flatten([
                styles.chevronBtn,
                !hasChildren ? styles.chevronHidden : null,
              ])}>
              <Text style={[styles.chevronGlyph, { color: colors.muted }]}>
                {hasChildren ? (isCollapsed ? '▸' : '▾') : '·'}
              </Text>
            </RipplePressable>

            <RipplePressable
              onPress={() => onSelectPage(page.id)}
              style={styles.pageHit}>
              <Text style={styles.pageIcon}>{page.icon}</Text>
              <Text
                style={[
                  styles.pageTitle,
                  { color: isActive ? colors.text : colors.muted },
                ]}
                numberOfLines={1}>
                {page.title.trim() || 'Без названия'}
              </Text>
            </RipplePressable>

            <RipplePressable
              accessibilityLabel="Добавить вложенную страницу"
              onPress={() => {
                setCollapsedIds((prev) => {
                  const next = new Set(prev);
                  next.delete(page.id);
                  return next;
                });
                onCreatePage(page.id);
              }}
              style={styles.addChildBtn}>
              <Text style={[styles.addChildGlyph, { color: colors.muted }]}>+</Text>
            </RipplePressable>
          </View>

          {hasChildren && !isCollapsed ? renderTreeBranch(page.id, depth + 1) : null}
        </View>
      );
    });
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.line }]}>
        <View
          style={[
            styles.searchBox,
            { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
          ]}>
          <TextInput
            value={searchQuery}
            onChangeText={onSearchChange}
            placeholder="Поиск заметок…"
            placeholderTextColor={colors.muted}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {searchQuery.length > 0 ? (
            <RipplePressable onPress={() => onSearchChange('')} style={styles.clearBtn}>
              <Text style={[styles.clearGlyph, { color: colors.muted }]}>×</Text>
            </RipplePressable>
          ) : null}
        </View>

        <RipplePressable
          accessibilityLabel="Новая страница"
          onPress={() => onCreatePage(null)}
          style={StyleSheet.flatten([
            styles.newPageIconBtn,
            { backgroundColor: colors.accent },
          ])}>
          <Text style={[styles.newPageIconGlyph, { color: colors.accentText }]}>+</Text>
        </RipplePressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {isSearching ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.muted }]}>
              Найдено ({searchResults.length})
            </Text>
            {searchResults.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.muted }]}>Ничего не найдено</Text>
            ) : (
              searchResults.map((page) => {
                const isActive = page.id === activePageId;
                return (
                  <RipplePressable
                    key={page.id}
                    onPress={() => onSelectPage(page.id)}
                    style={StyleSheet.flatten([
                      styles.flatRow,
                      isActive ? { backgroundColor: colors.surfaceActive } : null,
                    ])}>
                    <Text style={styles.pageIcon}>{page.icon}</Text>
                    <Text
                      style={[
                        styles.pageTitle,
                        { color: isActive ? colors.text : colors.muted },
                      ]}
                      numberOfLines={1}>
                      {page.title.trim() || 'Без названия'}
                    </Text>
                  </RipplePressable>
                );
              })
            )}
          </View>
        ) : (
          <>
            {favorites.length > 0 ? (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.muted }]}>Избранное</Text>
                {favorites.map((page) => {
                  const isActive = page.id === activePageId;
                  return (
                    <RipplePressable
                      key={`fav-${page.id}`}
                      onPress={() => onSelectPage(page.id)}
                      style={StyleSheet.flatten([
                        styles.flatRow,
                        isActive ? { backgroundColor: colors.surfaceActive } : null,
                      ])}>
                      <Text style={styles.pageIcon}>{page.icon}</Text>
                      <Text
                        style={[
                          styles.pageTitle,
                          { color: isActive ? colors.text : colors.muted },
                        ]}
                        numberOfLines={1}>
                        {page.title.trim() || 'Без названия'}
                      </Text>
                    </RipplePressable>
                  );
                })}
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.muted }]}>Страницы</Text>
              {renderTreeBranch(null, 0)}
            </View>
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.line }]}>
        <RipplePressable
          onPress={() => onCreatePage(null)}
          style={StyleSheet.flatten([
            styles.footerBtn,
            { backgroundColor: colors.surfaceSubtle },
          ])}>
          <Text style={[styles.footerBtnText, { color: colors.text }]}>+ Новая страница</Text>
        </RipplePressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 10,
    paddingRight: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 4,
  },
  clearBtn: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearGlyph: {
    fontSize: 15,
  },
  newPageIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newPageIconGlyph: {
    fontSize: 19,
    lineHeight: 21,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 8,
    gap: 14,
  },
  section: {
    gap: 2,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  emptyText: {
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  flatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 9,
  },
  treeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 9,
    paddingRight: 4,
  },
  chevronBtn: {
    width: 22,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronHidden: {
    opacity: 0.25,
  },
  chevronGlyph: {
    fontSize: 12,
  },
  pageHit: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 7,
  },
  pageIcon: {
    fontSize: 14,
  },
  pageTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  addChildBtn: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addChildGlyph: {
    fontSize: 16,
    lineHeight: 18,
  },
  footer: {
    padding: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerBtn: {
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
  },
  footerBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
