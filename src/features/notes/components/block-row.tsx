import { type ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputKeyPressEvent,
  View,
} from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { WebDragBox, type WebDomDragEvent } from '@/components/web-drag-box';
import {
  BlockContextMenu,
  type PopoverAnchor,
} from '@/features/notes/components/block-context-menu';
import { filterBlockCatalog, SlashMenu } from '@/features/notes/components/slash-menu';
import {
  BLOCK_COLORS,
  detectMarkdownShortcut,
  getBlockTypeIcon,
  NOTION_DROP_BLUE,
  type NoteBlockColor,
  type NoteBlockRecord,
  type NoteBlockType,
  type NotePageRecord,
} from '@/features/notes/types';
import { useResolvedColorScheme } from '@/hooks/use-resolved-color-scheme';
import type { ThemeColors } from '@/theme/colors';

export type BlockDropPosition = 'before' | 'after' | 'nest';

type Props = {
  block: NoteBlockRecord;
  index: number;
  totalBlocks: number;
  numberedIndex: number;
  canIndent: boolean;
  linkedPage: NotePageRecord | null;
  isFocused: boolean;
  isContextMenuOpen: boolean;
  isInsertMenuOpen: boolean;
  isDragging: boolean;
  isBlockDragActive: boolean;
  dropIndicator: BlockDropPosition | null;
  isDesktop: boolean;
  reorderMode: boolean;
  colors: ThemeColors;
  registerInputRef: (blockId: string, ref: ComponentRef<typeof TextInput> | null) => void;
  onFocus: () => void;
  onToggleContextMenu: () => void;
  onToggleInsertMenu: () => void;
  onCloseMenus: () => void;
  onChangeContent: (content: string) => void;
  onChangeToggleBody: (body: string) => void;
  onConvertType: (type: NoteBlockType, nextContent?: string) => void;
  onInsertBlockBelow: (type: NoteBlockType) => void;
  onChangeColor: (color: NoteBlockColor) => void;
  onIndent: (delta: -1 | 1) => void;
  onToggleChecked: () => void;
  onToggleCollapsed: () => void;
  onEnterSplit: (beforeCursor: string, afterCursor: string) => void;
  onBackspaceAtStart: () => void;
  onFocusNeighbor: (direction: -1 | 1) => void;
  onMoveBlock: (direction: -1 | 1) => void;
  onDuplicateBlock: () => void;
  onDeleteBlock: () => void;
  onOpenLinkedPage: (pageId: string) => void;
  onDragStartBlock: (blockId: string) => void;
  onDragEndBlock: () => void;
  onDragHoverBlock: (blockId: string, position: BlockDropPosition) => void;
  onDragLeaveBlock: (blockId: string) => void;
  onDropOnBlock: (draggedId: string, targetId: string, position: BlockDropPosition) => void;
};

const MONOSPACE_FONT = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

function gutterTopOffsetForType(type: NoteBlockType): number {
  switch (type) {
    case 'h1':
      return 7;
    case 'h2':
      return 4;
    case 'h3':
      return 2;
    case 'h4':
      return 0;
    case 'callout':
      return 14;
    case 'code':
      return 12;
    case 'divider':
      return 0;
    default:
      return 1;
  }
}

function minHeightForType(type: NoteBlockType): number {
  switch (type) {
    case 'h1':
      return 40;
    case 'h2':
      return 34;
    case 'h3':
      return 30;
    case 'h4':
      return 26;
    case 'code':
      return 24;
    default:
      return 28;
  }
}

type WebTextareaNode = {
  style?: { height: string };
  scrollHeight?: number;
};

function syncWebTextareaHeight(
  node: ComponentRef<typeof TextInput> | null,
  value: string,
  minHeight: number,
) {
  if (Platform.OS !== 'web' || !node) return;
  const el = node as unknown as WebTextareaNode;
  if (!el.style) return;
  if (value.length === 0) {
    el.style.height = `${minHeight}px`;
    return;
  }
  el.style.height = 'auto';
  const measured = Math.max(minHeight, Math.ceil(el.scrollHeight ?? minHeight));
  el.style.height = `${measured}px`;
}

