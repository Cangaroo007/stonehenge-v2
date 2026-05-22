"use client";

// apps/web/src/components/canvas/EdgeLine.tsx
//
// One Konva Line (or Path, when curved) per edge.
//
// Round 4 — visual refresh (brief §2):
//   - Default:   1.5 px stroke at 70 % opacity, profile colour
//   - Hover:     2 px stroke at 100 % opacity, profile-coloured glow
//   - Selected:  2.5 px stroke at 100 % opacity, cinnabar glow
//   - Wall edges (exposure === wall): dashed (4, 3) pattern
//   - Concealed (exposure === concealed): dotted (1, 3) pattern
//   - Joined (exposure === join): finer dotted (2, 3) pattern
//
// Stroke widths and dash spacings are issued in mm * mmPerPx so they
// render at constant screen size regardless of zoom.
//
// Hover-state is reported up via `onHover` so the parent can render
// the edge tooltip (profile name + length + rate) and brighten the
// edge midpoint annotation.

import { useEffect, useRef, useState } from "react";
import Konva from "konva";
import { Line, Path } from "react-konva";

import type { Edge, EdgeId, Vertex } from "@stonehenge-proto/geometry";

import { PROFILE_COLOURS } from "../../lib/colour-map";

// Round 4 dash overrides (the EXPOSURE_DASH table still works for
// EdgeProfilePanel previews; here we want finer dashes to read at
// 1.5 px stroke).
const ROUND4_DASH: Readonly<
  Record<Edge["exposure"], readonly number[]>
> = {
  exposed: [],
  wall: [4, 3],
  join: [2, 3],
  concealed: [1, 3],
};

export interface EdgeLineProps {
  readonly edge: Edge;
  readonly start: Vertex;
  readonly end: Vertex;
  readonly selected: boolean;
  readonly mmPerPx: number;
  readonly onSelect: () => void;
  /** Round-3A: round-end edges (edges whose curve is a half-circle) get a
   * distinct stroke style when set. */
  readonly onDoubleClick?: () => void;
  /**
   * Round 4 — fires on hover-in and hover-out so the parent can render
   * the edge tooltip. `null` means the hover ended.
   */
  readonly onHover?: (edgeId: EdgeId | null) => void;
  /**
   * Round 6 (Fix 2) — when the canvas is in edge-selection mode for the
   * AddPiecePanel, the edge renders with a state-aware style:
   *   - "off"     normal rendering
   *   - "valid"   eligible for attach; cinnabar glow on hover
   *   - "invalid" not eligible; dimmed to 50 %
   *   - "picked"  already selected for attach; solid cinnabar
   */
  readonly attachSelectionState?: "off" | "valid" | "invalid" | "picked";
}

