"use client";

// apps/web/src/components/canvas/MeasurementOverlay.tsx
//
// Round 14 (Section B) — measurement-mode visual overlay.
//
// Renders the two species of measurement annotations computed by
// `apps/web/src/lib/measurement-lines.ts`:
//
//   1. Feature-to-edge distance lines for the SELECTED feature — thin
//      dashed lines from each face of the feature's bbox to the
//      nearest polygon edge in each cardinal direction. Labels at line
//      midpoint show the distance.
//
//   2. Edge subdivision dimensions ALONG each polygon edge — tick
//      marks at every feature boundary plus a labelled mm number for
//      every gap and feature span. The tick marks are perpendicular
//      to the edge and live in the Konva Layer; the labels sit in the
//      HTML overlay (anti-aliased at screen resolution).
//
// Visual contract (per the Round 14 brief):
//   - Thin dashed lines, 1 px screen-space, stone-400 colour, ~50%
//     opacity.
//   - Labels: IBM Plex Mono 10 px, stone-100 background pill.
//
// This module owns ONLY the rendering. All geometry — ray casting,
// edge partitioning — lives in the pure helpers in lib/measurement-lines.ts.

import { Line } from "react-konva";

import type {
  EdgeSubdivision,
  EdgeSubdivisionSegment,
  MeasurementLine,
} from "../../lib/measurement-lines";

// ─────────────────────────────────────────────────────────────────────────
// Konva — dashed measurement lines + edge subdivision ticks
// ─────────────────────────────────────────────────────────────────────────

export interface MeasurementLineKonvaProps {
  readonly line: MeasurementLine;
  readonly mmPerPx: number;
}

export function MeasurementLineKonva(props: MeasurementLineKonvaProps) {
  const { line, mmPerPx } = props;
  return (
    <Line
      points={[line.startMm.x, line.startMm.y, line.endMm.x, line.endMm.y]}
      stroke="#a8a29e"
      opacity={0.5}
      strokeWidth={1 * mmPerPx}
      dash={[6 * mmPerPx, 4 * mmPerPx]}
      listening={false}
    />
  );
}

export interface EdgeSubdivisionTicksKonvaProps {
  readonly subdivision: EdgeSubdivision;
  /** Edge tangent direction (unit). Drives tick perpendicular. */
  readonly tangentX: number;
  readonly tangentY: number;
  /**
   * Edge inward normal (unit) — ticks face into the polygon interior so
   * they don't clip across an exposed edge label. The MeasurementOverlay
   * computes this once per edge and passes it in.
   */
  readonly inwardX: number;
  readonly inwardY: number;
  readonly mmPerPx: number;
}

export function EdgeSubdivisionTicksKonva(
  props: EdgeSubdivisionTicksKonvaProps,
) {
  const { subdivision, tangentX, tangentY, inwardX, inwardY, mmPerPx } = props;
  // Only render ticks at the BOUNDARIES between segments — i.e. when a
  // feature meets a gap or another feature. An edge with no features
  // has only the {start, end} boundaries (which already render as the
  // standard DimensionLabel for the whole edge).
  if (subdivision.segments.length <= 1) return null;

  // Tick length: ~8 px screen-space, perpendicular to the edge in the
  // inward normal direction. Subtle.
  const tickHalfLengthMm = 8 * mmPerPx;
  // Boundary positions: along-edge mm values where one segment ends
  // and the next begins. Skip the first segment's `fromAlong` and the
  // last segment's `toAlong` (those are the edge endpoints).
  const boundaries: number[] = [];
  for (let i = 1; i < subdivision.segments.length; i++) {
    boundaries.push(subdivision.segments[i]!.fromAlongMm);
  }

  // We need the edge's start vertex to compute boundary positions in
  // piece-local mm. Re-derive from the first segment's midpoint and
  // its fromAlong/lengthMm via inverse math — easier to take from
  // the first segment's `midpointMm`.
  const firstSeg = subdivision.segments[0]!;
  // Start of edge in piece-local mm: midpoint - (fromAlong + length/2) * tangent.
  // Equivalently: midpoint - (avgAlong) * tangent where avgAlong is
  // the midpoint's distance from edge.start along the tangent.
  const avgAlong = (firstSeg.fromAlongMm + firstSeg.toAlongMm) / 2;
  const startX = firstSeg.midpointMm.x - tangentX * avgAlong;
  const startY = firstSeg.midpointMm.y - tangentY * avgAlong;

  return (
    <>
      {boundaries.map((alongMm, idx) => {
        const cx = startX + tangentX * alongMm;
        const cy = startY + tangentY * alongMm;
        const x1 = cx + inwardX * tickHalfLengthMm;
        const y1 = cy + inwardY * tickHalfLengthMm;
        const x2 = cx - inwardX * tickHalfLengthMm;
        const y2 = cy - inwardY * tickHalfLengthMm;
        return (
          <Line
            key={`tick-${subdivision.edgeId}-${idx}`}
            points={[x1, y1, x2, y2]}
            stroke="#a8a29e"
            opacity={0.7}
            strokeWidth={1 * mmPerPx}
            listening={false}
          />
        );
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// HTML labels — anti-aliased at screen resolution
// ─────────────────────────────────────────────────────────────────────────

export interface MeasurementLabelProps {
  readonly text: string;
  readonly screenX: number;
  readonly screenY: number;
  /** Optional `feature` styling: bolder type. */
  readonly emphasis?: "default" | "feature";
}

export function MeasurementLabel(props: MeasurementLabelProps) {
  const { text, screenX, screenY, emphasis = "default" } = props;
  const cls =
    emphasis === "feature"
      ? "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded bg-stone-200/95 px-1.5 py-[1px] font-mono text-[10px] font-medium leading-none text-stone-700 shadow-sm"
      : "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded bg-stone-100/90 px-1 py-[1px] font-mono text-[10px] leading-none text-stone-500 shadow-sm";
  return (
    <div className={cls} style={{ left: `${screenX}px`, top: `${screenY}px` }}>
      {text}
    </div>
  );
}

/** Re-export the segment shape for consumers. */
export type { EdgeSubdivisionSegment } from "../../lib/measurement-lines";
