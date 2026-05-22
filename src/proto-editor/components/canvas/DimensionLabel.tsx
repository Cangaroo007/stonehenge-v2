"use client";

// apps/web/src/components/canvas/DimensionLabel.tsx
//
// Editable dimension label rendered as an HTML element positioned over
// the Konva canvas. The parent owns the absolutely-positioned wrapper
// and passes the same `viewport` that drives the Konva Layer transform,
// so the label sits at the correct screen pixel for the edge midpoint
// plus a perpendicular 16-px offset.
//
// Round 4 — visual refresh (brief §4):
//   - Default: 12 px IBM Plex Mono, stone-900 at 85 % bg, no "mm" suffix
//   - Hover:   stone-800 bg, canvas-selection 1 px border, "mm" suffix
//   - Editing: cinnabar 1.5 px border, 13 px font, "mm" suffix outside input
//   - Short edges (< 60 mm): no label rendered; hover-on-edge tooltip
//     supplies the dimension instead.
//
// Dimension parsing strips a "mm" suffix if the operator types one.
// Validation (range, NaN) is delegated to `computeVertexMoveForEdgeLength`
// in usePiece's reducer; this component flashes its border red and
// reverts when the reducer rejects.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Edge, Vertex } from "@stonehenge-proto/geometry";

import {
  MAX_EDGE_LENGTH_MM,
  MIN_EDGE_LENGTH_MM,
} from "../../lib/edge-length-edit";
import type { CanvasViewport } from "../../types/editor";

const PERPENDICULAR_OFFSET_PX = 16;
// Round 8A (FIX 4) — tiered short-edge thresholds. Edges shorter than
// `HIDE_LABEL_THRESHOLD_MM` get no in-canvas label (the hover tooltip
// still supplies the dimension). Edges between Hide and Compact render
// the compact variant — smaller font + tighter padding — so the 100 mm
// segments adjacent to a window recess get a label without crowding the
// canvas. Edges ≥ Compact render the full label (Round 4 behaviour).
const HIDE_LABEL_THRESHOLD_MM = 30;
const COMPACT_LABEL_THRESHOLD_MM = 60;
const INPUT_MIN_WIDTH_PX = 60;
const INPUT_MIN_WIDTH_PX_COMPACT = 36;
const INPUT_MAX_WIDTH_PX = 120;
const INVALID_FLASH_MS = 600;

export interface DimensionLabelProps {
  readonly edge: Edge;
  readonly start: Vertex;
  readonly end: Vertex;
  readonly viewport: CanvasViewport;
  /** Called when the operator commits a new length. Caller dispatches
   *  the SET_EDGE_LENGTH action. */
  readonly onCommit: (newLengthMm: number) => void;
}

interface ScreenPos {
  readonly screenX: number;
  readonly screenY: number;
  readonly lengthMm: number;
}

function projectLabel(
  start: Vertex,
  end: Vertex,
  viewport: CanvasViewport,
): ScreenPos {
  const dxMm = end.x - start.x;
  const dyMm = end.y - start.y;
  const lengthMm = Math.hypot(dxMm, dyMm);
  const midXmm = (start.x + end.x) / 2;
  const midYmm = (start.y + end.y) / 2;

  // Perpendicular unit vector (rotate 90° CCW). We offset in screen
  // pixels — the same amount of offset regardless of zoom — so we
  // compute the perpendicular in world coords and scale back.
  const perpXmm = lengthMm === 0 ? 0 : -dyMm / lengthMm;
  const perpYmm = lengthMm === 0 ? 0 : dxMm / lengthMm;
  const offsetMm = PERPENDICULAR_OFFSET_PX * viewport.mmPerPx;
  const labelXmm = midXmm + perpXmm * offsetMm;
  const labelYmm = midYmm + perpYmm * offsetMm;

  const screenX = (labelXmm - viewport.panMmX) / viewport.mmPerPx;
  const screenY = (labelYmm - viewport.panMmY) / viewport.mmPerPx;
  return { screenX, screenY, lengthMm };
}

