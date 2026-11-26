import { type ComponentRef } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputKeyPressEvent,
  View,
} from 'react-native';

import { RipplePressable } from '@/components/ripple-pressable';
import { SlashMenu } from '@/features/notes/components/slash-menu';
import {
  detectMarkdownShortcut,
  type NoteBlockRecord,
  type NoteBlockType,
} from '@/features/notes/types';
import type { ThemeColors } from '@/theme/colors';

type Props = {
  block: NoteBlockRecord;
  index: number;
  totalBlocks: number;
  numberedIndex: number;
  isFocused: boolean;
  isActionMenuOpen: boolean;
  isDesktop: boolean;
  colors: ThemeColors;
  registerInputRef: (blockId: string, ref: ComponentRef<typeof TextInput> | null) => void;
  onFocus: () => void;
  onToggleActionMenu: () => void;
  onChangeContent: (content: string) => void;
  onChangeToggleBody: (body: string) => void;
  onConvertType: (type: NoteBlockType, nextContent?: string) => void;
  onToggleChecked: () => void;
  onToggleCollapsed: () => void;
  onEnter: () => void;
  onBackspaceEmpty: () => void;
  onMoveBlock: (direction: -1 | 1) => void;
  onDuplicateBlock: () => void;
  onDeleteBlock: () => void;
};

