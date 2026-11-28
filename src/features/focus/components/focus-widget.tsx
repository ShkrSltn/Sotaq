import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { RipplePressable } from '@/components/ripple-pressable';
import { useDatabase } from '@/db/provider';
import { useAuth } from '@/features/auth/auth-context';
import { useFocus } from '@/features/focus/focus-context';
import { listLinkableFocusTargets } from '@/features/focus/focus-repository';
import {
  FOCUS_DURATION_PRESETS,
  FOCUS_MODE_META,
  type FocusLinkTarget,
  type FocusMode,
  formatClock,
} from '@/features/focus/types';
import { useThemeColors, useViewport } from '@/theme/colors';

const MODES: readonly FocusMode[] = ['focus', 'short_break', 'long_break'];

function TaskPickerModal({
  visible,
  selectedId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selectedId: string | null;
  onSelect: (target: FocusLinkTarget | null) => void;
  onClose: () => void;
}) {
  const db = useDatabase();
  const { user } = useAuth();
  const colors = useThemeColors();
  const { isDesktop } = useViewport();
  const insets = useSafeAreaInsets();

  const [targets, setTargets] = useState<FocusLinkTarget[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!visible || !user?.id) {
      return;
    }
    let cancelled = false;
    listLinkableFocusTargets(db, user.id).then((items) => {
      if (!cancelled) {
        setTargets(items);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [visible, db, user?.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return targets;
    }
    return targets.filter(
      (item) =>
        item.title.toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q),
    );
  }, [targets, query]);

  if (!visible) {
    return null;
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View
          entering={
            isDesktop ? FadeIn.duration(140) : SlideInDown.springify().damping(24).stiffness(260)
          }
          style={[
            styles.pickerSheet,
            isDesktop ? styles.pickerDesktop : styles.pickerMobile,
            {
              backgroundColor: colors.surface,
              borderColor: colors.line,
              paddingBottom: isDesktop ? 14 : Math.max(insets.bottom, 14),
            },
          ]}>
          <View style={[styles.pickerHeader, { borderBottomColor: colors.line }]}>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>Привязать к фокусу</Text>
            <RipplePressable
              onPress={onClose}
              style={StyleSheet.flatten([
                styles.closeIconBtn,
                { backgroundColor: colors.surfaceSubtle },
              ])}>
              <AppIcon name="close" size="xs" color={colors.muted} />
            </RipplePressable>
          </View>

          <View style={styles.pickerSearchWrap}>
            <View
              style={[
                styles.pickerSearchBox,
                { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
              ]}>
              <AppIcon name="search" size="xs" color={colors.muted} />
              <TextInput
                autoFocus={Platform.OS === 'web'}
                value={query}
                onChangeText={setQuery}
                placeholder="Найти задачу или карточку…"
                placeholderTextColor={colors.muted}
                style={[styles.pickerSearchInput, { color: colors.text }]}
              />
            </View>
          </View>

          <ScrollView style={styles.pickerList} contentContainerStyle={styles.pickerListContent}>
            {selectedId ? (
              <RipplePressable
                onPress={() => {
                  onSelect(null);
                  onClose();
                }}
                style={StyleSheet.flatten([
                  styles.pickerRow,
                  { backgroundColor: colors.surfaceSubtle },
                ])}>
                <AppIcon name="unlink" size="xs" color={colors.muted} />
                <Text style={[styles.pickerRowTitle, { color: colors.muted }]}>
                  Без привязки к задаче
                </Text>
              </RipplePressable>
            ) : null}

            {filtered.length === 0 ? (
              <Text style={[styles.pickerEmpty, { color: colors.muted }]}>
                Нет активных задач или карточек
              </Text>
            ) : (
              filtered.map((item) => {
                const active = item.id === selectedId;
                return (
                  <RipplePressable
                    key={`${item.type}-${item.id}`}
                    onPress={() => {
                      onSelect(item);
                      onClose();
                    }}
                    style={StyleSheet.flatten([
                      styles.pickerRow,
                      active ? { backgroundColor: colors.surfaceActive } : null,
                    ])}>
                    <AppIcon
                      name={item.type === 'todo' ? 'todos' : 'kanban'}
                      size="xs"
                      color={active ? colors.text : colors.muted}
                    />
                    <View style={styles.pickerRowTexts}>
                      <Text
                        style={[styles.pickerRowTitle, { color: colors.text }]}
                        numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text
                        style={[styles.pickerRowSub, { color: colors.muted }]}
                        numberOfLines={1}>
                        {item.subtitle}
                      </Text>
                    </View>
                    {active ? <AppIcon name="check" size="xs" color={colors.text} /> : null}
                  </RipplePressable>
                );
              })
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function FocusSidebarWidget() {
  const colors = useThemeColors();
  const focus = useFocus();
  const [expanded, setExpanded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const progress =
    focus.totalSeconds > 0
      ? Math.min(100, Math.round(((focus.totalSeconds - focus.secondsLeft) / focus.totalSeconds) * 100))
      : 0;

  const accentColor = focus.mode === 'focus' ? colors.accent : colors.success;

  return (
    <View style={[styles.sidebarWrap, { borderTopColor: colors.line }]}>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
        ]}>
        {/* Top Row: mode + today mins + expand toggle */}
        <RipplePressable
          onPress={() => setExpanded((v) => !v)}
          style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View
              style={[
                styles.liveDot,
                { backgroundColor: focus.isRunning ? colors.success : colors.muted },
              ]}
            />
            <Text style={[styles.modeLabel, { color: colors.muted }]}>
              {FOCUS_MODE_META[focus.mode].shortLabel}
            </Text>
          </View>

          <View style={styles.cardHeaderRight}>
            <Text style={[styles.todayMeta, { color: colors.muted }]}>
              {focus.stats.todayMinutes > 0
                ? `${focus.stats.todayMinutes}м`
                : '0м'}
            </Text>
            <AppIcon
              name={expanded ? 'chevronDown' : 'chevronUp'}
              size="xs"
              color={colors.muted}
            />
          </View>
        </RipplePressable>

        {/* Clock + Quick Controls */}
        <View style={styles.clockRow}>
          <Text style={[styles.clockText, { color: colors.text }]}>
            {formatClock(focus.secondsLeft)}
          </Text>

          <View style={styles.controlsRow}>
            <RipplePressable
              accessibilityLabel={focus.isRunning ? 'Пауза' : 'Старт'}
              onPress={focus.toggle}
              style={StyleSheet.flatten([
                styles.playBtn,
                { backgroundColor: colors.accent },
              ])}>
              <AppIcon
                name={focus.isRunning ? 'pause' : 'play'}
                size="xs"
                color={colors.accentText}
              />
            </RipplePressable>

            <RipplePressable
              accessibilityLabel="Сбросить таймер"
              onPress={focus.reset}
              style={StyleSheet.flatten([
                styles.smallCtrlBtn,
                { backgroundColor: colors.surface },
              ])}>
              <AppIcon name="reset" size={12} color={colors.muted} />
            </RipplePressable>

            <RipplePressable
              accessibilityLabel="Переключить режим"
              onPress={focus.skip}
              style={StyleSheet.flatten([
                styles.smallCtrlBtn,
                { backgroundColor: colors.surface },
              ])}>
              <AppIcon name="skip" size={12} color={colors.muted} />
            </RipplePressable>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={[styles.progressTrack, { backgroundColor: colors.line }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${progress}%`, backgroundColor: accentColor },
            ]}
          />
        </View>

        {/* Linked Task Chip */}
        {focus.linkedTarget ? (
          <View style={[styles.linkedRow, { backgroundColor: colors.surface }]}>
            <RipplePressable
              onPress={() => setPickerOpen(true)}
              style={styles.linkedSelect}>
              <AppIcon
                name={focus.linkedTarget.type === 'todo' ? 'todos' : 'kanban'}
                size={11}
                color={colors.muted}
              />
              <Text style={[styles.linkedText, { color: colors.text }]} numberOfLines={1}>
                {focus.linkedTarget.title}
              </Text>
            </RipplePressable>
            <RipplePressable
              accessibilityLabel="Отвязать задачу"
              onPress={() => focus.linkTarget(null)}
              style={styles.unlinkBtn}>
              <AppIcon name="close" size={11} color={colors.muted} />
            </RipplePressable>
          </View>
        ) : (
          <RipplePressable
            onPress={() => setPickerOpen(true)}
            style={styles.linkPlaceholderBtn}>
            <AppIcon name="link" size={11} color={colors.muted} />
            <Text style={[styles.linkPlaceholderText, { color: colors.muted }]}>
              Привязать задачу
            </Text>
          </RipplePressable>
        )}

        {/* Expanded Settings & Stats */}
        {expanded ? (
          <View style={[styles.expandedBox, { borderTopColor: colors.line }]}>
            <View style={styles.modeTabs}>
              {MODES.map((m) => {
                const active = focus.mode === m;
                return (
                  <RipplePressable
                    key={m}
                    onPress={() => focus.setMode(m)}
                    style={StyleSheet.flatten([
                      styles.modeTab,
                      {
                        backgroundColor: active ? colors.surfaceActive : 'transparent',
                      },
                    ])}>
                    <Text
                      style={[
                        styles.modeTabText,
                        { color: active ? colors.text : colors.muted },
                      ]}>
                      {FOCUS_MODE_META[m].shortLabel}
                    </Text>
                  </RipplePressable>
                );
              })}
            </View>

            {focus.mode === 'focus' ? (
              <View style={styles.presetsRow}>
                {FOCUS_DURATION_PRESETS.map((mins) => {
                  const active = focus.focusMinutes === mins;
                  return (
                    <RipplePressable
                      key={mins}
                      onPress={() => focus.setFocusMinutes(mins)}
                      style={StyleSheet.flatten([
                        styles.presetBtn,
                        {
                          backgroundColor: active ? colors.surfaceActive : colors.surface,
                          borderColor: active ? colors.text : colors.line,
                        },
                      ])}>
                      <Text
                        style={[
                          styles.presetText,
                          { color: active ? colors.text : colors.muted },
                        ]}>
                        {mins}м
                      </Text>
                    </RipplePressable>
                  );
                })}
              </View>
            ) : null}

            <Text style={[styles.statsFooterText, { color: colors.muted }]}>
              Сегодня: {focus.stats.todayMinutes} мин ({focus.stats.todaySessions}) · 7д:{' '}
              {focus.stats.weekMinutes} мин
            </Text>
          </View>
        ) : null}

        {focus.bannerMessage ? (
          <Text style={[styles.bannerText, { color: colors.success }]}>{focus.bannerMessage}</Text>
        ) : null}
      </View>

      <TaskPickerModal
        visible={pickerOpen}
        selectedId={focus.linkedTarget?.id ?? null}
        onSelect={focus.linkTarget}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

export function FocusMobileTrigger() {
  const colors = useThemeColors();
  const focus = useFocus();
  const insets = useSafeAreaInsets();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <RipplePressable
        accessibilityLabel="Фокус-таймер"
        onPress={() => setSheetOpen(true)}
        style={StyleSheet.flatten([
          styles.mobilePill,
          {
            backgroundColor: focus.isRunning ? colors.accent : colors.surfaceSubtle,
          },
        ])}>
        <AppIcon
          name="timer"
          size={13}
          color={focus.isRunning ? colors.accentText : colors.muted}
        />
        {focus.isRunning || focus.secondsLeft !== focus.totalSeconds ? (
          <Text
            style={[
              styles.mobilePillText,
              { color: focus.isRunning ? colors.accentText : colors.text },
            ]}>
            {formatClock(focus.secondsLeft)}
          </Text>
        ) : null}
      </RipplePressable>

      <Modal
        visible={sheetOpen}
        transparent
        animationType="none"
        onRequestClose={() => setSheetOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setSheetOpen(false)} />
          <Animated.View
            entering={SlideInDown.springify().damping(24).stiffness(260)}
            style={[
              styles.mobileFocusSheet,
              {
                backgroundColor: colors.surface,
                borderColor: colors.line,
                paddingBottom: Math.max(insets.bottom, 18),
              },
            ]}>
            <View style={[styles.pickerHeader, { borderBottomColor: colors.line }]}>
              <Text style={[styles.pickerTitle, { color: colors.text }]}>Фокус-таймер</Text>
              <RipplePressable
                onPress={() => setSheetOpen(false)}
                style={StyleSheet.flatten([
                  styles.closeIconBtn,
                  { backgroundColor: colors.surfaceSubtle },
                ])}>
                <AppIcon name="close" size="xs" color={colors.muted} />
              </RipplePressable>
            </View>

            <View style={styles.mobileSheetBody}>
              <View style={styles.modeTabs}>
                {MODES.map((m) => {
                  const active = focus.mode === m;
                  return (
                    <RipplePressable
                      key={m}
                      onPress={() => focus.setMode(m)}
                      style={StyleSheet.flatten([
                        styles.modeTab,
                        { backgroundColor: active ? colors.surfaceActive : colors.surfaceSubtle },
                      ])}>
                      <Text
                        style={[
                          styles.modeTabText,
                          { color: active ? colors.text : colors.muted },
                        ]}>
                        {FOCUS_MODE_META[m].shortLabel}
                      </Text>
                    </RipplePressable>
                  );
                })}
              </View>

              <Text style={[styles.mobileBigClock, { color: colors.text }]}>
                {formatClock(focus.secondsLeft)}
              </Text>

              <View style={styles.mobileControlsRow}>
                <RipplePressable
                  onPress={focus.reset}
                  style={StyleSheet.flatten([
                    styles.mobileCircleBtn,
                    { backgroundColor: colors.surfaceSubtle },
                  ])}>
                  <AppIcon name="reset" size="md" color={colors.text} />
                </RipplePressable>

                <RipplePressable
                  onPress={focus.toggle}
                  style={StyleSheet.flatten([
                    styles.mobileMainPlayBtn,
                    { backgroundColor: colors.accent },
                  ])}>
                  <AppIcon
                    name={focus.isRunning ? 'pause' : 'play'}
                    size="md"
                    color={colors.accentText}
                  />
                  <Text style={[styles.mobilePlayText, { color: colors.accentText }]}>
                    {focus.isRunning ? 'Пауза' : 'Старт'}
                  </Text>
                </RipplePressable>

                <RipplePressable
                  onPress={focus.skip}
                  style={StyleSheet.flatten([
                    styles.mobileCircleBtn,
                    { backgroundColor: colors.surfaceSubtle },
                  ])}>
                  <AppIcon name="skip" size="md" color={colors.text} />
                </RipplePressable>
              </View>

              {focus.mode === 'focus' ? (
                <View style={styles.presetsRow}>
                  {FOCUS_DURATION_PRESETS.map((mins) => {
                    const active = focus.focusMinutes === mins;
                    return (
                      <RipplePressable
                        key={mins}
                        onPress={() => focus.setFocusMinutes(mins)}
                        style={StyleSheet.flatten([
                          styles.presetBtn,
                          {
                            backgroundColor: active ? colors.surfaceActive : colors.surfaceSubtle,
                            borderColor: active ? colors.text : colors.line,
                          },
                        ])}>
                        <Text
                          style={[
                            styles.presetText,
                            { color: active ? colors.text : colors.muted },
                          ]}>
                          {mins} мин
                        </Text>
                      </RipplePressable>
                    );
                  })}
                </View>
              ) : null}

              <RipplePressable
                onPress={() => setPickerOpen(true)}
                style={StyleSheet.flatten([
                  styles.mobileLinkRow,
                  { backgroundColor: colors.surfaceSubtle, borderColor: colors.line },
                ])}>
                <AppIcon name="link" size="xs" color={colors.muted} />
                <Text style={[styles.mobileLinkText, { color: colors.text }]} numberOfLines={1}>
                  {focus.linkedTarget ? focus.linkedTarget.title : 'Привязать задачу или карточку'}
                </Text>
              </RipplePressable>

              <Text style={[styles.statsFooterText, { color: colors.muted, textAlign: 'center' }]}>
                Сегодня: {focus.stats.todayMinutes} мин ({focus.stats.todaySessions} сессий) · 7
                дней: {focus.stats.weekMinutes} мин
              </Text>
            </View>
          </Animated.View>
        </View>
      </Modal>

      <TaskPickerModal
        visible={pickerOpen}
        selectedId={focus.linkedTarget?.id ?? null}
        onSelect={focus.linkTarget}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  sidebarWrap: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 6,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  modeLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  todayMeta: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  clockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  clockText: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  playBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallCtrlBtn: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  linkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 7,
    paddingLeft: 7,
    paddingRight: 4,
    paddingVertical: 4,
    gap: 4,
  },
  linkedSelect: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minWidth: 0,
  },
  linkedText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
  },
  unlinkBtn: {
    width: 18,
    height: 18,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkPlaceholderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 2,
  },
  linkPlaceholderText: {
    fontSize: 11,
    fontWeight: '500',
  },
  expandedBox: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    gap: 7,
  },
  modeTabs: {
    flexDirection: 'row',
    gap: 4,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 5,
    borderRadius: 7,
    alignItems: 'center',
  },
  modeTabText: {
    fontSize: 11,
    fontWeight: '600',
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 5,
  },
  presetBtn: {
    flex: 1,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  presetText: {
    fontSize: 11,
    fontWeight: '600',
  },
  statsFooterText: {
    fontSize: 10,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  bannerText: {
    fontSize: 11,
    fontWeight: '600',
  },
  mobilePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  mobilePillText: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  modalRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 12, 16, 0.5)',
  },
  mobileFocusSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
  mobileSheetBody: {
    padding: 18,
    gap: 14,
  },
  mobileBigClock: {
    fontSize: 48,
    fontWeight: '700',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    paddingVertical: 6,
  },
  mobileControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  mobileCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileMainPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    height: 44,
    borderRadius: 12,
  },
  mobilePlayText: {
    fontSize: 14,
    fontWeight: '700',
  },
  mobileLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  mobileLinkText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  pickerSheet: {
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  pickerDesktop: {
    maxWidth: 440,
    maxHeight: '72%',
    borderRadius: 16,
  },
  pickerMobile: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '80%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomWidth: 0,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  closeIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerSearchWrap: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
  },
  pickerSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 36,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
  },
  pickerSearchInput: {
    flex: 1,
    fontSize: 13,
  },
  pickerList: {
    maxHeight: 340,
  },
  pickerListContent: {
    padding: 10,
    gap: 4,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 9,
  },
  pickerRowTexts: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  pickerRowTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  pickerRowSub: {
    fontSize: 11,
  },
  pickerEmpty: {
    textAlign: 'center',
    fontSize: 13,
    paddingVertical: 20,
  },
});
