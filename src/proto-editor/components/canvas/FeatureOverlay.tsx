"use client";

// apps/web/src/components/canvas/FeatureOverlay.tsx
//
// Per-feature canvas rendering. Each feature kind has its own visual
// vocabulary so the operator can distinguish a sink from a cooktop at
// a glance:
//
//   undermount-sink  dashed outer + solid inner bowl + drain dot, blue
//   overmount-sink   solid rect, blue
//   cooktop-cutout   dashed rect + 4 burner circles, amber
//   tap-hole         circle + inner dot, cinnabar
//   window-recess    hatched rect, grey
//   custom-cutout    dashed polygon, pink
//
// All labels render in IBM Plex Mono and centre on the feature's bbox.
// Dimensions sit one line below the label.
//
// Round 1 — feature interaction overhaul:
//   - Group is centre-anchored (`x = feature.position.x`, children offset
//     by ±half-bbox). This makes drag-to-reposition trivial — Konva
//     reports the feature's centre directly — and prepares for rotation
//     against non-axis-aligned reference edges (deferred to a future round).
//   - Group accepts `draggable`, `dragBoundFunc`, `onDragStart/Move/End`
//     props supplied by `PolygonCanvas`. The parent owns the snap math
//     (UNCERTAIN-6 [A]); this component stays presentational.
//   - When selected, axis-aligned features render four corner resize
//     handles; tap-hole gets a single radial handle (§4.3); window-recess
//     gets two handles — width along the edge and intrusion into the
//     bench (§4.4); custom-cutout has no resize this round (UNCERTAIN-7
//     [A]).
//   - During an invalid drag (no snap target within 300 mm), the parent
//     sets `dragInvalid` and the feature renders with a red tint to signal
//     "release here = rubber-band back".
//
// For Round 1 features remain axis-aligned — `rotationDeg` is computed in
// `feature-placement.ts` but not yet applied to the Group. Most edges in
// the test pieces (rectangle, L, U) are axis-aligned, so the visual is
// correct in the common case.

import { useRef, useState, type RefObject } from "react";
import { Decimal } from "decimal.js";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { SceneContext } from "konva/lib/Context";
import { Circle, Group, Line, Rect, Text } from "react-konva";

import type {
  EdgeId,
  Feature,
  FeatureId,
  Piece,
  VertexId,
} from "@stonehenge-proto/geometry";
import type { FeatureRate } from "@stonehenge-proto/pricing";

import featuresCatalogue from "../../data/features.json";
import { PROFILE_COLOURS } from "../../lib/colour-map";
import { formatAud } from "../../lib/format-aud";
import type { FixtureMetadata } from "../../types/editor";

const FEATURES = featuresCatalogue as readonly FeatureRate[];
const PRICE_BY_KIND: ReadonlyMap<Feature["kind"], string> = new Map(
  FEATURES.map((f) => [f.featureKind, f.flatRate]),
);

const STROKE: Record<Feature["kind"], string> = {
  "undermount-sink": "#4A90D9",
  "overmount-sink": "#4A90D9",
  "cooktop-cutout": "#EF9F27",
  "tap-hole": "#D63F1A",
  "window-recess": "#95A5A6",
  "custom-cutout": "#D4537E",
};

// Round 4 — lower-opacity fills. The polygon's geometry, not the
// feature's fill, is the primary visual; features sit on top as
// secondary cues. Brief §5: 5..8 % fill opacity per kind.
const FILL: Record<Feature["kind"], string> = {
  "undermount-sink": "rgba(74, 144, 217, 0.08)",
  "overmount-sink": "rgba(74, 144, 217, 0.06)",
  "cooktop-cutout": "rgba(239, 159, 39, 0.07)",
  "tap-hole": "rgba(214, 63, 26, 0.10)",
  "window-recess": "rgba(149, 165, 166, 0.12)",
  "custom-cutout": "rgba(212, 83, 126, 0.08)",
};

// Round 4 — feature stroke widths in px (multiplied by mmPerPx at use site).
// Default 1, selected 2. Down from 2/3 in Round 3A.
const STROKE_DEFAULT_PX = 1;
const STROKE_SELECTED_PX = 2;

const LABEL: Record<Feature["kind"], string> = {
  "undermount-sink": "UNDERMOUNT SINK",
  "overmount-sink": "OVERMOUNT SINK",
  "cooktop-cutout": "COOKTOP",
  "tap-hole": "TAP",
  "window-recess": "WINDOW RECESS",
  "custom-cutout": "CUSTOM",
};

const INVALID_TINT = "#D63F1A"; // cinnabar — used when drag has no snap

export interface FeatureDragHandlers {
  /** Whether the feature group accepts mouse-driven drag. */
  readonly draggable: boolean;
  /** Konva drag-bound function — used by parent for snap-to-edge. */
  readonly dragBoundFunc?: (pos: { x: number; y: number }) => {
    x: number;
    y: number;
  };
  readonly onDragStart?: (featureId: FeatureId) => void;
  /** Fires per drag frame. Position is the feature's centre in piece-local mm. */
  readonly onDragMove?: (
    featureId: FeatureId,
    centreMmX: number,
    centreMmY: number,
  ) => void;
  readonly onDragEnd?: (
    featureId: FeatureId,
    centreMmX: number,
    centreMmY: number,
  ) => void;
  /**
   * Drag-time visual flag. When true, the feature renders with a red tint
   * to signal "release here = rubber-band back" (no valid snap within the
   * drag threshold).
   */
  readonly dragInvalid?: boolean;
}

export interface FeatureResizeHandlers {
  /** Fires while a resize handle is being dragged. */
  readonly onResize: (
    featureId: FeatureId,
    widthMm: number,
    depthMm: number,
  ) => void;
  /**
   * Round 5 (A3) — fires when Shift is held during a window-recess width
   * drag. Carries the new dimensions plus the along-edge centre shift so
   * the parent can update placement.offsetAlongEdgeMm atomically.
   */
  readonly onResizeAsymmetric?: (
    featureId: FeatureId,
    widthMm: number,
    depthMm: number,
    alongShiftMm: number,
  ) => void;
}

/**
 * Round 7A (FIX 2): a polygon-clip context handed down to each feature
 * variant. Captures the parent piece's outer ring as world-coord points
 * plus the feature's centre (so the variant can convert to local coords).
 * Each feature's *visual* render is wrapped in a `<Group clipFunc=...>`
 * built from `clipToPolygonLocal`, ensuring nothing draws outside the
 * polygon boundary. Resize handles, delete buttons, and confidence
 * badges render OUTSIDE the clip so the operator can still grab them
 * (per Gate-0 UNCERTAIN-7A-1 [A]).
 */
export interface PolygonClipContext {
  readonly outerRingPointsMm: ReadonlyArray<{ readonly x: number; readonly y: number }>;
}

