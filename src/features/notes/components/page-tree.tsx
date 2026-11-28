import { type ComponentRef, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  AnchoredPopover,
  type AnchorRect,
  measureAnchor,
} from '@/components/anchored-popover';
import { AppIcon } from '@/components/app-icon';
import { DragTrashZone } from '@/components/drag-trash-zone';
import { RipplePressable } from '@/components/ripple-pressable';
import { WebDragBox } from '@/components/web-drag-box';
import { MobilePageActionsSheet } from '@/features/notes/components/mobile-sheets';
import {
  NOTION_DROP_BLUE,
  type NotePageRecord,
  resolveNotePageIcon,
} from '@/features/notes/types';
import { useResolvedColorScheme } from '@/hooks/use-resolved-color-scheme';
import type { ThemeColors } from '@/theme/colors';

export type PageDropMode = 'before' | 'inside' | 'after';

type Props = {
  pages: NotePageRecord[];
  activePageId: string | null;
  isDesktop: boolean;
  colors: ThemeColors;
  onOpenQuickFind: () => void;
  onSelectPage: (pageId: string) => void;
  onCreatePage: (parentId?: string | null) => void;
  onRenamePage: (pageId: string, title: string) => void;
  onToggleFavorite: (pageId: string, isFavorite: boolean) => void;
  onDuplicatePage: (pageId: string) => void;
  onDeletePage: (pageId: string) => void;
  onMovePage: (
    pageId: string,
    targetParentId: string | null,
    targetIndex?: number,
  ) => void;
};

