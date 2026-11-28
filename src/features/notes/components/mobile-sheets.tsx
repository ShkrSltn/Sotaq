import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { RipplePressable } from '@/components/ripple-pressable';
import {
  BLOCK_COLORS,
  BLOCK_TYPE_CATALOG,
  MAX_INDENT_LEVEL,
  type NoteBlockColor,
  type NoteBlockRecord,
  type NoteBlockType,
  type NotePageRecord,
  TURN_INTO_TYPES,
} from '@/features/notes/types';
import { useThemeColors } from '@/theme/colors';

const COLOR_KEYS: readonly NoteBlockColor[] = [
  'default',
  'gray',
  'blue',
  'green',
  'yellow',
  'red',
  'purple',
];

/* -------------------------------------------------------------------------- */
/* 1. Mobile Insert Block Sheet ('+')                                         */
/* -------------------------------------------------------------------------- */

type InsertSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSelectType: (type: NoteBlockType) => void;
};

export function MobileInsertBlockSheet({
  visible,
  onClose,
  onSelectType,
}: InsertSheetProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  if (!visible) {
    return null;
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View
          entering={SlideInDown.springify().damping(25).stiffness(280)}
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.line,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}>
          <View style={styles.grabberRow}>
            <View style={[styles.grabber, { backgroundColor: colors.line }]} />
          </View>

          <View style={[styles.header, { borderBottomColor: colors.line }]}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Добавить блок</Text>
            <RipplePressable
              onPress={onClose}
              style={StyleSheet.flatten([
                styles.doneBtn,
                { backgroundColor: colors.surfaceSubtle },
              ])}>
              <Text style={[styles.doneLabel, { color: colors.muted }]}>Закрыть</Text>
            </RipplePressable>
          </View>

          <ScrollView contentContainerStyle={styles.gridWrap}>
            {BLOCK_TYPE_CATALOG.map((item) => (
              <RipplePressable
                key={item.type}
                onPress={() => {
                  onSelectType(item.type);
                  onClose();
                }}
                style={StyleSheet.flatten([
                  styles.typeTile,
                  { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                ])}>
                <View style={[styles.tileIconBox, { backgroundColor: colors.surface }]}>
                  <AppIcon name={item.icon} size="md" color={colors.text} />
                </View>
                <View style={styles.tileTextCol}>
                  <Text style={[styles.tileLabel, { color: colors.text }]} numberOfLines={1}>
                    {item.label}
                  </Text>
                  <Text style={[styles.tileDesc, { color: colors.muted }]} numberOfLines={1}>
                    {item.description}
                  </Text>
                </View>
              </RipplePressable>
            ))}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Mobile Block Actions Sheet ('⋮⋮')                                       */
/* -------------------------------------------------------------------------- */

type BlockSheetProps = {
  block: NoteBlockRecord | null;
  index: number;
  totalBlocks: number;
  canIndent: boolean;
  onClose: () => void;
  onTurnInto: (type: NoteBlockType) => void;
  onChangeColor: (color: NoteBlockColor) => void;
  onIndent: (delta: -1 | 1) => void;
  onMoveBlock: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

export function MobileBlockActionsSheet({
  block,
  index,
  totalBlocks,
  canIndent,
  onClose,
  onTurnInto,
  onChangeColor,
  onIndent,
  onMoveBlock,
  onDuplicate,
  onDelete,
}: BlockSheetProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  if (!block) {
    return null;
  }

  const canTurnInto = block.type !== 'page' && block.type !== 'divider';
  const turnIntoItems = BLOCK_TYPE_CATALOG.filter((item) =>
    TURN_INTO_TYPES.includes(item.type),
  );

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View
          entering={SlideInDown.springify().damping(25).stiffness(280)}
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.line,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}>
          <View style={styles.grabberRow}>
            <View style={[styles.grabber, { backgroundColor: colors.line }]} />
          </View>

          <View style={[styles.header, { borderBottomColor: colors.line }]}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Действия с блоком</Text>
            <RipplePressable
              onPress={onClose}
              style={StyleSheet.flatten([
                styles.doneBtn,
                { backgroundColor: colors.surfaceSubtle },
              ])}>
              <Text style={[styles.doneLabel, { color: colors.text }]}>Готово</Text>
            </RipplePressable>
          </View>

          <ScrollView contentContainerStyle={styles.sheetBody}>
            {/* Quick position & indent row */}
            <View style={styles.quickBarRow}>
              <RipplePressable
                disabled={index <= 0}
                onPress={() => onMoveBlock(-1)}
                style={StyleSheet.flatten([
                  styles.quickActionBtn,
                  { backgroundColor: colors.surfaceSubtle },
                  index <= 0 ? styles.disabled : null,
                ])}>
                <AppIcon name="arrowUp" size="md" color={colors.text} />
                <Text style={[styles.quickActionLabel, { color: colors.muted }]}>Выше</Text>
              </RipplePressable>

              <RipplePressable
                disabled={index >= totalBlocks - 1}
                onPress={() => onMoveBlock(1)}
                style={StyleSheet.flatten([
                  styles.quickActionBtn,
                  { backgroundColor: colors.surfaceSubtle },
                  index >= totalBlocks - 1 ? styles.disabled : null,
                ])}>
                <AppIcon name="arrowDown" size="md" color={colors.text} />
                <Text style={[styles.quickActionLabel, { color: colors.muted }]}>Ниже</Text>
              </RipplePressable>

              <RipplePressable
                disabled={block.indentLevel <= 0}
                onPress={() => onIndent(-1)}
                style={StyleSheet.flatten([
                  styles.quickActionBtn,
                  { backgroundColor: colors.surfaceSubtle },
                  block.indentLevel <= 0 ? styles.disabled : null,
                ])}>
                <AppIcon name="outdent" size="md" color={colors.text} />
                <Text style={[styles.quickActionLabel, { color: colors.muted }]}>Левее</Text>
              </RipplePressable>

              <RipplePressable
                disabled={!canIndent || block.indentLevel >= MAX_INDENT_LEVEL}
                onPress={() => onIndent(1)}
                style={StyleSheet.flatten([
                  styles.quickActionBtn,
                  { backgroundColor: colors.surfaceSubtle },
                  !canIndent || block.indentLevel >= MAX_INDENT_LEVEL ? styles.disabled : null,
                ])}>
                <AppIcon name="indent" size="md" color={colors.text} />
                <Text style={[styles.quickActionLabel, { color: colors.muted }]}>Вложить</Text>
              </RipplePressable>
            </View>

            {/* Color picker */}
            {block.type !== 'divider' ? (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: colors.muted }]}>Цвет блока</Text>
                <View style={styles.colorRow}>
                  {COLOR_KEYS.map((colorKey) => {
                    const meta = BLOCK_COLORS[colorKey];
                    const selected = block.blockColor === colorKey;
                    return (
                      <RipplePressable
                        key={colorKey}
                        accessibilityLabel={meta.label}
                        onPress={() => onChangeColor(colorKey)}
                        style={StyleSheet.flatten([
                          styles.colorBtn,
                          {
                            borderColor: selected ? colors.text : colors.line,
                            backgroundColor: colors.surfaceSubtle,
                          },
                        ])}>
                        {colorKey === 'default' ? (
                          <Text style={[styles.colorResetText, { color: colors.muted }]}>/</Text>
                        ) : (
                          <View style={[styles.colorDot, { backgroundColor: meta.dot }]} />
                        )}
                      </RipplePressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Turn into grid */}
            {canTurnInto ? (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: colors.muted }]}>
                  Превратить в (текст сохранится)
                </Text>
                <View style={styles.turnIntoGrid}>
                  {turnIntoItems.map((item) => {
                    const active = item.type === block.type;
                    return (
                      <RipplePressable
                        key={item.type}
                        onPress={() => {
                          onTurnInto(item.type);
                          onClose();
                        }}
                        style={StyleSheet.flatten([
                          styles.turnChip,
                          {
                            backgroundColor: active ? colors.accent : colors.surfaceSubtle,
                            borderColor: active ? colors.accent : colors.line,
                          },
                        ])}>
                        <AppIcon
                          name={item.icon}
                          size="xs"
                          color={active ? colors.accentText : colors.muted}
                        />
                        <Text
                          style={[
                            styles.turnChipLabel,
                            { color: active ? colors.accentText : colors.text },
                          ]}
                          numberOfLines={1}>
                          {item.label}
                        </Text>
                      </RipplePressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Duplicate & Delete */}
            <View style={styles.bottomActionsRow}>
              {block.type !== 'page' ? (
                <RipplePressable
                  onPress={() => {
                    onDuplicate();
                    onClose();
                  }}
                  style={StyleSheet.flatten([
                    styles.bigBtn,
                    { backgroundColor: colors.surfaceSubtle },
                  ])}>
                  <AppIcon name="copy" size="sm" color={colors.text} />
                  <Text style={[styles.bigBtnText, { color: colors.text }]}>Дублировать</Text>
                </RipplePressable>
              ) : null}

              <RipplePressable
                onPress={() => {
                  onDelete();
                  onClose();
                }}
                style={StyleSheet.flatten([
                  styles.bigBtn,
                  { backgroundColor: colors.dangerBg },
                ])}>
                <AppIcon name="trash" size="sm" color={colors.danger} />
                <Text style={[styles.bigBtnText, { color: colors.danger }]}>Удалить</Text>
              </RipplePressable>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. Mobile Page Actions Sheet ('⋯' on any page in mobile tree)              */
/* -------------------------------------------------------------------------- */

type PageSheetProps = {
  page: NotePageRecord | null;
  allPages: NotePageRecord[];
  onClose: () => void;
  onRename: (pageId: string, title: string) => void;
  onToggleFavorite: (pageId: string, isFavorite: boolean) => void;
  onCreateChild: (parentId: string) => void;
  onDuplicate: (pageId: string) => void;
  onMoveToParent: (pageId: string, parentId: string | null) => void;
  onDelete: (pageId: string) => void;
};

export function MobilePageActionsSheet(props: PageSheetProps) {
  if (!props.page) {
    return null;
  }
  return <MobilePageActionsSheetContent key={props.page.id} {...props} page={props.page} />;
}

function MobilePageActionsSheetContent({
  page,
  allPages,
  onClose,
  onRename,
  onToggleFavorite,
  onCreateChild,
  onDuplicate,
  onMoveToParent,
  onDelete,
}: Omit<PageSheetProps, 'page'> & { page: NotePageRecord }) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [titleDraft, setTitleDraft] = useState(page.title);
  const [movePickerOpen, setMovePickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Exclude self and descendants from valid move targets
  const validMoveTargets = useMemo(() => {
    const blocked = new Set<string>([page.id]);
    let added = true;
    while (added) {
      added = false;
      for (const candidate of allPages) {
        if (candidate.parentId && blocked.has(candidate.parentId) && !blocked.has(candidate.id)) {
          blocked.add(candidate.id);
          added = true;
        }
      }
    }
    return allPages.filter((candidate) => !blocked.has(candidate.id));
  }, [allPages, page.id]);

  function saveRenameAndClose() {
    if (titleDraft.trim() !== page.title) {
      onRename(page.id, titleDraft.trim());
    }
    onClose();
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={saveRenameAndClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={saveRenameAndClose} />
        <Animated.View
          entering={SlideInDown.springify().damping(25).stiffness(280)}
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.line,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}>
          <View style={styles.grabberRow}>
            <View style={[styles.grabber, { backgroundColor: colors.line }]} />
          </View>

          <View style={[styles.header, { borderBottomColor: colors.line }]}>
            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
              {page.icon} {page.title.trim() || 'Без названия'}
            </Text>
            <RipplePressable
              onPress={saveRenameAndClose}
              style={StyleSheet.flatten([
                styles.doneBtn,
                { backgroundColor: colors.surfaceSubtle },
              ])}>
              <Text style={[styles.doneLabel, { color: colors.text }]}>Готово</Text>
            </RipplePressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.sheetBody}
            keyboardShouldPersistTaps="handled">
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.muted }]}>Название</Text>
              <TextInput
                value={titleDraft}
                onChangeText={setTitleDraft}
                onSubmitEditing={saveRenameAndClose}
                placeholder="Без названия"
                placeholderTextColor={colors.muted}
                style={[
                  styles.renameBox,
                  {
                    color: colors.text,
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.line,
                  },
                ]}
              />
            </View>

            <View style={styles.listActions}>
              <RipplePressable
                onPress={() => {
                  onToggleFavorite(page.id, !page.isFavorite);
                  onClose();
                }}
                style={StyleSheet.flatten([
                  styles.sheetActionRow,
                  { backgroundColor: colors.surfaceSubtle },
                ])}>
                <View style={styles.sheetActionLeft}>
                  <AppIcon
                    name="star"
                    size="sm"
                    color={page.isFavorite ? colors.warning : colors.muted}
                    fill={page.isFavorite ? colors.warning : 'none'}
                  />
                  <Text style={[styles.sheetActionText, { color: colors.text }]}>
                    {page.isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
                  </Text>
                </View>
              </RipplePressable>

              <RipplePressable
                onPress={() => {
                  onCreateChild(page.id);
                  onClose();
                }}
                style={StyleSheet.flatten([
                  styles.sheetActionRow,
                  { backgroundColor: colors.surfaceSubtle },
                ])}>
                <View style={styles.sheetActionLeft}>
                  <AppIcon name="filePlus" size="sm" color={colors.muted} />
                  <Text style={[styles.sheetActionText, { color: colors.text }]}>
                    Добавить вложенную страницу
                  </Text>
                </View>
              </RipplePressable>

              <RipplePressable
                onPress={() => {
                  onDuplicate(page.id);
                  onClose();
                }}
                style={StyleSheet.flatten([
                  styles.sheetActionRow,
                  { backgroundColor: colors.surfaceSubtle },
                ])}>
                <View style={styles.sheetActionLeft}>
                  <AppIcon name="copy" size="sm" color={colors.muted} />
                  <Text style={[styles.sheetActionText, { color: colors.text }]}>
                    Дублировать страницу
                  </Text>
                </View>
              </RipplePressable>

              <RipplePressable
                onPress={() => setMovePickerOpen((value) => !value)}
                style={StyleSheet.flatten([
                  styles.sheetActionRow,
                  { backgroundColor: colors.surfaceSubtle },
                ])}>
                <View style={styles.sheetActionLeft}>
                  <AppIcon name="moveFolder" size="sm" color={colors.muted} />
                  <Text style={[styles.sheetActionText, { color: colors.text }]}>
                    Переместить страницу в…
                  </Text>
                </View>
                <AppIcon
                  name={movePickerOpen ? 'chevronUp' : 'chevronDown'}
                  size="sm"
                  color={colors.muted}
                />
              </RipplePressable>

              {movePickerOpen ? (
                <View
                  style={[
                    styles.moveTargetsBox,
                    { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                  ]}>
                  {page.parentId !== null ? (
                    <RipplePressable
                      onPress={() => {
                        onMoveToParent(page.id, null);
                        onClose();
                      }}
                      style={StyleSheet.flatten([
                        styles.moveTargetRow,
                        { backgroundColor: colors.surface },
                      ])}>
                      <View style={styles.sheetActionLeft}>
                        <AppIcon name="rootUp" size="sm" color={colors.muted} />
                        <Text style={[styles.moveTargetText, { color: colors.text }]}>
                          В корень (верхний уровень)
                        </Text>
                      </View>
                    </RipplePressable>
                  ) : null}

                  {validMoveTargets.map((target) => (
                    <RipplePressable
                      key={target.id}
                      onPress={() => {
                        onMoveToParent(page.id, target.id);
                        onClose();
                      }}
                      style={StyleSheet.flatten([
                        styles.moveTargetRow,
                        { backgroundColor: colors.surface },
                      ])}>
                      <Text style={[styles.moveTargetText, { color: colors.text }]} numberOfLines={1}>
                        {target.icon} {target.title.trim() || 'Без названия'}
                      </Text>
                    </RipplePressable>
                  ))}
                </View>
              ) : null}

              <RipplePressable
                onPress={() => {
                  if (!confirmDelete) {
                    setConfirmDelete(true);
                    return;
                  }
                  onDelete(page.id);
                  onClose();
                }}
                style={StyleSheet.flatten([
                  styles.sheetActionRow,
                  {
                    backgroundColor: confirmDelete ? colors.danger : colors.dangerBg,
                  },
                ])}>
                <View style={styles.sheetActionLeft}>
                  <AppIcon
                    name="trash"
                    size="sm"
                    color={confirmDelete ? '#FFFFFF' : colors.danger}
                  />
                  <Text
                    style={[
                      styles.sheetActionText,
                      { color: confirmDelete ? '#FFFFFF' : colors.danger },
                    ]}>
                    {confirmDelete ? 'Точно удалить страницу?' : 'Удалить страницу'}
                  </Text>
                </View>
              </RipplePressable>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 12, 16, 0.5)',
  },
  sheet: {
    width: '100%',
    maxHeight: '58%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  grabberRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 2,
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  doneBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9,
  },
  doneLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  gridWrap: {
    padding: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeTile: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 11,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tileIconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileIcon: {
    fontSize: 14,
    fontWeight: '700',
  },
  tileTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  tileLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  tileDesc: {
    fontSize: 11,
  },
  sheetBody: {
    padding: 16,
    gap: 16,
  },
  quickBarRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickActionBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
    gap: 3,
  },
  quickActionGlyph: {
    fontSize: 17,
    fontWeight: '700',
  },
  quickActionLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  colorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  colorBtn: {
    flex: 1,
    height: 40,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  colorResetText: {
    fontSize: 14,
    fontWeight: '700',
  },
  turnIntoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  turnChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
  },
  turnChipIcon: {
    fontSize: 12,
    fontWeight: '700',
  },
  turnChipLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  bottomActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  bigBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetActionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bigBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.35,
  },
  renameBox: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 15,
    fontWeight: '600',
  },
  listActions: {
    gap: 8,
  },
  sheetActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
  },
  sheetActionText: {
    fontSize: 15,
    fontWeight: '600',
  },
  chevronText: {
    fontSize: 14,
  },
  moveTargetsBox: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 8,
    gap: 6,
  },
  moveTargetRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 9,
  },
  moveTargetText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
