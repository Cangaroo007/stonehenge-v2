"use client";

// apps/web/src/components/canvas/VertexHandle.tsx
//
// Round 4 — precision-instrument refresh.
//
// Visual contract (brief §1):
//   - Default      6 px circle, transparent fill, stone-400 stroke 1.5 px
//   - Hover        8 px circle, canvas-selection stroke 2 px, 15 % fill
//   - Selected     8 px circle, cinnabar stroke 2 px, 20 % fill, halo ring
//   - Dragging     8 px circle, cinnabar stroke 2 px, 40 % fill
//   - Corner-arc   indicator drawn as a thin dashed arc circle (whisper-thin)
//   - Hit area     16 px radius regardless of visual size — easy to click
//
// Width/radius is issued in piece-local mm (multiplied by mmPerPx) so the
// values above are screen pixels regardless of zoom. State transitions
// (hover, select) are governed by hovered/selected/dragging flags;
// react-konva re-renders the underlying Circles on every change.
//
// We use a draggable Group anchored at (vertex.x, vertex.y) so the visible
// handle and the larger invisible hit-target move together during drag.
// The visible handle uses listening:false so all pointer events pass to
// the hit-target.
//
// The coordinate tooltip during drag is rendered by the parent in the
// HTML overlay — see `onDragMove`.

import { useState } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { Circle, Group } from "react-konva";

import type { Vertex, VertexId } from "@stonehenge-proto/geometry";

const DEFAULT_RADIUS_PX = 3; // diameter 6
const ACTIVE_RADIUS_PX = 4; // diameter 8
const HIT_RADIUS_PX = 16;
const HALO_OUTER_PX = 14;

const STROKE_DEFAULT = "#9E9D93"; // stone-400
const STROKE_HOVER = "#4A90D9"; // canvas-selection
const STROKE_ACTIVE = "#D63F1A"; // cinnabar
const ARC_INDICATOR = "#75746B"; // stone-500
const FILL_HOVER = "rgba(74, 144, 217, 0.15)";
const FILL_SELECTED = "rgba(214, 63, 26, 0.20)";
const FILL_DRAGGING = "rgba(214, 63, 26, 0.40)";

export interface VertexHandleProps {
  readonly vertex: Vertex;
  readonly mmPerPx: number;
  readonly onMove: (vertexId: VertexId, x: number, y: number) => void;
  /** Round-3A: highlight when selected; click-to-select wiring. */
  readonly selected?: boolean;
  /**
   * Round 15 (Fix 1) — `additive` is true when Ctrl+Shift was held at
   * click time. The parent uses this to dispatch a TOGGLE selection
   * (multi-select) rather than a single SELECT_VERTEX. Plain click
   * passes additive=false.
   */
  readonly onSelect?: (vertexId: VertexId, additive: boolean) => void;
  /**
   * Round 4 — fires on hover-in and hover-out so the parent can show the
   * coordinate tooltip in the HTML overlay layer. `null` means the
   * hover ended.
   */
  readonly onHover?: (vertexId: VertexId | null) => void;
  /**
   * Round 4 — fires per drag frame with the in-progress position so the
   * parent can update the live coordinate tooltip. The committed value
   * still goes through `onMove` on drag end.
   */
  readonly onDragMove?: (vertexId: VertexId, x: number, y: number) => void;
  /**
   * Round 9 (Issue 4 Level 1) — optional Konva dragBoundFunc to
   * constrain drag positions. Used by the parent to magnetise the
   * vertex to standard interior angles (90°, 45°, etc.) when the
   * proposed drag position is close to a target. Returns the actual
   * position Konva should use for the drag frame.
   */
  readonly dragBoundFunc?: (pos: { x: number; y: number }) => {
    x: number;
    y: number;
  };
  /**
   * Round 9 (Issue 4 Level 1) — fires on drag end. Used by the parent
   * to clear the angle-snap indicator state.
   */
  readonly onDragEnd?: () => void;
}

