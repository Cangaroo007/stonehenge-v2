"use client";

// apps/web/src/components/canvas/CanvasToast.tsx
//
// Round 8A (FIX 3) — feature-placement confirmation toast.
// Round 12 (Section A) — adds a `variant` so overflow rejections render
// in amber rather than the success-pill stone-grey.
//
// Tiny pill above the bottom of the canvas. Auto-dismisses after 2 s
// (info) or 4 s (warning — gives the operator more time to read the
// fit details). Setting a new message while one is visible replaces
// it — the timer restarts, so two placements in quick succession
// produce two distinct toasts back-to-back (per the brief's
// acceptance criteria).

import { useEffect } from "react";

const DISMISS_AFTER_MS_INFO = 2000;
const DISMISS_AFTER_MS_WARNING = 4000;

export type CanvasToastVariant = "info" | "warning";

export interface CanvasToastProps {
  /** Message to display. `null` hides the toast. */
  readonly message: string | null;
  /**
   * Round 12 — toast style. "info" (default) renders the stone-grey
   * success pill from Round 8A. "warning" renders an amber pill used
   * for overflow rejection messages.
   */
  readonly variant?: CanvasToastVariant;
  /** Called when the dismiss timer fires. */
  readonly onDismiss: () => void;
}

export function CanvasToast({
  message,
  variant = "info",
  onDismiss,
}: CanvasToastProps) {
  useEffect(() => {
    if (!message) return;
    const dismissMs =
      variant === "warning" ? DISMISS_AFTER_MS_WARNING : DISMISS_AFTER_MS_INFO;
    const t = window.setTimeout(onDismiss, dismissMs);
    return () => window.clearTimeout(t);
  }, [message, variant, onDismiss]);

  if (!message) return null;

  // Amber pill (warning) vs stone-grey pill (info). The warning text
  // wraps to multiple lines on long sentences ("⚠ X (760×450 mm)
  // doesn't fit — edge is only 500 mm. Try a smaller product or a
  // longer edge."), so we drop the `rounded-full` for `rounded-md`
  // and let the text breathe.
  const className =
    variant === "warning"
      ? "pointer-events-none absolute bottom-6 left-1/2 z-20 -translate-x-1/2 max-w-[560px] rounded-md bg-amber-500/95 px-4 py-2 text-center font-sans text-[12px] text-stone-900 shadow-md"
      : "pointer-events-none absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-full bg-stone-900/85 px-4 py-1.5 font-sans text-[12px] text-white shadow-md";

  return (
    <div role="status" aria-live="polite" className={className}>
      {message}
    </div>
  );
}
