import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AppIcon } from '@/components/app-icon';
import { RipplePressable } from '@/components/ripple-pressable';
import {
  BOARD_COLOR_PALETTE,
  COLUMN_ACCENTS,
  DEFAULT_BOARD_COLOR_PRESETS,
  hexWithAlpha,
  type KanbanBoardColorDraft,
  type KanbanBoardColorRecord,
  type KanbanColumnRecord,
} from '@/features/kanban/types';
import { useThemeColors } from '@/theme/colors';

type BoardColorRowState = {
  localKey: string;
  id?: string;
  name: string;
  color: string;
};

type BoardDialogProps = {
  visible: boolean;
  mode: 'create' | 'edit';
  initialTitle: string;
  initialColors: KanbanBoardColorRecord[];
  canDelete: boolean;
  onClose: () => void;
  onSubmit: (title: string, colors: KanbanBoardColorDraft[]) => Promise<void>;
  onDelete?: () => Promise<void>;
};

export function BoardDialog(props: BoardDialogProps) {
  if (!props.visible) {
    return null;
  }
  return <BoardDialogContent {...props} />;
}

function BoardDialogContent({
  mode,
  initialTitle,
  initialColors,
  canDelete,
  onClose,
  onSubmit,
  onDelete,
}: BoardDialogProps) {
  const colors = useThemeColors();
  const [title, setTitle] = useState(initialTitle);
  const [colorRows, setColorRows] = useState<BoardColorRowState[]>(() =>
    initialColors.map((item, idx) => ({
      localKey: item.id || `init-${idx}`,
      id: item.id,
      name: item.name,
      color: item.color,
    })),
  );
  const [paletteRowIndex, setPaletteRowIndex] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function pickNextColor(): string {
    const used = new Set(colorRows.map((row) => row.color.toLowerCase()));
    const unused = BOARD_COLOR_PALETTE.find((hex) => !used.has(hex.toLowerCase()));
    return unused ?? BOARD_COLOR_PALETTE[colorRows.length % BOARD_COLOR_PALETTE.length];
  }

  function handleAddColor() {
    setColorRows((prev) => [
      ...prev,
      {
        localKey: `new-${Date.now()}-${prev.length}`,
        name: '',
        color: pickNextColor(),
      },
    ]);
  }

  function handleAddPresets() {
    setColorRows(
      DEFAULT_BOARD_COLOR_PRESETS.map((preset, idx) => ({
        localKey: `preset-${Date.now()}-${idx}`,
        name: preset.name,
        color: preset.color,
      })),
    );
  }

  function handleMoveColor(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= colorRows.length) {
      return;
    }
    setColorRows((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  }

  function handleRemoveColor(index: number) {
    if (paletteRowIndex === index) {
      setPaletteRowIndex(null);
    }
    setColorRows((prev) => prev.filter((_, idx) => idx !== index));
  }

  async function handleSubmit() {
    const trimmed = title.trim();
    if (!trimmed || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      const drafts: KanbanBoardColorDraft[] = colorRows.map((row) => ({
        id: row.id,
        name: row.name.trim(),
        color: row.color,
      }));
      await onSubmit(trimmed, drafts);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!onDelete || submitting) {
      return;
    }
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSubmitting(true);
    try {
      await onDelete();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View
          entering={FadeIn.duration(140)}
          style={[
            styles.dialog,
            styles.boardDialog,
            { backgroundColor: colors.surface, borderColor: colors.line },
          ]}>
          <View style={styles.dialogHeader}>
            <Text style={[styles.title, { color: colors.text }]}>
              {mode === 'create' ? 'Новая доска' : 'Настройки доски'}
            </Text>
            <RipplePressable
              accessibilityLabel="Закрыть"
              onPress={onClose}
              style={StyleSheet.flatten([
                styles.closeIconBtn,
                { backgroundColor: colors.surfaceSubtle },
              ])}>
              <AppIcon name="close" size="xs" color={colors.muted} />
            </RipplePressable>
          </View>

          <ScrollView
            style={styles.boardScroll}
            contentContainerStyle={styles.boardScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.muted }]}>Название доски</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                onSubmitEditing={handleSubmit}
                autoFocus={mode === 'create'}
                placeholder="Например: Work, Учёба, Личное"
                placeholderTextColor={colors.muted}
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.line,
                  },
                ]}
              />
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderText}>
                  <Text style={[styles.sectionLabel, { color: colors.muted }]}>
                    Цвета и проекты
                  </Text>
                  <Text style={[styles.sectionHint, { color: colors.muted }]}>
                    Назовите цвета — они появятся внизу доски и в карточках
                  </Text>
                </View>
                <RipplePressable
                  onPress={handleAddColor}
                  style={StyleSheet.flatten([
                    styles.addColorBtn,
                    { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                  ])}>
                  <AppIcon name="plus" size="xs" color={colors.text} />
                  <Text style={[styles.addColorBtnText, { color: colors.text }]}>Цвет</Text>
                </RipplePressable>
              </View>

              {colorRows.length === 0 ? (
                <View
                  style={[
                    styles.emptyColorsBox,
                    { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                  ]}>
                  <Text style={[styles.emptyColorsText, { color: colors.muted }]}>
                    Цвета ещё не заданы. Можно добавить 4 базовых цвета и подписать их под свои
                    проекты.
                  </Text>
                  <RipplePressable
                    onPress={handleAddPresets}
                    style={StyleSheet.flatten([
                      styles.presetBtn,
                      { backgroundColor: colors.surface, borderColor: colors.line },
                    ])}>
                    <View style={styles.presetDots}>
                      {DEFAULT_BOARD_COLOR_PRESETS.map((preset) => (
                        <View
                          key={preset.color}
                          style={[styles.presetDot, { backgroundColor: preset.color }]}
                        />
                      ))}
                    </View>
                    <Text style={[styles.presetBtnText, { color: colors.text }]}>
                      Добавить 4 базовых цвета
                    </Text>
                  </RipplePressable>
                </View>
              ) : (
                <View style={styles.colorRowsList}>
                  {colorRows.map((row, index) => (
                    <View
                      key={row.localKey}
                      style={[
                        styles.colorEditorRow,
                        {
                          backgroundColor: hexWithAlpha(row.color, 0.1),
                          borderColor: hexWithAlpha(row.color, 0.35),
                        },
                      ]}>
                      <RipplePressable
                        accessibilityLabel="Выбрать оттенок"
                        onPress={() => setPaletteRowIndex(index)}
                        style={StyleSheet.flatten([
                          styles.colorPickTrigger,
                          {
                            backgroundColor: row.color,
                            borderColor: colors.surface,
                          },
                        ])}
                      />

                      <TextInput
                        value={row.name}
                        onChangeText={(text) =>
                          setColorRows((prev) =>
                            prev.map((item, idx) =>
                              idx === index ? { ...item, name: text } : item,
                            ),
                          )
                        }
                        placeholder="Название проекта (напр. MentalWords)"
                        placeholderTextColor={colors.muted}
                        style={[styles.colorNameInput, { color: colors.text }]}
                      />

                      {colorRows.length > 1 ? (
                        <View style={styles.rowReorderGroup}>
                          <RipplePressable
                            accessibilityLabel="Поднять выше"
                            disabled={index === 0}
                            onPress={() => handleMoveColor(index, -1)}
                            style={StyleSheet.flatten([
                              styles.rowIconBtn,
                              index === 0 ? styles.disabled : null,
                            ])}>
                            <AppIcon name="arrowUp" size={12} color={colors.muted} />
                          </RipplePressable>
                          <RipplePressable
                            accessibilityLabel="Опустить ниже"
                            disabled={index === colorRows.length - 1}
                            onPress={() => handleMoveColor(index, 1)}
                            style={StyleSheet.flatten([
                              styles.rowIconBtn,
                              index === colorRows.length - 1 ? styles.disabled : null,
                            ])}>
                            <AppIcon name="arrowDown" size={12} color={colors.muted} />
                          </RipplePressable>
                        </View>
                      ) : null}

                      <RipplePressable
                        accessibilityLabel="Удалить цвет"
                        onPress={() => handleRemoveColor(index)}
                        style={styles.rowIconBtn}>
                        <AppIcon name="close" size={13} color={colors.muted} />
                      </RipplePressable>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>

          <View style={[styles.actions, styles.boardFooter, { borderTopColor: colors.line }]}>
            {mode === 'edit' && canDelete && onDelete ? (
              <RipplePressable
                onPress={handleDelete}
                style={StyleSheet.flatten([
                  styles.btn,
                  { backgroundColor: confirmDelete ? colors.danger : colors.dangerBg },
                ])}>
                <Text
                  style={[
                    styles.btnLabel,
                    { color: confirmDelete ? '#FFFFFF' : colors.danger },
                  ]}>
                  {confirmDelete ? 'Точно удалить?' : 'Удалить'}
                </Text>
              </RipplePressable>
            ) : (
              <View />
            )}

            <View style={styles.rightActions}>
              <RipplePressable
                onPress={onClose}
                style={StyleSheet.flatten([
                  styles.btn,
                  { backgroundColor: colors.surfaceSubtle },
                ])}>
                <Text style={[styles.btnLabel, { color: colors.muted }]}>Отмена</Text>
              </RipplePressable>
              <RipplePressable
                disabled={title.trim().length === 0 || submitting}
                onPress={handleSubmit}
                style={StyleSheet.flatten([
                  styles.btn,
                  { backgroundColor: colors.accent },
                  title.trim().length === 0 || submitting ? styles.disabled : null,
                ])}>
                <Text style={[styles.btnLabel, { color: colors.accentText }]}>
                  {mode === 'create' ? 'Создать' : 'Сохранить'}
                </Text>
              </RipplePressable>
            </View>
          </View>

          {/* In-modal floating palette overlay (avoids nested Modals on iOS & zero layout shift) */}
          {paletteRowIndex !== null && colorRows[paletteRowIndex] ? (
            <View style={styles.paletteOverlayRoot}>
              <Pressable
                style={styles.paletteOverlayBackdrop}
                onPress={() => setPaletteRowIndex(null)}
              />
              <View
                style={[
                  styles.paletteCard,
                  { backgroundColor: colors.surface, borderColor: colors.line },
                ]}>
                <View style={styles.paletteCardHeader}>
                  <Text style={[styles.paletteCardTitle, { color: colors.text }]}>
                    Выберите цвет
                  </Text>
                  <RipplePressable
                    onPress={() => setPaletteRowIndex(null)}
                    style={styles.rowIconBtn}>
                    <AppIcon name="close" size="xs" color={colors.muted} />
                  </RipplePressable>
                </View>
                <View style={styles.paletteGrid}>
                  {BOARD_COLOR_PALETTE.map((swatch) => {
                    const selected =
                      colorRows[paletteRowIndex].color.toLowerCase() === swatch.toLowerCase();
                    return (
                      <Pressable
                        key={swatch}
                        accessibilityLabel={`Оттенок ${swatch}`}
                        onPress={() => {
                          const targetIdx = paletteRowIndex;
                          setColorRows((prev) =>
                            prev.map((item, idx) =>
                              idx === targetIdx ? { ...item, color: swatch } : item,
                            ),
                          );
                          setPaletteRowIndex(null);
                        }}
                        style={({ hovered }: { hovered?: boolean }) => [
                          styles.paletteSwatchOuter,
                          {
                            borderColor: selected
                              ? colors.text
                              : hovered
                                ? colors.muted
                                : 'transparent',
                            transform: hovered ? [{ scale: 1.08 }] : undefined,
                          },
                        ]}>
                        <View style={[styles.paletteSwatchInner, { backgroundColor: swatch }]} />
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          ) : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type ColumnDialogProps = {
  visible: boolean;
  mode: 'create' | 'edit';
  initialTitle: string;
  initialAccent: string;
  canDelete: boolean;
  onClose: () => void;
  onSubmit: (title: string, accent: string) => Promise<void>;
  onDelete?: () => Promise<void>;
};

export function ColumnDialog(props: ColumnDialogProps) {
  if (!props.visible) {
    return null;
  }
  return <ColumnDialogContent {...props} />;
}

function ColumnDialogContent({
  mode,
  initialTitle,
  initialAccent,
  canDelete,
  onClose,
  onSubmit,
  onDelete,
}: ColumnDialogProps) {
  const colors = useThemeColors();
  const [title, setTitle] = useState(initialTitle);
  const [accent, setAccent] = useState(initialAccent || COLUMN_ACCENTS[0]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleSubmit() {
    const trimmed = title.trim();
    if (!trimmed) {
      return;
    }
    await onSubmit(trimmed, accent);
    onClose();
  }

  async function handleDelete() {
    if (!onDelete) {
      return;
    }
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await onDelete();
    onClose();
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View
          entering={FadeIn.duration(140)}
          style={[
            styles.dialog,
            { backgroundColor: colors.surface, borderColor: colors.line },
          ]}>
          <Text style={[styles.title, { color: colors.text }]}>
            {mode === 'create' ? 'Новая колонка' : 'Редактировать колонку'}
          </Text>

          <TextInput
            value={title}
            onChangeText={setTitle}
            onSubmitEditing={handleSubmit}
            autoFocus
            placeholder="Название колонки"
            placeholderTextColor={colors.muted}
            style={[
              styles.input,
              {
                color: colors.text,
                backgroundColor: colors.surfaceSubtle,
                borderColor: colors.line,
              },
            ]}
          />

          <View style={styles.colorRow}>
            {COLUMN_ACCENTS.map((swatch) => {
              const selected = accent === swatch;
              return (
                <Pressable
                  key={swatch}
                  accessibilityLabel={`Цвет ${swatch}`}
                  onPress={() => setAccent(swatch)}
                  style={({ hovered }: { hovered?: boolean }) => [
                    styles.swatchOuter,
                    {
                      borderColor: selected
                        ? colors.text
                        : hovered
                          ? colors.muted
                          : 'transparent',
                      transform: hovered ? [{ scale: 1.1 }] : undefined,
                    },
                  ]}>
                  <View style={[styles.swatchInner, { backgroundColor: swatch }]} />
                </Pressable>
              );
            })}
          </View>

          <View style={styles.actions}>
            {mode === 'edit' && canDelete && onDelete ? (
              <RipplePressable
                onPress={handleDelete}
                style={StyleSheet.flatten([
                  styles.btn,
                  { backgroundColor: confirmDelete ? colors.danger : colors.dangerBg },
                ])}>
                <Text
                  style={[
                    styles.btnLabel,
                    { color: confirmDelete ? '#FFFFFF' : colors.danger },
                  ]}>
                  {confirmDelete ? 'Удалить с карточками?' : 'Удалить'}
                </Text>
              </RipplePressable>
            ) : (
              <View />
            )}

            <View style={styles.rightActions}>
              <RipplePressable
                onPress={onClose}
                style={StyleSheet.flatten([
                  styles.btn,
                  { backgroundColor: colors.surfaceSubtle },
                ])}>
                <Text style={[styles.btnLabel, { color: colors.muted }]}>Отмена</Text>
              </RipplePressable>
              <RipplePressable
                disabled={title.trim().length === 0}
                onPress={handleSubmit}
                style={StyleSheet.flatten([
                  styles.btn,
                  { backgroundColor: colors.accent },
                  title.trim().length === 0 ? styles.disabled : null,
                ])}>
                <Text style={[styles.btnLabel, { color: colors.accentText }]}>
                  {mode === 'create' ? 'Добавить' : 'Сохранить'}
                </Text>
              </RipplePressable>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

type ColumnsManagerDialogProps = {
  visible: boolean;
  columns: KanbanColumnRecord[];
  cardCountByColumn: Record<string, number>;
  onClose: () => void;
  onMoveColumn: (columnId: string, direction: -1 | 1) => Promise<void>;
  onEditColumn: (column: KanbanColumnRecord) => void;
  onCreateColumn: () => void;
};

export function ColumnsManagerDialog({
  visible,
  columns,
  cardCountByColumn,
  onClose,
  onMoveColumn,
  onEditColumn,
  onCreateColumn,
}: ColumnsManagerDialogProps) {
  const colors = useThemeColors();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!visible) {
    return null;
  }

  async function handleMove(columnId: string, direction: -1 | 1) {
    if (busyId) {
      return;
    }
    setBusyId(columnId);
    try {
      await onMoveColumn(columnId, direction);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View
          entering={FadeIn.duration(140)}
          style={[
            styles.dialog,
            styles.boardDialog,
            { backgroundColor: colors.surface, borderColor: colors.line },
          ]}>
          <View style={styles.dialogHeader}>
            <View style={styles.sectionHeaderText}>
              <Text style={[styles.title, { color: colors.text }]}>Колонки доски</Text>
              <Text style={[styles.sectionHint, { color: colors.muted }]}>
                Меняйте порядок, названия или добавляйте новые колонки
              </Text>
            </View>
            <RipplePressable
              accessibilityLabel="Закрыть"
              onPress={onClose}
              style={StyleSheet.flatten([
                styles.closeIconBtn,
                { backgroundColor: colors.surfaceSubtle },
              ])}>
              <AppIcon name="close" size="xs" color={colors.muted} />
            </RipplePressable>
          </View>

          <ScrollView
            style={styles.boardScroll}
            contentContainerStyle={styles.colorRowsList}
            showsVerticalScrollIndicator={false}>
            {columns.map((col, index) => {
              const count = cardCountByColumn[col.id] ?? 0;
              return (
                <View
                  key={col.id}
                  style={[
                    styles.columnManagerRow,
                    {
                      backgroundColor: colors.surfaceSubtle,
                      borderColor: colors.line,
                    },
                  ]}>
                  <View style={[styles.colManagerDot, { backgroundColor: col.accent }]} />
                  <Text
                    style={[styles.colManagerTitle, { color: colors.text }]}
                    numberOfLines={1}>
                    {col.title}
                  </Text>
                  <View style={[styles.colManagerCountPill, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.colManagerCountText, { color: colors.muted }]}>
                      {count}
                    </Text>
                  </View>

                  {columns.length > 1 ? (
                    <View style={styles.rowReorderGroup}>
                      <RipplePressable
                        accessibilityLabel={`Поднять «${col.title}» выше`}
                        disabled={index === 0 || busyId !== null}
                        onPress={() => handleMove(col.id, -1)}
                        style={StyleSheet.flatten([
                          styles.colManagerIconBtn,
                          { backgroundColor: colors.surface },
                          index === 0 ? styles.disabled : null,
                        ])}>
                        <AppIcon name="arrowUp" size={13} color={colors.text} />
                      </RipplePressable>
                      <RipplePressable
                        accessibilityLabel={`Опустить «${col.title}» ниже`}
                        disabled={index === columns.length - 1 || busyId !== null}
                        onPress={() => handleMove(col.id, 1)}
                        style={StyleSheet.flatten([
                          styles.colManagerIconBtn,
                          { backgroundColor: colors.surface },
                          index === columns.length - 1 ? styles.disabled : null,
                        ])}>
                        <AppIcon name="arrowDown" size={13} color={colors.text} />
                      </RipplePressable>
                    </View>
                  ) : null}

                  <RipplePressable
                    accessibilityLabel={`Редактировать «${col.title}»`}
                    onPress={() => {
                      onClose();
                      onEditColumn(col);
                    }}
                    style={StyleSheet.flatten([
                      styles.colManagerIconBtn,
                      { backgroundColor: colors.surface },
                    ])}>
                    <AppIcon name="edit" size={13} color={colors.muted} />
                  </RipplePressable>
                </View>
              );
            })}
          </ScrollView>

          <View style={[styles.actions, styles.boardFooter, { borderTopColor: colors.line }]}>
            <RipplePressable
              onPress={() => {
                onClose();
                onCreateColumn();
              }}
              style={StyleSheet.flatten([
                styles.addColorBtn,
                { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
              ])}>
              <AppIcon name="plus" size="xs" color={colors.text} />
              <Text style={[styles.addColorBtnText, { color: colors.text }]}>
                Новая колонка
              </Text>
            </RipplePressable>

            <RipplePressable
              onPress={onClose}
              style={StyleSheet.flatten([styles.btn, { backgroundColor: colors.accent }])}>
              <Text style={[styles.btnLabel, { color: colors.accentText }]}>Готово</Text>
            </RipplePressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 12, 16, 0.45)',
  },
  dialog: {
    position: 'relative',
    width: '100%',
    maxWidth: 400,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    gap: 14,
    overflow: 'hidden',
  },
  boardDialog: {
    maxWidth: 480,
    maxHeight: '86%',
  },
  dialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  closeIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  boardScroll: {
    flexGrow: 0,
  },
  boardScrollContent: {
    gap: 16,
    paddingBottom: 4,
  },
  section: {
    gap: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionHeaderText: {
    flex: 1,
    gap: 2,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionHint: {
    fontSize: 12,
    lineHeight: 16,
  },
  addColorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
  },
  addColorBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyColorsBox: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 10,
    alignItems: 'flex-start',
  },
  emptyColorsText: {
    fontSize: 12,
    lineHeight: 17,
  },
  presetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
  },
  presetDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  presetDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  presetBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  colorRowsList: {
    gap: 8,
  },
  colorEditorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
  },
  colorPickTrigger: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  colorNameInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    paddingVertical: 4,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  rowReorderGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  rowIconBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardFooter: {
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  paletteOverlayRoot: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 30,
  },
  paletteOverlayBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 12, 16, 0.35)',
  },
  paletteCard: {
    width: '100%',
    maxWidth: 280,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 12,
  },
  paletteCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paletteCardTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  paletteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  paletteSwatchOuter: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paletteSwatchInner: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  input: {
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  swatchOuter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchInner: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 4,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  btn: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 10,
  },
  btnLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.4,
  },
  columnManagerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
  },
  colManagerDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  colManagerTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  colManagerCountPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  colManagerCountText: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  colManagerIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