export function VertexHandle(props: VertexHandleProps) {
  const {
    vertex,
    mmPerPx,
    onMove,
    selected,
    onSelect,
    onHover,
    onDragMove,
    dragBoundFunc,
    onDragEnd,
  } = props;
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);

  const cornerRadiusMm = vertex.cornerRadiusMm ?? 0;
  const isActive = dragging || selected || hovered;
  const radiusPx = isActive ? ACTIVE_RADIUS_PX : DEFAULT_RADIUS_PX;
  const radiusMm = radiusPx * mmPerPx;

  let stroke = STROKE_DEFAULT;
  let strokeWidth = 1.5 * mmPerPx;
  let fill = "transparent";
  if (dragging) {
    stroke = STROKE_ACTIVE;
    strokeWidth = 2 * mmPerPx;
    fill = FILL_DRAGGING;
  } else if (selected) {
    stroke = STROKE_ACTIVE;
    strokeWidth = 2 * mmPerPx;
    fill = FILL_SELECTED;
  } else if (hovered) {
    stroke = STROKE_HOVER;
    strokeWidth = 2 * mmPerPx;
    fill = FILL_HOVER;
  }

  return (
    <Group
      x={vertex.x}
      y={vertex.y}
      draggable
      onMouseEnter={() => {
        setHovered(true);
        onHover?.(vertex.id);
      }}
      onMouseLeave={() => {
        setHovered(false);
        onHover?.(null);
      }}
      onClick={(e: KonvaEventObject<MouseEvent>) => {
        if (!onSelect) return;
        // Round 15 (Fix 1) — Ctrl+Shift means "add to multi-select".
        // Either Cmd+Shift (macOS) or Ctrl+Shift (Win/Linux) qualifies.
        const evt = e.evt;
        const additive =
          evt.shiftKey && (evt.ctrlKey || evt.metaKey);
        onSelect(vertex.id, additive);
      }}
      onTap={(e: KonvaEventObject<TouchEvent>) => {
        if (!onSelect) return;
        // Round 15 (Fix 1) — same additive rule on touch (rare in
        // practice but cheap to support).
        const evt = e.evt as TouchEvent & { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean };
        const additive =
          (evt.shiftKey ?? false) && ((evt.ctrlKey ?? false) || (evt.metaKey ?? false));
        onSelect(vertex.id, additive);
      }}
      onDragStart={() => setDragging(true)}
      onDragMove={(e: KonvaEventObject<DragEvent>) => {
        if (onDragMove) {
          const node = e.target;
          onDragMove(vertex.id, Math.round(node.x()), Math.round(node.y()));
        }
      }}
      onDragEnd={(e: KonvaEventObject<DragEvent>) => {
        setDragging(false);
        const node = e.target;
        const newX = Math.round(node.x());
        const newY = Math.round(node.y());
        onMove(vertex.id, newX, newY);
        if (onDragEnd) onDragEnd();
      }}
      {...(dragBoundFunc !== undefined ? { dragBoundFunc } : {})}
    >
      {/* Corner-radius indicator. A thin dashed circle in piece-local mm so
          the arc preview is to scale with the canvas. Lower priority than
          the handle itself — listening: false. */}
      {cornerRadiusMm > 0 && (
        <Circle
          radius={cornerRadiusMm}
          stroke={ARC_INDICATOR}
          strokeWidth={0.75 * mmPerPx}
          dash={[4 * mmPerPx, 4 * mmPerPx]}
          listening={false}
          opacity={0.55}
        />
      )}

      {/* Selection halo — thin outer ring when selected. Subtle. */}
      {selected && !dragging && (
        <Circle
          radius={HALO_OUTER_PX * mmPerPx}
          stroke={STROKE_ACTIVE}
          strokeWidth={1 * mmPerPx}
          listening={false}
          opacity={0.25}
        />
      )}

      {/* Invisible hit-target — keeps the click area generous (16 px
          radius) regardless of the small visual size. */}
      <Circle radius={HIT_RADIUS_PX * mmPerPx} fill="transparent" />

      {/* Visible handle — small circle, scaled by zoom. listening:false
          so the hit-target above owns pointer events. */}
      <Circle
        radius={radiusMm}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        listening={false}
      />
    </Group>
  );
}