export function DimensionLabel(props: DimensionLabelProps) {
  const { edge, start, end, viewport, onCommit } = props;
  const { screenX, screenY, lengthMm } = useMemo(
    () => projectLabel(start, end, viewport),
    [start, end, viewport],
  );

  const [editing, setEditing] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [draft, setDraft] = useState(`${Math.round(lengthMm)}`);
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // When the underlying length changes (e.g. another edge edit moved the
  // shared vertex), and we are NOT currently editing, sync the draft.
  useEffect(() => {
    if (editing) return;
    setDraft(`${Math.round(lengthMm)}`);
  }, [lengthMm, editing]);

  // Auto-select on focus so typing replaces the value.
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Flash invalid state for INVALID_FLASH_MS, then revert.
  useEffect(() => {
    if (!invalid) return;
    const t = window.setTimeout(() => setInvalid(false), INVALID_FLASH_MS);
    return () => window.clearTimeout(t);
  }, [invalid]);

  const commit = useCallback(() => {
    const cleaned = draft.trim().replace(/mm$/i, "").trim();
    const parsed = Number(cleaned);
    if (
      !Number.isFinite(parsed) ||
      parsed < MIN_EDGE_LENGTH_MM ||
      parsed > MAX_EDGE_LENGTH_MM
    ) {
      setInvalid(true);
      setDraft(`${Math.round(lengthMm)}`);
      setEditing(false);
      return;
    }
    if (Math.round(parsed) === Math.round(lengthMm)) {
      setEditing(false);
      return;
    }
    onCommit(Math.round(parsed));
    setEditing(false);
  }, [draft, lengthMm, onCommit]);

  const cancel = useCallback(() => {
    setDraft(`${Math.round(lengthMm)}`);
    setEditing(false);
  }, [lengthMm]);

  // Click-outside while editing → commit.
  useEffect(() => {
    if (!editing) return;
    function onMouseDown(e: MouseEvent) {
      if (!containerRef.current) return;
      if (containerRef.current.contains(e.target as Node)) return;
      commit();
    }
    document.addEventListener("mousedown", onMouseDown, true);
    return () => document.removeEventListener("mousedown", onMouseDown, true);
  }, [editing, commit]);

  // Round 4 — edges below the hide-label threshold get no in-line label.
  // The parent can still surface the dimension via the edge hover tooltip
  // (rendered separately in PolygonCanvas). We deliberately don't render
  // a small dot any more — too noisy when many short edges are present.
  //
  // Round 8A (FIX 4) — threshold lowered from 60 → 30 mm. Edges in the
  // 30–60 mm band render the *compact* variant so window-recess 100 mm
  // segments etc. get a label without overwhelming the canvas.
  if (lengthMm < HIDE_LABEL_THRESHOLD_MM) {
    return null;
  }
  const isCompact = lengthMm < COMPACT_LABEL_THRESHOLD_MM;

  if (editing) {
    const minWidth = isCompact ? INPUT_MIN_WIDTH_PX_COMPACT : INPUT_MIN_WIDTH_PX;
    const widthCh = Math.min(
      INPUT_MAX_WIDTH_PX,
      Math.max(minWidth, draft.length * 11 + 24),
    );
    return (
      <div
        ref={containerRef}
        className="pointer-events-auto absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1"
        style={{ left: `${screenX}px`, top: `${screenY}px` }}
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          aria-label={`Edge ${edge.id} length in millimetres`}
          className={`h-7 rounded border-[1.5px] bg-stone-900 px-2 font-mono text-[13px] leading-none text-white shadow-md focus:outline-none ${
            invalid ? "border-red-500" : "border-cinnabar-500"
          }`}
          style={{ width: `${widthCh}px` }}
        />
        <span className="select-none font-mono text-[11px] text-stone-400">
          mm
        </span>
      </div>
    );
  }

  // Round 8A (FIX 4) — compact variant for 30–60 mm edges. Smaller font
  // (9 px vs 12 px) and tighter padding so the label doesn't crowd the
  // adjacent geometry. Hover still surfaces the "mm" suffix on both
  // variants; the compact variant just lays it out tighter.
  const sizeClass = isCompact
    ? "px-1 py-0 text-[9px]"
    : "px-2 py-[3px] text-[12px]";

  return (
    <button
      type="button"
      title="Click to edit"
      aria-label={`Edge ${edge.id} length: ${Math.round(lengthMm)} millimetres. Click to edit.`}
      onClick={() => setEditing(true)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-text rounded border ${sizeClass} font-mono leading-none text-white shadow-sm transition-colors ${
        invalid
          ? "border-red-500 bg-stone-900/95"
          : hovered
            ? "border-canvas-selection bg-stone-800/95"
            : "border-stone-700 bg-stone-900/85"
      }`}
      style={{ left: `${screenX}px`, top: `${screenY}px` }}
    >
      {Math.round(lengthMm)}
      {hovered && (
        <span className="ml-1 text-stone-400">mm</span>
      )}
    </button>
  );
}