export function EdgeLine(props: EdgeLineProps) {
  const {
    edge,
    start,
    end,
    selected,
    mmPerPx,
    onSelect,
    onDoubleClick,
    onHover,
    attachSelectionState = "off",
  } = props;
  const [hovered, setHovered] = useState(false);

  // Round 7A (FIX 4): pulse animation on valid attach edges. A Konva
  // Tween drives shadowOpacity between 0.25 and 0.65 over 2 s, looping
  // until the attach-selection state leaves "valid". Picked / invalid
  // / off states stop the tween. Native easing, no manual RAF.
  const nodeRef = useRef<Konva.Line | Konva.Path | null>(null);
  const tweenRef = useRef<Konva.Tween | null>(null);
  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    // Clear any prior tween so we don't stack animations.
    if (tweenRef.current) {
      tweenRef.current.destroy();
      tweenRef.current = null;
    }
    if (attachSelectionState !== "valid" || hovered) {
      // Not in the pulse state — let the static shadowOpacity (set
      // below) drive appearance.
      return;
    }
    let alive = true;
    // Inner closure captures the already-narrowed (non-null) `node`.
    // Using a const-arrow rather than `function` so TypeScript carries
    // the narrowing into the closure.
    const loop = (target: 0.65 | 0.25): void => {
      if (!alive) return;
      const tween = new Konva.Tween({
        node,
        duration: 1, // half a 2 s cycle
        shadowOpacity: target,
        easing: Konva.Easings.EaseInOut,
        onFinish: () => {
          if (!alive) return;
          loop(target === 0.65 ? 0.25 : 0.65);
        },
      });
      tweenRef.current = tween;
      tween.play();
    };
    loop(0.65);
    return () => {
      alive = false;
      if (tweenRef.current) {
        tweenRef.current.destroy();
        tweenRef.current = null;
      }
    };
  }, [attachSelectionState, hovered]);
  const colour =
    attachSelectionState === "picked"
      ? "#D63F1A"
      : attachSelectionState === "invalid"
        ? "#75746B"
        : PROFILE_COLOURS[edge.profile];
  const dashPattern = ROUND4_DASH[edge.exposure];

  let strokePx = 1.5;
  let opacity = 0.7;
  let shadowBlurPx = 0;
  let shadowOpacity = 0;
  let shadowColour = colour;
  if (selected || attachSelectionState === "picked") {
    strokePx = 2.5;
    opacity = 1;
    shadowBlurPx = 4;
    shadowOpacity = 0.5;
    shadowColour = "#D63F1A";
  } else if (attachSelectionState === "valid" && hovered) {
    strokePx = 2.5;
    opacity = 1;
    shadowBlurPx = 6;
    shadowOpacity = 0.6;
    shadowColour = "#D63F1A";
  } else if (attachSelectionState === "valid") {
    strokePx = 2;
    opacity = 0.95;
    shadowBlurPx = 2;
    shadowOpacity = 0.35;
    shadowColour = "#D63F1A";
  } else if (attachSelectionState === "invalid") {
    opacity = 0.4;
  } else if (hovered) {
    strokePx = 2;
    opacity = 1;
    shadowBlurPx = 2;
    shadowOpacity = 0.35;
  }

  const strokeMm = strokePx * mmPerPx;
  const dashMm =
    dashPattern.length > 0 ? dashPattern.map((d) => d * mmPerPx) : undefined;
  const shadowBlurMm = shadowBlurPx * mmPerPx;

  const sharedHandlers = {
    onClick: onSelect,
    onTap: onSelect,
    onMouseEnter: () => {
      setHovered(true);
      onHover?.(edge.id);
    },
    onMouseLeave: () => {
      setHovered(false);
      onHover?.(null);
    },
    ...(onDoubleClick
      ? { onDblClick: onDoubleClick, onDblTap: onDoubleClick }
      : {}),
  };

  // Curved edge — render as an SVG path. Sweep flag based on bulge:
  // SVG sweep-flag 1 = clockwise; "right" bulge maps to 1 for our axis
  // convention (Konva Y grows downward, like SVG).
  if (edge.curve) {
    const sweepFlag = edge.curve.bulge === "right" ? 1 : 0;
    const r = edge.curve.radiusMm;
    const data =
      `M ${start.x} ${start.y} ` +
      `A ${r} ${r} 0 0 ${sweepFlag} ${end.x} ${end.y}`;
    return (
      <Path
        ref={(n) => {
          nodeRef.current = n;
        }}
        data={data}
        stroke={colour}
        strokeWidth={strokeMm}
        opacity={opacity}
        {...(dashMm !== undefined ? { dash: dashMm } : {})}
        lineCap="round"
        hitStrokeWidth={Math.max(strokeMm * 4, 16 * mmPerPx)}
        shadowColor={shadowColour}
        shadowBlur={shadowBlurMm}
        shadowOpacity={shadowOpacity}
        {...sharedHandlers}
      />
    );
  }

  return (
    <Line
      ref={(n) => {
        nodeRef.current = n;
      }}
      points={[start.x, start.y, end.x, end.y]}
      stroke={colour}
      strokeWidth={strokeMm}
      opacity={opacity}
      {...(dashMm !== undefined ? { dash: dashMm } : {})}
      lineCap="round"
      hitStrokeWidth={Math.max(strokeMm * 4, 16 * mmPerPx)}
      shadowColor={shadowColour}
      shadowBlur={shadowBlurMm}
      shadowOpacity={shadowOpacity}
      {...sharedHandlers}
    />
  );
}
