"use client";

// apps/web/src/components/canvas/CanvasRulers.tsx
//
// Round 4 — top + left rulers with major-tier labels.
//
// Rendered in the HTML overlay (the same pointer-events: none layer that
// hosts DimensionLabel) so the rulers stay crisp text rather than Konva
// rasterised Text nodes. The horizontal ruler sits at the top, the
// vertical ruler sits at the left.
//
// Visibility — per brief §3: labels only when zoom < 5 mm/px. At larger
// zoom-outs the numbers would crowd, so we drop them entirely. The grid
// lines themselves still render via GridBackground.
//
// The numeric values are the world-mm coordinates of the major
// gridlines (e.g. 0, 500, 1000, 1500). Negative values are shown with
// a leading minus.

import { gridTierFor } from "../../lib/canvas-utils";
import type { CanvasViewport } from "../../types/editor";

const LABEL_FONT_PX = 9;
const TICK_INSET_PX = 4;
const SHOW_THRESHOLD_MM_PER_PX = 5;

export interface CanvasRulersProps {
  readonly viewport: CanvasViewport;
  readonly widthPx: number;
  readonly heightPx: number;
  /** When false (G shortcut), rulers don't render. */
  readonly visible?: boolean;
}

export function CanvasRulers(props: CanvasRulersProps) {
  const { viewport, widthPx, heightPx, visible = true } = props;
  if (!visible) return null;
  if (viewport.mmPerPx >= SHOW_THRESHOLD_MM_PER_PX) return null;

  const tier = gridTierFor(viewport.mmPerPx);
  const stride = tier.labelEveryMm;

  const worldMinX = viewport.panMmX;
  const worldMaxX = viewport.panMmX + widthPx * viewport.mmPerPx;
  const worldMinY = viewport.panMmY;
  const worldMaxY = viewport.panMmY + heightPx * viewport.mmPerPx;

  const firstX = Math.ceil(worldMinX / stride) * stride;
  const firstY = Math.ceil(worldMinY / stride) * stride;

  const xLabels: Array<{ value: number; screenX: number }> = [];
  for (let x = firstX; x <= worldMaxX; x += stride) {
    const screenX = (x - viewport.panMmX) / viewport.mmPerPx;
    xLabels.push({ value: x, screenX });
  }
  const yLabels: Array<{ value: number; screenY: number }> = [];
  for (let y = firstY; y <= worldMaxY; y += stride) {
    const screenY = (y - viewport.panMmY) / viewport.mmPerPx;
    yLabels.push({ value: y, screenY });
  }

  return (
    <div
      className="pointer-events-none absolute inset-0"
      aria-hidden
      style={{ fontSize: `${LABEL_FONT_PX}px` }}
    >
      {xLabels.map(({ value, screenX }) => (
        <span
          key={`x-${value}`}
          className="absolute select-none font-mono text-stone-600/60"
          style={{
            left: `${screenX + TICK_INSET_PX}px`,
            top: `${TICK_INSET_PX}px`,
            lineHeight: 1,
          }}
        >
          {formatLabel(value)}
        </span>
      ))}
      {yLabels.map(({ value, screenY }) => (
        <span
          key={`y-${value}`}
          className="absolute select-none font-mono text-stone-600/60"
          style={{
            left: `${TICK_INSET_PX}px`,
            top: `${screenY + TICK_INSET_PX}px`,
            lineHeight: 1,
          }}
        >
          {formatLabel(value)}
        </span>
      ))}
    </div>
  );
}

function formatLabel(value: number): string {
  if (value === 0) return "0";
  // World-y grows downward in piece-local mm; keep the sign honest.
  return String(Math.round(value));
}
