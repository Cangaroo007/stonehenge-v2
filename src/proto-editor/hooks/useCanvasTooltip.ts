"use client";

// apps/web/src/hooks/useCanvasTooltip.ts
//
// Round 6 (Fix 4) — single-source-of-truth tooltip state for the canvas.
//
// The Round 4/5 implementation kept hover state per element (vertex,
// edge, feature) with three independent useState calls and timers
// scattered across CanvasTooltip mount/unmount cycles. Rapid mouse moves
// between adjacent elements produced flicker and orphaned timers; some
// elements (join indicator, inactive ghost piece) never plumbed hover
// callbacks at all, which is the user-visible "tooltip never shows" bug.
//
// This hook collapses that into one tooltip state with a single 400 ms
// appearance timer. Callers fire `show(content, screenPos)` / `hide()`
// from element hover handlers; the hook deduplicates flickers and
// reschedules cleanly when one element hands off to the next.

import { useCallback, useEffect, useRef, useState } from "react";

import type { CanvasTooltipLine } from "../components/canvas/CanvasTooltip";

const APPEAR_DELAY_MS = 400;

export interface TooltipContent {
  /** Identifies the anchor — same id swaps content without flicker. */
  readonly anchorKey: string;
  readonly lines: readonly CanvasTooltipLine[];
  readonly screenX: number;
  readonly screenY: number;
}

export interface UseCanvasTooltipApi {
  readonly visible: TooltipContent | null;
  readonly show: (content: TooltipContent) => void;
  readonly hide: () => void;
  readonly update: (
    anchorKey: string,
    patch: Partial<Omit<TooltipContent, "anchorKey">>,
  ) => void;
}

export function useCanvasTooltip(): UseCanvasTooltipApi {
  const [visible, setVisible] = useState<TooltipContent | null>(null);
  const pendingRef = useRef<TooltipContent | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Always clean up the timer when the hook unmounts.
  useEffect(() => () => clearTimer(), [clearTimer]);

  const show = useCallback(
    (content: TooltipContent) => {
      // Hand-off case: another anchor was already visible. Swap the
      // content immediately (no second 400 ms wait). This produces the
      // "tooltips swap without flicker" behaviour the brief calls out.
      if (visible !== null && visible.anchorKey !== content.anchorKey) {
        clearTimer();
        pendingRef.current = null;
        setVisible(content);
        return;
      }
      // Same anchor already visible — just update coords/lines.
      if (visible !== null && visible.anchorKey === content.anchorKey) {
        setVisible(content);
        return;
      }
      // Cold start: schedule appearance after the 400 ms delay.
      pendingRef.current = content;
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        if (pendingRef.current) {
          setVisible(pendingRef.current);
          pendingRef.current = null;
        }
      }, APPEAR_DELAY_MS);
    },
    [visible, clearTimer],
  );

  const hide = useCallback(() => {
    pendingRef.current = null;
    clearTimer();
    setVisible(null);
  }, [clearTimer]);

  const update = useCallback(
    (
      anchorKey: string,
      patch: Partial<Omit<TooltipContent, "anchorKey">>,
    ) => {
      setVisible((current) => {
        if (current === null || current.anchorKey !== anchorKey) return current;
        return { ...current, ...patch };
      });
    },
    [],
  );

  return { visible, show, hide, update };
}