export function PageTree({
  pages,
  activePageId,
  isDesktop,
  colors,
  onOpenQuickFind,
  onSelectPage,
  onCreatePage,
  onRenamePage,
  onToggleFavorite,
  onDuplicatePage,
  onDeletePage,
  onMovePage,
}: Props) {
  const scheme = useResolvedColorScheme();
  const iconHoverBg =
    scheme === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(22, 24, 29, 0.09)';
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [hoveredPageId, setHoveredPageId] = useState<string | null>(null);
  const [menuPageId, setMenuPageId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<AnchorRect | null>(null);
  const menuBtnRefs = useRef<Record<string, ComponentRef<typeof View> | null>>({});
  const [mobileSheetPageId, setMobileSheetPageId] = useState<string | null>(null);
  const [mobileFilter, setMobileFilter] = useState<'all' | 'favorites' | 'recent'>('all');
  const [renamingPageId, setRenamingPageId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const [draggingPageId, setDraggingPageId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    pageId: string;
    mode: PageDropMode;
  } | null>(null);
  const [rootDropHover, setRootDropHover] = useState(false);

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
  const recentPages = useMemo(
    () => [...pages].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [pages],
  );
  const mobileSheetPage = useMemo(
    () => pages.find((p) => p.id === mobileSheetPageId) ?? null,
    [pages, mobileSheetPageId],
  );
  const activeMenuPage = useMemo(
    () => pages.find((p) => p.id === menuPageId) ?? null,
    [pages, menuPageId],
  );

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

  function startRename(page: NotePageRecord) {
    setMenuPageId(null);
    setRenamingPageId(page.id);
    setRenameDraft(page.title);
  }

  function commitRename(pageId: string) {
    onRenamePage(pageId, renameDraft.trim());
    setRenamingPageId(null);
  }

  function handleDropOnPage(draggedId: string, target: NotePageRecord, mode: PageDropMode) {
    setDraggingPageId(null);
    setDropTarget(null);
    setRootDropHover(false);

    if (draggedId === target.id) {
      return;
    }

    if (mode === 'inside') {
      setCollapsedIds((prev) => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
      onMovePage(draggedId, target.id);
      return;
    }

    const siblings = (childrenByParent.get(target.parentId) ?? []).filter(
      (p) => p.id !== draggedId,
    );
    const targetIdx = siblings.findIndex((p) => p.id === target.id);
    const insertAt = mode === 'before' ? targetIdx : targetIdx + 1;
    onMovePage(draggedId, target.parentId, Math.max(0, insertAt));
  }

  function renderTreeBranch(parentId: string | null, depth: number) {
    const branch = childrenByParent.get(parentId) ?? [];
    return branch.map((page) => {
      const children = childrenByParent.get(page.id) ?? [];
      const hasChildren = children.length > 0;
      const isCollapsed = collapsedIds.has(page.id);
      const isActive = page.id === activePageId;
      const isMenuOpen = menuPageId === page.id;
      const isRenaming = renamingPageId === page.id;
      const isHovered = hoveredPageId === page.id;
      const showRowActions = !isDesktop || isHovered || isMenuOpen || isActive;
      const rowDropMode = dropTarget?.pageId === page.id ? dropTarget.mode : null;

      return (
        <View key={page.id}>
          {rowDropMode === 'before' ? <View style={styles.pageDropLine} /> : null}

          <WebDragBox
            onPointerEnter={() => setHoveredPageId(page.id)}
            onPointerLeave={() =>
              setHoveredPageId((prev) => (prev === page.id ? null : prev))
            }
            onDragOver={(event) => {
              if (!draggingPageId || draggingPageId === page.id) {
                return;
              }
              event.preventDefault();
              if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'move';
              }
              const target = event.currentTarget as HTMLElement | null;
              const rect = target?.getBoundingClientRect?.();
              if (!rect) {
                setDropTarget({ pageId: page.id, mode: 'inside' });
                return;
              }
              const ratio = (event.clientY - rect.top) / Math.max(rect.height, 1);
              const mode: PageDropMode =
                ratio < 0.28 ? 'before' : ratio > 0.72 ? 'after' : 'inside';
              setDropTarget({ pageId: page.id, mode });
            }}
            onDragLeave={() => {
              setDropTarget((prev) => (prev?.pageId === page.id ? null : prev));
            }}
            onDrop={(event) => {
              if (!draggingPageId) {
                return;
              }
              event.preventDefault();
              const draggedId =
                event.dataTransfer?.getData('text/sotaq-page') || draggingPageId;
              if (!draggedId) {
                return;
              }
              handleDropOnPage(draggedId, page, rowDropMode ?? 'inside');
            }}
            style={[
              styles.treeRow,
              !isDesktop ? styles.treeRowMobile : null,
              { paddingLeft: (isDesktop ? 6 : 10) + depth * (isDesktop ? 15 : 18) },
              isActive ? { backgroundColor: colors.surfaceActive } : null,
              isHovered && !isActive ? { backgroundColor: colors.surfaceSubtle } : null,
              draggingPageId === page.id ? styles.draggingRow : null,
              rowDropMode === 'inside' ? styles.dropInsideRow : null,
            ]}>
            {/* 1. Expand/Collapse Chevron (independent sibling, never nested) */}
            <Pressable
              accessibilityLabel={isCollapsed ? 'Раскрыть' : 'Свернуть'}
              disabled={!hasChildren}
              onPress={() => toggleCollapse(page.id)}
              style={({ hovered }: { hovered?: boolean }) => [
                styles.chevronBtn,
                !isDesktop ? styles.chevronBtnMobile : null,
                !hasChildren ? styles.chevronHidden : null,
                hovered && hasChildren ? { backgroundColor: iconHoverBg } : null,
              ]}>
              {({ hovered }: { hovered?: boolean }) =>
                hasChildren ? (
                  <AppIcon
                    name={isCollapsed ? 'chevronRight' : 'chevronDown'}
                    size="xs"
                    color={hovered ? colors.text : colors.muted}
                  />
                ) : (
                  <View style={[styles.leafDot, { backgroundColor: colors.muted }]} />
                )
              }
            </Pressable>

            {/* 2. Page Title Hit Area (draggable source on web, independent sibling) */}
            {isRenaming ? (
              <View style={styles.rowMain}>
                <AppIcon
                  name={resolveNotePageIcon(page.icon)}
                  size={isDesktop ? 15 : 17}
                  color={colors.muted}
                />
                <TextInput
                  value={renameDraft}
                  onChangeText={setRenameDraft}
                  onSubmitEditing={() => commitRename(page.id)}
                  onBlur={() => commitRename(page.id)}
                  autoFocus
                  placeholder="Без названия"
                  placeholderTextColor={colors.muted}
                  style={[
                    styles.renameInput,
                    { color: colors.text, backgroundColor: colors.surface },
                  ]}
                />
              </View>
            ) : (
              <WebDragBox
                draggable={Platform.OS === 'web' && !isRenaming}
                onDragStart={(event) => {
                  if (event.dataTransfer) {
                    event.dataTransfer.setData('text/sotaq-page', page.id);
                    event.dataTransfer.effectAllowed = 'move';
                  }
                  setDraggingPageId(page.id);
                }}
                onDragEnd={() => {
                  setDraggingPageId(null);
                  setDropTarget(null);
                  setRootDropHover(false);
                }}
                style={styles.rowMainWrap}>
                <Pressable
                  onPress={() => {
                    setMenuPageId(null);
                    onSelectPage(page.id);
                  }}
                  style={styles.rowMain}>
                  <AppIcon
                    name={resolveNotePageIcon(page.icon)}
                    size={isDesktop ? 15 : 17}
                    color={isActive || isHovered ? colors.text : colors.muted}
                  />
                  <Text
                    style={[
                      styles.pageTitle,
                      !isDesktop ? styles.pageTitleMobile : null,
                      { color: isActive || isHovered ? colors.text : colors.muted },
                    ]}
                    numberOfLines={1}>
                    {page.title.trim() || 'Без названия'}
                  </Text>
                </Pressable>
              </WebDragBox>
            )}

            {/* 3. Action Buttons ('...' & '+') — independent siblings, rock-solid click targets */}
            {showRowActions && !isRenaming ? (
              <View style={styles.rowActions}>
                <View
                  ref={(node) => {
                    menuBtnRefs.current[page.id] = node;
                  }}
                  collapsable={false}>
                  <Pressable
                    accessibilityLabel="Меню страницы"
                    hitSlop={4}
                    onPress={() => {
                      if (!isDesktop) {
                        setMobileSheetPageId(page.id);
                      } else if (menuPageId === page.id) {
                        setMenuPageId(null);
                      } else {
                        measureAnchor(menuBtnRefs.current[page.id], (rect) => {
                          setMenuAnchor(rect);
                          setMenuPageId(page.id);
                        });
                      }
                    }}
                    style={({ hovered }: { hovered?: boolean }) => [
                      styles.rowIconBtn,
                      !isDesktop ? styles.rowIconBtnMobile : null,
                      hovered || isMenuOpen ? { backgroundColor: iconHoverBg } : null,
                    ]}>
                    {({ hovered }: { hovered?: boolean }) => (
                      <AppIcon
                        name="more"
                        size="sm"
                        color={hovered || isMenuOpen ? colors.text : colors.muted}
                      />
                    )}
                  </Pressable>
                </View>

                <Pressable
                  accessibilityLabel="Добавить вложенную страницу"
                  hitSlop={4}
                  onPress={() => {
                    setMenuPageId(null);
                    setCollapsedIds((prev) => {
                      const next = new Set(prev);
                      next.delete(page.id);
                      return next;
                    });
                    onCreatePage(page.id);
                  }}
                  style={({ hovered }: { hovered?: boolean }) => [
                    styles.rowIconBtn,
                    !isDesktop ? styles.rowIconBtnMobile : null,
                    hovered ? { backgroundColor: iconHoverBg } : null,
                  ]}>
                  {({ hovered }: { hovered?: boolean }) => (
                    <AppIcon
                      name="plus"
                      size="sm"
                      color={hovered ? colors.text : colors.muted}
                    />
                  )}
                </Pressable>
              </View>
            ) : null}
          </WebDragBox>

          {rowDropMode === 'after' ? <View style={styles.pageDropLine} /> : null}

          {hasChildren && !isCollapsed ? renderTreeBranch(page.id, depth + 1) : null}
        </View>
      );
    });
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderRightColor: colors.line,
          borderColor: colors.line,
        },
        isDesktop ? styles.containerDesktop : styles.containerMobile,
      ]}>
      {/* Quick Find + New Page */}
      <View style={[styles.topBar, { borderBottomColor: colors.line }]}>
        <RipplePressable
          onPress={onOpenQuickFind}
          style={StyleSheet.flatten([
            styles.quickFindBtn,
            { backgroundColor: colors.surfaceSubtle },
          ])}>
          <AppIcon name="search" size="sm" color={colors.muted} />
          <Text style={[styles.quickFindText, { color: colors.muted }]} numberOfLines={1}>
            Поиск
          </Text>
          {isDesktop ? (
            <Text style={[styles.kbdHint, { color: colors.muted }]}>⌘K</Text>
          ) : null}
        </RipplePressable>

        <RipplePressable
          accessibilityLabel="Новая страница"
          onPress={() => onCreatePage(null)}
          style={StyleSheet.flatten([
            styles.newPageBtn,
            { backgroundColor: colors.surfaceSubtle },
          ])}>
          <AppIcon name="plus" size="sm" color={colors.text} />
        </RipplePressable>
      </View>

      {/* Mobile Quick Tabs: All / Favorites / Recent */}
      {!isDesktop ? (
        <View style={[styles.mobileTabsBar, { borderBottomColor: colors.line }]}>
          {(
            [
              { key: 'all', label: `Все (${pages.length})`, icon: null },
              { key: 'favorites', label: `${favorites.length}`, icon: 'star' },
              { key: 'recent', label: 'Недавние', icon: null },
            ] as const
          ).map((item) => {
            const active = mobileFilter === item.key;
            const fg = active ? colors.accentText : colors.muted;
            return (
              <RipplePressable
                key={item.key}
                onPress={() => setMobileFilter(item.key)}
                style={StyleSheet.flatten([
                  styles.mobileFilterPill,
                  {
                    backgroundColor: active ? colors.accent : colors.surfaceSubtle,
                  },
                ])}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  {item.icon ? (
                    <AppIcon
                      name={item.icon}
                      size="xs"
                      color={fg}
                      fill={active ? fg : 'none'}
                    />
                  ) : null}
                  <Text style={[styles.mobileFilterText, { color: fg }]}>
                    {item.label}
                  </Text>
                </View>
              </RipplePressable>
            );
          })}
        </View>
      ) : null}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {!isDesktop && mobileFilter !== 'all' ? (
          <View style={styles.section}>
            {(mobileFilter === 'favorites' ? favorites : recentPages).length === 0 ? (
              <Text style={[styles.mobileEmptyText, { color: colors.muted }]}>
                {mobileFilter === 'favorites'
                  ? 'Пока нет избранных страниц — отметьте звёздочкой любую заметку.'
                  : 'Пока нет недавних страниц'}
              </Text>
            ) : (
              (mobileFilter === 'favorites' ? favorites : recentPages).map((page) => {
                const isActive = page.id === activePageId;
                return (
                  <View
                    key={`m-${page.id}`}
                    style={[
                      styles.treeRow,
                      styles.treeRowMobile,
                      { paddingLeft: 12 },
                      isActive ? { backgroundColor: colors.surfaceActive } : null,
                    ]}>
                    <Pressable
                      onPress={() => onSelectPage(page.id)}
                      style={styles.mobileFlatHit}>
                      <AppIcon
                        name={resolveNotePageIcon(page.icon)}
                        size={17}
                        color={isActive ? colors.text : colors.muted}
                      />
                      <Text
                        style={[
                          styles.pageTitle,
                          styles.pageTitleMobile,
                          { color: colors.text },
                        ]}
                        numberOfLines={1}>
                        {page.title.trim() || 'Без названия'}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel="Меню страницы"
                      onPress={() => setMobileSheetPageId(page.id)}
                      style={[styles.rowIconBtn, styles.rowIconBtnMobile]}>
                      <AppIcon name="more" size="sm" color={colors.muted} />
                    </Pressable>
                  </View>
                );
              })
            )}
          </View>
        ) : (
          <>
            {isDesktop && favorites.length > 0 ? (
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
                      <AppIcon
                        name={resolveNotePageIcon(page.icon)}
                        size={15}
                        color={isActive ? colors.text : colors.muted}
                      />
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
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { color: colors.muted }]}>Личные страницы</Text>
                <Pressable
                  accessibilityLabel="Добавить корневую страницу"
                  onPress={() => onCreatePage(null)}
                  style={({ hovered }: { hovered?: boolean }) => [
                    styles.sectionAddBtn,
                    hovered ? { backgroundColor: iconHoverBg } : null,
                  ]}>
                  {({ hovered }: { hovered?: boolean }) => (
                    <AppIcon name="plus" size="xs" color={hovered ? colors.text : colors.muted} />
                  )}
                </Pressable>
              </View>

              {renderTreeBranch(null, 0)}

              {draggingPageId ? (
                <WebDragBox
                  onDragOver={(event) => {
                    event.preventDefault();
                    setRootDropHover(true);
                  }}
                  onDragLeave={() => setRootDropHover(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    const draggedId =
                      event.dataTransfer?.getData('text/sotaq-page') || draggingPageId;
                    setDraggingPageId(null);
                    setDropTarget(null);
                    setRootDropHover(false);
                    if (draggedId) {
                      onMovePage(draggedId, null);
                    }
                  }}
                  style={[
                    styles.rootDropZone,
                    {
                      borderColor: rootDropHover ? NOTION_DROP_BLUE : colors.line,
                      backgroundColor: rootDropHover
                        ? 'rgba(35, 131, 226, 0.12)'
                        : 'transparent',
                    },
                  ]}>
                  <Text
                    style={[
                      styles.rootDropText,
                      { color: rootDropHover ? NOTION_DROP_BLUE : colors.muted },
                    ]}>
                    Перетащите сюда, чтобы вынести в корень
                  </Text>
                </WebDragBox>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.line }]}>
        <RipplePressable
          onPress={() => onCreatePage(null)}
          style={StyleSheet.flatten([
            styles.footerBtn,
            !isDesktop ? styles.footerBtnMobile : null,
            { backgroundColor: isDesktop ? colors.surfaceSubtle : colors.accent },
          ])}>
          <Text
            style={[
              styles.footerBtnText,
              { color: isDesktop ? colors.text : colors.accentText },
            ]}>
            + Новая страница
          </Text>
        </RipplePressable>
      </View>

      {/* Floating Desktop Page Actions Popover — zero layout shift */}
      <AnchoredPopover
        visible={isDesktop && activeMenuPage !== null}
        anchor={menuAnchor}
        width={212}
        estimatedHeight={196}
        colors={colors}
        onClose={() => setMenuPageId(null)}>
        {activeMenuPage ? (
          <View style={styles.popoverList}>
            <Pressable
              onPress={() => startRename(activeMenuPage)}
              style={({ hovered }: { hovered?: boolean }) => [
                styles.pageMenuItem,
                hovered ? { backgroundColor: colors.surfaceSubtle } : null,
              ]}>
              <AppIcon name="edit" size="xs" color={colors.muted} />
              <Text style={[styles.pageMenuText, { color: colors.text }]}>Переименовать</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setMenuPageId(null);
                onToggleFavorite(activeMenuPage.id, !activeMenuPage.isFavorite);
              }}
              style={({ hovered }: { hovered?: boolean }) => [
                styles.pageMenuItem,
                hovered ? { backgroundColor: colors.surfaceSubtle } : null,
              ]}>
              <AppIcon
                name="star"
                size="xs"
                color={activeMenuPage.isFavorite ? colors.warning : colors.muted}
                fill={activeMenuPage.isFavorite ? colors.warning : 'none'}
              />
              <Text style={[styles.pageMenuText, { color: colors.text }]}>
                {activeMenuPage.isFavorite ? 'Убрать из избранного' : 'В избранное'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setMenuPageId(null);
                onDuplicatePage(activeMenuPage.id);
              }}
              style={({ hovered }: { hovered?: boolean }) => [
                styles.pageMenuItem,
                hovered ? { backgroundColor: colors.surfaceSubtle } : null,
              ]}>
              <AppIcon name="copy" size="xs" color={colors.muted} />
              <Text style={[styles.pageMenuText, { color: colors.text }]}>Дублировать</Text>
            </Pressable>
            {activeMenuPage.parentId !== null ? (
              <Pressable
                onPress={() => {
                  setMenuPageId(null);
                  onMovePage(activeMenuPage.id, null);
                }}
                style={({ hovered }: { hovered?: boolean }) => [
                  styles.pageMenuItem,
                  hovered ? { backgroundColor: colors.surfaceSubtle } : null,
                ]}>
                <AppIcon name="rootUp" size="xs" color={colors.muted} />
                <Text style={[styles.pageMenuText, { color: colors.text }]}>
                  Вынести в корень
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => {
                setMenuPageId(null);
                onDeletePage(activeMenuPage.id);
              }}
              style={({ hovered }: { hovered?: boolean }) => [
                styles.pageMenuItem,
                hovered ? { backgroundColor: colors.dangerBg } : null,
              ]}>
              <AppIcon name="trash" size="xs" color={colors.danger} />
              <Text style={[styles.pageMenuText, { color: colors.danger }]}>Удалить</Text>
            </Pressable>
          </View>
        ) : null}
      </AnchoredPopover>

      <DragTrashZone
        visible={draggingPageId !== null}
        label="Удалить страницу"
        colors={colors}
        onDropDelete={(event) => {
          const pageId =
            event.dataTransfer?.getData('text/sotaq-page') || draggingPageId;
          setDraggingPageId(null);
          setDropTarget(null);
          setRootDropHover(false);
          if (pageId) {
            onDeletePage(pageId);
          }
        }}
      />

      <MobilePageActionsSheet
        page={mobileSheetPage}
        allPages={pages}
        onClose={() => setMobileSheetPageId(null)}
        onRename={onRenamePage}
        onToggleFavorite={onToggleFavorite}
        onCreateChild={(parentId) => onCreatePage(parentId)}
        onDuplicate={onDuplicatePage}
        onMoveToParent={(pageId, parentId) => onMovePage(pageId, parentId)}
        onDelete={onDeletePage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  containerDesktop: {
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  containerMobile: {
    flex: 1,
  },
  mobileTabsBar: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mobileFilterPill: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 9,
    alignItems: 'center',
  },
  mobileFilterText: {
    fontSize: 12,
    fontWeight: '600',
  },
  mobileEmptyText: {
    fontSize: 13,
    lineHeight: 20,
    padding: 16,
    textAlign: 'center',
  },
  mobileFlatHit: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  treeRowMobile: {
    minHeight: 44,
    paddingVertical: 4,
    paddingRight: 8,
    borderRadius: 10,
  },
  chevronBtnMobile: {
    width: 26,
    height: 28,
  },
  pageIconMobile: {
    fontSize: 17,
  },
  pageTitleMobile: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowIconBtnMobile: {
    width: 34,
    height: 34,
    borderRadius: 9,
  },
  footerBtnMobile: {
    paddingVertical: 12,
    borderRadius: 12,
  },
  topBar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  quickFindBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  quickFindGlyph: {
    fontSize: 15,
  },
  quickFindText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  kbdHint: {
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.75,
  },
  newPageBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newPageGlyph: {
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 8,
    paddingVertical: 10,
    gap: 14,
  },
  section: {
    gap: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  sectionAddBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({ cursor: 'pointer', transition: 'background-color 110ms ease' } as object)
      : null),
  },
  sectionAddGlyph: {
    fontSize: 15,
    lineHeight: 17,
  },
  flatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 7,
  },
  treeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 32,
    paddingRight: 4,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: 'transparent',
    ...(Platform.OS === 'web'
      ? ({ transition: 'background-color 120ms ease', userSelect: 'none' } as object)
      : null),
  },
  rowMainWrap: {
    flex: 1,
    minWidth: 0,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  draggingRow: {
    opacity: 0.35,
  },
  dropInsideRow: {
    borderColor: NOTION_DROP_BLUE,
    backgroundColor: 'rgba(35, 131, 226, 0.14)',
  },
  pageDropLine: {
    height: 2,
    backgroundColor: NOTION_DROP_BLUE,
    borderRadius: 2,
    marginHorizontal: 8,
    marginVertical: 1,
  },
  chevronBtn: {
    width: 22,
    height: 22,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({ cursor: 'pointer', transition: 'background-color 110ms ease' } as object)
      : null),
  },
  chevronHidden: {
    opacity: 0.25,
  },
  chevronGlyph: {
    fontSize: 11,
  },
  pageIcon: {
    fontSize: 14,
  },
  pageTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  renameInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  },
  rowIconBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({ cursor: 'pointer', transition: 'background-color 110ms ease' } as object)
      : null),
  },
  rowIconGlyph: {
    fontSize: 14,
    lineHeight: 16,
  },
  popoverList: {
    gap: 2,
  },
  pageMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 7,
    ...(Platform.OS === 'web'
      ? ({ cursor: 'pointer', transition: 'background-color 110ms ease' } as object)
      : null),
  },
  leafDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  pageMenuText: {
    fontSize: 12,
    fontWeight: '500',
  },
  rootDropZone: {
    marginTop: 8,
    marginHorizontal: 6,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  rootDropText: {
    fontSize: 11,
    fontWeight: '600',
  },
  footer: {
    padding: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerBtn: {
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  footerBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
