"use client";

// apps/web/src/components/canvas/CanvasTooltip.tsx
//
// Round 4 — reusable hover-annotation primitive.
//
// One tooltip primitive for every contextual annotation rendered on or
// near the canvas (vertex coordinates, edge profile + length + rate,
// feature dimensions + price, build-up label, etc.). Sits in the same
// HTML overlay layer DimensionLabel uses — positioned in screen pixels,
// pointer-events: none so it never intercepts canvas clicks.
//
// Behavioural contract (brief §7.3):
//   - Position: above the anchor, 12 px offset
//   - Background: stone-900 at 92 % opacity
//   - Border-radius: 4 px
//   - Body text: IBM Plex Sans 10 px
//   - Numeric / dimension text: IBM Plex Mono 10 px
//   - Max width: 220 px
//   - Animation: 150 ms fade-in after 400 ms delay, 100 ms fade-out
//   - Only ONE tooltip visible at a time (managed by the parent)
//
// We don't render a CSS-animated pointer triangle because the canvas
// already has so many lines that adding a 4 px sprite below the pill
// reads as visual noise. The offset alone is enough.

import { useEffect, useRef, useState } from "react";

const APPEAR_DELAY_MS = 400;
const FADE_IN_MS = 150;
const FADE_OUT_MS = 100;
const VERTICAL_OFFSET_PX = 12;
const MAX_WIDTH_PX = 220;

export interface CanvasTooltipLine {
  /** Sans-serif body text. Use for profile names, exposure labels. */
  readonly label?: string;
  /** Monospace text. Use for dimensions, prices, coordinates. */
  readonly value?: string;
}

export interface CanvasTooltipProps {
  /** When false, the tooltip fades out and unmounts after FADE_OUT_MS. */
  readonly visible: boolean;
  /** Screen-pixel position of the anchor (e.g. the edge midpoint). */
  readonly anchorScreenX: number;
  readonly anchorScreenY: number;
  /** Lines of content. Each line is rendered on its own row. */
  readonly lines: readonly CanvasTooltipLine[];
}

/**
 * Render a tooltip near a screen-anchored point. Mounts immediately when
 * `visible` flips true but holds opacity at 0 for `APPEAR_DELAY_MS` to
 * suppress flash-on-pass-through. Unmounts after `FADE_OUT_MS` once
 * `visible` flips false.
 */
export function CanvasTooltip(props: CanvasTooltipProps) {
  const { visible, anchorScreenX, anchorScreenY, lines } = props;
  const [mounted, setMounted] = useState(visible);
  const [opacity, setOpacity] = useState(0);
  const appearTimerRef = useRef<number | null>(null);
  const fadeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      // Delay the appearance so a mouse-pass-through doesn't flash.
      appearTimerRef.current = window.setTimeout(() => {
        setOpacity(1);
      }, APPEAR_DELAY_MS);
      return () => {
        if (appearTimerRef.current !== null) {
          window.clearTimeout(appearTimerRef.current);
          appearTimerRef.current = null;
        }
      };
    }
    // visible flipped false — fade out and unmount.
    setOpacity(0);
    fadeTimerRef.current = window.setTimeout(() => {
      setMounted(false);
    }, FADE_OUT_MS);
    return () => {
      if (fadeTimerRef.current !== null) {
        window.clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
    };
  }, [visible]);

  if (!mounted) return null;

  return (
    <div
      role="tooltip"
      aria-hidden={!visible}
      className="pointer-events-none absolute z-20 flex -translate-x-1/2 -translate-y-full flex-col gap-0.5 rounded border border-stone-800/60 bg-stone-900/95 px-2 py-1 text-stone-100 shadow-lg backdrop-blur-sm"
      style={{
        left: `${anchorScreenX}px`,
        top: `${anchorScreenY - VERTICAL_OFFSET_PX}px`,
        opacity,
        transition: `opacity ${opacity === 1 ? FADE_IN_MS : FADE_OUT_MS}ms ease-out`,
        maxWidth: `${MAX_WIDTH_PX}px`,
      }}
    >
      {lines.map((line, i) => (
        <div
          key={i}
          className="flex items-baseline gap-1.5 whitespace-nowrap leading-tight"
        >
          {line.label !== undefined && (
            <span className="font-sans text-[10px] font-medium text-stone-200">
              {line.label}
            </span>
          )}
          {line.value !== undefined && (
            <span className="font-mono text-[10px] text-stone-300">
              {line.value}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
