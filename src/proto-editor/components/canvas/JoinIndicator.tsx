"use client";

// apps/web/src/components/canvas/JoinIndicator.tsx
//
// Round 7A (FIX 4): JoinIndicator anchors on the actual shared edge, not
// the diagonal between piece centroids.
//
// Previous (Round 3B): a dashed cinnabar line was drawn from
// `parent.centroid → child.centroid`. On an L-shape benchtop with a
// waterfall on the right end, this produced a confusing diagonal slashing
// across the canvas.
//
// New (Round 7A): the indicator is a thin cinnabar line laid along the
// `join.edgeA` endpoints. On hover it widens slightly and surfaces the
// kind label via the parent's tooltip plumbing (`onHover` callback).
//
// Round 7A also aligns the JoinKind literals to V3's UPPER_SNAKE_CASE
// vocabulary (`MITRE` / `BUTT` / `MASON_MITRE` / `FIELD_JOIN`).

import { useState } from "react";

import { Line } from "react-konva";

import type { JoinId, JoinKind } from "@stonehenge-proto/geometry";

interface JoinIndicatorProps {
  readonly joinId?: JoinId;
  /** Edge-anchor start, parent-piece world coords (mm). */
  readonly startMm: { readonly x: number; readonly y: number };
  /** Edge-anchor end, parent-piece world coords (mm). */
  readonly endMm: { readonly x: number; readonly y: number };
  readonly kind: JoinKind;
  readonly mmPerPx: number;
  /**
   * Fires on hover-in / hover-out so the parent can render the join
   * tooltip (kind label + computed mitre angle for MITRE joins). Optional:
   * omit to keep a non-interactive indicator.
   */
  readonly onHover?: (joinId: JoinId | null) => void;
}

const CINNABAR = "#dc4a37";

export function JoinIndicator(props: JoinIndicatorProps) {
  const { joinId, startMm, endMm, mmPerPx, onHover } = props;
  const [hovered, setHovered] = useState(false);
  // Stroke width in mm so it stays constant in screen-space. Idle: 1 px,
  // hover: 2 px. The brief asks for a subtle line.
  const strokeWidthMm = (hovered ? 2 : 1) * mmPerPx;
  const hitListens = onHover !== undefined && joinId !== undefined;
  return (
    <Line
      points={[startMm.x, startMm.y, endMm.x, endMm.y]}
      stroke={CINNABAR}
      strokeWidth={strokeWidthMm}
      opacity={hovered ? 1 : 0.85}
      listening={hitListens}
      hitStrokeWidth={Math.max(strokeWidthMm * 6, 14 * mmPerPx)}
      lineCap="round"
      {...(hitListens
        ? {
            onMouseEnter: () => {
              setHovered(true);
              onHover?.(joinId!);
            },
            onMouseLeave: () => {
              setHovered(false);
              onHover?.(null);
            },
          }
        : {})}
    />
  );
}

/**
 * Display label for a JoinKind. Used by canvas tooltips. Title-cased
 * Australian English; the V3 UPPER_SNAKE literals are schema-internal.
 */
export function prettyKind(kind: JoinKind): string {
  switch (kind) {
    case "BUTT":
      return "butt";
    case "MITRE":
      return "mitre";
    case "MASON_MITRE":
      return "mason mitre";
    case "FIELD_JOIN":
      return "field join";
  }
}
