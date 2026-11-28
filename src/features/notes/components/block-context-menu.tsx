import { useState } from "react";
import {
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { AppIcon } from "@/components/app-icon";
import { RipplePressable } from "@/components/ripple-pressable";
import {
    BLOCK_COLORS,
    BLOCK_TYPE_CATALOG,
    MAX_INDENT_LEVEL,
    type NoteBlockColor,
    type NoteBlockRecord,
    type NoteBlockType,
    TURN_INTO_TYPES,
} from "@/features/notes/types";
import type { ThemeColors } from "@/theme/colors";

export type PopoverAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Props = {
  visible: boolean;
  anchor: PopoverAnchor | null;
  block: NoteBlockRecord;
  index: number;
  totalBlocks: number;
  canIndent: boolean;
  colors: ThemeColors;
  onTurnInto: (nextType: NoteBlockType) => void;
  onChangeColor: (color: NoteBlockColor) => void;
  onIndent: (delta: -1 | 1) => void;
  onInsertBelow: () => void;
  onMoveBlock: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
};

const COLOR_KEYS: readonly NoteBlockColor[] = [
  "default",
  "gray",
  "blue",
  "green",
  "yellow",
  "red",
  "purple",
];

const MENU_WIDTH = 256;
const ESTIMATED_HEIGHT = 360;

export function BlockContextMenu(props: Props) {
  if (!props.visible || !props.anchor) {
    return null;
  }
  return (
    <BlockContextMenuContent
      key={props.block.id}
      {...props}
      anchor={props.anchor}
    />
  );
}

function BlockContextMenuContent({
  anchor,
  block,
  index,
  totalBlocks,
  canIndent,
  colors,
  onTurnInto,
  onChangeColor,
  onIndent,
  onInsertBelow,
  onMoveBlock,
  onDuplicate,
  onDelete,
  onClose,
}: Omit<Props, "anchor"> & { anchor: PopoverAnchor }) {
  const { width: winW, height: winH } = useWindowDimensions();
  const [turnIntoOpen, setTurnIntoOpen] = useState(false);

  const canTurnInto = block.type !== "page" && block.type !== "divider";
  const turnIntoItems = BLOCK_TYPE_CATALOG.filter((item) =>
    TURN_INTO_TYPES.includes(item.type),
  );

  // Clamp cleanly inside viewport; flip above anchor if near bottom
  const left = Math.max(10, Math.min(anchor.x, winW - MENU_WIDTH - 10));
  const preferBelow = anchor.y + anchor.height + 6;
  const maxHeight = Math.min(440, winH - 24);
  const top =
    preferBelow + ESTIMATED_HEIGHT > winH - 12
      ? Math.max(12, anchor.y - Math.min(ESTIMATED_HEIGHT, maxHeight) - 6)
      : preferBelow;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <Animated.View
          entering={FadeIn.duration(100)}
          style={[
            styles.menu,
            {
              left,
              top,
              width: MENU_WIDTH,
              maxHeight,
              backgroundColor: colors.surface,
              borderColor: colors.line,
            },
          ]}
        >
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="always">
            {/* Turn into */}
            {canTurnInto ? (
              <View
                style={[styles.section, { borderBottomColor: colors.line }]}
              >
                <Pressable
                  onPress={() => setTurnIntoOpen((value) => !value)}
                  style={({ hovered }: { hovered?: boolean }) => [
                    styles.menuItem,
                    hovered ? { backgroundColor: colors.surfaceSubtle } : null,
                  ]}
                >
                  <AppIcon name="turnInto" size="sm" color={colors.muted} />
                  <Text style={[styles.menuLabel, { color: colors.text }]}>
                    Превратить в
                  </Text>
                  <AppIcon
                    name={turnIntoOpen ? "chevronDown" : "chevronRight"}
                    size="xs"
                    color={colors.muted}
                  />
                </Pressable>

                {turnIntoOpen ? (
                  <View style={styles.turnIntoList}>
                    {turnIntoItems.map((item) => {
                      const active = item.type === block.type;
                      return (
                        <Pressable
                          key={item.type}
                          onPress={() => {
                            onTurnInto(item.type);
                            onClose();
                          }}
                          style={({ hovered }: { hovered?: boolean }) => [
                            styles.turnIntoItem,
                            active
                              ? { backgroundColor: colors.surfaceActive }
                              : hovered
                                ? { backgroundColor: colors.surfaceSubtle }
                                : null,
                          ]}
                        >
                          <AppIcon
                            name={item.icon}
                            size="xs"
                            color={colors.muted}
                          />
                          <Text
                            style={[
                              styles.turnIntoLabel,
                              { color: colors.text },
                            ]}
                          >
                            {item.label}
                          </Text>
                          {active ? (
                            <AppIcon
                              name="check"
                              size="xs"
                              color={colors.text}
                            />
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Block background color */}
            {block.type !== "divider" ? (
              <View
                style={[
                  styles.colorSection,
                  { borderBottomColor: colors.line },
                ]}
              >
                <Text style={[styles.sectionCaption, { color: colors.muted }]}>
                  Цвет блока
                </Text>
                <View style={styles.colorRow}>
                  {COLOR_KEYS.map((colorKey) => {
                    const meta = BLOCK_COLORS[colorKey];
                    const selected = block.blockColor === colorKey;
                    return (
                      <Pressable
                        key={colorKey}
                        accessibilityLabel={meta.label}
                        onPress={() => onChangeColor(colorKey)}
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
                        {colorKey === 'default' ? (
                          <View
                            style={[
                              styles.swatchDefault,
                              {
                                borderColor: colors.muted,
                                backgroundColor: colors.surfaceSubtle,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.swatchResetGlyph,
                                { color: colors.muted },
                              ]}
                            >
                              /
                            </Text>
                          </View>
                        ) : (
                          <View
                            style={[
                              styles.swatchInner,
                              { backgroundColor: meta.dot },
                            ]}
                          />
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Indent & Position */}
            <View style={[styles.section, { borderBottomColor: colors.line }]}>
              <View style={styles.compactActionsRow}>
                <RipplePressable
                  disabled={block.indentLevel <= 0}
                  onPress={() => onIndent(-1)}
                  style={StyleSheet.flatten([
                    styles.compactBtn,
                    { backgroundColor: colors.surfaceSubtle },
                    block.indentLevel <= 0 ? styles.disabled : null,
                  ])}
                >
                  <AppIcon name="outdent" size="xs" color={colors.text} />
                  <Text style={[styles.compactBtnText, { color: colors.text }]}>
                    Левее
                  </Text>
                </RipplePressable>

                <RipplePressable
                  disabled={!canIndent || block.indentLevel >= MAX_INDENT_LEVEL}
                  onPress={() => onIndent(1)}
                  style={StyleSheet.flatten([
                    styles.compactBtn,
                    { backgroundColor: colors.surfaceSubtle },
                    !canIndent || block.indentLevel >= MAX_INDENT_LEVEL
                      ? styles.disabled
                      : null,
                  ])}
                >
                  <AppIcon name="indent" size="xs" color={colors.text} />
                  <Text style={[styles.compactBtnText, { color: colors.text }]}>
                    Вложить
                  </Text>
                </RipplePressable>
              </View>

              <View style={styles.compactActionsRow}>
                <RipplePressable
                  disabled={index <= 0}
                  onPress={() => onMoveBlock(-1)}
                  style={StyleSheet.flatten([
                    styles.compactBtn,
                    { backgroundColor: colors.surfaceSubtle },
                    index <= 0 ? styles.disabled : null,
                  ])}
                >
                  <AppIcon name="arrowUp" size="xs" color={colors.text} />
                  <Text style={[styles.compactBtnText, { color: colors.text }]}>
                    Выше
                  </Text>
                </RipplePressable>

                <RipplePressable
                  disabled={index >= totalBlocks - 1}
                  onPress={() => onMoveBlock(1)}
                  style={StyleSheet.flatten([
                    styles.compactBtn,
                    { backgroundColor: colors.surfaceSubtle },
                    index >= totalBlocks - 1 ? styles.disabled : null,
                  ])}
                >
                  <AppIcon name="arrowDown" size="xs" color={colors.text} />
                  <Text style={[styles.compactBtnText, { color: colors.text }]}>
                    Ниже
                  </Text>
                </RipplePressable>
              </View>
            </View>

            {/* Primary block ops */}
            <View style={styles.sectionPlain}>
              <Pressable
                onPress={() => {
                  onInsertBelow();
                  onClose();
                }}
                style={({ hovered }: { hovered?: boolean }) => [
                  styles.menuItem,
                  hovered ? { backgroundColor: colors.surfaceSubtle } : null,
                ]}
              >
                <AppIcon name="plus" size="sm" color={colors.muted} />
                <Text style={[styles.menuLabel, { color: colors.text }]}>
                  Вставить блок ниже
                </Text>
              </Pressable>

              {block.type !== "page" ? (
                <Pressable
                  onPress={() => {
                    onDuplicate();
                    onClose();
                  }}
                  style={({ hovered }: { hovered?: boolean }) => [
                    styles.menuItem,
                    hovered ? { backgroundColor: colors.surfaceSubtle } : null,
                  ]}
                >
                  <AppIcon name="copy" size="sm" color={colors.muted} />
                  <Text style={[styles.menuLabel, { color: colors.text }]}>
                    Дублировать
                  </Text>
                  <Text style={[styles.menuHint, { color: colors.muted }]}>
                    ⌘D
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                onPress={() => {
                  onDelete();
                  onClose();
                }}
                style={({ hovered }: { hovered?: boolean }) => [
                  styles.menuItem,
                  hovered ? { backgroundColor: colors.dangerBg } : null,
                ]}
              >
                <AppIcon name="trash" size="sm" color={colors.danger} />
                <Text style={[styles.menuLabel, { color: colors.danger }]}>
                  Удалить блок
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "transparent",
  },
  menu: {
    position: "absolute",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    elevation: 14,
    ...(Platform.OS === "web"
      ? ({
          boxShadow:
            "0 10px 30px rgba(0, 0, 0, 0.32), 0 2px 8px rgba(0, 0, 0, 0.16)",
        } as object)
      : {
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
        }),
  },
  section: {
    paddingVertical: 5,
    paddingHorizontal: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 5,
  },
  sectionPlain: {
    paddingVertical: 5,
    paddingHorizontal: 5,
    gap: 2,
  },
  colorSection: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 7,
  },
  sectionCaption: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  colorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  swatchOuter: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.75,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === 'web'
      ? ({
          cursor: 'pointer',
          transition: 'border-color 120ms ease, transform 120ms ease',
        } as object)
      : null),
  },
  swatchInner: {
    width: 17,
    height: 17,
    borderRadius: 9,
  },
  swatchDefault: {
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  swatchResetGlyph: {
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 12,
  },
  compactActionsRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 4,
  },
  compactBtn: {
    flex: 1,
    flexDirection: "row",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  compactBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.35,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 7,
    ...(Platform.OS === 'web'
      ? ({ cursor: 'pointer', transition: 'background-color 110ms ease' } as object)
      : null),
  },
  menuIcon: {
    width: 16,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "700",
  },
  menuLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
  },
  menuHint: {
    fontSize: 11,
    fontWeight: "600",
  },
  turnIntoList: {
    paddingTop: 2,
    gap: 1,
  },
  turnIntoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
    ...(Platform.OS === 'web'
      ? ({ cursor: 'pointer', transition: 'background-color 110ms ease' } as object)
      : null),
  },
  turnIntoIcon: {
    width: 22,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
  },
  turnIntoLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
  },
  checkMark: {
    fontSize: 12,
    fontWeight: "700",
  },
});
