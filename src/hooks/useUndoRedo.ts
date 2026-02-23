'use client';

import { useState, useCallback, useRef } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface UndoableAction {
  id: string;
  type:
    | 'PIECE_EDIT'
    | 'EDGE_CHANGE'
    | 'CUTOUT_CHANGE'
    | 'RELATIONSHIP_CHANGE'
    | 'PIECE_DELETE'
    | 'PIECE_CREATE'
    | 'ROOM_MOVE';
  description: string;
  timestamp: number;
  forward: () => Promise<void>;
  backward: () => Promise<void>;
  snapshot?: unknown;
}

export interface UseUndoRedoReturn {
  canUndo: boolean;
  canRedo: boolean;
  undoDescription: string | null;
  redoDescription: string | null;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  pushAction: (action: Omit<UndoableAction, 'id' | 'timestamp'>) => void;
  history: UndoableAction[];
  historyIndex: number;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

let actionIdCounter = 0;

export function useUndoRedo(maxHistory = 50): UseUndoRedoReturn {
  const [history, setHistory] = useState<UndoableAction[]>([]);
  // historyIndex points to the last executed action (-1 = nothing executed)
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isProcessingRef = useRef(false);

  const pushAction = useCallback(
    (action: Omit<UndoableAction, 'id' | 'timestamp'>) => {
      const fullAction: UndoableAction = {
        ...action,
        id: `undo-${++actionIdCounter}`,
        timestamp: Date.now(),
      };

      setHistory((prev) => {
        // Discard any future branch (actions after current index)
        const trimmed = prev.slice(0, historyIndex + 1);
        const next = [...trimmed, fullAction];
        // Cap at maxHistory
        if (next.length > maxHistory) {
          return next.slice(next.length - maxHistory);
        }
        return next;
      });

      setHistoryIndex((prev) => {
        // After discarding future, new index = length of trimmed + 0 (new item)
        const trimmedLength = Math.min(prev + 1, maxHistory - 1);
        return trimmedLength;
      });
    },
    [historyIndex, maxHistory]
  );

  const undo = useCallback(async () => {
    if (isProcessingRef.current) return;
    if (historyIndex < 0) return;

    const action = history[historyIndex];
    if (!action) return;

    isProcessingRef.current = true;
    try {
      await action.backward();
      setHistoryIndex((i) => i - 1);
    } catch (err) {
      console.error('Undo failed:', err);
    } finally {
      isProcessingRef.current = false;
    }
  }, [history, historyIndex]);

  const redo = useCallback(async () => {
    if (isProcessingRef.current) return;
    if (historyIndex >= history.length - 1) return;

    const action = history[historyIndex + 1];
    if (!action) return;

    isProcessingRef.current = true;
    try {
      await action.forward();
      setHistoryIndex((i) => i + 1);
    } catch (err) {
      console.error('Redo failed:', err);
    } finally {
      isProcessingRef.current = false;
    }
  }, [history, historyIndex]);

  const canUndo = historyIndex >= 0;
  const canRedo = historyIndex < history.length - 1;

  const undoDescription = canUndo ? history[historyIndex]?.description ?? null : null;
  const redoDescription = canRedo
    ? history[historyIndex + 1]?.description ?? null
    : null;

  return {
    canUndo,
    canRedo,
    undoDescription,
    redoDescription,
    undo,
    redo,
    pushAction,
    history,
    historyIndex,
  };
}
