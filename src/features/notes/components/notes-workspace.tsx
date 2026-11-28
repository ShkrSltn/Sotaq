import {
    type ComponentRef,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    Keyboard,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

import {
    AnchoredPopover,
    type AnchorRect,
    measureAnchor,
} from "@/components/anchored-popover";
import { AppIcon } from "@/components/app-icon";
import { FadeIn as ContentFade, ScreenLoader } from "@/components/screen-loader";
import { DragTrashZone } from "@/components/drag-trash-zone";
import { useKeyboardInset } from "@/components/keyboard-avoiding-modal-view";
import { RipplePressable } from "@/components/ripple-pressable";
import { HistoryToast, UndoRedoButtons } from "@/components/undo-redo-bar";
import { WebDragBox } from "@/components/web-drag-box";
import { createId, nowIso } from "@/db/client";
import { useDatabase } from "@/db/provider";
import { useAuth } from "@/features/auth/auth-context";
import {
    type BlockDropPosition,
    BlockRow,
} from "@/features/notes/components/block-row";
import {
    MobileBlockActionsSheet,
    MobileInsertBlockSheet,
} from "@/features/notes/components/mobile-sheets";
import { PageTree } from "@/features/notes/components/page-tree";
import { QuickFindModal } from "@/features/notes/components/quick-find-modal";
import {
    createNotePage,
    deleteNotePage,
    duplicateNotePage,
    ensureDemoNotePages,
    ensureInitialNotes,
    listNotePages,
    loadPageBlocks,
    moveNotePage,
    savePageBlocks,
    updateNotePage,
} from "@/features/notes/notes-repository";
import {
    BLOCK_TYPE_CATALOG,
    MAX_INDENT_LEVEL,
    type NoteBlockColor,
    type NoteBlockRecord,
    type NoteBlockType,
    type NotePageRecord,
    PAGE_COVERS,
    PAGE_ICONS,
    type PageCoverKey,
    resolveNotePageIcon,
} from "@/features/notes/types";
import { useResolvedColorScheme } from "@/hooks/use-resolved-color-scheme";
import { useUndoRedoHotkeys } from "@/hooks/use-undo-redo";
import { useThemeColors, useViewport } from "@/theme/colors";

const COVER_KEYS: readonly PageCoverKey[] = [
  "slate",
  "ocean",
  "forest",
  "amber",
  "berry",
  "violet",
];

function computeNumberedIndices(blocks: NoteBlockRecord[]): number[] {
  const result: number[] = [];
  const countersByIndent = new Map<number, number>();

  for (const block of blocks) {
    if (block.type === "numbered") {
      const next = (countersByIndent.get(block.indentLevel) ?? 0) + 1;
      countersByIndent.set(block.indentLevel, next);
      for (const level of Array.from(countersByIndent.keys())) {
        if (level > block.indentLevel) {
          countersByIndent.delete(level);
        }
      }
      result.push(next);
    } else {
      for (const level of Array.from(countersByIndent.keys())) {
        if (level >= block.indentLevel) {
          countersByIndent.delete(level);
        }
      }
      result.push(0);
    }
  }
  return result;
}

function makeBlock(
  pageId: string,
  type: NoteBlockType,
  position: number,
  options?: {
    content?: string;
    indentLevel?: number;
    blockColor?: NoteBlockColor;
    linkedPageId?: string | null;
  },
): NoteBlockRecord {
  return {
    id: createId(),
    pageId,
    type,
    content: options?.content ?? "",
    checked: false,
    collapsed: false,
    toggleBody: "",
    indentLevel: options?.indentLevel ?? 0,
    blockColor: options?.blockColor ?? "default",
    linkedPageId: options?.linkedPageId ?? null,
    position,
    updatedAt: nowIso(),
  };
}

export function NotesWorkspace() {
  const db = useDatabase();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const colors = useThemeColors();
  const scheme = useResolvedColorScheme();
  const { isDesktop } = useViewport();
  const keyboardInset = useKeyboardInset();

  const [pages, setPages] = useState<NotePageRecord[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<NoteBlockRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [desktopTreeOpen, setDesktopTreeOpen] = useState(true);
  const [mobileMode, setMobileMode] = useState<"tree" | "editor">("editor");
  const [mobileReorderMode, setMobileReorderMode] = useState(false);
  const [mobileInsertSheetOpen, setMobileInsertSheetOpen] = useState(false);
  const [mobileBlockSheetId, setMobileBlockSheetId] = useState<string | null>(
    null,
  );
  const [quickFindOpen, setQuickFindOpen] = useState(false);

  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [contextMenuBlockId, setContextMenuBlockId] = useState<string | null>(
    null,
  );
  const [insertMenuBlockId, setInsertMenuBlockId] = useState<string | null>(
    null,
  );

  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    blockId: string;
    position: BlockDropPosition;
  } | null>(null);

  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconPickerAnchor, setIconPickerAnchor] = useState<AnchorRect | null>(
    null,
  );
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [coverPickerAnchor, setCoverPickerAnchor] = useState<AnchorRect | null>(
    null,
  );
  const [coverPickerAlign, setCoverPickerAlign] = useState<"left" | "right">(
    "left",
  );
  const [pageOptionsOpen, setPageOptionsOpen] = useState(false);
  const [pageOptionsAnchor, setPageOptionsAnchor] = useState<AnchorRect | null>(
    null,
  );
  const [confirmDeletePage, setConfirmDeletePage] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const [historyMeta, setHistoryMeta] = useState({
    canUndo: false,
    canRedo: false,
  });
  const [historyToast, setHistoryToast] = useState<string | null>(null);

  const pageOptionsBtnRef = useRef<ComponentRef<typeof View>>(null);
  const iconBtnRef = useRef<ComponentRef<typeof View>>(null);
  const coverBtnRef = useRef<ComponentRef<typeof View>>(null);
  const addCoverChipRef = useRef<ComponentRef<typeof View>>(null);
  const historyByPageRef = useRef<
    Map<string, { past: NoteBlockRecord[][]; future: NoteBlockRecord[][] }>
  >(new Map());
  const typingBurstRef = useRef<{
    pageId: string;
    blockId: string | null;
    ts: number;
  } | null>(null);
  const blocksRef = useRef<NoteBlockRecord[]>([]);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  const showHistoryToast = useCallback((message: string) => {
    setHistoryToast(message);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setHistoryToast(null);
      toastTimerRef.current = null;
    }, 1800);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const syncHistoryMeta = useCallback((pageId: string | null) => {
    if (!pageId) {
      setHistoryMeta({ canUndo: false, canRedo: false });
      return;
    }
    const entry = historyByPageRef.current.get(pageId);
    setHistoryMeta({
      canUndo: Boolean(entry && entry.past.length > 0),
      canRedo: Boolean(entry && entry.future.length > 0),
    });
  }, []);

  function openCoverPickerFrom(
    ref: { current: ComponentRef<typeof View> | null },
    align: "left" | "right" = "left",
  ) {
    measureAnchor(ref.current, (rect) => {
      setCoverPickerAlign(align);
      setCoverPickerAnchor(rect);
      setCoverPickerOpen(true);
    });
  }

  const inputRefs = useRef<Map<string, ComponentRef<typeof TextInput>>>(
    new Map(),
  );
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<{
    pageId: string;
    blocks: NoteBlockRecord[];
  } | null>(null);

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
    setSaveState("saved");
  }, [db]);

  const scheduleBlocksSave = useCallback(
    (pageId: string, nextBlocks: NoteBlockRecord[], immediate = false) => {
      pendingSaveRef.current = { pageId, blocks: nextBlocks };
      setSaveState("saving");

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

  // Global Cmd/Ctrl + K Quick Find shortcut on web
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setQuickFindOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
      await ensureInitialNotes(db, userId);
      const initialPages = await ensureDemoNotePages(db, userId);
      if (cancelled) {
        return;
      }
      setPages(initialPages);
      const showcasePage =
        initialPages.find((p) => p.title === "Личный хаб — 2026") ??
        initialPages[0];
      const firstId = showcasePage?.id ?? null;
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

  const pageById = useMemo(() => {
    const map = new Map<string, NotePageRecord>();
    for (const page of pages) {
      map.set(page.id, page);
    }
    return map;
  }, [pages]);

  const activePage = activePageId ? (pageById.get(activePageId) ?? null) : null;

  const breadcrumbs = useMemo(() => {
    const trail: NotePageRecord[] = [];
    let cursor = activePage;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      trail.unshift(cursor);
      cursor = cursor.parentId ? (pageById.get(cursor.parentId) ?? null) : null;
    }
    return trail;
  }, [activePage, pageById]);

  const childPages = useMemo(() => {
    if (!activePageId) {
      return [];
    }
    const inlineLinkedIds = new Set(
      blocks
        .map((b) => b.linkedPageId)
        .filter((id): id is string => Boolean(id)),
    );
    return pages.filter(
      (page) => page.parentId === activePageId && !inlineLinkedIds.has(page.id),
    );
  }, [pages, activePageId, blocks]);

  function closeAllMenus() {
    setContextMenuBlockId(null);
    setInsertMenuBlockId(null);
    setPageOptionsOpen(false);
    setMobileBlockSheetId(null);
    setMobileInsertSheetOpen(false);
  }

  async function selectPage(pageId: string) {
    await flushPendingSave();
    const nextBlocks = await loadPageBlocks(db, pageId);
    setActivePageId(pageId);
    setBlocks(nextBlocks);
    typingBurstRef.current = null;
    syncHistoryMeta(pageId);
    setFocusedBlockId(null);
    setMobileReorderMode(false);
    closeAllMenus();
    setIconPickerOpen(false);
    setCoverPickerOpen(false);
    setConfirmDeletePage(false);
    setMobileMode("editor");
  }

  async function handleCreatePage(
    parentId?: string | null,
    initialTitle?: string,
  ) {
    if (!userId) {
      return;
    }
    await flushPendingSave();
    const created = await createNotePage(db, userId, {
      parentId: parentId ?? null,
      title: initialTitle ?? "",
    });
    const updatedPages = await listNotePages(db, userId);
    const createdBlocks = await loadPageBlocks(db, created.id);
    setPages(updatedPages);
    setActivePageId(created.id);
    setBlocks(createdBlocks);
    closeAllMenus();
    setIconPickerOpen(false);
    setCoverPickerOpen(false);
    setConfirmDeletePage(false);
    setMobileMode("editor");
    if (createdBlocks[0]) {
      focusBlockSoon(createdBlocks[0].id);
    }
  }

  async function handleUpdatePageMeta(
    pageId: string,
    patch: {
      title?: string;
      icon?: string;
      isFavorite?: boolean;
      coverColor?: PageCoverKey | null;
      fullWidth?: boolean;
    },
  ) {
    setPages((prev) =>
      prev.map((page) => (page.id === pageId ? { ...page, ...patch } : page)),
    );
    await updateNotePage(db, pageId, patch);
  }

  async function handleDuplicatePage(sourcePageId: string) {
    if (!userId) {
      return;
    }
    await flushPendingSave();
    const copy = await duplicateNotePage(db, userId, sourcePageId);
    if (!copy) {
      return;
    }
    const updatedPages = await listNotePages(db, userId);
    setPages(updatedPages);
    await selectPage(copy.id);
  }

  async function handleMovePage(
    pageId: string,
    targetParentId: string | null,
    targetIndex?: number,
  ) {
    if (!userId) {
      return;
    }
    const moved = await moveNotePage(
      db,
      userId,
      pageId,
      targetParentId,
      targetIndex,
    );
    if (!moved) {
      return;
    }
    const updatedPages = await listNotePages(db, userId);
    setPages(updatedPages);
  }

  async function handleDeletePageById(deletingId: string) {
    if (!userId) {
      return;
    }
    await flushPendingSave();
    await deleteNotePage(db, deletingId);
    let nextPages = await listNotePages(db, userId);
    if (nextPages.length === 0) {
      const fresh = await createNotePage(db, userId, {
        title: "Новая заметка",
        icon: "notes",
      });
      nextPages = [fresh];
    }

    setPages(nextPages);
    setConfirmDeletePage(false);
    setPageOptionsOpen(false);

    if (
      activePageId === deletingId ||
      !nextPages.some((p) => p.id === activePageId)
    ) {
      const fallback = nextPages[0];
      const fallbackBlocks = await loadPageBlocks(db, fallback.id);
      setActivePageId(fallback.id);
      setBlocks(fallbackBlocks);
      if (!isDesktop) {
        setMobileMode("tree");
      }
    } else if (activePageId) {
      // Reload active blocks in case an inline linked subpage block was cascaded
      const reloaded = await loadPageBlocks(db, activePageId);
      setBlocks(reloaded);
    }
  }

  function mutateBlocks(
    updater: (prev: NoteBlockRecord[]) => NoteBlockRecord[],
    options?: {
      immediate?: boolean;
      focusId?: string | null;
      skipHistory?: boolean;
    },
  ) {
    if (!activePageId) {
      return;
    }
    const pageId = activePageId;
    const isImmediate = options?.immediate ?? false;

    setBlocks((prev) => {
      const next = updater(prev).map((block, index) => ({
        ...block,
        position: index,
      }));

      if (!options?.skipHistory) {
        let entry = historyByPageRef.current.get(pageId);
        if (!entry) {
          entry = { past: [], future: [] };
          historyByPageRef.current.set(pageId, entry);
        }

        const now = Date.now();
        const burst = typingBurstRef.current;
        const shouldCoalesce =
          !isImmediate &&
          burst !== null &&
          burst.pageId === pageId &&
          burst.blockId === focusedBlockId &&
          now - burst.ts < 650;

        if (!shouldCoalesce) {
          entry.past.push(prev.map((b) => ({ ...b })));
          if (entry.past.length > 60) {
            entry.past.shift();
          }
        }
        entry.future = [];
        typingBurstRef.current = isImmediate
          ? null
          : { pageId, blockId: focusedBlockId, ts: now };
        setHistoryMeta({ canUndo: entry.past.length > 0, canRedo: false });
      }

      scheduleBlocksSave(pageId, next, isImmediate);
      return next;
    });
    if (options?.focusId) {
      focusBlockSoon(options.focusId);
    }
  }

  const handleUndoBlocks = useCallback(() => {
    if (!activePageId) {
      return;
    }
    const entry = historyByPageRef.current.get(activePageId);
    if (!entry || entry.past.length === 0) {
      return;
    }
    const previous = entry.past.pop()!;
    entry.future.push(blocksRef.current.map((b) => ({ ...b })));
    typingBurstRef.current = null;
    setBlocks(previous);
    scheduleBlocksSave(activePageId, previous, true);
    setHistoryMeta({
      canUndo: entry.past.length > 0,
      canRedo: entry.future.length > 0,
    });
    showHistoryToast("Отменено");
  }, [activePageId, scheduleBlocksSave, showHistoryToast]);

  const handleRedoBlocks = useCallback(() => {
    if (!activePageId) {
      return;
    }
    const entry = historyByPageRef.current.get(activePageId);
    if (!entry || entry.future.length === 0) {
      return;
    }
    const next = entry.future.pop()!;
    entry.past.push(blocksRef.current.map((b) => ({ ...b })));
    typingBurstRef.current = null;
    setBlocks(next);
    scheduleBlocksSave(activePageId, next, true);
    setHistoryMeta({
      canUndo: entry.past.length > 0,
      canRedo: entry.future.length > 0,
    });
    showHistoryToast("Возвращено");
  }, [activePageId, scheduleBlocksSave, showHistoryToast]);

  useUndoRedoHotkeys({
    enabled: !quickFindOpen && Boolean(activePageId),
    ignoreInsideInputs: false,
    shouldIgnoreTarget: (target) =>
      typeof HTMLInputElement !== "undefined" &&
      target instanceof HTMLInputElement,
    onUndo: handleUndoBlocks,
    onRedo: handleRedoBlocks,
  });

  async function createAndAttachInlinePage(
    blockId: string,
    mode: "convert" | "insert",
  ) {
    if (!activePageId || !userId) {
      return;
    }
    const child = await createNotePage(db, userId, {
      parentId: activePageId,
      title: "Новая подстраница",
      icon: "notes",
    });
    const updatedPages = await listNotePages(db, userId);
    setPages(updatedPages);

    const trailingParagraph = makeBlock(activePageId, "paragraph", 0);

    mutateBlocks(
      (prev) => {
        const idx = prev.findIndex((b) => b.id === blockId);
        if (idx === -1) {
          return prev;
        }
        const copy = [...prev];
        if (mode === "convert") {
          copy[idx] = {
            ...copy[idx],
            type: "page",
            content: "",
            linkedPageId: child.id,
          };
          copy.splice(idx + 1, 0, trailingParagraph);
        } else {
          const pageBlock = makeBlock(activePageId, "page", idx + 1, {
            indentLevel: copy[idx].indentLevel,
            linkedPageId: child.id,
          });
          copy.splice(idx + 1, 0, pageBlock, trailingParagraph);
        }
        return copy;
      },
      { immediate: true, focusId: trailingParagraph.id },
    );
  }

  function handleChangeContent(blockId: string, content: string) {
    mutateBlocks((prev) =>
      prev.map((block) =>
        block.id === blockId ? { ...block, content } : block,
      ),
    );
  }

  function handleChangeToggleBody(blockId: string, toggleBody: string) {
    mutateBlocks((prev) =>
      prev.map((block) =>
        block.id === blockId ? { ...block, toggleBody } : block,
      ),
    );
  }

  function handleConvertType(
    blockId: string,
    nextType: NoteBlockType,
    nextContent?: string,
  ) {
    if (!activePageId) {
      return;
    }
    closeAllMenus();

    if (nextType === "page") {
      createAndAttachInlinePage(blockId, "convert");
      return;
    }

    if (nextType === "divider") {
      const freshAfter = makeBlock(activePageId, "paragraph", 0);
      mutateBlocks(
        (prev) => {
          const idx = prev.findIndex((b) => b.id === blockId);
          if (idx === -1) {
            return prev;
          }
          const copy = [...prev];
          copy[idx] = { ...copy[idx], type: "divider", content: "" };
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
                content:
                  nextContent !== undefined ? nextContent : block.content,
              }
            : block,
        ),
      { immediate: true, focusId: blockId },
    );
  }

  function handleInsertBlockBelow(
    anchorBlockId: string,
    nextType: NoteBlockType,
  ) {
    if (!activePageId) {
      return;
    }
    closeAllMenus();

    if (nextType === "page") {
      createAndAttachInlinePage(anchorBlockId, "insert");
      return;
    }

    const anchor = blocks.find((b) => b.id === anchorBlockId);
    const created = makeBlock(activePageId, nextType, 0, {
      indentLevel: anchor?.indentLevel ?? 0,
    });
    const trailing =
      nextType === "divider" ? makeBlock(activePageId, "paragraph", 0) : null;

    mutateBlocks(
      (prev) => {
        const idx = prev.findIndex((b) => b.id === anchorBlockId);
        const copy = [...prev];
        if (trailing) {
          copy.splice(idx + 1, 0, created, trailing);
        } else {
          copy.splice(idx + 1, 0, created);
        }
        return copy;
      },
      { immediate: true, focusId: trailing ? trailing.id : created.id },
    );
  }

  function handleChangeColor(blockId: string, blockColor: NoteBlockColor) {
    mutateBlocks(
      (prev) =>
        prev.map((block) =>
          block.id === blockId ? { ...block, blockColor } : block,
        ),
      { immediate: true },
    );
  }

  function handleIndent(blockId: string, delta: -1 | 1) {
    mutateBlocks(
      (prev) => {
        const idx = prev.findIndex((b) => b.id === blockId);
        if (idx === -1) {
          return prev;
        }
        const current = prev[idx];
        if (delta < 0) {
          const nextLevel = Math.max(0, current.indentLevel - 1);
          if (nextLevel === current.indentLevel) {
            return prev;
          }
          return prev.map((b, i) =>
            i === idx ? { ...b, indentLevel: nextLevel } : b,
          );
        }

        // Notion rule: first block cannot be indented; block i cannot exceed prevBlock.indentLevel + 1
        if (idx === 0) {
          return prev;
        }
        const maxAllowed = Math.min(
          MAX_INDENT_LEVEL,
          prev[idx - 1].indentLevel + 1,
        );
        const nextLevel = Math.min(maxAllowed, current.indentLevel + 1);
        if (nextLevel === current.indentLevel) {
          return prev;
        }
        return prev.map((b, i) =>
          i === idx ? { ...b, indentLevel: nextLevel } : b,
        );
      },
      { immediate: true },
    );
  }

  function handleEnterSplit(
    blockId: string,
    beforeCursor: string,
    afterCursor: string,
  ) {
    if (!activePageId) {
      return;
    }
    const idx = blocks.findIndex((b) => b.id === blockId);
    if (idx === -1) {
      return;
    }
    const current = blocks[idx];

    const isList =
      current.type === "bullet" ||
      current.type === "numbered" ||
      current.type === "todo";

    // Pressing Enter on an empty list item outdents first or exits list to paragraph.
    if (
      isList &&
      beforeCursor.trim().length === 0 &&
      afterCursor.trim().length === 0
    ) {
      if (current.indentLevel > 0) {
        handleIndent(blockId, -1);
      } else {
        handleConvertType(blockId, "paragraph", "");
      }
      return;
    }

    const nextType: NoteBlockType = isList ? current.type : "paragraph";
    const created = makeBlock(activePageId, nextType, idx + 1, {
      content: afterCursor,
      indentLevel: current.indentLevel,
    });

    mutateBlocks(
      (prev) => {
        const copy = [...prev];
        const pos = copy.findIndex((b) => b.id === blockId);
        if (pos === -1) {
          return prev;
        }
        copy[pos] = { ...copy[pos], content: beforeCursor };
        copy.splice(pos + 1, 0, created);
        return copy;
      },
      { immediate: true, focusId: created.id },
    );
  }

  function handleBackspaceAtStart(blockId: string) {
    const idx = blocks.findIndex((b) => b.id === blockId);
    if (idx === -1) {
      return;
    }
    const current = blocks[idx];

    // 1. Convert non-paragraph back to paragraph (keeping text!)
    if (current.type !== "paragraph") {
      handleConvertType(blockId, "paragraph");
      return;
    }

    // 2. Outdent if indented
    if (current.indentLevel > 0) {
      handleIndent(blockId, -1);
      return;
    }

    // 3. Merge into previous editable text block
    if (idx === 0 || blocks.length <= 1) {
      return;
    }
    const prevBlock = blocks[idx - 1];
    if (prevBlock.type === "divider" || prevBlock.type === "page") {
      if (current.content.length === 0) {
        mutateBlocks((prev) => prev.filter((b) => b.id !== blockId), {
          immediate: true,
        });
      }
      return;
    }

    const mergedText = `${prevBlock.content}${current.content}`;
    mutateBlocks(
      (prev) =>
        prev
          .map((b) =>
            b.id === prevBlock.id ? { ...b, content: mergedText } : b,
          )
          .filter((b) => b.id !== blockId),
      { immediate: true, focusId: prevBlock.id },
    );
  }

  function handleFocusNeighbor(blockId: string, direction: -1 | 1) {
    const idx = blocks.findIndex((b) => b.id === blockId);
    if (idx === -1) {
      return;
    }
    let cursor = idx + direction;
    while (cursor >= 0 && cursor < blocks.length) {
      const candidate = blocks[cursor];
      if (candidate.type !== "divider" && candidate.type !== "page") {
        focusBlockSoon(candidate.id);
        return;
      }
      cursor += direction;
    }
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

  function handleDropOnBlock(
    draggedId: string,
    targetId: string,
    position: BlockDropPosition,
  ) {
    setDraggingBlockId(null);
    setDropTarget(null);

    if (draggedId === targetId) {
      return;
    }

    mutateBlocks(
      (prev) => {
        const fromIdx = prev.findIndex((b) => b.id === draggedId);
        const targetBlock = prev.find((b) => b.id === targetId);
        if (fromIdx === -1 || !targetBlock) {
          return prev;
        }

        const copy = [...prev];
        const [moved] = copy.splice(fromIdx, 1);
        const nextTargetIdx = copy.findIndex((b) => b.id === targetId);
        if (nextTargetIdx === -1) {
          return prev;
        }

        const insertIdx =
          position === "before" ? nextTargetIdx : nextTargetIdx + 1;
        const nextIndent =
          position === "nest"
            ? Math.min(MAX_INDENT_LEVEL, targetBlock.indentLevel + 1)
            : targetBlock.indentLevel;

        copy.splice(insertIdx, 0, {
          ...moved,
          indentLevel: insertIdx === 0 ? 0 : nextIndent,
        });
        return copy;
      },
      { immediate: true },
    );
  }

  function handleDuplicateBlock(blockId: string) {
    if (!activePageId) {
      return;
    }
    closeAllMenus();
    const source = blocks.find((b) => b.id === blockId);
    if (!source || source.type === "page") {
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
    closeAllMenus();
    if (blocks.length <= 1) {
      mutateBlocks(() => [makeBlock(activePageId, "paragraph", 0)], {
        immediate: true,
      });
      return;
    }
    mutateBlocks((prev) => prev.filter((b) => b.id !== blockId), {
      immediate: true,
    });
  }

  function handleAppendBlock(type: NoteBlockType = "paragraph") {
    if (!activePageId) {
      return;
    }
    if (type === "page") {
      const last = blocks[blocks.length - 1];
      if (last) {
        createAndAttachInlinePage(last.id, "insert");
      }
      return;
    }
    const created = makeBlock(activePageId, type, blocks.length);
    mutateBlocks((prev) => [...prev, created], {
      immediate: true,
      focusId: type === "divider" ? null : created.id,
    });
  }

  function handleMobileFormat(type: NoteBlockType) {
    if (focusedBlockId && blocks.some((b) => b.id === focusedBlockId)) {
      handleConvertType(focusedBlockId, type);
    } else {
      handleAppendBlock(type);
    }
  }

  if (loading) {
    return <ScreenLoader />;
  }

  const showTreePane = isDesktop ? desktopTreeOpen : mobileMode === "tree";
  const showEditorPane = isDesktop || mobileMode === "editor";
  const numberedIndices = computeNumberedIndices(blocks);
  const focusedBlock = blocks.find((b) => b.id === focusedBlockId) ?? null;
  const focusedBlockIndex = focusedBlock
    ? blocks.findIndex((b) => b.id === focusedBlock.id)
    : -1;
  const mobileSheetBlock = mobileBlockSheetId
    ? (blocks.find((b) => b.id === mobileBlockSheetId) ?? null)
    : null;
  const mobileSheetBlockIndex = mobileSheetBlock
    ? blocks.findIndex((b) => b.id === mobileSheetBlock.id)
    : -1;
  const mobileSheetCanIndent =
    mobileSheetBlock !== null &&
    mobileSheetBlockIndex > 0 &&
    mobileSheetBlock.indentLevel <
      Math.min(
        MAX_INDENT_LEVEL,
        blocks[mobileSheetBlockIndex - 1].indentLevel + 1,
      );

  const activeCover = activePage?.coverColor
    ? PAGE_COVERS[activePage.coverColor]
    : null;
  const coverBg = activeCover
    ? scheme === "dark"
      ? activeCover.dark
      : activeCover.light
    : null;

  return (
    <ContentFade>
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.split,
          isDesktop ? styles.splitDesktop : styles.splitMobile,
        ]}
      >
        {showTreePane ? (
          <View
            style={isDesktop ? styles.desktopTreePane : styles.mobileFullPane}
          >
            <PageTree
              pages={pages}
              activePageId={activePageId}
              isDesktop={isDesktop}
              colors={colors}
              onOpenQuickFind={() => setQuickFindOpen(true)}
              onSelectPage={selectPage}
              onCreatePage={(parentId) => handleCreatePage(parentId)}
              onRenamePage={(pageId, title) =>
                handleUpdatePageMeta(pageId, { title })
              }
              onToggleFavorite={(pageId, isFavorite) =>
                handleUpdatePageMeta(pageId, { isFavorite })
              }
              onDuplicatePage={handleDuplicatePage}
              onDeletePage={handleDeletePageById}
              onMovePage={handleMovePage}
            />
          </View>
        ) : null}

        {showEditorPane && activePage ? (
          <View
            style={[
              styles.canvasPane,
              {
                backgroundColor: colors.background,
                paddingBottom:
                  !isDesktop && keyboardInset > 0
                    ? Math.max(0, keyboardInset - 60)
                    : 0,
              },
            ]}
          >
            {/* Clean Notion Top Bar */}
            <View style={[styles.topBar, { borderBottomColor: colors.line }]}>
              <View style={styles.topLeft}>
                {isDesktop ? (
                  <RipplePressable
                    accessibilityLabel="Показать или скрыть дерево страниц"
                    onPress={() => setDesktopTreeOpen((value) => !value)}
                    style={StyleSheet.flatten([
                      styles.topIconBtn,
                      { backgroundColor: colors.surfaceSubtle },
                    ])}
                  >
                    <AppIcon name="sidebar" size="sm" color={colors.text} />
                  </RipplePressable>
                ) : (
                  <RipplePressable
                    onPress={async () => {
                      await flushPendingSave();
                      setMobileMode("tree");
                    }}
                    style={StyleSheet.flatten([
                      styles.backBtn,
                      { backgroundColor: colors.surfaceSubtle },
                    ])}
                  >
                    <AppIcon name="arrowLeft" size="xs" color={colors.text} />
                    <Text style={[styles.backBtnText, { color: colors.text }]}>
                      Страницы
                    </Text>
                  </RipplePressable>
                )}

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.breadcrumbs}
                >
                  {breadcrumbs.map((crumb, idx) => {
                    const isLast = idx === breadcrumbs.length - 1;
                    return (
                      <View key={crumb.id} style={styles.crumbItem}>
                        {idx > 0 ? (
                          <Text
                            style={[styles.crumbSep, { color: colors.muted }]}
                          >
                            /
                          </Text>
                        ) : null}
                        <RipplePressable
                          disabled={isLast}
                          onPress={() => selectPage(crumb.id)}
                          style={styles.crumbBtn}
                        >
                          <AppIcon
                            name={resolveNotePageIcon(crumb.icon)}
                            size={13}
                            color={isLast ? colors.text : colors.muted}
                          />
                          <Text
                            style={[
                              styles.crumbText,
                              { color: isLast ? colors.text : colors.muted },
                            ]}
                            numberOfLines={1}
                          >
                            {crumb.title.trim() || "Без названия"}
                          </Text>
                        </RipplePressable>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.topRight}>
                {isDesktop ? (
                  <Text style={[styles.saveText, { color: colors.muted }]}>
                    {saveState === "saving" ? "Сохранение…" : "Сохранено"}
                  </Text>
                ) : (
                  <RipplePressable
                    accessibilityLabel={
                      mobileReorderMode
                        ? "Выйти из режима порядка"
                        : "Режим порядка блоков"
                    }
                    onPress={() => {
                      Keyboard.dismiss();
                      setMobileReorderMode((value) => !value);
                    }}
                    style={StyleSheet.flatten([
                      styles.reorderToggleBtn,
                      {
                        backgroundColor: mobileReorderMode
                          ? colors.accent
                          : colors.surfaceSubtle,
                      },
                    ])}
                  >
                    <View style={styles.inlineIconRow}>
                      {!mobileReorderMode ? (
                        <AppIcon name="reorder" size="xs" color={colors.text} />
                      ) : null}
                      <Text
                        style={[
                          styles.reorderToggleText,
                          {
                            color: mobileReorderMode
                              ? colors.accentText
                              : colors.text,
                          },
                        ]}
                      >
                        {mobileReorderMode ? "Готово" : "Порядок"}
                      </Text>
                    </View>
                  </RipplePressable>
                )}

                <UndoRedoButtons
                  compact
                  canUndo={historyMeta.canUndo}
                  canRedo={historyMeta.canRedo}
                  colors={colors}
                  onUndo={handleUndoBlocks}
                  onRedo={handleRedoBlocks}
                />

                <View
                  style={[
                    styles.topBarDivider,
                    { backgroundColor: colors.line },
                  ]}
                />

                <RipplePressable
                  accessibilityLabel="Быстрый поиск"
                  onPress={() => setQuickFindOpen(true)}
                  style={StyleSheet.flatten([
                    styles.topIconBtn,
                    { backgroundColor: colors.surfaceSubtle },
                  ])}
                >
                  <AppIcon name="search" size="sm" color={colors.muted} />
                </RipplePressable>

                <RipplePressable
                  accessibilityLabel={
                    activePage.isFavorite
                      ? "Убрать из избранного"
                      : "В избранное"
                  }
                  onPress={() =>
                    handleUpdatePageMeta(activePage.id, {
                      isFavorite: !activePage.isFavorite,
                    })
                  }
                  style={StyleSheet.flatten([
                    styles.topIconBtn,
                    { backgroundColor: colors.surfaceSubtle },
                  ])}
                >
                  <AppIcon
                    name="star"
                    size="sm"
                    color={
                      activePage.isFavorite ? colors.warning : colors.muted
                    }
                    fill={activePage.isFavorite ? colors.warning : "none"}
                  />
                </RipplePressable>

                <View ref={pageOptionsBtnRef} collapsable={false}>
                  <RipplePressable
                    accessibilityLabel="Настройки страницы"
                    onPress={() => {
                      setConfirmDeletePage(false);
                      if (pageOptionsOpen) {
                        setPageOptionsOpen(false);
                        return;
                      }
                      measureAnchor(pageOptionsBtnRef.current, (rect) => {
                        setPageOptionsAnchor(rect);
                        setPageOptionsOpen(true);
                      });
                    }}
                    style={StyleSheet.flatten([
                      styles.topIconBtn,
                      {
                        backgroundColor: pageOptionsOpen
                          ? colors.surfaceActive
                          : colors.surfaceSubtle,
                      },
                    ])}
                  >
                    <AppIcon name="more" size="sm" color={colors.text} />
                  </RipplePressable>
                </View>
              </View>
            </View>

            {/* Document Sheet */}
            <ScrollView
              style={styles.canvasScroll}
              contentContainerStyle={[
                styles.canvasScrollContent,
                !isDesktop ? styles.canvasScrollContentMobile : null,
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              automaticallyAdjustKeyboardInsets={false}
            >
              {/* Optional Notion-style Cover Band */}
              {coverBg ? (
                <View
                  style={[
                    styles.coverBand,
                    !isDesktop ? styles.coverBandMobile : null,
                    { backgroundColor: coverBg },
                  ]}
                >
                  <View style={styles.coverControls}>
                    <View ref={coverBtnRef} collapsable={false}>
                      <RipplePressable
                        onPress={() =>
                          openCoverPickerFrom(coverBtnRef, "right")
                        }
                        style={StyleSheet.flatten([
                          styles.coverBtn,
                          { backgroundColor: colors.surface },
                        ])}
                      >
                        <Text
                          style={[styles.coverBtnText, { color: colors.text }]}
                        >
                          Обложка
                        </Text>
                      </RipplePressable>
                    </View>
                    <RipplePressable
                      onPress={() => {
                        setCoverPickerOpen(false);
                        handleUpdatePageMeta(activePage.id, {
                          coverColor: null,
                        });
                      }}
                      style={StyleSheet.flatten([
                        styles.coverBtn,
                        { backgroundColor: colors.surface },
                      ])}
                    >
                      <Text
                        style={[styles.coverBtnText, { color: colors.muted }]}
                      >
                        Убрать
                      </Text>
                    </RipplePressable>
                  </View>
                </View>
              ) : null}

              <View
                style={[
                  styles.sheetInner,
                  isDesktop
                    ? activePage.fullWidth
                      ? styles.sheetWide
                      : styles.sheetNarrow
                    : styles.sheetMobile,
                  coverBg ? styles.sheetWithCover : null,
                ]}
              >
                {/* Page Header (Icon + Quick Controls + Title) */}
                <View
                  style={[
                    styles.pageHeader,
                    {
                      paddingLeft: isDesktop ? 74 : 0,
                      paddingRight: isDesktop ? 10 : 0,
                    },
                    coverBg ? styles.pageHeaderWithCover : null,
                  ]}
                >
                  <View style={styles.pageMetaActions}>
                    <View ref={iconBtnRef} collapsable={false}>
                      <RipplePressable
                        accessibilityLabel="Сменить иконку"
                        onPress={() => {
                          if (iconPickerOpen) {
                            setIconPickerOpen(false);
                            return;
                          }
                          measureAnchor(iconBtnRef.current, (rect) => {
                            setIconPickerAnchor(rect);
                            setIconPickerOpen(true);
                          });
                        }}
                        style={StyleSheet.flatten([
                          styles.pageIconBtn,
                          {
                            backgroundColor: colors.surface,
                            borderColor: colors.line,
                          },
                        ])}
                      >
                        <AppIcon
                          name={resolveNotePageIcon(activePage.icon)}
                          size={24}
                          color={colors.text}
                        />
                      </RipplePressable>
                    </View>

                    <View style={styles.headerQuickChips}>
                      {!activePage.coverColor ? (
                        <View ref={addCoverChipRef} collapsable={false}>
                          <RipplePressable
                            onPress={() =>
                              openCoverPickerFrom(addCoverChipRef, "left")
                            }
                            style={styles.headerGhostChip}
                          >
                            <AppIcon
                              name="cover"
                              size="xs"
                              color={colors.muted}
                            />
                            <Text
                              style={[
                                styles.headerGhostText,
                                { color: colors.muted },
                              ]}
                            >
                              Добавить обложку
                            </Text>
                          </RipplePressable>
                        </View>
                      ) : null}

                      <RipplePressable
                        onPress={() => handleCreatePage(activePage.id)}
                        style={styles.headerGhostChip}
                      >
                        <AppIcon
                          name="filePlus"
                          size="xs"
                          color={colors.muted}
                        />
                        <Text
                          style={[
                            styles.headerGhostText,
                            { color: colors.muted },
                          ]}
                        >
                          Подстраница
                        </Text>
                      </RipplePressable>
                    </View>
                  </View>

                  <TextInput
                    value={activePage.title}
                    onChangeText={(nextTitle) =>
                      handleUpdatePageMeta(activePage.id, { title: nextTitle })
                    }
                    onSubmitEditing={() => {
                      if (blocks[0]) {
                        focusBlockSoon(blocks[0].id);
                      }
                    }}
                    placeholder="Без названия"
                    placeholderTextColor={colors.muted}
                    returnKeyType="next"
                    style={[
                      styles.pageTitleInput,
                      !isDesktop ? styles.pageTitleInputMobile : null,
                      { color: colors.text },
                    ]}
                  />
                </View>

                {/* Blocks Stream */}
                <View style={styles.blocksList}>
                  {blocks.map((block, idx) => {
                    const prevBlock = idx > 0 ? blocks[idx - 1] : null;
                    const canIndent =
                      idx > 0 &&
                      prevBlock !== null &&
                      block.indentLevel <
                        Math.min(MAX_INDENT_LEVEL, prevBlock.indentLevel + 1);

                    return (
                      <BlockRow
                        key={block.id}
                        block={block}
                        index={idx}
                        totalBlocks={blocks.length}
                        numberedIndex={numberedIndices[idx]}
                        canIndent={canIndent}
                        linkedPage={
                          block.linkedPageId
                            ? (pageById.get(block.linkedPageId) ?? null)
                            : null
                        }
                        isFocused={focusedBlockId === block.id}
                        isContextMenuOpen={contextMenuBlockId === block.id}
                        isInsertMenuOpen={insertMenuBlockId === block.id}
                        isDragging={draggingBlockId === block.id}
                        isBlockDragActive={draggingBlockId !== null}
                        dropIndicator={
                          dropTarget?.blockId === block.id
                            ? dropTarget.position
                            : null
                        }
                        isDesktop={isDesktop}
                        reorderMode={mobileReorderMode}
                        colors={colors}
                        registerInputRef={registerInputRef}
                        onFocus={() => {
                          setFocusedBlockId(block.id);
                          setPageOptionsOpen(false);
                          setConfirmDeletePage(false);
                        }}
                        onToggleContextMenu={() => {
                          if (!isDesktop) {
                            Keyboard.dismiss();
                            setMobileBlockSheetId(block.id);
                            return;
                          }
                          setInsertMenuBlockId(null);
                          setContextMenuBlockId((current) =>
                            current === block.id ? null : block.id,
                          );
                        }}
                        onToggleInsertMenu={() => {
                          setContextMenuBlockId(null);
                          setInsertMenuBlockId((current) =>
                            current === block.id ? null : block.id,
                          );
                        }}
                        onCloseMenus={closeAllMenus}
                        onChangeContent={(content) =>
                          handleChangeContent(block.id, content)
                        }
                        onChangeToggleBody={(body) =>
                          handleChangeToggleBody(block.id, body)
                        }
                        onConvertType={(type, nextContent) =>
                          handleConvertType(block.id, type, nextContent)
                        }
                        onInsertBlockBelow={(type) =>
                          handleInsertBlockBelow(block.id, type)
                        }
                        onChangeColor={(color) =>
                          handleChangeColor(block.id, color)
                        }
                        onIndent={(delta) => handleIndent(block.id, delta)}
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
                        onEnterSplit={(before, after) =>
                          handleEnterSplit(block.id, before, after)
                        }
                        onBackspaceAtStart={() =>
                          handleBackspaceAtStart(block.id)
                        }
                        onFocusNeighbor={(dir) =>
                          handleFocusNeighbor(block.id, dir)
                        }
                        onMoveBlock={(dir) => handleMoveBlock(block.id, dir)}
                        onDuplicateBlock={() => handleDuplicateBlock(block.id)}
                        onDeleteBlock={() => handleDeleteBlock(block.id)}
                        onOpenLinkedPage={selectPage}
                        onDragStartBlock={(id) => {
                          closeAllMenus();
                          setDraggingBlockId(id);
                        }}
                        onDragEndBlock={() => {
                          setDraggingBlockId(null);
                          setDropTarget(null);
                        }}
                        onDragHoverBlock={(id, position) => {
                          setDropTarget((prev) =>
                            prev?.blockId === id && prev.position === position
                              ? prev
                              : { blockId: id, position },
                          );
                        }}
                        onDragLeaveBlock={(id) => {
                          setDropTarget((prev) =>
                            prev?.blockId === id ? null : prev,
                          );
                        }}
                        onDropOnBlock={handleDropOnBlock}
                      />
                    );
                  })}
                </View>

                {/* Tail click & drop area to keep writing or drop a block at the end */}
                <WebDragBox
                  onDragOver={(event) => {
                    if (!draggingBlockId || blocks.length === 0) return;
                    event.preventDefault();
                    if (event.dataTransfer) {
                      event.dataTransfer.dropEffect = "move";
                    }
                    const lastId = blocks[blocks.length - 1].id;
                    if (lastId !== draggingBlockId) {
                      setDropTarget((prev) =>
                        prev?.blockId === lastId && prev.position === "after"
                          ? prev
                          : { blockId: lastId, position: "after" },
                      );
                    }
                  }}
                  onDrop={(event) => {
                    if (!draggingBlockId || blocks.length === 0) return;
                    event.preventDefault();
                    const draggedId =
                      event.dataTransfer?.getData("text/sotaq-note-block") ||
                      event.dataTransfer?.getData("text/plain") ||
                      draggingBlockId;
                    const lastId = blocks[blocks.length - 1].id;
                    if (draggedId && draggedId !== lastId) {
                      handleDropOnBlock(draggedId, lastId, "after");
                    } else {
                      setDraggingBlockId(null);
                      setDropTarget(null);
                    }
                  }}
                >
                  <Pressable
                    onPress={() => {
                      closeAllMenus();
                      const last = blocks[blocks.length - 1];
                      if (
                        last &&
                        last.type === "paragraph" &&
                        last.content.length === 0
                      ) {
                        focusBlockSoon(last.id);
                      } else {
                        handleAppendBlock("paragraph");
                      }
                    }}
                    style={[
                      styles.tailTapArea,
                      {
                        paddingLeft: isDesktop ? 74 : 0,
                        paddingRight: isDesktop ? 10 : 0,
                      },
                    ]}
                  >
                    <Text style={[styles.tailHint, { color: colors.muted }]}>
                      Нажмите, чтобы продолжить, или введите / для команд…
                    </Text>
                  </Pressable>
                </WebDragBox>

                {/* Non-inline child pages (if any created via sidebar) */}
                {childPages.length > 0 ? (
                  <View
                    style={[
                      styles.subpagesSection,
                      {
                        marginLeft: isDesktop ? 74 : 0,
                        marginRight: isDesktop ? 10 : 0,
                        borderTopColor: colors.line,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.subpagesLabel, { color: colors.muted }]}
                    >
                      Вложенные страницы
                    </Text>
                    <View style={styles.subpagesList}>
                      {childPages.map((child) => (
                        <RipplePressable
                          key={child.id}
                          onPress={() => selectPage(child.id)}
                          style={StyleSheet.flatten([
                            styles.subpageCard,
                            {
                              backgroundColor: colors.surface,
                              borderColor: colors.line,
                            },
                          ])}
                        >
                          <AppIcon
                            name={resolveNotePageIcon(child.icon)}
                            size="sm"
                            color={colors.muted}
                          />
                          <Text
                            style={[
                              styles.subpageTitle,
                              { color: colors.text },
                            ]}
                          >
                            {child.title.trim() || "Без названия"}
                          </Text>
                          <AppIcon
                            name="arrowRight"
                            size="xs"
                            color={colors.muted}
                          />
                        </RipplePressable>
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            </ScrollView>

            {/* Mobile-only Thumb-Zone Toolbar (Desktop stays pure Notion paper) */}
            {!isDesktop ? (
              mobileReorderMode ? (
                <View
                  style={[
                    styles.mobileReorderBar,
                    {
                      backgroundColor: colors.surface,
                      borderTopColor: colors.line,
                    },
                  ]}
                >
                  <Text
                    style={[styles.mobileReorderHint, { color: colors.muted }]}
                  >
                    Меняйте порядок и вложенность блоков
                  </Text>
                  <RipplePressable
                    onPress={() => setMobileReorderMode(false)}
                    style={StyleSheet.flatten([
                      styles.reorderDoneBtn,
                      { backgroundColor: colors.accent },
                    ])}
                  >
                    <Text
                      style={[
                        styles.reorderDoneText,
                        { color: colors.accentText },
                      ]}
                    >
                      Готово
                    </Text>
                  </RipplePressable>
                </View>
              ) : (
                <View
                  style={[
                    styles.mobileToolbar,
                    {
                      backgroundColor: colors.surface,
                      borderTopColor: colors.line,
                    },
                  ]}
                >
                  <RipplePressable
                    accessibilityLabel="Добавить блок"
                    onPress={() => {
                      Keyboard.dismiss();
                      setMobileInsertSheetOpen(true);
                    }}
                    style={StyleSheet.flatten([
                      styles.pinnedToolBtn,
                      { backgroundColor: colors.accent },
                    ])}
                  >
                    <AppIcon name="plus" size="md" color={colors.accentText} />
                  </RipplePressable>

                  <RipplePressable
                    accessibilityLabel="Действия с активным блоком"
                    onPress={() => {
                      Keyboard.dismiss();
                      const targetId =
                        focusedBlockId ?? blocks[blocks.length - 1]?.id ?? null;
                      if (targetId) {
                        setMobileBlockSheetId(targetId);
                      }
                    }}
                    style={StyleSheet.flatten([
                      styles.pinnedToolBtn,
                      { backgroundColor: colors.surfaceSubtle },
                    ])}
                  >
                    <AppIcon name="grip" size="md" color={colors.text} />
                  </RipplePressable>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="always"
                    style={styles.mobileToolbarScroll}
                    contentContainerStyle={styles.mobileToolbarContent}
                  >
                    {focusedBlock ? (
                      <>
                        <RipplePressable
                          disabled={focusedBlock.indentLevel <= 0}
                          onPress={() => handleIndent(focusedBlock.id, -1)}
                          style={StyleSheet.flatten([
                            styles.toolChip,
                            { backgroundColor: colors.surfaceSubtle },
                            focusedBlock.indentLevel <= 0
                              ? styles.disabledChip
                              : null,
                          ])}
                        >
                          <AppIcon
                            name="outdent"
                            size="sm"
                            color={colors.text}
                          />
                        </RipplePressable>
                        <RipplePressable
                          onPress={() => handleIndent(focusedBlock.id, 1)}
                          style={StyleSheet.flatten([
                            styles.toolChip,
                            { backgroundColor: colors.surfaceSubtle },
                          ])}
                        >
                          <AppIcon
                            name="indent"
                            size="sm"
                            color={colors.text}
                          />
                        </RipplePressable>
                        <RipplePressable
                          disabled={focusedBlockIndex <= 0}
                          onPress={() => handleMoveBlock(focusedBlock.id, -1)}
                          style={StyleSheet.flatten([
                            styles.toolChip,
                            { backgroundColor: colors.surfaceSubtle },
                            focusedBlockIndex <= 0 ? styles.disabledChip : null,
                          ])}
                        >
                          <AppIcon
                            name="arrowUp"
                            size="sm"
                            color={colors.text}
                          />
                        </RipplePressable>
                        <RipplePressable
                          disabled={focusedBlockIndex >= blocks.length - 1}
                          onPress={() => handleMoveBlock(focusedBlock.id, 1)}
                          style={StyleSheet.flatten([
                            styles.toolChip,
                            { backgroundColor: colors.surfaceSubtle },
                            focusedBlockIndex >= blocks.length - 1
                              ? styles.disabledChip
                              : null,
                          ])}
                        >
                          <AppIcon
                            name="arrowDown"
                            size="sm"
                            color={colors.text}
                          />
                        </RipplePressable>
                      </>
                    ) : null}

                    {BLOCK_TYPE_CATALOG.filter((item) =>
                      [
                        "todo",
                        "h1",
                        "h2",
                        "bullet",
                        "numbered",
                        "toggle",
                        "quote",
                        "page",
                      ].includes(item.type),
                    ).map((item) => {
                      const active = focusedBlock?.type === item.type;
                      return (
                        <RipplePressable
                          key={item.type}
                          accessibilityLabel={item.label}
                          onPress={() => handleMobileFormat(item.type)}
                          style={StyleSheet.flatten([
                            styles.toolChip,
                            {
                              backgroundColor: active
                                ? colors.surfaceActive
                                : colors.surfaceSubtle,
                            },
                          ])}
                        >
                          <AppIcon
                            name={item.icon}
                            size="sm"
                            color={active ? colors.text : colors.muted}
                          />
                        </RipplePressable>
                      );
                    })}
                  </ScrollView>

                  <RipplePressable
                    accessibilityLabel="Скрыть клавиатуру"
                    onPress={() => Keyboard.dismiss()}
                    style={StyleSheet.flatten([
                      styles.pinnedToolBtn,
                      { backgroundColor: colors.surfaceSubtle },
                    ])}
                  >
                    <AppIcon
                      name="keyboardOff"
                      size="sm"
                      color={colors.muted}
                    />
                  </RipplePressable>
                </View>
              )
            ) : null}
          </View>
        ) : null}
      </View>

      <QuickFindModal
        visible={quickFindOpen}
        pages={pages}
        onClose={() => setQuickFindOpen(false)}
        onSelectPage={selectPage}
        onCreatePageWithTitle={(title) => handleCreatePage(null, title)}
      />

      <MobileInsertBlockSheet
        visible={mobileInsertSheetOpen}
        onClose={() => setMobileInsertSheetOpen(false)}
        onSelectType={(type) => {
          const anchorId =
            focusedBlockId ?? blocks[blocks.length - 1]?.id ?? null;
          if (anchorId) {
            handleInsertBlockBelow(anchorId, type);
          } else {
            handleAppendBlock(type);
          }
        }}
      />

      <MobileBlockActionsSheet
        block={mobileSheetBlock}
        index={mobileSheetBlockIndex}
        totalBlocks={blocks.length}
        canIndent={mobileSheetCanIndent}
        onClose={() => setMobileBlockSheetId(null)}
        onTurnInto={(type) => {
          if (mobileSheetBlock) {
            handleConvertType(mobileSheetBlock.id, type);
          }
        }}
        onChangeColor={(color) => {
          if (mobileSheetBlock) {
            handleChangeColor(mobileSheetBlock.id, color);
          }
        }}
        onIndent={(delta) => {
          if (mobileSheetBlock) {
            handleIndent(mobileSheetBlock.id, delta);
          }
        }}
        onMoveBlock={(dir) => {
          if (mobileSheetBlock) {
            handleMoveBlock(mobileSheetBlock.id, dir);
          }
        }}
        onDuplicate={() => {
          if (mobileSheetBlock) {
            handleDuplicateBlock(mobileSheetBlock.id);
          }
        }}
        onDelete={() => {
          if (mobileSheetBlock) {
            handleDeleteBlock(mobileSheetBlock.id);
          }
        }}
      />

      {/* Floating Page Options Popover — zero layout shift */}
      <AnchoredPopover
        visible={pageOptionsOpen && activePage !== null}
        anchor={pageOptionsAnchor}
        width={236}
        estimatedHeight={210}
        align="right"
        colors={colors}
        onClose={() => {
          setPageOptionsOpen(false);
          setConfirmDeletePage(false);
        }}
      >
        {activePage ? (
          <View style={styles.popoverList}>
            {isDesktop ? (
              <Pressable
                onPress={() => {
                  handleUpdatePageMeta(activePage.id, {
                    fullWidth: !activePage.fullWidth,
                  });
                  setPageOptionsOpen(false);
                }}
                style={({ hovered }: { hovered?: boolean }) => [
                  styles.optionRow,
                  hovered ? { backgroundColor: colors.surfaceSubtle } : null,
                ]}
              >
                <AppIcon
                  name={activePage.fullWidth ? "minimize" : "maximize"}
                  size="xs"
                  color={colors.muted}
                />
                <Text style={[styles.optionLabel, { color: colors.text }]}>
                  {activePage.fullWidth
                    ? "Обычная ширина (708px)"
                    : "Во всю ширину"}
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={() => {
                setPageOptionsOpen(false);
                openCoverPickerFrom(pageOptionsBtnRef, "right");
              }}
              style={({ hovered }: { hovered?: boolean }) => [
                styles.optionRow,
                hovered ? { backgroundColor: colors.surfaceSubtle } : null,
              ]}
            >
              <AppIcon name="cover" size="xs" color={colors.muted} />
              <Text style={[styles.optionLabel, { color: colors.text }]}>
                {activePage.coverColor
                  ? "Изменить обложку"
                  : "Добавить обложку"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setPageOptionsOpen(false);
                handleCreatePage(activePage.id);
              }}
              style={({ hovered }: { hovered?: boolean }) => [
                styles.optionRow,
                hovered ? { backgroundColor: colors.surfaceSubtle } : null,
              ]}
            >
              <AppIcon name="filePlus" size="xs" color={colors.muted} />
              <Text style={[styles.optionLabel, { color: colors.text }]}>
                Добавить подстраницу
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setPageOptionsOpen(false);
                handleDuplicatePage(activePage.id);
              }}
              style={({ hovered }: { hovered?: boolean }) => [
                styles.optionRow,
                hovered ? { backgroundColor: colors.surfaceSubtle } : null,
              ]}
            >
              <AppIcon name="copy" size="xs" color={colors.muted} />
              <Text style={[styles.optionLabel, { color: colors.text }]}>
                Дублировать страницу
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                if (!confirmDeletePage) {
                  setConfirmDeletePage(true);
                  return;
                }
                handleDeletePageById(activePage.id);
              }}
              style={({ hovered }: { hovered?: boolean }) => [
                styles.optionRow,
                hovered ? { backgroundColor: colors.dangerBg } : null,
              ]}
            >
              <AppIcon name="trash" size="xs" color={colors.danger} />
              <Text style={[styles.optionLabel, { color: colors.danger }]}>
                {confirmDeletePage
                  ? "Точно удалить страницу?"
                  : "Удалить страницу"}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </AnchoredPopover>

      {/* Floating Cover Picker Popover — zero layout shift */}
      <AnchoredPopover
        visible={coverPickerOpen && activePage !== null}
        anchor={coverPickerAnchor}
        width={256}
        estimatedHeight={128}
        align={coverPickerAlign}
        colors={colors}
        onClose={() => setCoverPickerOpen(false)}
      >
        {activePage ? (
          <View style={styles.pickerGrid}>
            {COVER_KEYS.map((key) => {
              const preset = PAGE_COVERS[key];
              const selected = activePage.coverColor === key;
              return (
                <RipplePressable
                  key={key}
                  onPress={() => {
                    handleUpdatePageMeta(activePage.id, { coverColor: key });
                    setCoverPickerOpen(false);
                  }}
                  style={StyleSheet.flatten([
                    styles.coverChip,
                    {
                      backgroundColor:
                        scheme === "dark" ? preset.dark : preset.light,
                      borderColor: selected ? colors.text : colors.line,
                    },
                  ])}
                >
                  <Text style={[styles.coverChipText, { color: colors.text }]}>
                    {preset.label}
                  </Text>
                </RipplePressable>
              );
            })}
          </View>
        ) : null}
      </AnchoredPopover>

      {/* Floating Vector Icon Picker Popover — zero layout shift */}
      <AnchoredPopover
        visible={iconPickerOpen && activePage !== null}
        anchor={iconPickerAnchor}
        width={256}
        estimatedHeight={156}
        align="left"
        colors={colors}
        onClose={() => setIconPickerOpen(false)}
      >
        {activePage ? (
          <View style={styles.pickerGrid}>
            {PAGE_ICONS.map((iconName) => {
              const selected = resolveNotePageIcon(activePage.icon) === iconName;
              return (
                <RipplePressable
                  key={iconName}
                  onPress={() => {
                    handleUpdatePageMeta(activePage.id, { icon: iconName });
                    setIconPickerOpen(false);
                  }}
                  style={StyleSheet.flatten([
                    styles.emojiOption,
                    selected ? { backgroundColor: colors.surfaceActive } : null,
                  ])}
                >
                  <AppIcon
                    name={iconName}
                    size="md"
                    color={selected ? colors.text : colors.muted}
                  />
                </RipplePressable>
              );
            })}
          </View>
        ) : null}
      </AnchoredPopover>

      <DragTrashZone
        visible={draggingBlockId !== null}
        label="Удалить блок"
        colors={colors}
        onDropDelete={(event) => {
          const blockId =
            event.dataTransfer?.getData("text/sotaq-note-block") ||
            event.dataTransfer?.getData("text/plain") ||
            draggingBlockId;
          setDraggingBlockId(null);
          setDropTarget(null);
          if (blockId) {
            handleDeleteBlock(blockId);
          }
        }}
      />

      <HistoryToast message={historyToast} colors={colors} />
    </View>
    </ContentFade>
  );
}

const styles = StyleSheet.create({
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  screen: {
    flex: 1,
  },
  split: {
    flex: 1,
    minHeight: 0,
  },
  splitDesktop: {
    flexDirection: "row",
  },
  splitMobile: {
    flexDirection: "column",
  },
  desktopTreePane: {
    width: 256,
  },
  mobileFullPane: {
    flex: 1,
  },
  canvasPane: {
    flex: 1,
    minWidth: 0,
    position: "relative",
  },
  topBar: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  topRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  topBarDivider: {
    width: 1,
    height: 16,
    marginHorizontal: 2,
  },
  topIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  topIconGlyph: {
    fontSize: 15,
    fontWeight: "600",
  },
  backBtn: {
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  inlineIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  backBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  breadcrumbs: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  crumbItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  crumbSep: {
    fontSize: 12,
  },
  crumbBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
    maxWidth: 190,
  },
  crumbText: {
    fontSize: 13,
    fontWeight: "500",
    flexShrink: 1,
  },
  saveText: {
    fontSize: 11,
    fontWeight: "500",
    marginRight: 2,
  },
  popoverList: {
    gap: 2,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    ...(Platform.OS === "web"
      ? ({
          cursor: "pointer",
          transition: "background-color 110ms ease",
        } as object)
      : null),
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  canvasScroll: {
    flex: 1,
  },
  canvasScrollContent: {
    flexGrow: 1,
    alignItems: "center",
    paddingBottom: 96,
  },
  canvasScrollContentMobile: {
    paddingBottom: 220,
  },
  coverBand: {
    width: "100%",
    height: 124,
    justifyContent: "flex-end",
    alignItems: "flex-end",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  coverBandMobile: {
    height: 96,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  coverControls: {
    flexDirection: "row",
    gap: 6,
  },
  coverBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    opacity: 0.9,
  },
  coverBtnText: {
    fontSize: 11,
    fontWeight: "600",
  },
  sheetInner: {
    width: "100%",
  },
  // Desktop blocks reserve 74px on the left (gutter) and 10px on the right,
  // so paddingRight = paddingLeft + 64 keeps the actual text column mathematically dead-centered.
  sheetNarrow: {
    maxWidth: 888,
    paddingLeft: 16,
    paddingRight: 80,
    paddingTop: 40,
  },
  sheetWide: {
    maxWidth: 1360,
    paddingLeft: 16,
    paddingRight: 80,
    paddingTop: 40,
  },
  sheetMobile: {
    paddingHorizontal: 20,
    paddingTop: 22,
  },
  sheetWithCover: {
    paddingTop: 0,
  },
  pageTitleInputMobile: {
    fontSize: 28,
    letterSpacing: -0.5,
  },
  reorderToggleBtn: {
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  reorderToggleText: {
    fontSize: 12,
    fontWeight: "600",
  },
  mobileReorderBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  mobileReorderHint: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
  },
  reorderDoneBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9,
  },
  reorderDoneText: {
    fontSize: 13,
    fontWeight: "700",
  },
  pageHeader: {
    gap: 10,
    marginBottom: 18,
  },
  pageHeaderWithCover: {
    marginTop: -28,
  },
  pageMetaActions: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
    flexWrap: "wrap",
  },
  pageIconBtn: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  pageIconLarge: {
    fontSize: 32,
  },
  headerQuickChips: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingBottom: 4,
  },
  headerGhostChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
  },
  headerGhostText: {
    fontSize: 12,
    fontWeight: "500",
  },
  pickerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    padding: 4,
  },
  coverChip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  coverChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  emojiOption: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  emojiGlyph: {
    fontSize: 18,
  },
  pageTitleInput: {
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: -0.8,
    paddingVertical: 4,
    paddingHorizontal: 0,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },
  blocksList: {
    gap: 0,
  },
  tailTapArea: {
    paddingVertical: 16,
    minHeight: 140,
  },
  tailHint: {
    fontSize: 13,
    opacity: 0.38,
  },
  subpagesSection: {
    marginTop: 12,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  subpagesLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  subpagesList: {
    gap: 6,
  },
  subpageCard: {
    flexDirection: "row",
    alignItems: "center",
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
    fontWeight: "600",
  },
  subpageArrow: {
    fontSize: 14,
  },
  mobileToolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  mobileToolbarScroll: {
    flex: 1,
  },
  mobileToolbarContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pinnedToolBtn: {
    width: 36,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  pinnedToolText: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 18,
  },
  dismissKbdGlyph: {
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 20,
    marginTop: -4,
  },
  toolChip: {
    height: 34,
    paddingHorizontal: 11,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  toolChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  disabledChip: {
    opacity: 0.35,
  },
});