/**
 * Round 9 (Issue 2) — Live-binding clipFunc.
 *
 * Reads the outer Group's position from a ref on every draw frame so
 * the polygon clip stays anchored to world coords during drag (the
 * previous static version captured `feature.position` once and let the
 * clip "follow" the drag, defeating the boundary mid-drag).
 *
 * Round 9 (Issue 3) — Rotation-aware. The outer Group rotates by
 * `rotationDeg` to align the feature with its reference edge. The clip
 * path is rendered in the rotated frame, so we apply the inverse
 * rotation to keep the polygon anchored to world coords.
 *
 * Math: a world point P maps to local L via
 *   L = R(-θ) * (P - G)
 * where G is the live Group position and θ is the rotation. Both are
 * read at clipFunc invocation time (each draw frame). The fallback
 * (centreX/centreY) is used on the first draw before the ref attaches.
 */
function makeClipFunc(
  polygonClip: PolygonClipContext,
  groupRef: RefObject<Konva.Group | null>,
  rotationDeg: number,
  fallbackX: number,
  fallbackY: number,
): (sceneCtx: SceneContext) => void {
  const theta = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return (sceneCtx) => {
    const node = groupRef.current;
    const dx = node ? node.x() : fallbackX;
    const dy = node ? node.y() : fallbackY;
    const pts = polygonClip.outerRingPointsMm;
    if (pts.length < 3) return;
    sceneCtx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      const dpx = p.x - dx;
      const dpy = p.y - dy;
      // Inverse-rotate: (lx, ly) = R(-θ) · (dpx, dpy).
      const lx = dpx * cos + dpy * sin;
      const ly = -dpx * sin + dpy * cos;
      if (i === 0) sceneCtx.moveTo(lx, ly);
      else sceneCtx.lineTo(lx, ly);
    }
    sceneCtx.closePath();
  };
}

export interface FeatureOverlayProps {
  readonly feature: Feature;
  readonly selected: boolean;
  readonly mmPerPx: number;
  readonly onSelect: (id: FeatureId) => void;
  /**
   * Optional. When set, a small "×" button appears in the top-right of the
   * selected feature.
   */
  readonly onDelete?: (id: FeatureId) => void;
  /** Optional 0..1 confidence score sourced from AI extraction. */
  readonly confidence?: number;
  /**
   * Round 2 — fixture catalogue. When the feature was placed via the
   * picker, this carries the brand + model and the on-canvas label shows
   * `BRAND MODEL` instead of the generic kind label.
   */
  readonly fixture?: FixtureMetadata;
  readonly drag?: FeatureDragHandlers;
  readonly resize?: FeatureResizeHandlers;
  /**
   * Round 5 — fires on hover-in and hover-out so the parent can render
   * the feature tooltip (product name + dimensions + price). `null` means
   * the hover ended.
   */
  readonly onHover?: (featureId: FeatureId | null) => void;
  /**
   * Round 7A (FIX 2): the polygon-clip context for this feature. When
   * present, the feature's *visual* render is clipped to the polygon's
   * outer ring so nothing draws past the boundary. Resize handles and
   * delete buttons render outside the clip. Pass via PolygonCanvas.
   */
  readonly polygonClip?: PolygonClipContext;
  /**
   * Round 9 (Issue 3) — Rotation in degrees, aligning the feature's
   * local frame with its reference edge tangent. The outer Group
   * rotates by this amount so visuals + resize handles + dimension
   * label all sit in the rotated frame. When omitted (or 0) the feature
   * renders axis-aligned, matching pre-Round-9 behaviour.
   */
  readonly rotationDeg?: number;
}

/**
 * Compute the on-canvas label. Falls back to the generic kind label when
 * no fixture metadata is set or it lacks brand/model (e.g. a feature
 * placed before Round 2 catalogue support, or a "Custom dimensions"
 * placement).
 */
function labelForFeature(
  feature: Feature,
  fixture: FixtureMetadata | undefined,
): string {
  if (fixture?.brand && fixture.model) {
    return `${fixture.brand} ${fixture.model}`.toUpperCase();
  }
  return LABEL[feature.kind];
}