export function BlockRow({
  block,
  index,
  totalBlocks,
  numberedIndex,
  canIndent,
  linkedPage,
  isFocused,
  isContextMenuOpen,
  isInsertMenuOpen,
  isDragging,
  isBlockDragActive,
  dropIndicator,
  isDesktop,
  reorderMode,
  colors,
  registerInputRef,
  onFocus,
  onToggleContextMenu,
  onToggleInsertMenu,
  onCloseMenus,
  onChangeContent,
  onChangeToggleBody,
  onConvertType,
  onInsertBlockBelow,
  onChangeColor,
  onIndent,
  onToggleChecked,
  onToggleCollapsed,
  onEnterSplit,
  onBackspaceAtStart,
  onFocusNeighbor,
  onMoveBlock,
  onDuplicateBlock,
  onDeleteBlock,
  onOpenLinkedPage,
  onDragStartBlock,
  onDragEndBlock,
  onDragHoverBlock,
  onDragLeaveBlock,
  onDropOnBlock,
}: Props) {
  const scheme = useResolvedColorScheme();
  const [hovered, setHovered] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [menuAnchor, setMenuAnchor] = useState<PopoverAnchor | null>(null);
  const plusBtnRef = useRef<ComponentRef<typeof View>>(null);
  const handleBtnRef = useRef<ComponentRef<typeof View>>(null);
  const localInputRef = useRef<ComponentRef<typeof TextInput> | null>(null);
  const toggleBodyRef = useRef<ComponentRef<typeof TextInput> | null>(null);
  const selectionRef = useRef<{ start: number; end: number }>({
    start: block.content.length,
    end: block.content.length,
  });

  const minHeight = minHeightForType(block.type);
  const toggleBodyMinHeight = 25;

  const syncMainHeight = useCallback(() => {
    syncWebTextareaHeight(localInputRef.current, block.content, minHeight);
  }, [block.content, minHeight]);

  const syncToggleHeight = useCallback(() => {
    syncWebTextareaHeight(toggleBodyRef.current, block.toggleBody, toggleBodyMinHeight);
  }, [block.toggleBody]);

  useEffect(() => {
    syncMainHeight();
  }, [syncMainHeight, isDesktop, reorderMode]);

  useEffect(() => {
    if (block.type === 'toggle' && !block.collapsed) {
      syncToggleHeight();
    }
  }, [block.type, block.collapsed, syncToggleHeight]);

  function measureAndRun(
    ref: { current: ComponentRef<typeof View> | null },
    callback: () => void,
  ) {
    if (ref.current && typeof ref.current.measureInWindow === 'function') {
      ref.current.measureInWindow((x, y, width, height) => {
        setMenuAnchor({ x, y, width, height });
        callback();
      });
    } else {
      setMenuAnchor({ x: 80, y: 140, width: 24, height: 24 });
      callback();
    }
  }

  const showSlashMenu =
    isFocused &&
    block.type !== 'code' &&
    block.type !== 'divider' &&
    block.type !== 'page' &&
    block.content.startsWith('/');
  const slashQuery = showSlashMenu ? block.content.slice(1) : '';
  const slashItems = showSlashMenu ? filterBlockCatalog(slashQuery) : [];
  const clampedSlashIndex =
    slashItems.length > 0 ? Math.min(slashIndex, slashItems.length - 1) : 0;

  const activeColorMeta = BLOCK_COLORS[block.blockColor] ?? BLOCK_COLORS.default;
  const blockTintBg =
    block.blockColor === 'default'
      ? 'transparent'
      : scheme === 'dark'
        ? activeColorMeta.darkBg
        : activeColorMeta.lightBg;

  const showGutter = hovered || isFocused || isContextMenuOpen || isInsertMenuOpen;

  function handleTextChange(nextText: string) {
    if (nextText.startsWith('/')) {
      setSlashIndex(0);
    }

    // Mobile & fallback Enter handling when newline arrives inside onChangeText
    if (block.type !== 'code' && nextText.includes('\n')) {
      if (showSlashMenu && slashItems[clampedSlashIndex]) {
        onConvertType(slashItems[clampedSlashIndex].type, '');
        return;
      }
      const newlinePos = nextText.indexOf('\n');
      const before = nextText.slice(0, newlinePos).replace(/\n/g, '');
      const after = nextText.slice(newlinePos + 1).replace(/\n/g, '');
      onEnterSplit(before, after);
      return;
    }

    if (block.type === 'paragraph') {
      const shortcut = detectMarkdownShortcut(nextText);
      if (shortcut) {
        onConvertType(shortcut.type, shortcut.rest);
        return;
      }
    }

    onChangeContent(nextText);
  }

  function handleKeyPress(event: TextInputKeyPressEvent) {
    const native = event.nativeEvent as unknown as {
      key: string;
      shiftKey?: boolean;
      metaKey?: boolean;
      ctrlKey?: boolean;
      altKey?: boolean;
    };
    const key = native.key;
    const mod = Boolean(native.metaKey || native.ctrlKey);
    const shift = Boolean(native.shiftKey);
    const alt = Boolean(native.altKey);

    // 1. Slash menu keyboard navigation
    if (showSlashMenu) {
      if (key === 'Escape') {
        if (Platform.OS === 'web') event.preventDefault();
        onChangeContent('');
        return;
      }
      if (key === 'ArrowDown' && slashItems.length > 0) {
        if (Platform.OS === 'web') event.preventDefault();
        setSlashIndex((prev) => (prev + 1) % slashItems.length);
        return;
      }
      if (key === 'ArrowUp' && slashItems.length > 0) {
        if (Platform.OS === 'web') event.preventDefault();
        setSlashIndex((prev) => (prev - 1 + slashItems.length) % slashItems.length);
        return;
      }
      if (key === 'Enter' && slashItems[clampedSlashIndex]) {
        if (Platform.OS === 'web') event.preventDefault();
        onConvertType(slashItems[clampedSlashIndex].type, '');
        return;
      }
    }

    // 2. Notion power shortcuts
    if (mod && key.toLowerCase() === 'd') {
      if (Platform.OS === 'web') event.preventDefault();
      onDuplicateBlock();
      return;
    }
    if (mod && shift && key === 'ArrowUp') {
      if (Platform.OS === 'web') event.preventDefault();
      onMoveBlock(-1);
      return;
    }
    if (mod && shift && key === 'ArrowDown') {
      if (Platform.OS === 'web') event.preventDefault();
      onMoveBlock(1);
      return;
    }
    if (mod && alt && (key === '1' || key === '2' || key === '3' || key === '4')) {
      if (Platform.OS === 'web') event.preventDefault();
      onConvertType(
        key === '1' ? 'h1' : key === '2' ? 'h2' : key === '3' ? 'h3' : 'h4',
      );
      return;
    }

    // 3. Tab / Shift+Tab indentation
    if (key === 'Tab') {
      if (Platform.OS === 'web') event.preventDefault();
      onIndent(shift ? -1 : 1);
      return;
    }

    // 4. Backspace at cursor 0 -> reset type / outdent / merge with previous block
    if (
      key === 'Backspace' &&
      selectionRef.current.start === 0 &&
      selectionRef.current.end === 0
    ) {
      if (Platform.OS === 'web') event.preventDefault();
      onBackspaceAtStart();
      return;
    }

    // 5. Enter -> split block at cursor position (except code blocks & Shift+Enter)
    if (key === 'Enter' && block.type !== 'code' && !shift) {
      if (Platform.OS === 'web') event.preventDefault();
      const { start, end } = selectionRef.current;
      const safeStart = Math.max(0, Math.min(start, block.content.length));
      const safeEnd = Math.max(safeStart, Math.min(end, block.content.length));
      const before = block.content.slice(0, safeStart);
      const after = block.content.slice(safeEnd);
      onEnterSplit(before, after);
      return;
    }

    // 6. ArrowUp / ArrowDown block-to-block navigation
    if (key === 'ArrowUp' && !shift && !mod) {
      const atStart = selectionRef.current.start === 0;
      const isSingleLine = !block.content.includes('\n') && block.content.length < 70;
      if (atStart || isSingleLine) {
        if (Platform.OS === 'web') event.preventDefault();
        onFocusNeighbor(-1);
      }
      return;
    }

    if (key === 'ArrowDown' && !shift && !mod) {
      const atEnd = selectionRef.current.end >= block.content.length;
      const isSingleLine = !block.content.includes('\n') && block.content.length < 70;
      if (atEnd || isSingleLine) {
        if (Platform.OS === 'web') event.preventDefault();
        onFocusNeighbor(1);
      }
    }
  }

  function getPlaceholder(): string {
    switch (block.type) {
      case 'h1':
        return 'Заголовок 1';
      case 'h2':
        return 'Заголовок 2';
      case 'h3':
        return 'Заголовок 3';
      case 'h4':
        return 'Заголовок 4';
      case 'bullet':
      case 'numbered':
        return 'Элемент списка';
      case 'todo':
        return 'Задача…';
      case 'quote':
        return 'Цитата…';
      case 'callout':
        return 'Важная мысль…';
      case 'code':
        return 'Напишите код…';
      case 'toggle':
        return 'Заголовок раскрывающегося блока…';
      default:
        return isFocused ? 'Введите / для команд или начните писать…' : '';
    }
  }

  function getTextStyle() {
    switch (block.type) {
      case 'h1':
        return [styles.h1Text, { color: colors.text }];
      case 'h2':
        return [styles.h2Text, { color: colors.text }];
      case 'h3':
        return [styles.h3Text, { color: colors.text }];
      case 'h4':
        return [styles.h4Text, { color: colors.text }];
      case 'quote':
        return [styles.quoteText, { color: colors.muted }];
      case 'code':
        return [styles.codeText, { color: colors.text }];
      case 'todo':
        return [
          styles.bodyText,
          { color: block.checked ? colors.muted : colors.text },
          block.checked ? styles.strikethrough : null,
        ];
      case 'toggle':
        return [styles.toggleTitleText, { color: colors.text }];
      default:
        return [styles.bodyText, { color: colors.text }];
    }
  }

  function handleRowDragOver(event: WebDomDragEvent) {
    if (!isBlockDragActive || isDragging) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    const target = event.currentTarget as HTMLElement | null;
    const rect = target?.getBoundingClientRect?.();
    if (!rect) {
      onDragHoverBlock(block.id, 'after');
      return;
    }
    const relY = (event.clientY - rect.top) / Math.max(rect.height, 1);
    const relX = event.clientX - rect.left;
    const isNestable =
      block.type === 'bullet' ||
      block.type === 'numbered' ||
      block.type === 'todo' ||
      block.type === 'toggle';
    const nestThreshold = 190 + block.indentLevel * 24;

    if (relY < 0.5) {
      onDragHoverBlock(block.id, 'before');
    } else if (isNestable && relX > nestThreshold) {
      onDragHoverBlock(block.id, 'nest');
    } else {
      onDragHoverBlock(block.id, 'after');
    }
  }

  function handleRowDrop(event: WebDomDragEvent) {
    if (!isBlockDragActive) {
      return;
    }
    event.preventDefault();
    const draggedId =
      event.dataTransfer?.getData('text/sotaq-note-block') ||
      event.dataTransfer?.getData('text/plain');
    if (!draggedId || draggedId === block.id) {
      onDragEndBlock();
      return;
    }
    onDropOnBlock(draggedId, block.id, dropIndicator ?? 'after');
  }

  const inputElement =
    block.type === 'divider' ? (
      <Pressable onPress={onFocus} style={styles.dividerHit}>
        <View style={[styles.dividerLine, { backgroundColor: colors.line }]} />
      </Pressable>
    ) : block.type === 'page' ? (
      <Pressable
        onPress={() => {
          if (block.linkedPageId) {
            onOpenLinkedPage(block.linkedPageId);
          }
        }}
        style={({ hovered: linkHovered }: { hovered?: boolean }) => [
          styles.pageLinkRow,
          {
            backgroundColor: linkHovered ? colors.surfaceActive : colors.surfaceSubtle,
            borderColor: colors.line,
          },
        ]}>
        <Text style={styles.pageLinkIcon}>{linkedPage?.icon ?? '📄'}</Text>
        <Text style={[styles.pageLinkTitle, { color: colors.text }]} numberOfLines={1}>
          {linkedPage?.title.trim() || 'Без названия'}
        </Text>
        <AppIcon name="arrowRight" size="xs" color={colors.muted} />
      </Pressable>
    ) : (
      <TextInput
        ref={(ref) => {
          localInputRef.current = ref;
          registerInputRef(block.id, ref);
        }}
        value={block.content}
        onChangeText={handleTextChange}
        onKeyPress={handleKeyPress}
        onSelectionChange={(event) => {
          selectionRef.current = event.nativeEvent.selection;
        }}
        onLayout={syncMainHeight}
        onFocus={onFocus}
        multiline
        numberOfLines={Platform.OS === 'web' ? 1 : undefined}
        scrollEnabled={false}
        blurOnSubmit={false}
        placeholder={getPlaceholder()}
        placeholderTextColor={colors.muted}
        textAlignVertical="top"
        style={[styles.baseInput, getTextStyle(), { minHeight }]}
      />
    );

  const indentPx = block.indentLevel * (isDesktop ? 24 : 18);

  // Mobile Reorder Mode: tactile one-thumb block sorting card (no accidental keyboard popup!)
  if (!isDesktop && reorderMode) {
    const previewText =
      block.type === 'divider'
        ? '─── Разделитель ───'
        : block.type === 'page'
          ? `${linkedPage?.icon ?? '📄'} ${linkedPage?.title.trim() || 'Подстраница'}`
          : block.content.trim() || 'Пустой блок';

    return (
      <View
        style={[
          styles.mobileReorderCard,
          {
            marginLeft: indentPx,
            backgroundColor: block.blockColor !== 'default' ? blockTintBg : colors.surface,
            borderColor: colors.line,
          },
        ]}>
        <Pressable onPress={onToggleContextMenu} style={styles.mobileReorderMain}>
          <View style={[styles.mobileReorderBadge, { backgroundColor: colors.surfaceSubtle }]}>
            <AppIcon name={getBlockTypeIcon(block.type)} size="sm" color={colors.muted} />
          </View>
          <Text style={[styles.mobileReorderText, { color: colors.text }]} numberOfLines={2}>
            {previewText}
          </Text>
        </Pressable>

        <View style={styles.mobileReorderActions}>
          <Pressable
            accessibilityLabel="Уменьшить отступ"
            disabled={block.indentLevel <= 0}
            onPress={() => onIndent(-1)}
            style={[
              styles.reorderMiniBtn,
              { backgroundColor: colors.surfaceSubtle },
              block.indentLevel <= 0 ? styles.reorderMiniDisabled : null,
            ]}>
            <AppIcon name="outdent" size="sm" color={colors.text} />
          </Pressable>
          <Pressable
            accessibilityLabel="Вложить"
            disabled={!canIndent}
            onPress={() => onIndent(1)}
            style={[
              styles.reorderMiniBtn,
              { backgroundColor: colors.surfaceSubtle },
              !canIndent ? styles.reorderMiniDisabled : null,
            ]}>
            <AppIcon name="indent" size="sm" color={colors.text} />
          </Pressable>
          <Pressable
            accessibilityLabel="Поднять выше"
            disabled={index <= 0}
            onPress={() => onMoveBlock(-1)}
            style={[
              styles.reorderMiniBtn,
              { backgroundColor: colors.surfaceSubtle },
              index <= 0 ? styles.reorderMiniDisabled : null,
            ]}>
            <AppIcon name="arrowUp" size="sm" color={colors.text} />
          </Pressable>
          <Pressable
            accessibilityLabel="Опустить ниже"
            disabled={index >= totalBlocks - 1}
            onPress={() => onMoveBlock(1)}
            style={[
              styles.reorderMiniBtn,
              { backgroundColor: colors.surfaceSubtle },
              index >= totalBlocks - 1 ? styles.reorderMiniDisabled : null,
            ]}>
            <AppIcon name="arrowDown" size="sm" color={colors.text} />
          </Pressable>
          <Pressable
            accessibilityLabel="Действия с блоком"
            onPress={onToggleContextMenu}
            style={[styles.reorderMiniBtn, { backgroundColor: colors.surfaceSubtle }]}>
            <AppIcon name="more" size="sm" color={colors.muted} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <WebDragBox
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onDragOver={handleRowDragOver}
      onDragLeave={() => onDragLeaveBlock(block.id)}
      onDrop={handleRowDrop}
      style={[
        styles.outerWrap,
        showSlashMenu ? styles.elevatedRow : null,
        isDragging ? styles.dragging : null,
      ]}>
      {/* Blue drop line ABOVE */}
      {dropIndicator === 'before' ? (
        <View
          style={[
            styles.dropLineWrap,
            {
              marginLeft: (isDesktop ? 74 : 0) + indentPx,
              marginRight: isDesktop ? 10 : 0,
            },
          ]}>
          <View style={styles.dropDot} />
          <View style={styles.dropLine} />
        </View>
      ) : null}

      <View
        style={[
          styles.row,
          !isDesktop ? styles.rowMobile : null,
          isDesktop && hovered
            ? {
                backgroundColor:
                  scheme === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(22, 24, 29, 0.03)',
              }
            : null,
          block.type === 'divider' ? styles.rowCenter : null,
          index > 0 && block.type === 'h1' ? styles.rowH1 : null,
          index > 0 && block.type === 'h2' ? styles.rowH2 : null,
          index > 0 && block.type === 'h3' ? styles.rowH3 : null,
          index > 0 && block.type === 'h4' ? styles.rowH4 : null,
        ]}>
        {/* Desktop Hover Gutter ('+' & 6-dot drag grip); Mobile hides gutter for full-width reading/typing */}
        {isDesktop ? (
          <View
            pointerEvents={showGutter ? 'auto' : 'none'}
            style={[
              styles.gutter,
              styles.gutterDesktop,
              { paddingTop: gutterTopOffsetForType(block.type) },
              showGutter ? styles.gutterVisible : styles.gutterHidden,
            ]}>
            <View ref={plusBtnRef} collapsable={false}>
              <Pressable
                accessibilityLabel="Добавить блок ниже"
                onPress={(event) => {
                  event.stopPropagation?.();
                  measureAndRun(plusBtnRef, onToggleInsertMenu);
                }}
                style={({ hovered: btnHovered }: { hovered?: boolean }) => [
                  styles.gutterBtn,
                  styles.plusBtnCursor,
                  {
                    backgroundColor:
                      btnHovered || isInsertMenuOpen
                        ? colors.surfaceActive
                        : colors.surfaceSubtle,
                    borderColor:
                      btnHovered || isInsertMenuOpen ? colors.text : colors.line,
                  },
                ]}>
                {({ hovered: btnHovered }: { hovered?: boolean }) => (
                  <AppIcon
                    name="plus"
                    size="sm"
                    color={btnHovered || isInsertMenuOpen ? colors.text : colors.muted}
                  />
                )}
              </Pressable>
            </View>

            <WebDragBox
              ref={handleBtnRef}
              collapsable={false}
              draggable={Platform.OS === 'web'}
              onDragStart={(event) => {
                if (event.dataTransfer) {
                  event.dataTransfer.setData('text/sotaq-note-block', block.id);
                  event.dataTransfer.setData('text/plain', block.id);
                  event.dataTransfer.effectAllowed = 'move';
                }
                onDragStartBlock(block.id);
              }}
              onDragEnd={() => onDragEndBlock()}>
              <Pressable
                accessibilityLabel="Перетащить или открыть меню блока"
                hitSlop={4}
                onPress={(event) => {
                  event.stopPropagation?.();
                  measureAndRun(handleBtnRef, onToggleContextMenu);
                }}
                style={({ hovered: btnHovered }: { hovered?: boolean }) => [
                  styles.gutterBtn,
                  styles.dragHandleBtn,
                  {
                    backgroundColor:
                      btnHovered || isContextMenuOpen
                        ? colors.surfaceActive
                        : colors.surfaceSubtle,
                    borderColor:
                      btnHovered || isContextMenuOpen ? colors.text : colors.line,
                  },
                ]}>
                {({ hovered: btnHovered }: { hovered?: boolean }) => (
                  <AppIcon
                    name="grip"
                    size="sm"
                    color={btnHovered || isContextMenuOpen ? colors.text : colors.muted}
                  />
                )}
              </Pressable>
            </WebDragBox>
          </View>
        ) : null}

        {/* Block body with indentation & color tint */}
        <View
          style={[
            styles.blockBody,
            { marginLeft: indentPx },
            block.blockColor !== 'default'
              ? [styles.tintedBlock, { backgroundColor: blockTintBg }]
              : null,
          ]}>
          {block.type === 'bullet' ? (
            <View style={styles.prefixRow}>
              <Text style={[styles.bulletGlyph, { color: colors.text }]}>
                {block.indentLevel % 2 === 1 ? '◦' : '•'}
              </Text>
              <View style={styles.flexOne}>{inputElement}</View>
            </View>
          ) : block.type === 'numbered' ? (
            <View style={styles.prefixRow}>
              <Text style={[styles.numberGlyph, { color: colors.muted }]}>{numberedIndex}.</Text>
              <View style={styles.flexOne}>{inputElement}</View>
            </View>
          ) : block.type === 'todo' ? (
            <View style={styles.prefixRow}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: block.checked }}
                onPress={onToggleChecked}
                hitSlop={6}
                style={styles.todoCheckHit}>
                {(state) => {
                  const boxHovered =
                    Platform.OS === 'web' && (state as { hovered?: boolean }).hovered === true;
                  return (
                    <View
                      style={[
                        styles.todoBox,
                        {
                          borderColor: block.checked
                            ? colors.success
                            : boxHovered
                              ? colors.text
                              : colors.muted,
                          backgroundColor: block.checked
                            ? colors.success
                            : boxHovered
                              ? colors.surfaceSubtle
                              : 'transparent',
                        },
                      ]}>
                      {block.checked ? (
                        <AppIcon name="check" size={12} color="#FFFFFF" strokeWidth={2.5} />
                      ) : null}
                    </View>
                  );
                }}
              </Pressable>
              <View style={styles.flexOne}>{inputElement}</View>
            </View>
          ) : block.type === 'quote' ? (
            <View style={[styles.quoteShell, { borderLeftColor: colors.text }]}>
              {inputElement}
            </View>
          ) : block.type === 'callout' ? (
            <View
              style={[
                styles.calloutShell,
                {
                  backgroundColor:
                    block.blockColor === 'default' ? colors.surfaceSubtle : 'transparent',
                  borderColor: colors.line,
                },
              ]}>
              <View style={styles.calloutIconWrap}>
                <AppIcon name="callout" size="md" color={colors.text} />
              </View>
              <View style={styles.flexOne}>{inputElement}</View>
            </View>
          ) : block.type === 'code' ? (
            <View
              style={[
                styles.codeShell,
                { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
              ]}>
              {inputElement}
            </View>
          ) : block.type === 'toggle' ? (
            <View style={styles.toggleShell}>
              <View style={styles.prefixRow}>
                <Pressable
                  accessibilityLabel={block.collapsed ? 'Раскрыть блок' : 'Свернуть блок'}
                  hitSlop={6}
                  onPress={onToggleCollapsed}
                  style={({ hovered }: { hovered?: boolean }) => [
                    styles.toggleBtn,
                    hovered ? { backgroundColor: colors.surfaceActive } : null,
                  ]}>
                  <AppIcon
                    name={block.collapsed ? 'chevronRight' : 'chevronDown'}
                    size="sm"
                    color={colors.muted}
                  />
                </Pressable>
                <View style={styles.flexOne}>{inputElement}</View>
              </View>
              {!block.collapsed ? (
                <View style={[styles.toggleInner, { borderLeftColor: colors.line }]}>
                  <TextInput
                    ref={toggleBodyRef}
                    value={block.toggleBody}
                    onChangeText={onChangeToggleBody}
                    onLayout={syncToggleHeight}
                    multiline
                    numberOfLines={Platform.OS === 'web' ? 1 : undefined}
                    scrollEnabled={false}
                    placeholder="Содержимое внутри блока…"
                    placeholderTextColor={colors.muted}
                    textAlignVertical="top"
                    style={[styles.baseInput, styles.toggleBodyInput, { color: colors.text }]}
                  />
                </View>
              ) : null}
            </View>
          ) : (
            inputElement
          )}

          {/* Desktop Floating Context Menu (Modal overlay — zero layout shift) */}
          {isDesktop ? (
            <BlockContextMenu
              visible={isContextMenuOpen}
              anchor={menuAnchor}
              block={block}
              index={index}
              totalBlocks={totalBlocks}
              canIndent={canIndent}
              colors={colors}
              onTurnInto={(nextType) => onConvertType(nextType)}
              onChangeColor={onChangeColor}
              onIndent={onIndent}
              onInsertBelow={() => onInsertBlockBelow('paragraph')}
              onMoveBlock={onMoveBlock}
              onDuplicate={onDuplicateBlock}
              onDelete={onDeleteBlock}
              onClose={onCloseMenus}
            />
          ) : null}

          {/* '+' Floating Insert Block Menu (Modal overlay — zero layout shift) */}
          {isDesktop && isInsertMenuOpen ? (
            <SlashMenu
              query=""
              mode="insert"
              anchor={menuAnchor}
              selectedIndex={0}
              colors={colors}
              onSelect={(nextType) => {
                onCloseMenus();
                onInsertBlockBelow(nextType);
              }}
              onClose={onCloseMenus}
            />
          ) : null}

          {/* '/' Inline Floating Slash Command Menu */}
          {showSlashMenu ? (
            <SlashMenu
              query={slashQuery}
              mode="slash"
              selectedIndex={clampedSlashIndex}
              colors={colors}
              onHoverIndex={setSlashIndex}
              onSelect={(nextType) => onConvertType(nextType, '')}
              onClose={() => onChangeContent('')}
            />
          ) : null}
        </View>
      </View>

      {/* Blue drop line BELOW or NESTED */}
      {dropIndicator === 'after' || dropIndicator === 'nest' ? (
        <View
          style={[
            styles.dropLineWrap,
            {
              marginLeft:
                (isDesktop ? 74 : 0) + indentPx + (dropIndicator === 'nest' ? 24 : 0),
              marginRight: isDesktop ? 10 : 0,
            },
          ]}>
          <View style={styles.dropDot} />
          <View style={styles.dropLine} />
        </View>
      ) : null}
    </WebDragBox>
  );
}

