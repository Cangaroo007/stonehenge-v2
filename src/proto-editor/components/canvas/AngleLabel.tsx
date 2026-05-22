"use client";

// apps/web/src/components/canvas/AngleLabel.tsx
//
// Round 11 (Fix 1) — Interactive interior-angle label.
//
// Mirrors `DimensionLabel`'s interaction model but for the interior
// angle at the selected vertex. The component is an HTML overlay
// positioned in screen coordinates by the parent (PolygonCanvas).
// Konva owns the angle arc; this overlay owns the readable, clickable
// degree value.
//
// States:
//   - default  : 11 px IBM Plex Mono on stone-900/85% bg, exact value
//                via `formatAngleDisplay` (one decimal if non-integer)
//   - hover    : cinnabar-700 bg, "°" suffix tucked alongside, cursor
//                changes to text — invites the click
//   - editing  : inline text input, cinnabar 2 px border, "°" sits
//                outside the input. Enter/Tab/click-outside commit,
//                Escape cancels, invalid values flash red and revert.
//
// Colour parameter mirrors VertexAngleArc's status palette so the arc
// and label always agree:
//   blue   — within ±0.5° of a standard target (fabrication-exact)
//   amber  — > 0.5° and ≤ 2° off a standard target (warning band)
//   white  — non-standard intentional angle (60°, 70°, etc.)
//
// Pure UI — no kernel calls. `onSetAngle` dispatches the existing
// SET_VERTEX_ANGLE reducer action up the tree.

import { useCallback, useEffect, useRef, useState } from "react";

import {
  formatAngleDisplay,
  formatAngleInputValue,
} from "../../lib/angle-snap";

/** Minimum acceptable angle the operator can type. */
export const ANGLE_LABEL_MIN_DEG = 1;
/** Maximum acceptable angle the operator can type. */
export const ANGLE_LABEL_MAX_DEG = 359;

const INVALID_FLASH_MS = 600;
const INPUT_MIN_WIDTH_PX = 56;
const INPUT_MAX_WIDTH_PX = 104;

export type AngleLabelColour = "blue" | "amber" | "white";

export interface AngleLabelProps {
  /** Interior angle at the vertex, in degrees. */
  readonly angleDeg: number;
  /** Screen-space position (px) of the label's anchor. */
  readonly screenX: number;
  readonly screenY: number;
  /** Colour band — matches VertexAngleArc. */
  readonly colour: AngleLabelColour;
  /**
   * Called when the operator commits a new angle. Parent dispatches
   * SET_VERTEX_ANGLE — the kernel's `setVertexAngle` moves the vertex
   * via law-of-sines so the outgoing edge length is preserved.
   */
  readonly onSetAngle: (newAngleDeg: number) => void;
}

/**
 * Parse a raw text input into a numeric angle. Strips a trailing °,
 * trims whitespace, accepts integers and decimals. Returns null on
 * non-finite or out-of-range values so the caller can flash red and
 * revert.
 */
export function parseAngleInput(raw: string): number | null {
  const cleaned = raw.trim().replace(/°$/, "").trim();
  if (cleaned === "") return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < ANGLE_LABEL_MIN_DEG || parsed > ANGLE_LABEL_MAX_DEG) {
    return null;
  }
  return parsed;
}

/** Colour-band classes for the default (non-editing) state. */
const BAND_CLASSES: Record<AngleLabelColour, { default: string; hover: string }> = {
  blue: {
    default: "border-canvas-selection/70 bg-stone-900/85 text-canvas-selection",
    hover: "border-canvas-selection bg-cinnabar-700 text-white",
  },
  amber: {
    default: "border-amber-300 bg-stone-900/85 text-amber-200",
    hover: "border-amber-200 bg-cinnabar-700 text-white",
  },
  white: {
    default: "border-stone-700 bg-stone-900/85 text-stone-50",
    hover: "border-stone-400 bg-cinnabar-700 text-white",
  },
};

export function AngleLabel(props: AngleLabelProps) {
  const { angleDeg, screenX, screenY, colour, onSetAngle } = props;

  const [editing, setEditing] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [draft, setDraft] = useState<string>(formatAngleInputValue(angleDeg));
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Sync draft when the underlying angle changes from outside (e.g.
  // another vertex was moved, recomputing this corner). Skip while the
  // operator is mid-edit so we don't clobber their typing.
  useEffect(() => {
    if (editing) return;
    setDraft(formatAngleInputValue(angleDeg));
  }, [angleDeg, editing]);

  // Auto-select on focus.
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Invalid-flash timer.
  useEffect(() => {
    if (!invalid) return;
    const t = window.setTimeout(() => setInvalid(false), INVALID_FLASH_MS);
    return () => window.clearTimeout(t);
  }, [invalid]);

  const commit = useCallback(() => {
    const parsed = parseAngleInput(draft);
    if (parsed === null) {
      setInvalid(true);
      setDraft(formatAngleInputValue(angleDeg));
      setEditing(false);
      return;
    }
    // No-op when the new value matches (to one decimal place) the
    // current value — avoids a wasted snapshot in the undo stack.
    const rounded = Math.round(parsed * 10) / 10;
    const currentRounded = Math.round(angleDeg * 10) / 10;
    if (rounded === currentRounded) {
      setEditing(false);
      return;
    }
    onSetAngle(parsed);
    setEditing(false);
  }, [draft, angleDeg, onSetAngle]);

  const cancel = useCallback(() => {
    setDraft(formatAngleInputValue(angleDeg));
    setEditing(false);
  }, [angleDeg]);

  // Click-outside while editing commits the value.
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
    const widthCh = Math.min(
      INPUT_MAX_WIDTH_PX,
      Math.max(INPUT_MIN_WIDTH_PX, draft.length * 10 + 24),
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
          inputMode="decimal"
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
          aria-label="Interior angle in degrees"
          className={`h-6 rounded border-2 bg-cinnabar-900 px-1.5 font-mono text-[11px] leading-none text-white shadow-md focus:outline-none ${
            invalid ? "border-red-500" : "border-cinnabar-500"
          }`}
          style={{ width: `${widthCh}px` }}
        />
        <span className="select-none font-mono text-[10px] text-stone-300">
          °
        </span>
      </div>
    );
  }

  const bandClasses = BAND_CLASSES[colour];
  const stateClass = invalid
    ? "border-red-500 bg-stone-900/95 text-red-300"
    : hovered
      ? bandClasses.hover
      : bandClasses.default;

  return (
    <button
      type="button"
      title="Click to edit interior angle"
      aria-label={`Interior angle: ${formatAngleDisplay(angleDeg)}. Click to edit.`}
      onClick={() => setEditing(true)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-text rounded border px-1.5 py-[2px] font-mono text-[11px] leading-none shadow-sm transition-colors ${stateClass}`}
      style={{ left: `${screenX}px`, top: `${screenY}px` }}
    >
      {formatAngleDisplay(angleDeg)}
    </button>
  );
}