export function FeatureOverlay(props: FeatureOverlayProps) {
  const {
    feature,
    selected,
    mmPerPx,
    onSelect,
    onDelete,
    confidence,
    fixture,
    drag,
    resize,
    onHover,
    polygonClip,
    rotationDeg = 0,
  } = props;
  // Round 8A (FIX 1.3): the dashed-outline colour for sinks and cooktops
  // is derived from the fixture's cutout edge profile when one is set —
  // a non-raw profile means the operator (or the round-8A default for
  // undermount sinks) has selected a finished cutout edge, and the
  // colour from `PROFILE_COLOURS` makes that visible at a glance.
  //
  // "raw" or absent falls through to the per-kind stroke (Round 4
  // behaviour). The undermount-sink default of pencil-round resolves to
  // the same blue (#4A90D9) the kind already uses, so no visual delta in
  // the default case — but bullnose / full-bullnose etc. shift the
  // dashed outline to the profile's colour as expected.
  const cutoutProfile = fixture?.cutoutEdgeProfile;
  const profileStroke =
    cutoutProfile && cutoutProfile !== "raw"
      ? PROFILE_COLOURS[cutoutProfile]
      : STROKE[feature.kind];
  const stroke = drag?.dragInvalid ? INVALID_TINT : profileStroke;
  const fill = FILL[feature.kind];
  const label = labelForFeature(feature, fixture);
  const strokeWidthMm =
    (selected ? STROKE_SELECTED_PX : STROKE_DEFAULT_PX) * mmPerPx;
  const labelFontMm = 10 * mmPerPx;
  const dimsFontMm = 9 * mmPerPx;
  const priceFontMm = 10 * mmPerPx;

  const flatRate = PRICE_BY_KIND.get(feature.kind);
  const priceText = flatRate ? formatAud(new Decimal(flatRate)) : "";

  const groupHandlers = buildGroupHandlers(feature.id, drag, onHover);

  // Round 9 (Issue 2 + Issue 3): each variant constructs its own
  // live-binding clipFunc using its own group ref. We pass the raw
  // polygonClip context + rotationDeg + centre fallback down to each
  // variant; the variant creates the ref and the clipFunc inline. This
  // lets the clip path read the LIVE Group position (so the clip stays
  // anchored to world coords during drag) and inverse-rotate the path
  // (so the clip stays anchored even after rotation).

  switch (feature.kind) {
    case "undermount-sink":
      return (
        <BoxFeature
          centreX={feature.position.x}
          centreY={feature.position.y}
          w={feature.bowlWidthMm}
          d={feature.bowlDepthMm}
          stroke={stroke}
          fill={fill}
          dashed
          innerBowl
          showDrain
          label={label}
          dimensionsLabel={`${Math.round(feature.bowlWidthMm)} × ${Math.round(feature.bowlDepthMm)}`}
          priceText={priceText}
          selected={selected}
          mmPerPx={mmPerPx}
          labelFontMm={labelFontMm}
          dimsFontMm={dimsFontMm}
          priceFontMm={priceFontMm}
          strokeWidthMm={strokeWidthMm}
          rotationDeg={rotationDeg}
          {...(polygonClip !== undefined ? { polygonClip } : {})}
          {...(confidence !== undefined ? { confidence } : {})}
          {...(groupHandlers !== undefined ? { groupHandlers } : {})}
          onSelect={() => onSelect(feature.id)}
          {...(onDelete !== undefined
            ? { onDelete: () => onDelete(feature.id) }
            : {})}
          {...(resize !== undefined && selected
            ? {
                onResize: (w: number, d: number) =>
                  resize.onResize(feature.id, w, d),
              }
            : {})}
        />
      );

    case "overmount-sink":
      return (
        <BoxFeature
          centreX={feature.position.x}
          centreY={feature.position.y}
          w={feature.cutoutWidthMm}
          d={feature.cutoutDepthMm}
          stroke={stroke}
          fill={fill}
          dashed={false}
          innerBowl={false}
          showDrain
          label={label}
          dimensionsLabel={`${Math.round(feature.cutoutWidthMm)} × ${Math.round(feature.cutoutDepthMm)}`}
          priceText={priceText}
          selected={selected}
          mmPerPx={mmPerPx}
          labelFontMm={labelFontMm}
          dimsFontMm={dimsFontMm}
          priceFontMm={priceFontMm}
          strokeWidthMm={strokeWidthMm}
          rotationDeg={rotationDeg}
          {...(polygonClip !== undefined ? { polygonClip } : {})}
          {...(confidence !== undefined ? { confidence } : {})}
          {...(groupHandlers !== undefined ? { groupHandlers } : {})}
          onSelect={() => onSelect(feature.id)}
          {...(onDelete !== undefined
            ? { onDelete: () => onDelete(feature.id) }
            : {})}
          {...(resize !== undefined && selected
            ? {
                onResize: (w: number, d: number) =>
                  resize.onResize(feature.id, w, d),
              }
            : {})}
        />
      );

    case "cooktop-cutout":
      return (
        <CooktopFeature
          centreX={feature.position.x}
          centreY={feature.position.y}
          w={feature.cutoutWidthMm}
          d={feature.cutoutDepthMm}
          stroke={stroke}
          fill={fill}
          label={label}
          dimensionsLabel={`${Math.round(feature.cutoutWidthMm)} × ${Math.round(feature.cutoutDepthMm)}`}
          priceText={priceText}
          selected={selected}
          mmPerPx={mmPerPx}
          labelFontMm={labelFontMm}
          dimsFontMm={dimsFontMm}
          priceFontMm={priceFontMm}
          strokeWidthMm={strokeWidthMm}
          cornerRadiusMm={feature.cornerRadiusMm}
          rotationDeg={rotationDeg}
          {...(polygonClip !== undefined ? { polygonClip } : {})}
          {...(confidence !== undefined ? { confidence } : {})}
          {...(groupHandlers !== undefined ? { groupHandlers } : {})}
          onSelect={() => onSelect(feature.id)}
          {...(onDelete !== undefined
            ? { onDelete: () => onDelete(feature.id) }
            : {})}
          {...(resize !== undefined && selected
            ? {
                onResize: (w: number, d: number) =>
                  resize.onResize(feature.id, w, d),
              }
            : {})}
        />
      );

    case "tap-hole":
      return (
        <TapFeature
          centreX={feature.position.x}
          centreY={feature.position.y}
          diameterMm={feature.diameterMm}
          stroke={stroke}
          fill={fill}
          label={label}
          priceText={priceText}
          selected={selected}
          mmPerPx={mmPerPx}
          labelFontMm={labelFontMm}
          priceFontMm={priceFontMm}
          strokeWidthMm={strokeWidthMm}
          rotationDeg={rotationDeg}
          {...(polygonClip !== undefined ? { polygonClip } : {})}
          {...(confidence !== undefined ? { confidence } : {})}
          {...(groupHandlers !== undefined ? { groupHandlers } : {})}
          onSelect={() => onSelect(feature.id)}
          {...(onDelete !== undefined
            ? { onDelete: () => onDelete(feature.id) }
            : {})}
          {...(resize !== undefined && selected
            ? {
                onResize: (diameterMm: number) =>
                  resize.onResize(feature.id, diameterMm, diameterMm),
              }
            : {})}
        />
      );

    case "window-recess":
      return (
        <WindowFeature
          centreX={feature.position.x}
          centreY={feature.position.y}
          widthMm={feature.widthMm}
          intrusionMm={Math.max(feature.intrusionMm, 50)}
          stroke={stroke}
          fill={fill}
          label={label}
          dimensionsLabel={`${Math.round(feature.widthMm)} × ${Math.round(feature.intrusionMm)}`}
          priceText={priceText}
          selected={selected}
          mmPerPx={mmPerPx}
          labelFontMm={labelFontMm}
          dimsFontMm={dimsFontMm}
          priceFontMm={priceFontMm}
          strokeWidthMm={strokeWidthMm}
          rotationDeg={rotationDeg}
          {...(polygonClip !== undefined ? { polygonClip } : {})}
          {...(confidence !== undefined ? { confidence } : {})}
          {...(groupHandlers !== undefined ? { groupHandlers } : {})}
          onSelect={() => onSelect(feature.id)}
          {...(onDelete !== undefined
            ? { onDelete: () => onDelete(feature.id) }
            : {})}
          {...(resize !== undefined && selected
            ? {
                onResize: (w: number, d: number) =>
                  resize.onResize(feature.id, w, d),
                ...(resize.onResizeAsymmetric !== undefined
                  ? {
                      onResizeAsymmetric: (
                        w: number,
                        d: number,
                        alongShiftMm: number,
                      ) =>
                        resize.onResizeAsymmetric?.(
                          feature.id,
                          w,
                          d,
                          alongShiftMm,
                        ),
                    }
                  : {}),
              }
            : {})}
        />
      );

    case "custom-cutout":
      return (
        <CustomFeature
          centreX={feature.position.x}
          centreY={feature.position.y}
          outline={feature.outline}
          stroke={stroke}
          fill={fill}
          label={label}
          priceText={priceText}
          selected={selected}
          mmPerPx={mmPerPx}
          labelFontMm={labelFontMm}
          priceFontMm={priceFontMm}
          strokeWidthMm={strokeWidthMm}
          rotationDeg={0}
          {...(polygonClip !== undefined ? { polygonClip } : {})}
          {...(confidence !== undefined ? { confidence } : {})}
          {...(groupHandlers !== undefined ? { groupHandlers } : {})}
          onSelect={() => onSelect(feature.id)}
          {...(onDelete !== undefined
            ? { onDelete: () => onDelete(feature.id) }
            : {})}
        />
      );

    default: {
      const _exhaustive: never = feature;
      return _exhaustive;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Group handler shim — translates Konva drag events into FeatureId-typed
// callbacks. Centre coords are read directly from `e.target.x()`/`y()`
// since the Group is centre-anchored.
// ─────────────────────────────────────────────────────────────────────────

interface GroupHandlers {
  readonly draggable: boolean;
  readonly dragBoundFunc?: (pos: { x: number; y: number }) => {
    x: number;
    y: number;
  };
  readonly onDragStart?: (e: KonvaEventObject<DragEvent>) => void;
  readonly onDragMove?: (e: KonvaEventObject<DragEvent>) => void;
  readonly onDragEnd?: (e: KonvaEventObject<DragEvent>) => void;
  readonly onMouseEnter?: () => void;
  readonly onMouseLeave?: () => void;
}

function buildGroupHandlers(
  featureId: FeatureId,
  drag: FeatureDragHandlers | undefined,
  onHover: ((featureId: FeatureId | null) => void) | undefined,
): GroupHandlers | undefined {
  if (!drag && !onHover) return undefined;
  const handlers: GroupHandlers = {
    draggable: drag?.draggable ?? false,
    ...(drag?.dragBoundFunc !== undefined
      ? { dragBoundFunc: drag.dragBoundFunc }
      : {}),
    ...(drag?.onDragStart !== undefined
      ? { onDragStart: () => drag.onDragStart?.(featureId) }
      : {}),
    ...(drag?.onDragMove !== undefined
      ? {
          onDragMove: (e: KonvaEventObject<DragEvent>) => {
            drag.onDragMove?.(featureId, e.target.x(), e.target.y());
          },
        }
      : {}),
    ...(drag?.onDragEnd !== undefined
      ? {
          onDragEnd: (e: KonvaEventObject<DragEvent>) => {
            drag.onDragEnd?.(featureId, e.target.x(), e.target.y());
          },
        }
      : {}),
    ...(onHover !== undefined
      ? {
          onMouseEnter: () => onHover(featureId),
          onMouseLeave: () => onHover(null),
        }
      : {}),
  };
  return handlers;
}

// ─────────────────────────────────────────────────────────────────────────
// Shared types for the per-variant components
// ─────────────────────────────────────────────────────────────────────────

// Round 9 (Issue 2 + 3): the old `ClipFunc` type alias was retired —
// each variant now constructs its own live-binding clipFunc via
// `makeClipFunc(polygonClip, groupRef, rotationDeg, …)` so the clip
// path follows the Group during drag AND inverse-rotates so the
// polygon stays anchored to world coords after rotation.

// ─────────────────────────────────────────────────────────────────────────
// BoxFeature — sinks
// ─────────────────────────────────────────────────────────────────────────

interface BoxFeatureProps {
  readonly centreX: number;
  readonly centreY: number;
  readonly w: number;
  readonly d: number;
  readonly stroke: string;
  readonly fill: string;
  readonly dashed: boolean;
  readonly innerBowl: boolean;
  readonly showDrain: boolean;
  readonly label: string;
  readonly dimensionsLabel: string;
  readonly priceText: string;
  readonly selected: boolean;
  readonly mmPerPx: number;
  readonly labelFontMm: number;
  readonly dimsFontMm: number;
  readonly priceFontMm: number;
  readonly strokeWidthMm: number;
  readonly rotationDeg: number;
  readonly polygonClip?: PolygonClipContext;
  readonly confidence?: number;
  readonly groupHandlers?: GroupHandlers;
  readonly onSelect: () => void;
  readonly onDelete?: () => void;
  readonly onResize?: (w: number, d: number) => void;
}

function BoxFeature(props: BoxFeatureProps) {
  const {
    centreX,
    centreY,
    w,
    d,
    stroke,
    fill,
    dashed,
    innerBowl,
    showDrain,
    label,
    dimensionsLabel,
    priceText,
    selected,
    mmPerPx,
    labelFontMm,
    dimsFontMm,
    priceFontMm,
    strokeWidthMm,
    rotationDeg,
    polygonClip,
    confidence,
    groupHandlers,
    onSelect,
    onDelete,
    onResize,
  } = props;
  // Round 9 — ref to the outer Group so the clipFunc can read its
  // live position during drag. Each variant has its own ref.
  const groupRef = useRef<Konva.Group | null>(null);
  const clipFunc = polygonClip
    ? makeClipFunc(polygonClip, groupRef, rotationDeg, centreX, centreY)
    : undefined;

  const dashMm = dashed ? [10 * mmPerPx, 5 * mmPerPx] : undefined;
  const halfW = w / 2;
  const halfD = d / 2;

  // Round 7A (FIX 2): visual elements clipped to the polygon; handles +
  // delete button + confidence badge sit OUTSIDE the clip so they stay
  // grabbable when the feature is pushed up against the polygon edge.
  const visuals = (
    <>
      <Rect
        x={-halfW}
        y={-halfD}
        width={w}
        height={d}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidthMm}
        {...(dashMm !== undefined ? { dash: dashMm } : {})}
        cornerRadius={Math.min(w, d) * 0.04}
        {...(selected
          ? {
              shadowColor: stroke,
              shadowBlur: 8 * mmPerPx,
              shadowOpacity: 0.6,
            }
          : {})}
      />

      {innerBowl && (
        <Rect
          x={-halfW + w * 0.06}
          y={-halfD + d * 0.06}
          width={w * 0.88}
          height={d * 0.88}
          stroke={stroke}
          strokeWidth={strokeWidthMm * 0.7}
          fill="transparent"
          cornerRadius={Math.min(w, d) * 0.08}
        />
      )}

      {showDrain && (
        <Circle
          x={0}
          y={0}
          radius={2 * mmPerPx}
          fill={stroke}
          opacity={0.4}
          listening={false}
        />
      )}

      <CentredLabel
        boxWidth={w}
        boxHeight={d}
        label={label}
        dimensionsLabel={dimensionsLabel}
        priceText={priceText}
        selected={selected}
        labelFontMm={labelFontMm}
        dimsFontMm={dimsFontMm}
        priceFontMm={priceFontMm}
      />
    </>
  );

  return (
    <Group
      ref={groupRef}
      x={centreX}
      y={centreY}
      rotation={rotationDeg}
      onClick={onSelect}
      onTap={onSelect}
      {...(groupHandlers ?? {})}
    >
      {clipFunc ? <Group clipFunc={clipFunc}>{visuals}</Group> : visuals}

      {confidence !== undefined && (
        <Group x={-halfW} y={-halfD}>
          <ConfidenceBadge confidence={confidence} mmPerPx={mmPerPx} />
        </Group>
      )}

      {selected && onDelete && (
        <DeleteButton
          x={halfW}
          y={-halfD}
          mmPerPx={mmPerPx}
          onActivate={onDelete}
        />
      )}

      {selected && onResize && (
        <CornerResizeHandles
          halfW={halfW}
          halfD={halfD}
          mmPerPx={mmPerPx}
          minMm={100}
          onResize={onResize}
        />
      )}
    </Group>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// CooktopFeature
// ─────────────────────────────────────────────────────────────────────────

interface CooktopFeatureProps {
  readonly centreX: number;
  readonly centreY: number;
  readonly w: number;
  readonly d: number;
  readonly stroke: string;
  readonly fill: string;
  readonly label: string;
  readonly dimensionsLabel: string;
  readonly priceText: string;
  readonly selected: boolean;
  readonly mmPerPx: number;
  readonly labelFontMm: number;
  readonly dimsFontMm: number;
  readonly priceFontMm: number;
  readonly strokeWidthMm: number;
  readonly cornerRadiusMm: number;
  readonly rotationDeg: number;
  readonly polygonClip?: PolygonClipContext;
  readonly confidence?: number;
  readonly groupHandlers?: GroupHandlers;
  readonly onSelect: () => void;
  readonly onDelete?: () => void;
  readonly onResize?: (w: number, d: number) => void;
}

function CooktopFeature(props: CooktopFeatureProps) {
  const {
    centreX,
    centreY,
    w,
    d,
    stroke,
    fill,
    label,
    dimensionsLabel,
    priceText,
    selected,
    mmPerPx,
    labelFontMm,
    dimsFontMm,
    priceFontMm,
    strokeWidthMm,
    cornerRadiusMm,
    rotationDeg,
    polygonClip,
    confidence,
    groupHandlers,
    onSelect,
    onDelete,
    onResize,
  } = props;
  const groupRef = useRef<Konva.Group | null>(null);
  const clipFunc = polygonClip
    ? makeClipFunc(polygonClip, groupRef, rotationDeg, centreX, centreY)
    : undefined;

  const halfW = w / 2;
  const halfD = d / 2;
  // Round 4 — burners scaled to ~8 px screen radius minimum.
  // Round 6 (Fix 5) — but never larger than the burner cell would allow.
  // Each burner occupies a quadrant centred at (28 %, 30 %) etc.; the
  // burner-to-burner gap is 0.44 × w along x and 0.4 × d along y. We
  // cap the radius at half the smaller of those gaps minus a margin so
  // adjacent burners never overlap AND the rightmost burners never run
  // past the cooktop boundary at extreme zoom (when 8 × mmPerPx blows
  // up to hundreds of mm).
  const maxBurnerRadius = Math.min(w * 0.18, d * 0.18);
  const burnerRadius = Math.min(
    Math.max(8 * mmPerPx, Math.min(w, d) * 0.08),
    maxBurnerRadius,
  );
  const burners = [
    { cx: -halfW + w * 0.28, cy: -halfD + d * 0.3 },
    { cx: -halfW + w * 0.72, cy: -halfD + d * 0.3 },
    { cx: -halfW + w * 0.28, cy: -halfD + d * 0.7 },
    { cx: -halfW + w * 0.72, cy: -halfD + d * 0.7 },
  ];

  // Round 6 (Fix 5) — clip the burner circles to the cooktop's bounding
  // rectangle so they cannot render past the dashed outline at any zoom
  // level. The clip is applied to a dedicated child Group; the cooktop
  // Rect itself (the dashed outline) is rendered outside this clip so
  // its stroke is never cropped.
  function clipToCooktop(ctx: {
    rect: (x: number, y: number, w: number, h: number) => void;
  }): void {
    ctx.rect(-halfW, -halfD, w, d);
  }

  // Round 7A (FIX 2): cooktop visuals (the dashed rectangle + burner
  // circles) clipped to the polygon. The internal `clipToCooktop` clip
  // for burners is preserved so a 600×520 cooktop never paints burner
  // circles past its own dashed border at extreme zoom.
  const visuals = (
    <>
      <Rect
        x={-halfW}
        y={-halfD}
        width={w}
        height={d}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidthMm}
        dash={[10 * mmPerPx, 5 * mmPerPx]}
        cornerRadius={cornerRadiusMm}
        {...(selected
          ? {
              shadowColor: stroke,
              shadowBlur: 8 * mmPerPx,
              shadowOpacity: 0.6,
            }
          : {})}
      />

      <Group clipFunc={clipToCooktop}>
        {burners.map((b, i) => (
          <Circle
            key={i}
            x={b.cx}
            y={b.cy}
            radius={burnerRadius}
            stroke={stroke}
            strokeWidth={0.75 * mmPerPx}
            fill="rgba(239, 159, 39, 0.10)"
            opacity={0.6}
            listening={false}
          />
        ))}
      </Group>

      <CentredLabel
        boxWidth={w}
        boxHeight={d}
        label={label}
        dimensionsLabel={dimensionsLabel}
        priceText={priceText}
        selected={selected}
        labelFontMm={labelFontMm}
        dimsFontMm={dimsFontMm}
        priceFontMm={priceFontMm}
      />
    </>
  );

  return (
    <Group
      ref={groupRef}
      x={centreX}
      y={centreY}
      rotation={rotationDeg}
      onClick={onSelect}
      onTap={onSelect}
      {...(groupHandlers ?? {})}
    >
      {clipFunc ? <Group clipFunc={clipFunc}>{visuals}</Group> : visuals}

      {confidence !== undefined && (
        <Group x={-halfW} y={-halfD}>
          <ConfidenceBadge confidence={confidence} mmPerPx={mmPerPx} />
        </Group>
      )}

      {selected && onDelete && (
        <DeleteButton
          x={halfW}
          y={-halfD}
          mmPerPx={mmPerPx}
          onActivate={onDelete}
        />
      )}

      {selected && onResize && (
        <CornerResizeHandles
          halfW={halfW}
          halfD={halfD}
          mmPerPx={mmPerPx}
          minMm={100}
          onResize={onResize}
        />
      )}
    </Group>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// TapFeature
// ─────────────────────────────────────────────────────────────────────────

interface TapFeatureProps {
  readonly centreX: number;
  readonly centreY: number;
  readonly diameterMm: number;
  readonly stroke: string;
  readonly fill: string;
  readonly label: string;
  readonly priceText: string;
  readonly selected: boolean;
  readonly mmPerPx: number;
  readonly labelFontMm: number;
  readonly priceFontMm: number;
  readonly strokeWidthMm: number;
  readonly rotationDeg: number;
  readonly polygonClip?: PolygonClipContext;
  readonly confidence?: number;
  readonly groupHandlers?: GroupHandlers;
  readonly onSelect: () => void;
  readonly onDelete?: () => void;
  readonly onResize?: (diameterMm: number) => void;
}

function TapFeature(props: TapFeatureProps) {
  const {
    centreX,
    centreY,
    diameterMm,
    stroke,
    fill,
    label,
    priceText,
    selected,
    mmPerPx,
    labelFontMm,
    priceFontMm,
    strokeWidthMm,
    rotationDeg,
    polygonClip,
    confidence,
    groupHandlers,
    onSelect,
    onDelete,
    onResize,
  } = props;
  const groupRef = useRef<Konva.Group | null>(null);
  const clipFunc = polygonClip
    ? makeClipFunc(polygonClip, groupRef, rotationDeg, centreX, centreY)
    : undefined;

  const r = diameterMm / 2;
  const hitR = Math.max(r, 18 * mmPerPx);

  // Round 7A (FIX 2): tap circle + label clipped to polygon; the hit
  // circle (transparent) stays outside the clip so the tap remains
  // grabbable when its centre is close to the polygon edge.
  const visuals = (
    <>
      <Circle
        radius={r}
        stroke={stroke}
        strokeWidth={strokeWidthMm}
        fill={fill}
        {...(selected
          ? {
              shadowColor: stroke,
              shadowBlur: 8 * mmPerPx,
              shadowOpacity: 0.6,
            }
          : {})}
      />
      <Circle radius={3 * mmPerPx} fill={stroke} />

      <Text
        text={label}
        x={-100 * mmPerPx}
        y={r + 4 * mmPerPx}
        width={200 * mmPerPx}
        align="center"
        fontSize={labelFontMm}
        fontFamily="var(--font-mono), monospace"
        fontStyle="500"
        fill="#FAFAF8"
      />

      {selected && (
        <Text
          text={priceText}
          x={-100 * mmPerPx}
          y={r + 4 * mmPerPx + labelFontMm + 2 * mmPerPx}
          width={200 * mmPerPx}
          align="center"
          fontSize={priceFontMm}
          fontFamily="var(--font-mono), monospace"
          fill="#D63F1A"
        />
      )}
    </>
  );

  return (
    <Group
      ref={groupRef}
      x={centreX}
      y={centreY}
      rotation={rotationDeg}
      onClick={onSelect}
      onTap={onSelect}
      {...(groupHandlers ?? {})}
    >
      <Circle radius={hitR} fill="transparent" listening />
      {clipFunc ? <Group clipFunc={clipFunc}>{visuals}</Group> : visuals}

      {confidence !== undefined && (
        <Group x={-r} y={-r}>
          <ConfidenceBadge confidence={confidence} mmPerPx={mmPerPx} />
        </Group>
      )}

      {selected && onDelete && (
        <DeleteButton
          x={r}
          y={-r}
          mmPerPx={mmPerPx}
          onActivate={onDelete}
        />
      )}

      {selected && onResize && (
        <RadialResizeHandle
          radiusMm={r}
          mmPerPx={mmPerPx}
          minDiameterMm={25}
          maxDiameterMm={65}
          onResize={onResize}
        />
      )}
    </Group>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// WindowFeature
// ─────────────────────────────────────────────────────────────────────────

interface WindowFeatureProps {
  readonly centreX: number;
  readonly centreY: number;
  readonly widthMm: number;
  readonly intrusionMm: number;
  readonly stroke: string;
  readonly fill: string;
  readonly label: string;
  readonly dimensionsLabel: string;
  readonly priceText: string;
  readonly selected: boolean;
  readonly mmPerPx: number;
  readonly labelFontMm: number;
  readonly dimsFontMm: number;
  readonly priceFontMm: number;
  readonly strokeWidthMm: number;
  readonly rotationDeg: number;
  readonly polygonClip?: PolygonClipContext;
  readonly confidence?: number;
  readonly groupHandlers?: GroupHandlers;
  readonly onSelect: () => void;
  readonly onDelete?: () => void;
  readonly onResize?: (widthMm: number, intrusionMm: number) => void;
  readonly onResizeAsymmetric?: (
    widthMm: number,
    intrusionMm: number,
    alongShiftMm: number,
  ) => void;
}

function WindowFeature(props: WindowFeatureProps) {
  const {
    centreX,
    centreY,
    widthMm,
    intrusionMm,
    stroke,
    fill,
    label,
    dimensionsLabel,
    priceText,
    selected,
    mmPerPx,
    labelFontMm,
    dimsFontMm,
    priceFontMm,
    strokeWidthMm,
    rotationDeg,
    polygonClip,
    confidence,
    groupHandlers,
    onSelect,
    onDelete,
    onResize,
    onResizeAsymmetric,
  } = props;
  const groupRef = useRef<Konva.Group | null>(null);
  const clipFunc = polygonClip
    ? makeClipFunc(polygonClip, groupRef, rotationDeg, centreX, centreY)
    : undefined;

  const halfW = widthMm / 2;
  const halfD = intrusionMm / 2;

  // Hatching — 45° lines. Round 4: 0.5 px stroke at ~20 % opacity,
  // spacing scaled with zoom so it never collapses into a solid block.
  // The 4 px on-screen spacing target from the brief means a fine,
  // architectural hatch.
  const hatchSpacingMm = Math.max(8, 24 * mmPerPx); // never tighter than 8 mm
  const hatchLines: number[][] = [];
  for (let i = -intrusionMm; i < widthMm + intrusionMm; i += hatchSpacingMm) {
    hatchLines.push([
      -halfW + i,
      -halfD,
      -halfW + i + intrusionMm,
      -halfD + intrusionMm,
    ]);
  }

  // Round 7A (FIX 2): rect + hatch + label clipped to polygon.
  const visuals = (
    <>
      <Rect
        x={-halfW}
        y={-halfD}
        width={widthMm}
        height={intrusionMm}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidthMm}
        {...(selected
          ? {
              shadowColor: stroke,
              shadowBlur: 8 * mmPerPx,
              shadowOpacity: 0.6,
            }
          : {})}
      />
      {hatchLines.map((pts, i) => (
        <Line
          key={i}
          points={pts}
          stroke={stroke}
          strokeWidth={0.5 * mmPerPx}
          opacity={0.22}
          listening={false}
        />
      ))}

      <CentredLabel
        boxWidth={widthMm}
        boxHeight={intrusionMm}
        label={label}
        dimensionsLabel={dimensionsLabel}
        priceText={priceText}
        selected={selected}
        labelFontMm={labelFontMm}
        dimsFontMm={dimsFontMm}
        priceFontMm={priceFontMm}
      />
    </>
  );

  return (
    <Group
      ref={groupRef}
      x={centreX}
      y={centreY}
      rotation={rotationDeg}
      onClick={onSelect}
      onTap={onSelect}
      {...(groupHandlers ?? {})}
    >
      {clipFunc ? <Group clipFunc={clipFunc}>{visuals}</Group> : visuals}

      {confidence !== undefined && (
        <Group x={-halfW} y={-halfD}>
          <ConfidenceBadge confidence={confidence} mmPerPx={mmPerPx} />
        </Group>
      )}

      {selected && onDelete && (
        <DeleteButton
          x={halfW}
          y={-halfD}
          mmPerPx={mmPerPx}
          onActivate={onDelete}
        />
      )}

      {selected && onResize && (
        <WindowResizeHandles
          halfW={halfW}
          halfD={halfD}
          mmPerPx={mmPerPx}
          onResize={onResize}
          {...(onResizeAsymmetric !== undefined ? { onResizeAsymmetric } : {})}
        />
      )}
    </Group>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// CustomFeature — outline-driven, no resize this round (UNCERTAIN-7 [A])
// ─────────────────────────────────────────────────────────────────────────

interface CustomFeatureProps {
  readonly centreX: number;
  readonly centreY: number;
  readonly outline: ReadonlyArray<{ readonly x: number; readonly y: number }>;
  readonly stroke: string;
  readonly fill: string;
  readonly label: string;
  readonly priceText: string;
  readonly selected: boolean;
  readonly mmPerPx: number;
  readonly labelFontMm: number;
  readonly priceFontMm: number;
  readonly strokeWidthMm: number;
  readonly rotationDeg: number;
  readonly polygonClip?: PolygonClipContext;
  readonly confidence?: number;
  readonly groupHandlers?: GroupHandlers;
  readonly onSelect: () => void;
  readonly onDelete?: () => void;
}

function CustomFeature(props: CustomFeatureProps) {
  const {
    centreX,
    centreY,
    outline,
    stroke,
    fill,
    label,
    priceText,
    selected,
    mmPerPx,
    labelFontMm,
    priceFontMm,
    strokeWidthMm,
    rotationDeg,
    polygonClip,
    confidence,
    groupHandlers,
    onSelect,
    onDelete,
  } = props;
  const groupRef = useRef<Konva.Group | null>(null);
  const clipFunc = polygonClip
    ? makeClipFunc(polygonClip, groupRef, rotationDeg, centreX, centreY)
    : undefined;

  const flat: number[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pt of outline) {
    flat.push(pt.x, pt.y);
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }
  const w = Number.isFinite(minX) ? maxX - minX : 0;

  // Round 7A (FIX 2): outline + labels clipped to polygon.
  const visuals = (
    <>
      <Line
        points={flat}
        closed
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidthMm}
        dash={[10 * mmPerPx, 5 * mmPerPx]}
        {...(selected
          ? {
              shadowColor: stroke,
              shadowBlur: 8 * mmPerPx,
              shadowOpacity: 0.6,
            }
          : {})}
      />
      <Text
        text={label}
        x={minX}
        y={(minY + maxY) / 2 - labelFontMm / 2}
        width={w}
        align="center"
        fontSize={labelFontMm}
        fontFamily="var(--font-mono), monospace"
        fontStyle="500"
        fill="#FAFAF8"
      />
      {selected && (
        <Text
          text={priceText}
          x={minX}
          y={(minY + maxY) / 2 + labelFontMm}
          width={w}
          align="center"
          fontSize={priceFontMm}
          fontFamily="var(--font-mono), monospace"
          fill="#D63F1A"
        />
      )}
    </>
  );

  return (
    <Group
      ref={groupRef}
      x={centreX}
      y={centreY}
      rotation={rotationDeg}
      onClick={onSelect}
      onTap={onSelect}
      {...(groupHandlers ?? {})}
    >
      {clipFunc ? <Group clipFunc={clipFunc}>{visuals}</Group> : visuals}

      {confidence !== undefined && (
        <Group x={minX} y={minY}>
          <ConfidenceBadge confidence={confidence} mmPerPx={mmPerPx} />
        </Group>
      )}

      {selected && onDelete && (
        <DeleteButton
          x={maxX}
          y={minY}
          mmPerPx={mmPerPx}
          onActivate={onDelete}
        />
      )}
    </Group>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Shared sub-components
// ─────────────────────────────────────────────────────────────────────────

interface CentredLabelProps {
  readonly boxWidth: number;
  readonly boxHeight: number;
  readonly label: string;
  readonly dimensionsLabel: string;
  readonly priceText: string;
  readonly selected: boolean;
  readonly labelFontMm: number;
  readonly dimsFontMm: number;
  readonly priceFontMm: number;
}

function CentredLabel(props: CentredLabelProps) {
  const {
    boxWidth,
    label,
    dimensionsLabel,
    priceText,
    selected,
    labelFontMm,
    dimsFontMm,
    priceFontMm,
  } = props;
  // Note: `boxHeight` is part of the prop shape for forwards-compatibility
  // but no longer used — the centre-anchored Group puts (0, 0) at the box
  // centre, so vertical positioning is symmetric around the origin.

  const totalLineHeight =
    labelFontMm +
    4 * (dimsFontMm / 10) +
    dimsFontMm +
    (selected ? priceFontMm + 2 * (dimsFontMm / 10) : 0);
  const startY = -totalLineHeight / 2;
  const halfW = boxWidth / 2;

  return (
    <>
      <Text
        text={label}
        x={-halfW}
        y={startY}
        width={boxWidth}
        align="center"
        fontSize={labelFontMm}
        fontFamily="var(--font-mono), monospace"
        fontStyle="500"
        fill="#FAFAF8"
        listening={false}
      />
      <Text
        text={dimensionsLabel}
        x={-halfW}
        y={startY + labelFontMm + 4 * (dimsFontMm / 10)}
        width={boxWidth}
        align="center"
        fontSize={dimsFontMm}
        fontFamily="var(--font-mono), monospace"
        fill="#9E9D93"
        listening={false}
      />
      {selected && priceText && (
        <Text
          text={priceText}
          x={-halfW}
          y={startY + labelFontMm + dimsFontMm + 8 * (dimsFontMm / 10)}
          width={boxWidth}
          align="center"
          fontSize={priceFontMm}
          fontFamily="var(--font-mono), monospace"
          fill="#D63F1A"
          listening={false}
        />
      )}
    </>
  );
}

interface ConfidenceBadgeProps {
  readonly confidence: number;
  readonly mmPerPx: number;
}

function ConfidenceBadge({ confidence, mmPerPx }: ConfidenceBadgeProps) {
  const pct = Math.round(confidence * 100);
  let bg = "#1D9E75";
  if (confidence < 0.5) bg = "#D63F1A";
  else if (confidence < 0.8) bg = "#EF9F27";

  const widthMm = 28 * mmPerPx;
  const heightMm = 14 * mmPerPx;

  return (
    <Group x={-widthMm / 2} y={-heightMm / 2} listening={false}>
      <Rect
        width={widthMm}
        height={heightMm}
        fill={bg}
        cornerRadius={heightMm / 2}
      />
      <Text
        text={`${pct}%`}
        x={0}
        y={2 * mmPerPx}
        width={widthMm}
        align="center"
        fontSize={9 * mmPerPx}
        fontFamily="var(--font-mono), monospace"
        fontStyle="500"
        fill="#FAFAF8"
      />
    </Group>
  );
}

interface DeleteButtonProps {
  readonly x: number;
  readonly y: number;
  readonly mmPerPx: number;
  readonly onActivate: () => void;
}

function DeleteButton(props: DeleteButtonProps) {
  const { x, y, mmPerPx, onActivate } = props;
  // Round 9 (Issue 1) — bumped from 12 px to 20 px (Fitts-law-friendly
  // mouse-tap target; brief asks ≥ 20). Cinnabar-fill on hover so the
  // affordance is visible without overwhelming the resting state.
  const [hovered, setHovered] = useState(false);
  const sizeMm = 20 * mmPerPx;
  const fillColour = hovered ? "#D63F1A" : "#434239";
  const strokeColour = hovered ? "#FAFAF8" : "#1A1913";
  return (
    <Group
      x={x - sizeMm / 2}
      y={y - sizeMm / 2}
      onClick={(e) => {
        e.cancelBubble = true;
        onActivate();
      }}
      onTap={(e) => {
        e.cancelBubble = true;
        onActivate();
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Circle
        x={sizeMm / 2}
        y={sizeMm / 2}
        radius={sizeMm / 2}
        fill={fillColour}
        stroke={strokeColour}
        strokeWidth={0.5 * mmPerPx}
      />
      <Text
        text="×"
        x={0}
        y={0}
        width={sizeMm}
        height={sizeMm}
        align="center"
        verticalAlign="middle"
        fontSize={14 * mmPerPx}
        fontFamily="var(--font-sans), sans-serif"
        fontStyle="500"
        fill="#FAFAF8"
        listening={false}
      />
    </Group>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Resize handles
//
// Centre-fixed resize: the feature's centre stays put and dimensions grow
// symmetrically. The opposite corner moves with the dragged corner, so the
// brief's "anchor on the opposite corner" intent is approximated for
// axis-aligned features. A future round can add Figma-style anchored
// resize once features render with rotation.
// ─────────────────────────────────────────────────────────────────────────

interface CornerResizeHandlesProps {
  readonly halfW: number;
  readonly halfD: number;
  readonly mmPerPx: number;
  readonly minMm: number;
  readonly onResize: (widthMm: number, depthMm: number) => void;
}

function CornerResizeHandles(props: CornerResizeHandlesProps) {
  const { halfW, halfD, mmPerPx, minMm, onResize } = props;
  const corners: ReadonlyArray<{ readonly x: number; readonly y: number }> = [
    { x: -halfW, y: -halfD },
    { x: halfW, y: -halfD },
    { x: halfW, y: halfD },
    { x: -halfW, y: halfD },
  ];

  // Centre-fixed resize: the dragged corner's local position becomes the
  // new half-extent on each axis, so the box grows symmetrically about the
  // centre. Figma-style anchored resize is deferred to a later round once
  // features render with rotation.
  function onCornerDragMove(e: KonvaEventObject<DragEvent>): void {
    e.cancelBubble = true;
    const localX = e.target.x();
    const localY = e.target.y();
    const newHalfW = Math.max(minMm / 2, Math.abs(localX));
    const newHalfD = Math.max(minMm / 2, Math.abs(localY));
    onResize(newHalfW * 2, newHalfD * 2);
  }

  return (
    <>
      {corners.map((c, i) => (
        <ResizeHandleSquare
          key={i}
          x={c.x}
          y={c.y}
          mmPerPx={mmPerPx}
          onDragMove={onCornerDragMove}
        />
      ))}
    </>
  );
}

interface RadialResizeHandleProps {
  readonly radiusMm: number;
  readonly mmPerPx: number;
  readonly minDiameterMm: number;
  readonly maxDiameterMm: number;
  readonly onResize: (diameterMm: number) => void;
}

function RadialResizeHandle(props: RadialResizeHandleProps) {
  const { radiusMm, mmPerPx, minDiameterMm, maxDiameterMm, onResize } = props;

  function onDragMove(e: KonvaEventObject<DragEvent>): void {
    e.cancelBubble = true;
    const localX = Math.abs(e.target.x());
    const newDiameterMm = clamp(localX * 2, minDiameterMm, maxDiameterMm);
    onResize(newDiameterMm);
  }

  return (
    <ResizeHandleSquare
      x={radiusMm}
      y={0}
      mmPerPx={mmPerPx}
      onDragMove={onDragMove}
    />
  );
}

interface WindowResizeHandlesProps {
  readonly halfW: number;
  readonly halfD: number;
  readonly mmPerPx: number;
  readonly onResize: (widthMm: number, intrusionMm: number) => void;
  /**
   * Round 5 (A3) — when Shift is held during a width-handle drag, the
   * resize is asymmetric: only the dragged side moves. The callback
   * receives the new total width AND the along-edge centre shift (mm),
   * so the parent can update both the dimensions and the placement
   * offset atomically. Optional — callers without this prop only get
   * the symmetric path. The depth handle remains symmetric (depth is
   * front-to-back; the back edge moves; the front edge sits on the wall).
   */
  readonly onResizeAsymmetric?: (
    widthMm: number,
    intrusionMm: number,
    alongShiftMm: number,
  ) => void;
}

function WindowResizeHandles(props: WindowResizeHandlesProps) {
  const { halfW, halfD, mmPerPx, onResize, onResizeAsymmetric } = props;

  function onWidthDrag(e: KonvaEventObject<DragEvent>): void {
    e.cancelBubble = true;
    const localX = e.target.x();
    const shiftHeld =
      onResizeAsymmetric !== undefined && (e.evt?.shiftKey ?? false);
    if (shiftHeld) {
      // Asymmetric — only the right side moves (the dragged handle's side).
      // The opposite (left) side stays anchored at -halfW. The new total
      // width = oldHalfW + newRightHalfW. The centre shifts along the
      // edge by (newRightHalfW - oldHalfW) / 2 so the left edge stays put.
      const newRightHalfW = Math.max(50, localX);
      const newWidthMm = halfW + newRightHalfW;
      const alongShiftMm = (newRightHalfW - halfW) / 2;
      onResizeAsymmetric(newWidthMm, halfD * 2, alongShiftMm);
      return;
    }
    // Symmetric (default) — both sides move equally; centre stays fixed.
    const symHalfW = Math.max(50, Math.abs(localX));
    onResize(symHalfW * 2, halfD * 2);
  }
  function onIntrusionDrag(e: KonvaEventObject<DragEvent>): void {
    e.cancelBubble = true;
    const localY = Math.max(50, Math.abs(e.target.y()));
    onResize(halfW * 2, localY * 2);
  }

  return (
    <>
      {/* Both width handles (left + right) — the right is the active
          handle; the left is a ghost preview of the symmetric mirror. The
          drag from either updates the resize state. */}
      <ResizeHandleSquare
        x={halfW}
        y={0}
        mmPerPx={mmPerPx}
        onDragMove={onWidthDrag}
      />
      {/* Ghost mirror — visual confirmation that the resize is symmetric.
          Rendered as a small square at -halfW (the opposite side), pure
          visual cue. Not draggable. */}
      <Rect
        x={-halfW - 2.5 * mmPerPx}
        y={-2.5 * mmPerPx}
        width={5 * mmPerPx}
        height={5 * mmPerPx}
        fill="#D63F1A"
        opacity={0.35}
        listening={false}
      />
      <ResizeHandleSquare
        x={0}
        y={halfD}
        mmPerPx={mmPerPx}
        onDragMove={onIntrusionDrag}
      />
    </>
  );
}

interface ResizeHandleSquareProps {
  readonly x: number;
  readonly y: number;
  readonly mmPerPx: number;
  readonly onDragMove: (e: KonvaEventObject<DragEvent>) => void;
}

function ResizeHandleSquare(props: ResizeHandleSquareProps) {
  const { x, y, mmPerPx, onDragMove } = props;
  // Round 4 — 5 px square, smaller stroke, finer presence.
  const sizeMm = 5 * mmPerPx;
  return (
    <Rect
      x={x - sizeMm / 2}
      y={y - sizeMm / 2}
      width={sizeMm}
      height={sizeMm}
      fill="#D63F1A"
      stroke="#FAFAF8"
      strokeWidth={0.5 * mmPerPx}
      draggable
      onDragMove={onDragMove}
      onMouseDown={(e) => {
        e.cancelBubble = true;
      }}
      onTouchStart={(e) => {
        e.cancelBubble = true;
      }}
    />
  );
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}