const styles = StyleSheet.create({
  outerWrap: {
    width: '100%',
    position: 'relative',
    zIndex: 1,
  },
  elevatedRow: {
    zIndex: 50,
  },
  dragging: {
    opacity: 0.35,
  },
  dropLineWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 4,
    marginVertical: -2,
    zIndex: 10,
  },
  dropDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: NOTION_DROP_BLUE,
    marginRight: -1,
  },
  dropLine: {
    flex: 1,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: NOTION_DROP_BLUE,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 2,
    paddingLeft: 6,
    paddingRight: 10,
    gap: 10,
    borderRadius: 9,
  },
  rowCenter: {
    alignItems: 'center',
  },
  rowMobile: {
    gap: 0,
    paddingLeft: 0,
    paddingRight: 0,
    paddingVertical: 2,
  },
  mobileReorderCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    marginVertical: 4,
    gap: 8,
  },
  mobileReorderMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mobileReorderBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileReorderText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  mobileReorderActions: {
    flexDirection: 'row',
    gap: 6,
  },
  reorderMiniBtn: {
    flex: 1,
    height: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderMiniDisabled: {
    opacity: 0.3,
  },
  rowH1: {
    marginTop: 18,
    marginBottom: 4,
  },
  rowH2: {
    marginTop: 14,
    marginBottom: 2,
  },
  rowH3: {
    marginTop: 10,
  },
  rowH4: {
    marginTop: 14,
    marginBottom: 2,
  },
  gutter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    ...(Platform.OS === 'web'
      ? ({ transition: 'opacity 140ms ease' } as object)
      : null),
  },
  gutterDesktop: {
    width: 58,
    justifyContent: 'flex-end',
  },
  gutterVisible: {
    opacity: 1,
  },
  gutterHidden: {
    opacity: 0,
  },
  gutterBtn: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({ transition: 'background-color 120ms ease, border-color 120ms ease' } as object)
      : null),
  },
  plusBtnCursor: {
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  dragHandleBtn: {
    ...(Platform.OS === 'web' ? ({ cursor: 'grab' } as object) : null),
  },
  blockBody: {
    flex: 1,
    minWidth: 0,
    borderRadius: 9,
  },
  tintedBlock: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginVertical: 2,
  },
  flexOne: {
    flex: 1,
    minWidth: 0,
  },
  baseInput: {
    paddingVertical: 2,
    paddingHorizontal: 0,
    ...(Platform.OS === 'web'
      ? ({ outlineStyle: 'none', resize: 'none', overflow: 'hidden' } as object)
      : null),
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 24,
  },
  h1Text: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  h2Text: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  h3Text: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '600',
  },
  h4Text: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  quoteText: {
    fontSize: 15,
    lineHeight: 24,
    fontStyle: 'italic',
  },
  codeText: {
    fontFamily: MONOSPACE_FONT,
    fontSize: 13,
    lineHeight: 20,
  },
  toggleTitleText: {
    fontSize: 15,
    lineHeight: 24,
    fontWeight: '600',
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },
  prefixRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bulletGlyph: {
    fontSize: 18,
    lineHeight: 28,
    width: 16,
    textAlign: 'center',
  },
  numberGlyph: {
    fontSize: 14,
    lineHeight: 28,
    minWidth: 20,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  todoCheckHit: {
    paddingTop: 5,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  todoBox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({ transition: 'background-color 120ms ease, border-color 120ms ease' } as object)
      : null),
  },
  quoteShell: {
    borderLeftWidth: 3,
    paddingLeft: 13,
    paddingVertical: 2,
  },
  calloutShell: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 13,
    paddingVertical: 10,
    marginVertical: 3,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  calloutIconWrap: {
    paddingTop: 5,
  },
  codeShell: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginVertical: 3,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  toggleShell: {
    gap: 4,
  },
  toggleBtn: {
    width: 22,
    height: 28,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({ cursor: 'pointer', transition: 'background-color 110ms ease' } as object)
      : null),
  },
  toggleInner: {
    marginLeft: 10,
    paddingLeft: 14,
    borderLeftWidth: 1.5,
    paddingVertical: 2,
  },
  toggleBodyInput: {
    fontSize: 14,
    lineHeight: 21,
    minHeight: 25,
  },
  dividerHit: {
    paddingVertical: 13,
    justifyContent: 'center',
  },
  dividerLine: {
    height: 1,
    width: '100%',
  },
  pageLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    marginVertical: 2,
    ...(Platform.OS === 'web'
      ? ({ cursor: 'pointer', transition: 'background-color 120ms ease' } as object)
      : null),
  },
  pageLinkIcon: {
    fontSize: 15,
  },
  pageLinkTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
