import { type ComponentRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { RipplePressable } from '@/components/ripple-pressable';
import { createId, nowIso } from '@/db/client';
import { useDatabase } from '@/db/provider';
import { useAuth } from '@/features/auth/auth-context';
import { BlockRow } from '@/features/notes/components/block-row';
import { PageTree } from '@/features/notes/components/page-tree';
import {
  createNotePage,
  deleteNotePage,
  ensureInitialNotes,
  listNotePages,
  loadPageBlocks,
  savePageBlocks,
  searchNotePageIds,
  updateNotePage,
} from '@/features/notes/notes-repository';
import {
  BLOCK_TYPE_CATALOG,
  type NoteBlockRecord,
  type NoteBlockType,
  type NotePageRecord,
  PAGE_ICONS,
} from '@/features/notes/types';
import { useThemeColors, useViewport } from '@/theme/colors';

function computeNumberedIndices(blocks: NoteBlockRecord[]): number[] {
  const result: number[] = [];
  let running = 0;
  for (const block of blocks) {
    if (block.type === 'numbered') {
      running += 1;
      result.push(running);
    } else {
      running = 0;
      result.push(0);
    }
  }
  return result;
}

function makeBlock(pageId: string, type: NoteBlockType, position: number, content = ''): NoteBlockRecord {
  return {
    id: createId(),
    pageId,
    type,
    content,
    checked: false,
    collapsed: false,
    toggleBody: '',
    position,
    updatedAt: nowIso(),
  };
}

export function NotesWorkspace() {
  const db = useDatabase();
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const colors = useThemeColors();
  const { isDesktop } = useViewport();

  const [pages, setPages] = useState<NotePageRecord[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<NoteBlockRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [desktopTreeOpen, setDesktopTreeOpen] = useState(true);
  const [mobileMode, setMobileMode] = useState<'tree' | 'editor'>('tree');

  const [searchQuery, setSearchQuery] = useState('');
  const [matchingPageIds, setMatchingPageIds] = useState<Set<string>>(() => new Set());

  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [actionMenuBlockId, setActionMenuBlockId] = useState<string | null>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [confirmDeletePage, setConfirmDeletePage] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved');

  const inputRefs = useRef<Map<string, ComponentRef<typeof TextInput>>>(new Map());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<{ pageId: string; blocks: NoteBlockRecord[] } | null>(null);

  const registerInputRef = useCallback(
    (blockId: string, ref: ComponentRef<typeof TextInput> | null) => {
      if (ref) {
        inputRefs.current.set(blockId, ref);
      } else {
        inputRefs.current.delete(blockId);
      }
    },
    [],
  );

  const focusBlockSoon = useCallback((blockId: string) => {
    setFocusedBlockId(blockId);
    requestAnimationFrame(() => {
      inputRefs.current.get(blockId)?.focus();
    });
  }, []);

  const flushPendingSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = pendingSaveRef.current;
    if (!pending) {
      return;
    }
    pendingSaveRef.current = null;
    await savePageBlocks(db, pending.pageId, pending.blocks);
    setSaveState('saved');
  }, [db]);

  const scheduleBlocksSave = useCallback(
    (pageId: string, nextBlocks: NoteBlockRecord[], immediate = false) => {
      pendingSaveRef.current = { pageId, blocks: nextBlocks };
      setSaveState('saving');

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      if (immediate) {
        flushPendingSave();
        return;
      }

      saveTimerRef.current = setTimeout(() => {
        flushPendingSave();
      }, 280);
    },
    [flushPendingSave],
  );

  useEffect(() => {
    return () => {
      flushPendingSave();
    };
  }, [flushPendingSave]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    let cancelled = false;

    async function init() {
      const initialPages = await ensureInitialNotes(db, userId);
      if (cancelled) {
        return;
      }
      setPages(initialPages);
      const firstId = initialPages[0]?.id ?? null;
      if (firstId) {
        const initialBlocks = await loadPageBlocks(db, firstId);
        if (!cancelled) {
          setActivePageId(firstId);
          setBlocks(initialBlocks);
        }
      }
      if (!cancelled) {
        setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [db, userId]);

  useEffect(() => {
    if (!userId || searchQuery.trim().length === 0) {
      return;
    }
    let cancelled = false;

    async function runSearch() {
      const ids = await searchNotePageIds(db, userId, searchQuery);
      if (!cancelled) {
        setMatchingPageIds(ids);
      }
    }

    runSearch();

    return () => {
      cancelled = true;
    };
  }, [db, userId, searchQuery]);

  const pageById = useMemo(() => {
    const map = new Map<string, NotePageRecord>();
    for (const page of pages) {
      map.set(page.id, page);
    }
    return map;
  }, [pages]);

  const activePage = activePageId ? pageById.get(activePageId) ?? null : null;

  const breadcrumbs = useMemo(() => {
    const trail: NotePageRecord[] = [];
    let cursor = activePage;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      trail.unshift(cursor);
      cursor = cursor.parentId ? pageById.get(cursor.parentId) ?? null : null;
    }
    return trail;
  }, [activePage, pageById]);

  const childPages = useMemo(() => {
    if (!activePageId) {
      return [];
    }
    return pages.filter((page) => page.parentId === activePageId);
  }, [pages, activePageId]);

  async function selectPage(pageId: string) {
    await flushPendingSave();
    const nextBlocks = await loadPageBlocks(db, pageId);
    setActivePageId(pageId);
    setBlocks(nextBlocks);
    setFocusedBlockId(null);
    setActionMenuBlockId(null);
    setIconPickerOpen(false);
    setConfirmDeletePage(false);
    setMobileMode('editor');
  }

  async function handleCreatePage(parentId?: string | null) {
    if (!userId) {
      return;
    }
    await flushPendingSave();
    const created = await createNotePage(db, userId, { parentId: parentId ?? null });
    const updatedPages = await listNotePages(db, userId);
    const createdBlocks = await loadPageBlocks(db, created.id);
    setPages(updatedPages);
    setActivePageId(created.id);
    setBlocks(createdBlocks);
    setIconPickerOpen(false);
    setConfirmDeletePage(false);
    setMobileMode('editor');
    if (createdBlocks[0]) {
      focusBlockSoon(createdBlocks[0].id);
    }
  }

  async function handleUpdatePageMeta(patch: {
    title?: string;
    icon?: string;
    isFavorite?: boolean;
  }) {
    if (!activePageId) {
      return;
    }
    setPages((prev) =>
      prev.map((page) => (page.id === activePageId ? { ...page, ...patch } : page)),
    );
    await updateNotePage(db, activePageId, patch);
  }

  async function handleDeleteCurrentPage() {
    if (!activePageId || !userId) {
      return;
    }
    if (!confirmDeletePage) {
      setConfirmDeletePage(true);
      return;
    }

    await flushPendingSave();
    const deletingId = activePageId;
    await deleteNotePage(db, deletingId);
    let nextPages = await listNotePages(db, userId);
    if (nextPages.length === 0) {
      const fresh = await createNotePage(db, userId, { title: 'Новая заметка', icon: '📝' });
      nextPages = [fresh];
    }

    setPages(nextPages);
    setConfirmDeletePage(false);
    const fallback = nextPages[0];
    const fallbackBlocks = await loadPageBlocks(db, fallback.id);
    setActivePageId(fallback.id);
    setBlocks(fallbackBlocks);
    if (!isDesktop) {
      setMobileMode('tree');
    }
  }

  function mutateBlocks(
    updater: (prev: NoteBlockRecord[]) => NoteBlockRecord[],
    options?: { immediate?: boolean; focusId?: string | null },
  ) {
    if (!activePageId) {
      return;
    }
    setBlocks((prev) => {
      const next = updater(prev).map((block, index) => ({ ...block, position: index }));
      scheduleBlocksSave(activePageId, next, options?.immediate ?? false);
      return next;
    });
    if (options?.focusId) {
      focusBlockSoon(options.focusId);
    }
  }

  function handleChangeContent(blockId: string, content: string) {
    mutateBlocks((prev) =>
      prev.map((block) => (block.id === blockId ? { ...block, content } : block)),
    );
  }

  function handleChangeToggleBody(blockId: string, toggleBody: string) {
    mutateBlocks((prev) =>
      prev.map((block) => (block.id === blockId ? { ...block, toggleBody } : block)),
    );
  }

  function handleConvertType(blockId: string, nextType: NoteBlockType, nextContent?: string) {
    if (!activePageId) {
      return;
    }
    setActionMenuBlockId(null);

    if (nextType === 'divider') {
      const freshAfter = makeBlock(activePageId, 'paragraph', 0);
      mutateBlocks(
        (prev) => {
          const idx = prev.findIndex((b) => b.id === blockId);
          if (idx === -1) {
            return prev;
          }
          const copy = [...prev];
          copy[idx] = { ...copy[idx], type: 'divider', content: '' };
          copy.splice(idx + 1, 0, freshAfter);
          return copy;
        },
        { immediate: true, focusId: freshAfter.id },
      );
      return;
    }

    mutateBlocks(
      (prev) =>
        prev.map((block) =>
          block.id === blockId
            ? {
                ...block,
                type: nextType,
                content: nextContent !== undefined ? nextContent : block.content,
              }
            : block,
        ),
      { immediate: true, focusId: blockId },
    );
  }

  function handleEnter(blockId: string) {
    if (!activePageId) {
      return;
    }
    const idx = blocks.findIndex((b) => b.id === blockId);
    if (idx === -1) {
      return;
    }
    const current = blocks[idx];

    // Pressing Enter on an empty list/todo item exits the list back to a paragraph.
    const isList =
      current.type === 'bullet' || current.type === 'numbered' || current.type === 'todo';
    if (isList && current.content.trim().length === 0) {
      handleConvertType(blockId, 'paragraph', '');
      return;
    }

    const nextType: NoteBlockType = isList ? current.type : 'paragraph';
    const created = makeBlock(activePageId, nextType, idx + 1);

    mutateBlocks(
      (prev) => {
        const copy = [...prev];
        const pos = copy.findIndex((b) => b.id === blockId);
        copy.splice(pos + 1, 0, created);
        return copy;
      },
      { immediate: true, focusId: created.id },
    );
  }

  function handleBackspaceEmpty(blockId: string) {
    const idx = blocks.findIndex((b) => b.id === blockId);
    if (idx === -1) {
      return;
    }
    const current = blocks[idx];

    if (current.type !== 'paragraph') {
      handleConvertType(blockId, 'paragraph', '');
      return;
    }

    if (blocks.length <= 1) {
      return;
    }

    const prevBlock = blocks[idx - 1] ?? blocks[idx + 1];
    mutateBlocks(
      (prev) => prev.filter((b) => b.id !== blockId),
      { immediate: true, focusId: prevBlock?.id ?? null },
    );
  }

  function handleMoveBlock(blockId: string, direction: -1 | 1) {
    mutateBlocks(
      (prev) => {
        const idx = prev.findIndex((b) => b.id === blockId);
        const target = idx + direction;
        if (idx === -1 || target < 0 || target >= prev.length) {
          return prev;
        }
        const copy = [...prev];
        const [item] = copy.splice(idx, 1);
        copy.splice(target, 0, item);
        return copy;
      },
      { immediate: true },
    );
  }

  function handleDuplicateBlock(blockId: string) {
    if (!activePageId) {
      return;
    }
    setActionMenuBlockId(null);
    const source = blocks.find((b) => b.id === blockId);
    if (!source) {
      return;
    }
    const copyBlock: NoteBlockRecord = {
      ...source,
      id: createId(),
      updatedAt: nowIso(),
    };
    mutateBlocks(
      (prev) => {
        const idx = prev.findIndex((b) => b.id === blockId);
        const copy = [...prev];
        copy.splice(idx + 1, 0, copyBlock);
        return copy;
      },
      { immediate: true, focusId: copyBlock.id },
    );
  }

  function handleDeleteBlock(blockId: string) {
    if (!activePageId) {
      return;
    }
    setActionMenuBlockId(null);
    if (blocks.length <= 1) {
      mutateBlocks(
        () => [makeBlock(activePageId, 'paragraph', 0)],
        { immediate: true },
      );
      return;
    }
    mutateBlocks(
      (prev) => prev.filter((b) => b.id !== blockId),
      { immediate: true },
    );
  }

  function handleAppendBlock(type: NoteBlockType = 'paragraph') {
    if (!activePageId) {
      return;
    }
    const created = makeBlock(activePageId, type, blocks.length);
    mutateBlocks(
      (prev) => [...prev, created],
      { immediate: true, focusId: type === 'divider' ? null : created.id },
    );
  }

  function handleQuickFormat(type: NoteBlockType) {
    if (focusedBlockId && blocks.some((b) => b.id === focusedBlockId)) {
      handleConvertType(focusedBlockId, type);
    } else {
      handleAppendBlock(type);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator size="small" color={colors.text} />
      </View>
    );
  }

  const showTreePane = isDesktop ? desktopTreeOpen : mobileMode === 'tree';
  const showEditorPane = isDesktop || mobileMode === 'editor';

  const numberedIndices = computeNumberedIndices(blocks);

  const focusedBlock = blocks.find((b) => b.id === focusedBlockId) ?? null;

  return (
    <View style={[styles.screen, isDesktop ? styles.screenDesktop : styles.screenMobile]}>
      <View style={[styles.split, isDesktop ? styles.splitDesktop : styles.splitMobile]}>
        {showTreePane ? (
          <View style={isDesktop ? styles.desktopTreePane : styles.mobileFullPane}>
            <PageTree
              pages={pages}
              activePageId={activePageId}
              searchQuery={searchQuery}
              matchingPageIds={matchingPageIds}
              colors={colors}
              onSearchChange={setSearchQuery}
              onSelectPage={selectPage}
              onCreatePage={handleCreatePage}
            />
          </View>
        ) : null}

        {showEditorPane && activePage ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[
              styles.editorCard,
              { backgroundColor: colors.surface, borderColor: colors.line },
            ]}>
            {/* Editor Top Bar */}
            <View style={[styles.editorTopBar, { borderBottomColor: colors.line }]}>
              <View style={styles.topLeft}>
                {isDesktop ? (
                  <RipplePressable
                    accessibilityLabel="Показать или скрыть дерево страниц"
                    onPress={() => setDesktopTreeOpen((value) => !value)}
                    style={StyleSheet.flatten([
                      styles.topIconBtn,
                      { backgroundColor: colors.surfaceSubtle },
                    ])}>
                    <Text style={[styles.topIconGlyph, { color: colors.text }]}>☰</Text>
                  </RipplePressable>
                ) : (
                  <RipplePressable
                    onPress={async () => {
                      await flushPendingSave();
                      setMobileMode('tree');
                    }}
                    style={StyleSheet.flatten([
                      styles.backBtn,
                      { backgroundColor: colors.surfaceSubtle },
                    ])}>
                    <Text style={[styles.backBtnText, { color: colors.text }]}>← Страницы</Text>
                  </RipplePressable>
                )}

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.breadcrumbs}>
                  {breadcrumbs.map((crumb, idx) => {
                    const isLast = idx === breadcrumbs.length - 1;
                    return (
                      <View key={crumb.id} style={styles.crumbItem}>
                        {idx > 0 ? (
                          <Text style={[styles.crumbSep, { color: colors.muted }]}>/</Text>
                        ) : null}
                        <RipplePressable
                          disabled={isLast}
                          onPress={() => selectPage(crumb.id)}
                          style={styles.crumbBtn}>
                          <Text
                            style={[
                              styles.crumbText,
                              { color: isLast ? colors.text : colors.muted },
                            ]}
                            numberOfLines={1}>
                            {crumb.icon} {crumb.title.trim() || 'Без названия'}
                          </Text>
                        </RipplePressable>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.topRight}>
                <Text style={[styles.saveText, { color: colors.muted }]}>
                  {saveState === 'saving' ? 'Сохранение…' : 'Сохранено'}
                </Text>

                <RipplePressable
                  accessibilityLabel={
                    activePage.isFavorite ? 'Убрать из избранного' : 'В избранное'
                  }
                  onPress={() =>
                    handleUpdatePageMeta({ isFavorite: !activePage.isFavorite })
                  }
                  style={StyleSheet.flatten([
                    styles.topIconBtn,
                    { backgroundColor: colors.surfaceSubtle },
                  ])}>
                  <Text
                    style={[
                      styles.topIconGlyph,
                      { color: activePage.isFavorite ? colors.warning : colors.muted },
                    ]}>
                    {activePage.isFavorite ? '★' : '☆'}
                  </Text>
                </RipplePressable>

                <RipplePressable
                  accessibilityLabel="Создать вложенную страницу"
                  onPress={() => handleCreatePage(activePage.id)}
                  style={StyleSheet.flatten([
                    styles.topIconBtn,
                    { backgroundColor: colors.surfaceSubtle },
                  ])}>
                  <Text style={[styles.topIconGlyph, { color: colors.text }]}>+</Text>
                </RipplePressable>

                <RipplePressable
                  accessibilityLabel="Удалить страницу"
                  onPress={handleDeleteCurrentPage}
                  style={StyleSheet.flatten([
                    styles.deletePageBtn,
                    {
                      backgroundColor: confirmDeletePage
                        ? colors.danger
                        : colors.surfaceSubtle,
                    },
                  ])}>
                  <Text
                    style={[
                      styles.deletePageText,
                      { color: confirmDeletePage ? '#FFFFFF' : colors.muted },
                    ]}>
                    {confirmDeletePage ? 'Удалить?' : '×'}
                  </Text>
                </RipplePressable>
              </View>
            </View>

            {/* Document Canvas */}
            <ScrollView
              style={styles.canvasScroll}
              contentContainerStyle={[
                styles.canvasContent,
                isDesktop ? styles.canvasContentDesktop : styles.canvasContentMobile,
              ]}
              keyboardShouldPersistTaps="handled">
              <View style={styles.pageContainer}>
                {/* Page Icon + Title */}
                <View style={styles.pageHeader}>
                  <RipplePressable
                    accessibilityLabel="Сменить иконку страницы"
                    onPress={() => setIconPickerOpen((value) => !value)}
                    style={StyleSheet.flatten([
                      styles.pageIconBtn,
                      { backgroundColor: colors.surfaceSubtle },
                    ])}>
                    <Text style={styles.pageIconLarge}>{activePage.icon}</Text>
                  </RipplePressable>

                  {iconPickerOpen ? (
                    <View
                      style={[
                        styles.iconPicker,
                        { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                      ]}>
                      {PAGE_ICONS.map((emoji) => (
                        <RipplePressable
                          key={emoji}
                          onPress={() => {
                            handleUpdatePageMeta({ icon: emoji });
                            setIconPickerOpen(false);
                          }}
                          style={StyleSheet.flatten([
                            styles.emojiOption,
                            activePage.icon === emoji
                              ? { backgroundColor: colors.surfaceActive }
                              : null,
                          ])}>
                          <Text style={styles.emojiGlyph}>{emoji}</Text>
                        </RipplePressable>
                      ))}
                    </View>
                  ) : null}

                  <TextInput
                    value={activePage.title}
                    onChangeText={(nextTitle) => handleUpdatePageMeta({ title: nextTitle })}
                    onSubmitEditing={() => {
                      if (blocks[0]) {
                        focusBlockSoon(blocks[0].id);
                      }
                    }}
                    placeholder="Без названия"
                    placeholderTextColor={colors.muted}
                    returnKeyType="next"
                    style={[styles.pageTitleInput, { color: colors.text }]}
                  />
                </View>

                {/* Blocks */}
                <View style={styles.blocksList}>
                  {blocks.map((block, idx) => (
                    <BlockRow
                      key={block.id}
                      block={block}
                      index={idx}
                      totalBlocks={blocks.length}
                      numberedIndex={numberedIndices[idx]}
                      isFocused={focusedBlockId === block.id}
                      isActionMenuOpen={actionMenuBlockId === block.id}
                      isDesktop={isDesktop}
                      colors={colors}
                      registerInputRef={registerInputRef}
                      onFocus={() => {
                        setFocusedBlockId(block.id);
                        setConfirmDeletePage(false);
                      }}
                      onToggleActionMenu={() =>
                        setActionMenuBlockId((current) =>
                          current === block.id ? null : block.id,
                        )
                      }
                      onChangeContent={(content) => handleChangeContent(block.id, content)}
                      onChangeToggleBody={(body) => handleChangeToggleBody(block.id, body)}
                      onConvertType={(type, nextContent) =>
                        handleConvertType(block.id, type, nextContent)
                      }
                      onToggleChecked={() =>
                        mutateBlocks(
                          (prev) =>
                            prev.map((item) =>
                              item.id === block.id
                                ? { ...item, checked: !item.checked }
                                : item,
                            ),
                          { immediate: true },
                        )
                      }
                      onToggleCollapsed={() =>
                        mutateBlocks(
                          (prev) =>
                            prev.map((item) =>
                              item.id === block.id
                                ? { ...item, collapsed: !item.collapsed }
                                : item,
                            ),
                          { immediate: true },
                        )
                      }
                      onEnter={() => handleEnter(block.id)}
                      onBackspaceEmpty={() => handleBackspaceEmpty(block.id)}
                      onMoveBlock={(dir) => handleMoveBlock(block.id, dir)}
                      onDuplicateBlock={() => handleDuplicateBlock(block.id)}
                      onDeleteBlock={() => handleDeleteBlock(block.id)}
                    />
                  ))}
                </View>

                {/* Click empty canvas below to keep writing */}
                <Pressable
                  onPress={() => {
                    const last = blocks[blocks.length - 1];
                    if (last && last.type === 'paragraph' && last.content.length === 0) {
                      focusBlockSoon(last.id);
                    } else {
                      handleAppendBlock('paragraph');
                    }
                  }}
                  style={styles.tailTapArea}>
                  <Text style={[styles.tailHint, { color: colors.muted }]}>
                    + Нажмите, чтобы продолжить писать или введите /
                  </Text>
                </Pressable>

                {/* Nested Child Pages Preview (Notion-style) */}
                {childPages.length > 0 ? (
                  <View style={[styles.subpagesSection, { borderTopColor: colors.line }]}>
                    <Text style={[styles.subpagesLabel, { color: colors.muted }]}>
                      Вложенные страницы
                    </Text>
                    <View style={styles.subpagesList}>
                      {childPages.map((child) => (
                        <RipplePressable
                          key={child.id}
                          onPress={() => selectPage(child.id)}
                          style={StyleSheet.flatten([
                            styles.subpageCard,
                            { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                          ])}>
                          <Text style={styles.subpageIcon}>{child.icon}</Text>
                          <Text style={[styles.subpageTitle, { color: colors.text }]}>
                            {child.title.trim() || 'Без названия'}
                          </Text>
                          <Text style={[styles.subpageArrow, { color: colors.muted }]}>→</Text>
                        </RipplePressable>
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            </ScrollView>

            {/* Quick Format Toolbar */}
            <View
              style={[
                styles.formatBar,
                { backgroundColor: colors.surface, borderTopColor: colors.line },
              ]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="always"
                contentContainerStyle={styles.formatBarContent}>
                <RipplePressable
                  onPress={() => handleAppendBlock('paragraph')}
                  style={StyleSheet.flatten([
                    styles.formatChip,
                    { backgroundColor: colors.accent },
                  ])}>
                  <Text style={[styles.formatChipText, { color: colors.accentText }]}>+ Блок</Text>
                </RipplePressable>

                {BLOCK_TYPE_CATALOG.map((item) => {
                  const active = focusedBlock?.type === item.type;
                  return (
                    <RipplePressable
                      key={item.type}
                      accessibilityLabel={item.label}
                      onPress={() => handleQuickFormat(item.type)}
                      style={StyleSheet.flatten([
                        styles.formatChip,
                        {
                          backgroundColor: active
                            ? colors.surfaceActive
                            : colors.surfaceSubtle,
                        },
                      ])}>
                      <Text
                        style={[
                          styles.formatChipText,
                          { color: active ? colors.text : colors.muted },
                        ]}>
                        {item.shortLabel}
                      </Text>
                    </RipplePressable>
                  );
                })}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screen: {
    flex: 1,
  },
  screenDesktop: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  screenMobile: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  split: {
    flex: 1,
    minHeight: 0,
  },
  splitDesktop: {
    flexDirection: 'row',
    gap: 14,
  },
  splitMobile: {
    flexDirection: 'column',
  },
  desktopTreePane: {
    width: 264,
  },
  mobileFullPane: {
    flex: 1,
  },
  editorCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  editorTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  topIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topIconGlyph: {
    fontSize: 15,
    fontWeight: '600',
  },
  backBtn: {
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  breadcrumbs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  crumbItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  crumbSep: {
    fontSize: 12,
  },
  crumbBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
    maxWidth: 160,
  },
  crumbText: {
    fontSize: 12,
    fontWeight: '600',
  },
  saveText: {
    fontSize: 11,
    fontWeight: '500',
    marginRight: 2,
  },
  deletePageBtn: {
    minWidth: 30,
    height: 30,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deletePageText: {
    fontSize: 13,
    fontWeight: '600',
  },
  canvasScroll: {
    flex: 1,
  },
  canvasContent: {
    flexGrow: 1,
    alignItems: 'center',
  },
  canvasContentDesktop: {
    paddingHorizontal: 40,
    paddingTop: 36,
    paddingBottom: 60,
  },
  canvasContentMobile: {
    paddingHorizontal: 12,
    paddingTop: 20,
    paddingBottom: 40,
  },
  pageContainer: {
    width: '100%',
    maxWidth: 720,
    gap: 8,
  },
  pageHeader: {
    gap: 10,
    paddingLeft: 28,
    marginBottom: 8,
  },
  pageIconBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageIconLarge: {
    fontSize: 28,
  },
  iconPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    padding: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emojiOption: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiGlyph: {
    fontSize: 18,
  },
  pageTitleInput: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.7,
    paddingVertical: 4,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  blocksList: {
    gap: 2,
  },
  tailTapArea: {
    paddingLeft: 30,
    paddingVertical: 18,
    minHeight: 90,
  },
  tailHint: {
    fontSize: 13,
    opacity: 0.45,
  },
  subpagesSection: {
    marginTop: 12,
    paddingTop: 16,
    paddingLeft: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  subpagesLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subpagesList: {
    gap: 6,
  },
  subpageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  subpageIcon: {
    fontSize: 15,
  },
  subpageTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  subpageArrow: {
    fontSize: 14,
  },
  formatBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  formatBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  formatChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  formatChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