const MONOSPACE_FONT = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export function BlockRow({
  block,
  index,
  totalBlocks,
  numberedIndex,
  isFocused,
  isActionMenuOpen,
  isDesktop,
  colors,
  registerInputRef,
  onFocus,
  onToggleActionMenu,
  onChangeContent,
  onChangeToggleBody,
  onConvertType,
  onToggleChecked,
  onToggleCollapsed,
  onEnter,
  onBackspaceEmpty,
  onMoveBlock,
  onDuplicateBlock,
  onDeleteBlock,
}: Props) {
  const showSlashMenu =
    isFocused && block.type !== 'code' && block.type !== 'divider' && block.content.startsWith('/');
  const slashQuery = showSlashMenu ? block.content.slice(1) : '';

  function handleTextChange(nextText: string) {
    // On mobile & web multiline inputs, pressing Enter appends '\n' for non-code blocks.
    if (block.type !== 'code' && nextText.includes('\n')) {
      const cleaned = nextText.replace(/\n/g, '');
      if (cleaned !== block.content) {
        onChangeContent(cleaned);
      }
      onEnter();
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
    const key = event.nativeEvent.key;
    const shiftKey = Boolean((event.nativeEvent as unknown as { shiftKey?: boolean }).shiftKey);

    if (key === 'Backspace' && block.content.length === 0) {
      onBackspaceEmpty();
      return;
    }

    if (key === 'Enter' && block.type !== 'code' && !shiftKey) {
      if (Platform.OS === 'web') {
        event.preventDefault();
      }
      onEnter();
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
        return 'Код…';
      case 'toggle':
        return 'Заголовок блока…';
      default:
        return isFocused ? 'Пишите текст или введите / для команд…' : '';
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

  const inputElement =
    block.type === 'divider' ? (
      <Pressable onPress={onFocus} style={styles.dividerHit}>
        <View style={[styles.dividerLine, { backgroundColor: colors.line }]} />
      </Pressable>
    ) : (
      <TextInput
        ref={(ref) => registerInputRef(block.id, ref)}
        value={block.content}
        onChangeText={handleTextChange}
        onKeyPress={handleKeyPress}
        onFocus={onFocus}
        multiline
        blurOnSubmit={false}
        placeholder={getPlaceholder()}
        placeholderTextColor={colors.muted}
        textAlignVertical="top"
        style={[styles.baseInput, getTextStyle()]}
      />
    );

  return (
    <View style={styles.wrapper}>
      <Pressable
        onPress={onFocus}
        style={({ hovered }: { hovered?: boolean }) => [
          styles.row,
          block.type === 'h1' ? styles.rowH1 : null,
          block.type === 'h2' ? styles.rowH2 : null,
          block.type === 'h3' ? styles.rowH3 : null,
          isFocused && isDesktop ? styles.rowFocused : null,
          hovered && isDesktop ? styles.rowHovered : null,
        ]}>
        {/* Left drag/action handle */}
        <RipplePressable
          accessibilityLabel="Действия с блоком"
          hitSlop={6}
          onPress={onToggleActionMenu}
          style={StyleSheet.flatten([
            styles.handleBtn,
            isFocused || isActionMenuOpen ? styles.handleVisible : styles.handleSubtle,
          ])}>
          <Text style={[styles.handleGlyph, { color: colors.muted }]}>⋮⋮</Text>
        </RipplePressable>

        {/* Block visual shell */}
        <View style={styles.blockBody}>
          {block.type === 'bullet' ? (
            <View style={styles.prefixRow}>
              <Text style={[styles.bulletGlyph, { color: colors.text }]}>•</Text>
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
                <View
                  style={[
                    styles.todoBox,
                    {
                      borderColor: block.checked ? colors.success : colors.muted,
                      backgroundColor: block.checked ? colors.success : 'transparent',
                    },
                  ]}>
                  {block.checked ? <Text style={styles.todoCheckmark}>✓</Text> : null}
                </View>
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
                { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
              ]}>
              <Text style={styles.calloutIcon}>💡</Text>
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
                  style={styles.toggleBtn}>
                  <Text style={[styles.toggleArrow, { color: colors.muted }]}>
                    {block.collapsed ? '▸' : '▾'}
                  </Text>
                </Pressable>
                <View style={styles.flexOne}>{inputElement}</View>
              </View>
              {!block.collapsed ? (
                <View style={[styles.toggleInner, { borderLeftColor: colors.line }]}>
                  <TextInput
                    value={block.toggleBody}
                    onChangeText={onChangeToggleBody}
                    multiline
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

          {/* Block quick action bar */}
          {isActionMenuOpen ? (
            <View
              style={[
                styles.actionBar,
                { backgroundColor: colors.surface, borderColor: colors.line },
              ]}>
              <RipplePressable
                disabled={index <= 0}
                onPress={() => onMoveBlock(-1)}
                style={StyleSheet.flatten([
                  styles.actionChip,
                  { backgroundColor: colors.surfaceSubtle },
                  index <= 0 ? styles.disabledChip : null,
                ])}>
                <Text style={[styles.actionChipText, { color: colors.text }]}>↑ Выше</Text>
              </RipplePressable>

              <RipplePressable
                disabled={index >= totalBlocks - 1}
                onPress={() => onMoveBlock(1)}
                style={StyleSheet.flatten([
                  styles.actionChip,
                  { backgroundColor: colors.surfaceSubtle },
                  index >= totalBlocks - 1 ? styles.disabledChip : null,
                ])}>
                <Text style={[styles.actionChipText, { color: colors.text }]}>↓ Ниже</Text>
              </RipplePressable>

              <RipplePressable
                onPress={onDuplicateBlock}
                style={StyleSheet.flatten([
                  styles.actionChip,
                  { backgroundColor: colors.surfaceSubtle },
                ])}>
                <Text style={[styles.actionChipText, { color: colors.text }]}>Дубль</Text>
              </RipplePressable>

              <RipplePressable
                onPress={() => {
                  onToggleActionMenu();
                  onChangeContent('/');
                  onFocus();
                }}
                style={StyleSheet.flatten([
                  styles.actionChip,
                  { backgroundColor: colors.surfaceSubtle },
                ])}>
                <Text style={[styles.actionChipText, { color: colors.text }]}>Тип /</Text>
              </RipplePressable>

              <RipplePressable
                onPress={onDeleteBlock}
                style={StyleSheet.flatten([
                  styles.actionChip,
                  { backgroundColor: colors.dangerBg },
                ])}>
                <Text style={[styles.actionChipText, { color: colors.danger }]}>Удалить</Text>
              </RipplePressable>
            </View>
          ) : null}

          {/* Floating slash menu */}
          {showSlashMenu ? (
            <SlashMenu
              query={slashQuery}
              colors={colors}
              onSelect={(nextType) => onConvertType(nextType, '')}
              onClose={() => onChangeContent('')}
            />
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 2,
    gap: 4,
    borderRadius: 8,
  },
  rowH1: {
    marginTop: 14,
    marginBottom: 4,
  },
  rowH2: {
    marginTop: 10,
    marginBottom: 2,
  },
  rowH3: {
    marginTop: 8,
  },
  rowFocused: {
    opacity: 1,
  },
  rowHovered: {
    opacity: 1,
  },
  handleBtn: {
    width: 24,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  handleVisible: {
    opacity: 0.9,
  },
  handleSubtle: {
    opacity: 0.25,
  },
  handleGlyph: {
    fontSize: 13,
    letterSpacing: -1,
  },
  blockBody: {
    flex: 1,
    minWidth: 0,
  },
  flexOne: {
    flex: 1,
    minWidth: 0,
  },
  baseInput: {
    paddingVertical: 3,
    paddingHorizontal: 2,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 24,
  },
  h1Text: {
    fontSize: 26,
    lineHeight: 33,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  h2Text: {
    fontSize: 21,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  h3Text: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
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
    lineHeight: 25,
    width: 16,
    textAlign: 'center',
  },
  numberGlyph: {
    fontSize: 14,
    lineHeight: 26,
    minWidth: 20,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  todoCheckHit: {
    paddingTop: 5,
  },
  todoBox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todoCheckmark: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 13,
  },
  quoteShell: {
    borderLeftWidth: 3,
    paddingLeft: 12,
    paddingVertical: 2,
  },
  calloutShell: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  calloutIcon: {
    fontSize: 16,
    lineHeight: 24,
  },
  codeShell: {
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
  },
  toggleShell: {
    gap: 4,
  },
  toggleBtn: {
    width: 22,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleArrow: {
    fontSize: 14,
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
    minHeight: 34,
  },
  dividerHit: {
    paddingVertical: 12,
    justifyContent: 'center',
  },
  dividerLine: {
    height: 1,
    width: '100%',
  },
  actionBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    padding: 8,
    marginTop: 4,
    marginBottom: 4,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
  },
  actionChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 7,
  },
  disabledChip: {
    opacity: 0.35,
  },
  actionChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
