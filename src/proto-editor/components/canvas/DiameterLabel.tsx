"use client";

// apps/web/src/components/canvas/DiameterLabel.tsx
//
// Round 18 (Fix 3) — editable diameter label for fully-curved (circle)
// pieces. Replaces the inert `<div pointer-events-none>` that previously
// rendered the `⌀ N mm` annotation at the polygon centroid (Round 16
// Fix 7). Mirrors `DimensionLabel`'s click → input → commit pattern so
// the operator can type a new diameter and have all 32 vertices scale
// uniformly around the centroid.
//
// The commit flow:
//   1. Parse the typed value (strip a "mm" suffix if present).
//   2. Reject NaN, negative, or out-of-range values (60 mm ≤ d ≤ 5000 mm).
//   3. Skip if the rounded value equals the current displayed diameter.
//   4. Call `onCommit(newDiameterMm)` — the parent computes the scale
//      factor and dispatches `SCALE_PIECE`.
//
// The component is intentionally agnostic about the underlying scale
// transform — it only knows the current diameter and the operator's
// target. Keeping the scale math in the parent (PolygonCanvas) means
// the centroid stays consistent with the canvas's own `activeCentroid`
// memo, which is what's used to position this label.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Smallest diameter the operator can type. Below this the polygon is
 *  smaller than the panel-typical 100 mm gridlines and the read-back is
 *  noisy; the same `MIN_EDGE_LENGTH_MM = 10` would technically work but
 *  60 mm is the smallest catalogue circle and aligns with the compact-
 *  label threshold in `DimensionLabel`. */
export const MIN_DIAMETER_MM = 60;
/** Largest diameter — matches `MAX_EDGE_LENGTH_MM` upper bound, scaled
 *  for circles. 5 m is well past the largest hand-formable kitchen
 *  island. */
export const MAX_DIAMETER_MM = 5000;
const INVALID_FLASH_MS = 600;

export interface DiameterLabelProps {
  readonly diameterMm: number;
  readonly screenX: number;
  readonly screenY: number;
  /** Called when the operator commits a new diameter (in mm).
   *  The parent computes scale = newDiameterMm / diameterMm and
   *  dispatches SCALE_PIECE. */
  readonly onCommit: (newDiameterMm: number) => void;
}

export function DiameterLabel(props: DiameterLabelProps) {
  const { diameterMm, screenX, screenY, onCommit } = props;

  const [editing, setEditing] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [draft, setDraft] = useState(`${Math.round(diameterMm)}`);
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const displayed = useMemo(() => Math.round(diameterMm), [diameterMm]);

  // Sync the draft to the underlying diameter when not editing — handles
  // the case where SCALE_PIECE lands and the displayed diameter changes.
  useEffect(() => {
    if (editing) return;
    setDraft(`${displayed}`);
  }, [displayed, editing]);

  // Focus + select on entering edit mode so typing replaces the value.
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Flash invalid border for INVALID_FLASH_MS, then clear.
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
      parsed < MIN_DIAMETER_MM ||
      parsed > MAX_DIAMETER_MM
    ) {
      setInvalid(true);
      setDraft(`${displayed}`);
      setEditing(false);
      return;
    }
    if (Math.round(parsed) === displayed) {
      setEditing(false);
      return;
    }
    onCommit(Math.round(parsed));
    setEditing(false);
  }, [draft, displayed, onCommit]);

  const cancel = useCallback(() => {
    setDraft(`${displayed}`);
    setEditing(false);
  }, [displayed]);

  // Click outside while editing → commit.
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

  if (editing) {
    const widthCh = Math.min(140, Math.max(70, draft.length * 11 + 24));
    return (
      <div
        ref={containerRef}
        className="pointer-events-auto absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1"
        style={{ left: `${screenX}px`, top: `${screenY}px` }}
      >
        <span className="select-none font-mono text-[12px] text-stone-400">
          ⌀
        </span>
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
          aria-label="Diameter in millimetres"
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

  return (
    <button
      type="button"
      title="Click to edit diameter"
      aria-label={`Diameter ${displayed} millimetres. Click to edit.`}
      onClick={() => setEditing(true)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-text rounded border px-2 py-[3px] font-mono text-[12px] leading-none text-white shadow-sm transition-colors ${
        invalid
          ? "border-red-500 bg-stone-900/95"
          : hovered
            ? "border-canvas-selection bg-stone-800/95"
            : "border-stone-700 bg-stone-900/85"
      }`}
      style={{ left: `${screenX}px`, top: `${screenY}px` }}
    >
      {`⌀ ${displayed}`}
      {hovered && <span className="ml-1 text-stone-400">mm</span>}
    </button>
  );
}
