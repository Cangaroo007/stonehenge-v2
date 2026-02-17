'use client';

import { useEffect, useCallback, useRef } from 'react';

// ── Interfaces ──────────────────────────────────────────────────────────────

interface UseQuoteKeyboardShortcutsOptions {
  /** Currently selected piece ID (null = no selection) */
  selectedPieceId: string | null;
  /** Current mode — shortcuts only active in edit mode */
  mode: 'view' | 'edit';
  /** All piece IDs in the current room, in order */
  roomPieceIds: string[];

  // ── Callbacks ──────────────────────────────────────────────────────────
  /** Called to select a piece */
  onSelectPiece: (pieceId: string | null) => void;
  /** Called to open/focus the edit panel for the selected piece */
  onEditPiece?: (pieceId: string) => void;
  /** Called to duplicate a piece */
  onDuplicatePiece?: (pieceId: string) => void;
  /** Called to delete a piece (should show confirmation) */
  onDeletePiece?: (pieceId: string) => void;
  /** Called to open material selector */
  onMaterialSelect?: (pieceId: string) => void;
  /** Called to toggle paint mode */
  onTogglePaintMode?: () => void;
  /** Called to open relationship editor */
  onRelationshipEditor?: (pieceId: string) => void;
  /** Called to add a new piece to the room */
  onAddNewPiece?: () => void;
  /** Called on Escape — deselect / close popover */
  onEscape?: () => void;
  /** Called on Ctrl/Cmd+Z — undo (wired in 13.12) */
  onUndo?: () => void;
  /** Called on Ctrl/Cmd+Shift+Z — redo (wired in 13.12) */
  onRedo?: () => void;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useQuoteKeyboardShortcuts({
  selectedPieceId,
  mode,
  roomPieceIds,
  onSelectPiece,
  onEditPiece,
  onDuplicatePiece,
  onDeletePiece,
  onMaterialSelect,
  onTogglePaintMode,
  onRelationshipEditor,
  onAddNewPiece,
  onEscape,
  onUndo,
  onRedo,
}: UseQuoteKeyboardShortcutsOptions) {
  // Track whether keyboard hint has been shown
  const hintShownRef = useRef(false);
  const hintDismissedRef = useRef(false);

  // Show hint on first piece selection
  const shouldShowHint = useCallback(() => {
    if (hintShownRef.current || hintDismissedRef.current) return false;
    if (selectedPieceId && mode === 'edit') {
      hintShownRef.current = true;
      return true;
    }
    return false;
  }, [selectedPieceId, mode]);

  const dismissHint = useCallback(() => {
    hintDismissedRef.current = true;
  }, []);

  useEffect(() => {
    if (mode !== 'edit') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip when typing in form elements
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable
      ) {
        return;
      }

      const key = e.key;
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;

      // ── Ctrl/Cmd shortcuts (always active) ────────────────────────────
      if (isCtrlOrMeta) {
        if (key === 'z' && e.shiftKey) {
          e.preventDefault();
          onRedo?.();
          return;
        }
        if (key === 'z') {
          e.preventDefault();
          onUndo?.();
          return;
        }
        return; // Don't process other Ctrl combos
      }

      // ── Escape — always active ────────────────────────────────────────
      if (key === 'Escape') {
        e.preventDefault();
        if (onEscape) {
          onEscape();
        } else {
          onSelectPiece(null);
        }
        return;
      }

      // ── N — Add new piece (no selection needed) ──────────────────────
      if (key === 'n' || key === 'N') {
        if (!selectedPieceId) {
          e.preventDefault();
          onAddNewPiece?.();
          return;
        }
      }

      // ── Piece-selected shortcuts ──────────────────────────────────────
      if (!selectedPieceId) return;

      switch (key) {
        case 'e':
        case 'E':
          e.preventDefault();
          onEditPiece?.(selectedPieceId);
          break;

        case 'd':
        case 'D':
          e.preventDefault();
          onDuplicatePiece?.(selectedPieceId);
          break;

        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          onDeletePiece?.(selectedPieceId);
          break;

        case 'Tab': {
          e.preventDefault();
          if (roomPieceIds.length === 0) break;
          const currentIndex = roomPieceIds.indexOf(selectedPieceId);
          let nextIndex: number;
          if (e.shiftKey) {
            // Previous piece
            nextIndex = currentIndex <= 0
              ? roomPieceIds.length - 1
              : currentIndex - 1;
          } else {
            // Next piece
            nextIndex = currentIndex >= roomPieceIds.length - 1
              ? 0
              : currentIndex + 1;
          }
          onSelectPiece(roomPieceIds[nextIndex]);
          break;
        }

        case 'm':
        case 'M':
          e.preventDefault();
          onMaterialSelect?.(selectedPieceId);
          break;

        case 'p':
        case 'P':
          e.preventDefault();
          onTogglePaintMode?.();
          break;

        case 'r':
        case 'R':
          e.preventDefault();
          onRelationshipEditor?.(selectedPieceId);
          break;

        case 'n':
        case 'N':
          e.preventDefault();
          onAddNewPiece?.();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    mode,
    selectedPieceId,
    roomPieceIds,
    onSelectPiece,
    onEditPiece,
    onDuplicatePiece,
    onDeletePiece,
    onMaterialSelect,
    onTogglePaintMode,
    onRelationshipEditor,
    onAddNewPiece,
    onEscape,
    onUndo,
    onRedo,
  ]);

  return { shouldShowHint, dismissHint };
}

// ── Keyboard Shortcuts Reference (for display) ─────────────────────────────

export const KEYBOARD_SHORTCUTS = [
  { key: 'E', description: 'Edit piece', condition: 'piece selected' },
  { key: 'D', description: 'Duplicate piece', condition: 'piece selected' },
  { key: 'Del', description: 'Delete piece', condition: 'piece selected' },
  { key: 'Esc', description: 'Deselect / close', condition: 'any' },
  { key: 'Tab', description: 'Next piece', condition: 'piece selected' },
  { key: 'Shift+Tab', description: 'Previous piece', condition: 'piece selected' },
  { key: 'M', description: 'Material selector', condition: 'piece selected' },
  { key: 'P', description: 'Toggle paint mode', condition: 'piece selected' },
  { key: 'R', description: 'Relationship editor', condition: 'piece selected' },
  { key: 'N', description: 'New piece', condition: 'room focused' },
  { key: 'Ctrl+Z', description: 'Undo', condition: 'any' },
  { key: 'Ctrl+Shift+Z', description: 'Redo', condition: 'any' },
] as const;
