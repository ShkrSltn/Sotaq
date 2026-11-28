import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

type HotkeyOptions = {
  enabled?: boolean;
  /**
   * When true, Ctrl/Cmd+Z/Y will not fire if focus is currently inside an <input>,
   * <textarea>, or contentEditable element (so native input editing stays intact).
   * Set to false in block editors like Notes where the editor manages block-level history.
   */
  ignoreInsideInputs?: boolean;
  /**
   * Optional predicate to check whether a specific focused element should still allow
   * native browser undo instead of workspace undo (e.g. a search box inside Notes).
   */
  shouldIgnoreTarget?: (target: EventTarget | null) => boolean;
  onUndo: () => void;
  onRedo: () => void;
};

function isEditableElement(target: EventTarget | null): boolean {
  if (!target || typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

/**
 * Registers global web keyboard shortcuts for Undo & Redo:
 * - Undo: Ctrl+Z (Win/Linux) / Cmd+Z (macOS)
 * - Redo: Ctrl+Y / Ctrl+Shift+Z (Win/Linux) / Cmd+Shift+Z / Cmd+Y (macOS)
 * Uses KeyboardEvent.code ('KeyZ' / 'KeyY') so shortcuts work identically
 * on both English and Russian keyboard layouts.
 */
export function useUndoRedoHotkeys({
  enabled = true,
  ignoreInsideInputs = true,
  shouldIgnoreTarget,
  onUndo,
  onRedo,
}: HotkeyOptions) {
  const callbacksRef = useRef({ onUndo, onRedo, shouldIgnoreTarget });

  useEffect(() => {
    callbacksRef.current = { onUndo, onRedo, shouldIgnoreTarget };
  });

  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled || typeof window === 'undefined') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.altKey) {
        return;
      }

      const code = event.code;
      const key = event.key.toLowerCase();
      const isZ = code === 'KeyZ' || key === 'z' || key === 'я';
      const isY = code === 'KeyY' || key === 'y' || key === 'н';

      if (!isZ && !isY) {
        return;
      }

      if (callbacksRef.current.shouldIgnoreTarget?.(event.target)) {
        return;
      }

      if (ignoreInsideInputs && isEditableElement(event.target)) {
        return;
      }

      if (isZ && !event.shiftKey) {
        event.preventDefault();
        callbacksRef.current.onUndo();
      } else if (isY || (isZ && event.shiftKey)) {
        event.preventDefault();
        callbacksRef.current.onRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [enabled, ignoreInsideInputs]);
}
