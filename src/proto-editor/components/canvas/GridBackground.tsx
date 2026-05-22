"use client";

// apps/web/src/components/canvas/GridBackground.tsx
//
// Round 4 — adaptive multi-level grid.
//
// The grid now resolves a (minor, major, label-stride) tier from the
// current zoom (`gridTierFor` in `lib/canvas-utils`) so the on-screen
// spacing remains in a sensible visual band regardless of how deep
// the operator has zoomed in or out. Brief §3:
//
//   > 5 mm/px        minor 100, major 500, labels every 500
//   2..5 mm/px       minor 50,  major 250, labels every 250
//   1..2 mm/px       minor 10,  major 100, labels every 100
//   < 1 mm/px        minor 5,   major 50,  labels every 50
//
// Visual contract:
//   - Minor lines: 0.5 px stroke, canvas-grid colour (#2A2A2A)
//   - Major lines: 0.75 px stroke, stone-800 at 40 % opacity
//   - Origin crosshair: stone-500, 1 px, 8 mm legs in *screen* px terms
//   - Hidden entirely when `visible === false` (G shortcut)
//
// Drawn directly via a Konva Shape `sceneFunc` so the cost is one node
// regardless of how dense the grid gets. The stroke widths are issued in
// piece-local mm (multiplied by mmPerPx) so 0.5 px on screen stays 0.5 px
// at any zoom.

import { Shape } from "react-konva";

import { gridTierFor } from "../../lib/canvas-utils";

export interface GridBackgroundProps {
  /** Visible region in piece-local mm (axis-aligned). */
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  /** Current zoom expressed as mm-per-pixel. */
  readonly mmPerPx: number;
  /** When false, the grid does not render. Toggled by the G shortcut. */
  readonly visible?: boolean;
}

const MINOR_STROKE = "#2A2A2A";
const MAJOR_STROKE = "rgba(58, 58, 58, 0.65)"; // stone-800-ish, slightly elevated
const ORIGIN_STROKE = "#75746B"; // stone-500
const ORIGIN_LEG_PX = 8;

export function GridBackground(props: GridBackgroundProps) {
  const { minX, minY, maxX, maxY, mmPerPx, visible = true } = props;
  if (!visible) return null;

  const tier = gridTierFor(mmPerPx);

  return (
    <Shape
      listening={false}
      sceneFunc={(ctx) => {
        ctx.save();

        // Minor lines.
        const startMinorX = Math.ceil(minX / tier.minorMm) * tier.minorMm;
        const startMinorY = Math.ceil(minY / tier.minorMm) * tier.minorMm;
        ctx.strokeStyle = MINOR_STROKE;
        ctx.lineWidth = 0.5 * mmPerPx;
        ctx.beginPath();
        for (let x = startMinorX; x <= maxX; x += tier.minorMm) {
          if (x % tier.majorMm === 0) continue; // major drawn separately
          ctx.moveTo(x, minY);
          ctx.lineTo(x, maxY);
        }
        for (let y = startMinorY; y <= maxY; y += tier.minorMm) {
          if (y % tier.majorMm === 0) continue;
          ctx.moveTo(minX, y);
          ctx.lineTo(maxX, y);
        }
        ctx.stroke();

        // Major lines.
        const startMajorX = Math.ceil(minX / tier.majorMm) * tier.majorMm;
        const startMajorY = Math.ceil(minY / tier.majorMm) * tier.majorMm;
        ctx.strokeStyle = MAJOR_STROKE;
        ctx.lineWidth = 0.75 * mmPerPx;
        ctx.beginPath();
        for (let x = startMajorX; x <= maxX; x += tier.majorMm) {
          ctx.moveTo(x, minY);
          ctx.lineTo(x, maxY);
        }
        for (let y = startMajorY; y <= maxY; y += tier.majorMm) {
          ctx.moveTo(minX, y);
          ctx.lineTo(maxX, y);
        }
        ctx.stroke();

        // Origin crosshair — only render when (0,0) is in view.
        if (minX <= 0 && 0 <= maxX && minY <= 0 && 0 <= maxY) {
          const legMm = ORIGIN_LEG_PX * mmPerPx;
          ctx.strokeStyle = ORIGIN_STROKE;
          ctx.lineWidth = 1 * mmPerPx;
          ctx.beginPath();
          ctx.moveTo(-legMm, 0);
          ctx.lineTo(legMm, 0);
          ctx.moveTo(0, -legMm);
          ctx.lineTo(0, legMm);
          ctx.stroke();
        }

        ctx.restore();
      }}
    />
  );
}
