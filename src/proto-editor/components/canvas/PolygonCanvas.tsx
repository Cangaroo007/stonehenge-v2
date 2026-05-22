"use client";

// apps/web/src/components/canvas/PolygonCanvas.tsx
//
// The main canvas. Renders the active piece on a dark Konva Stage with a
// world-to-screen transform on the Layer (so children use piece-local mm
// coordinates throughout).
//
// Round 4 — interface overhaul:
//   - Adaptive multi-tier grid + corner crosshair (GridBackground)
//   - Top/left rulers in screen-overlay HTML when zoom < 5 mm/px
//   - CanvasTooltip primitive used for vertex coords (on drag/hover) and
//     edge tooltips (profile + length + rate, with 400 ms hover delay)
//   - Subtle radial gradient + stone-800 inset border for canvas depth
//   - Refined zoom controls: floating pill with +/-, Fit, full-screen
//   - Full-screen mode toggle propagated up via `onToggleFullScreen`
//   - Grid toggle propagated up via `onToggleGrid` so the editor's
//     keyboard shortcut layer drives both visibility flags
//
// Logic is unchanged from Round 3B: features, joins, ghost pieces, snap
// previews and drag plumbing all work as before.

import { useEffect, useMemo, useRef, useState } from "react";
import { Decimal } from "decimal.js";
import type { KonvaEventObject } from "konva/lib/Node";
import type Konva from "konva";
import { Arc, Layer, Line, Rect, Stage, Text as KText } from "react-konva";

import type {
  Edge,
  EdgeId,
  Feature,
  FeatureId,
  Join,
  JoinId,
  Piece,
  PieceId,
  Vertex,
  VertexId,
} from "@stonehenge-proto/geometry";
import { computeBoundingBox, computeCornerArc } from "@stonehenge-proto/geometry";
import type { CornerArc } from "@stonehenge-proto/geometry";
import type { FeatureRate } from "@stonehenge-proto/pricing";

import featuresCatalogue from "../../data/features.json";
import edgeProfilesCatalogue from "../../data/edge-profiles.json";
import {
  bootstrapPlacementFromPosition,
  edgeAngleRad,
  featureBboxMm,
  DEFAULT_INWARD_OFFSET_MM,
} from "../../lib/feature-placement";
import {
  ANGLE_NO_WARN_THRESHOLD_DEG,
  ANGLE_WARNING_THRESHOLD_DEG,
  formatAngleDisplay,
  interiorAngleAtPositionDeg,
  snapVertexAngle,
} from "../../lib/angle-snap";
import {
  ANGLE_INTEGRITY_BANNER_THRESHOLD_DEG,
  checkAngleIntegrity,
} from "../../lib/angle-integrity";
import {
  DRAG_SNAP_THRESHOLD_MM,
  PLACEMENT_SNAP_THRESHOLD_MM,
  computeSnapPreview,
} from "../../lib/feature-snap";
import type { SnapPreview } from "../../lib/feature-snap";
import {
  ZOOM_MAX_MM_PER_PX,
  ZOOM_MIN_MM_PER_PX,
  ZOOM_STEP_MULTIPLIER,
  fitViewport,
} from "../../hooks/useCanvasViewport";
import { clampNumber, worldToScreen } from "../../lib/canvas-utils";
import { formatAud } from "../../lib/format-aud";
import { EXPOSURE_LABEL, PROFILE_LABEL } from "../../lib/colour-map";
import {
  materialCategoryTint,
} from "../../lib/colour-map";
import type {
  CanvasViewport,
  FeaturePlacement,
  FixtureMetadata,
  ToolMode,
} from "../../types/editor";

import { AngleLabel } from "./AngleLabel";
import type { AngleLabelColour } from "./AngleLabel";
import { CanvasRulers } from "./CanvasRulers";
import { CanvasTooltip } from "./CanvasTooltip";
import type { CanvasTooltipLine } from "./CanvasTooltip";
import { DiameterLabel } from "./DiameterLabel";
import { DimensionLabel } from "./DimensionLabel";
import { EdgeLine } from "./EdgeLine";
import { FeatureOverlay } from "./FeatureOverlay";
import type {
  FeatureDragHandlers,
  PolygonClipContext,
} from "./FeatureOverlay";
import { GridBackground } from "./GridBackground";
import { JoinIndicator } from "./JoinIndicator";
import {
  JoinLineKonva,
  JoinLineLabel,
} from "./JoinLineAnnotation";
import { computeJoinLineAnnotations } from "../../lib/join-line-annotations";
import {
  computeEdgeSubdivisions,
  computeFeaturePlacementMeasurements,
  computeFeatureToEdgeLines,
} from "../../lib/measurement-lines";
import type { MeasurementLineKind } from "../../lib/measurement-lines";
import {
  EdgeSubdivisionTicksKonva,
  MeasurementLabel,
  MeasurementLineKonva,
} from "./MeasurementOverlay";
import { VertexHandle } from "./VertexHandle";
import { ZoomControls } from "./ZoomControls";

// Round 15 (Fix 7): short labels for the four placement measurements.
// Kept terse so the on-canvas pill stays readable at 10 px.
const LINE_KIND_LABEL: Readonly<Record<MeasurementLineKind, string>> = {
  "left-margin": "left",
  "right-margin": "right",
  "back-setback": "back",
  "front-clearance": "front",
};

const FEATURES = featuresCatalogue as readonly FeatureRate[];
const PRICE_BY_KIND: ReadonlyMap<Feature["kind"], string> = new Map(
  FEATURES.map((f) => [f.featureKind, f.flatRate]),
);

interface EdgeProfileRateRow {
  readonly profile: Edge["profile"];
  readonly ratePerLinealMetre: string;
}
const EDGE_PROFILES = edgeProfilesCatalogue as readonly EdgeProfileRateRow[];
const RATE_BY_PROFILE: ReadonlyMap<Edge["profile"], string> = new Map(
  EDGE_PROFILES.map((r) => [r.profile, r.ratePerLinealMetre]),
);

export interface PolygonCanvasProps {
  readonly piece: Piece;
  readonly toolMode: ToolMode;
  readonly selectedEdgeId: string | null;
  readonly selectedFeatureId: string | null;
  /** Round-3A: vertex selection (also drives Delete/Backspace). */
  readonly selectedVertexId: VertexId | null;
  /**
   * Round 15 (Fix 1) — full multi-vertex selection. The primary is
   * `selectedVertexId`; this set carries every Ctrl+Shift-selected
   * sibling. VertexHandles render with the selected style for any
   * vertex in this set. Defaults to a singleton of `selectedVertexId`
   * when omitted, preserving single-select behaviour for older
   * callers.
   */
  readonly selectedVertexIds?: ReadonlySet<VertexId>;
  readonly materialCategory: string | undefined;
  readonly featurePlacements: ReadonlyMap<FeatureId, FeaturePlacement>;
  readonly fixtureMetadata: ReadonlyMap<FeatureId, FixtureMetadata>;
  readonly onMoveVertex: (
    vertexId: Vertex["id"],
    x: number,
    y: number,
  ) => void;
  readonly onSelectEdge: (edgeId: Edge["id"]) => void;
  readonly onSelectFeature: (featureId: Feature["id"]) => void;
  /**
   * Round 15 (Fix 1) — Ctrl+Shift+click signals an additive selection
   * (multi-vertex). Plain click passes additive=false.
   */
  readonly onSelectVertex: (vertexId: VertexId, additive?: boolean) => void;
  readonly onPlaceFeature: (xMm: number, yMm: number) => void;
  readonly onClearSelection: () => void;
  readonly onSetEdgeLength: (edgeId: EdgeId, newLengthMm: number) => void;
  /**
   * Round 18 (Fix 3) — set the diameter of a fully-curved (circle) piece.
   * Dispatched when the operator commits a new value on the editable
   * diameter label. Parent computes scale = newDiameterMm / currentDiameter
   * and the centroid, then dispatches SCALE_PIECE in one undo entry.
   * Optional so non-editor call sites still compile.
   */
  readonly onSetDiameter?: (newDiameterMm: number) => void;
  /**
   * Round 11 (Fix 1) — set the interior angle at a vertex (via the
   * geometry-kernel law-of-sines). Wired to the clickable
   * `<AngleLabel>` HTML overlay rendered for the selected vertex.
   * Optional so non-editor call sites still compile.
   */
  readonly onSetVertexAngle?: (vertexId: VertexId, angleDeg: number) => void;
  /**
   * Round 11 (Fix 2) — apply the polygon-wide angle-sum correction in
   * one snapshot. Wired to the canvas-level integrity banner so the
   * operator can fix the polygon without opening the vertex panel.
   */
  readonly onCorrectAngles?: () => void;
  readonly onInsertVertex: (
    edgeId: EdgeId,
    pointMm: { readonly x: number; readonly y: number },
  ) => void;
  readonly onPlaceRecess: (
    wallEdgeId: EdgeId,
    pointMm: { readonly x: number; readonly y: number },
  ) => void;
  /**
   * Round 10 (Fix 4) — Add-arm edge pick. Fires when the operator is in
   * `add-arm-pick-edge` mode and clicks any outer-ring edge. The editor
   * page captures the edge and opens the AddArm dimension modal.
   * Optional so existing call-sites compile without modification.
   */
  readonly onPickArmEdge?: (
    edgeId: EdgeId,
    pointMm: { readonly x: number; readonly y: number },
  ) => void;
  readonly onMoveFeature: (
    featureId: FeatureId,
    placement: FeaturePlacement,
  ) => void;
  readonly onResizeFeature: (
    featureId: FeatureId,
    widthMm: number,
    depthMm: number,
  ) => void;
  /**
   * Round 5 (A3) — asymmetric resize for window-recess features.
   * Carries the new width/depth plus the along-edge centre shift so the
   * caller can update placement.offsetAlongEdgeMm atomically.
   */
  readonly onResizeFeatureAsymmetric?: (
    featureId: FeatureId,
    widthMm: number,
    depthMm: number,
    alongShiftMm: number,
  ) => void;
  readonly onDeleteFeature?: (featureId: FeatureId) => void;
  readonly confidenceByFeatureId?: ReadonlyMap<FeatureId, number>;
  readonly inactivePieces?: readonly Piece[];
  readonly joins?: readonly Join[];
  readonly onSelectPiece?: (pieceId: PieceId) => void;
  /** Round 4 — full-screen / grid toggles, driven by the editor's
   *  keyboard layer. Optional so existing call-sites still compile. */
  readonly fullScreen?: boolean;
  readonly onToggleFullScreen?: () => void;
  readonly gridVisible?: boolean;
  readonly onToggleGrid?: () => void;
  /**
   * Round 14 (Section B) — measurement mode flag + toggle. When on,
   * the canvas overlays feature-to-edge distance lines (for the
   * SELECTED feature) and edge subdivision dimensions for any edge
   * with feature anchors. Keyboard equivalent: M. Optional props so
   * existing call sites compile without modification.
   */
  readonly measurementMode?: boolean;
  readonly onToggleMeasurement?: () => void;
  /**
   * Round 15 (Fix 5) — always-visible angle annotations. When on, every
   * outer-ring vertex with an interior angle that isn't ≈ 180° renders
   * a non-interactive Konva angle label (no click-to-edit) so the
   * mason can read the geometry at a glance. Keyboard shortcut: A.
   */
  readonly anglesVisible?: boolean;
  readonly onToggleAngles?: () => void;
  /**
   * Round 6 (Fix 2) — edge-selection mode used by the AddPiecePanel.
   * When set, valid edges glow on hover; clicking a valid edge fires
   * `onSelectAttachEdge`. Invalid edges render at 50 % opacity.
   * Selected edges remain highlighted in cinnabar.
   */
  readonly edgeSelectionMode?: {
    readonly validEdgeIds: readonly EdgeId[];
    readonly selectedEdgeIds: readonly EdgeId[];
    readonly onSelectAttachEdge: (edgeId: EdgeId) => void;
  };
}

interface DragContext {
  readonly featureId: FeatureId;
  readonly featureKind: Feature["kind"];
  readonly bboxWidthMm: number;
  readonly bboxDepthMm: number;
  readonly preservedInwardMm: number;
  readonly originalCentre: { readonly x: number; readonly y: number };
}

interface HoverState {
  readonly kind: "vertex";
  readonly vertexId: VertexId;
  readonly worldX: number;
  readonly worldY: number;
}

export default function PolygonCanvas(props: PolygonCanvasProps) {
  const {
    piece,
    toolMode,
    selectedEdgeId,
    selectedFeatureId,
    selectedVertexId,
    selectedVertexIds,
    materialCategory,
    featurePlacements,
    fixtureMetadata,
    onMoveVertex,
    onSelectEdge,
    onSelectFeature,
    onSelectVertex,
    onPlaceFeature,
    onClearSelection,
    onSetEdgeLength,
    onSetDiameter,
    onSetVertexAngle,
    onCorrectAngles,
    onInsertVertex,
    onPlaceRecess,
    onPickArmEdge,
    onMoveFeature,
    onResizeFeature,
    onResizeFeatureAsymmetric,
    onDeleteFeature,
    confidenceByFeatureId,
    inactivePieces,
    joins,
    onSelectPiece,
    fullScreen,
    onToggleFullScreen,
    gridVisible = true,
    onToggleGrid,
    measurementMode = false,
    anglesVisible = false,
    onToggleAngles,
    onToggleMeasurement,
    edgeSelectionMode,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [viewport, setViewport] = useState<CanvasViewport>(() =>
    fitViewport(piece, 800, 600),
  );

  // Snap previews — one for placement-mode mouse-move, one for active drag.
  const [placementPreview, setPlacementPreview] = useState<SnapPreview | null>(
    null,
  );
  const [dragPreview, setDragPreview] = useState<SnapPreview | null>(null);
  const dragContextRef = useRef<DragContext | null>(null);

  // Round 4/5 — hover state. Each tooltip is positioned in screen-space and
  // rendered as an HTML overlay (CanvasTooltip handles the 400 ms appear
  // delay internally — we do NOT wrap an outer timer around it because that
  // produced an 800 ms compound delay in Round 4 (UX issue A1).
  const [vertexHover, setVertexHover] = useState<HoverState | null>(null);
  const [edgeHoverId, setEdgeHoverId] = useState<EdgeId | null>(null);
  const [edgeTooltipScreen, setEdgeTooltipScreen] = useState<
    { x: number; y: number } | null
  >(null);
  const [featureHoverId, setFeatureHoverId] = useState<FeatureId | null>(null);
  // Round 6 (Fix 4) — hover state for join indicators and ghost pieces.
  // These previously lacked any hover plumbing and so produced "no
  // tooltip" reports.
  const [joinHoverId, setJoinHoverId] = useState<JoinId | null>(null);
  const [ghostHoverId, setGhostHoverId] = useState<PieceId | null>(null);

  // Round 9 (Issue 4 Level 1) — active vertex snap state. Set during a
  // drag when the proposed angle is within the snap threshold of a
  // standard target. Drives the on-canvas snap indicator (arc + label).
  // Cleared on dragEnd.
  const [vertexSnapIndicator, setVertexSnapIndicator] = useState<{
    readonly vertexId: VertexId;
    readonly angleDeg: number;
    readonly x: number;
    readonly y: number;
  } | null>(null);

  // Refs so dragBoundFunc and other Konva-callback closures read live
  // values without re-binding every render.
  const pieceRef = useRef(piece);
  const viewportRef = useRef(viewport);
  const placementsRef = useRef(featurePlacements);
  useEffect(() => {
    pieceRef.current = piece;
  }, [piece]);
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);
  useEffect(() => {
    placementsRef.current = featurePlacements;
  }, [featurePlacements]);

  // Track container size.
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) setSize({ width, height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Refit viewport when a new piece is loaded or full-screen toggles.
  const pieceIdSig = piece.id;
  useEffect(() => {
    setViewport(fitViewport(piece, size.width, size.height));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieceIdSig, size.width, size.height, fullScreen]);

  // Clear placement preview if tool mode changes away from feature-place.
  useEffect(() => {
    if (toolMode.kind !== "feature-place" && placementPreview) {
      setPlacementPreview(null);
    }
  }, [toolMode, placementPreview]);

  // Round 5 — the outer edge-tooltip delay timer is removed (it compounded
  // with CanvasTooltip's own 400 ms appear delay → 800 ms total). The
  // tooltip's `visible` prop now flips immediately on hover, and the 400 ms
  // appear delay is owned by CanvasTooltip alone.
  // EDGE_HOVER_TOOLTIP_DELAY_MS is retained as a constant for reference.

  const verticesById = useMemo(
    () => new Map(piece.vertices.map((v) => [v.id, v])),
    [piece.vertices],
  );

  // Round 15 (Fix 1) — effective multi-select set. Falls back to the
  // singleton `selectedVertexId` when no explicit set is supplied so
  // legacy callers (and the empty selection case) keep working.
  const effectiveSelectedVertexIds = useMemo<ReadonlySet<VertexId>>(() => {
    if (selectedVertexIds && selectedVertexIds.size > 0) {
      return selectedVertexIds;
    }
    if (selectedVertexId !== null) {
      return new Set<VertexId>([selectedVertexId]);
    }
    return new Set<VertexId>();
  }, [selectedVertexIds, selectedVertexId]);

  // Round 15 (Fix 6) — corner-arc computation for every vertex with
  // `cornerRadiusMm > 0`. Builds a VertexId → CornerArc map so the edge
  // rendering path can shorten itself to the arc tangent points and an
  // overlay can draw the arcs themselves.
  //
  // The arc consumes a chunk of each adjacent edge equal to
  // `radius / tan(θ/2)` (computed inside `computeCornerArc`). If two
  // adjacent corners both have radii that overlap on the shared edge, we
  // fall back to no rounding for the colliding corners (the geometry
  // kernel's `isValidCornerRadius` already rejects the application, so
  // this is defensive only).
  const cornerArcs = useMemo<ReadonlyMap<VertexId, CornerArc>>(() => {
    const out = new Map<VertexId, CornerArc>();
    const ring = piece.outerRing.edges;
    for (let i = 0; i < ring.length; i++) {
      const incomingId = ring[i]!;
      const outgoingId = ring[(i + 1) % ring.length]!;
      const incoming = piece.edges.find((e) => e.id === incomingId);
      const outgoing = piece.edges.find((e) => e.id === outgoingId);
      if (!incoming || !outgoing) continue;
      if (incoming.end !== outgoing.start) continue;
      const vId = incoming.end;
      const v = verticesById.get(vId);
      if (!v || !v.cornerRadiusMm || v.cornerRadiusMm <= 0) continue;
      const prev = verticesById.get(incoming.start);
      const next = verticesById.get(outgoing.end);
      if (!prev || !next) continue;
      const arc = computeCornerArc(v, prev, next, v.cornerRadiusMm);
      if (arc) out.set(vId, arc);
    }
    return out;
  }, [piece.outerRing.edges, piece.edges, piece.vertices, verticesById]);

  const polygonPoints = useMemo(() => {
    const flat: number[] = [];
    for (const id of piece.outerRing.edges) {
      const e = piece.edges.find((x) => x.id === id);
      if (!e) continue;
      const v = verticesById.get(e.start);
      if (!v) continue;
      flat.push(v.x, v.y);
    }
    return flat;
  }, [piece, verticesById]);

  // Round 7A (FIX 2): polygon outer ring as {x,y} points for the
  // FeatureOverlay clipFunc. Built once per piece-mutation; threaded to
  // every FeatureOverlay so the visual rendering can be clipped to the
  // polygon boundary.
  const polygonClip = useMemo<PolygonClipContext>(() => {
    const pts: Array<{ x: number; y: number }> = [];
    for (const id of piece.outerRing.edges) {
      const e = piece.edges.find((x) => x.id === id);
      if (!e) continue;
      const v = verticesById.get(e.start);
      if (!v) continue;
      pts.push({ x: v.x, y: v.y });
    }
    return { outerRingPointsMm: pts };
  }, [piece, verticesById]);

  // Round 14 (Section A) — join line annotations: one dashed grey line
  // per reflex (concave) vertex of the outer ring. Memoised so the heavy
  // reflex-detection only re-runs when the piece's geometry changes.
  //
  // Round 16 (Fix 5) — depend on `piece.vertices` explicitly. usePiece
  // returns a new piece reference on every mutation, so `[piece]` is
  // already sufficient — but spelling out `piece.vertices` makes the
  // intent legible and protects against a future caller that mutates
  // the piece in place without changing its identity.
  const joinLineAnnotations = useMemo(
    () => computeJoinLineAnnotations(piece),
    [piece, piece.vertices, piece.edges, piece.outerRing.edges],
  );

  // Round 16 (Fix 4 + Fix 7) — curve helpers. A "smooth-curve" outer-ring
  // edge is one that carries an arc/`CurveDescriptor`. Several
  // suppression rules key off this:
  //   - the per-segment dimension label (DimensionLabel) hides itself
  //     for any curved edge so the 32-segment circle isn't littered with
  //     "98 mm" pills (Fix 7);
  //   - the always-on angle label hides itself for any vertex whose two
  //     adjacent outer-ring edges are BOTH curved — that's a smooth-
  //     curve interior point, not a real corner (Fix 4);
  //   - when every outer-ring edge is curved, the canvas renders ONE
  //     `⌀ N mm` label at the polygon centroid in place of the missing
  //     per-segment dimensions (Fix 7);
  //   - selecting a curved edge on a fully-curved ring promotes the
  //     selection to "all curved edges" so the EdgeProfilePanel can
  //     re-profile the whole circumference at once (Fix 4).
  const outerRingCurvedEdgeIds = useMemo<ReadonlySet<EdgeId>>(() => {
    const out = new Set<EdgeId>();
    for (const id of piece.outerRing.edges) {
      const e = piece.edges.find((x) => x.id === id);
      if (e?.curve) out.add(id);
    }
    return out;
  }, [piece.outerRing.edges, piece.edges]);
  const isFullyCurvedRing =
    piece.outerRing.edges.length > 0 &&
    outerRingCurvedEdgeIds.size === piece.outerRing.edges.length;
  /**
   * Vertex IDs whose incoming and outgoing outer-ring edges are BOTH
   * curved. Drives the angle-label suppression — the "interior angle"
   * between two arc segments is just (360 − N segment turn) and adds no
   * information to the canvas.
   */
  const smoothCurveVertexIds = useMemo<ReadonlySet<VertexId>>(() => {
    const out = new Set<VertexId>();
    const ring = piece.outerRing.edges;
    for (let i = 0; i < ring.length; i++) {
      const incomingId = ring[i]!;
      const outgoingId = ring[(i + 1) % ring.length]!;
      if (
        !outerRingCurvedEdgeIds.has(incomingId) ||
        !outerRingCurvedEdgeIds.has(outgoingId)
      ) {
        continue;
      }
      const incoming = piece.edges.find((e) => e.id === incomingId);
      if (!incoming) continue;
      // The vertex sitting at the meeting point: incoming.end === outgoing.start
      out.add(incoming.end);
    }
    return out;
  }, [piece.outerRing.edges, piece.edges, outerRingCurvedEdgeIds]);
  /**
   * Effective set of edge IDs that should render with the "selected"
   * style. When the user picks a curved edge on a fully-curved ring,
   * every curved edge highlights so the operator sees that the next
   * profile change will land on the whole circumference.
   *
   * For a mixed ring (one curved edge plus straight ones), the same
   * rule applies — picking the curved edge expands selection to every
   * curved edge in the ring. Straight edges select individually as
   * before.
   */
  const effectiveSelectedEdgeIds = useMemo<ReadonlySet<EdgeId>>(() => {
    if (!selectedEdgeId) return new Set<EdgeId>();
    if (
      outerRingCurvedEdgeIds.has(selectedEdgeId as EdgeId) &&
      outerRingCurvedEdgeIds.size > 1
    ) {
      return outerRingCurvedEdgeIds;
    }
    return new Set<EdgeId>([selectedEdgeId as EdgeId]);
  }, [selectedEdgeId, outerRingCurvedEdgeIds]);
  /** Diameter of the inscribed circle for the fully-curved-ring label. */
  const fullyCurvedDiameterMm = useMemo<number | null>(() => {
    if (!isFullyCurvedRing) return null;
    const firstId = piece.outerRing.edges[0];
    if (firstId === undefined) return null;
    const first = piece.edges.find((e) => e.id === firstId);
    if (!first?.curve || first.curve.kind !== "arc") return null;
    // Every segment shares the same arc radius for a perfect circle.
    return first.curve.radiusMm * 2;
  }, [isFullyCurvedRing, piece.outerRing.edges, piece.edges]);

  // Round 14 (Section B) — measurement-mode pre-computation. Both the
  // feature-to-edge lines (for the SELECTED feature) and the edge
  // subdivision dimensions are derived from the piece + placements +
  // selection. When measurement mode is off the computed objects are
  // discarded by the render-time `measurementMode && …` guard below;
  // memoising still saves work because the editor toggles M frequently.
  const selectedFeature = useMemo(() => {
    if (!selectedFeatureId) return null;
    return piece.features.find((f) => f.id === selectedFeatureId) ?? null;
  }, [piece.features, selectedFeatureId]);

  const featureToEdgeLines = useMemo(() => {
    if (!measurementMode || !selectedFeature) return [];
    // Round 15 (Fix 7): when the selected feature has an edge-aligned
    // placement, surface the four mason-relevant measurements (left
    // margin, right margin, back setback, front clearance) keyed to
    // the reference edge. Fallback to the legacy cardinal rays for
    // free-floating features (custom-cutout with no placement) so we
    // still show *something* useful.
    const placement = featurePlacements.get(selectedFeature.id);
    if (placement) {
      return computeFeaturePlacementMeasurements(
        piece,
        selectedFeature,
        placement,
      );
    }
    return computeFeatureToEdgeLines(piece, selectedFeature);
  }, [measurementMode, piece, selectedFeature, featurePlacements]);

  const edgeSubdivisions = useMemo(() => {
    if (!measurementMode) return [];
    return computeEdgeSubdivisions(piece, featurePlacements);
  }, [measurementMode, piece, featurePlacements]);

  // Ghost piece layout.
  //
  // Round 6 (Fix 2) — three layout regimes:
  //   - Edge-anchored secondary pieces (WATERFALL_END / SPLASHBACK_* /
  //     UPSTAND / END_PANEL / WINDOWSILL) whose vertices are already in
  //     parent-local world coords: render in place (tx = ty = 0).
  //   - Build-up children (FASCIA / RETURN / TOP / INFILL) parented to
  //     the active piece: tile below the parent.
  //   - Anything else (top-level sibling pieces from multi-photo
  //     stitching, etc.): tile to the right.
  const ghostLayout = useMemo(() => {
    if (!inactivePieces || inactivePieces.length === 0) {
      return [] as readonly {
        readonly pieceId: PieceId;
        readonly tx: number;
        readonly ty: number;
        readonly points: readonly number[];
        readonly centroidX: number;
        readonly centroidY: number;
      }[];
    }
    const activeBb = computeBoundingBox(piece.vertices);
    let cursorX = activeBb.maxX + 600;
    let childCursorY = activeBb.maxY + 600;
    const out: Array<{
      pieceId: PieceId;
      tx: number;
      ty: number;
      points: number[];
      centroidX: number;
      centroidY: number;
    }> = [];
    const ANCHORED_ROLES = new Set([
      "WATERFALL_END",
      "SPLASHBACK_FULL",
      "SPLASHBACK_LOW",
      "UPSTAND",
      "END_PANEL",
      "WINDOWSILL",
    ]);
    for (const g of inactivePieces) {
      const gBb = computeBoundingBox(g.vertices);
      const isAnchored =
        g.parentPieceId === piece.id && ANCHORED_ROLES.has(g.pieceRole);
      const isBuildUpChild =
        !isAnchored && g.parentPieceId !== undefined;
      let tx: number;
      let ty: number;
      if (isAnchored) {
        // Vertices already sit in parent-local world coords — no offset.
        tx = 0;
        ty = 0;
      } else if (isBuildUpChild) {
        tx = activeBb.minX - gBb.minX;
        ty = childCursorY - gBb.minY;
      } else {
        tx = cursorX - gBb.minX;
        ty = activeBb.minY - gBb.minY;
      }
      const points: number[] = [];
      let cx = 0;
      let cy = 0;
      let n = 0;
      for (const id of g.outerRing.edges) {
        const e = g.edges.find((x) => x.id === id);
        if (!e) continue;
        const v = g.vertices.find((vv) => vv.id === e.start);
        if (!v) continue;
        points.push(v.x + tx, v.y + ty);
        cx += v.x + tx;
        cy += v.y + ty;
        n += 1;
      }
      if (n === 0) continue;
      out.push({
        pieceId: g.id,
        tx,
        ty,
        points,
        centroidX: cx / n,
        centroidY: cy / n,
      });
      if (isAnchored) {
        // No cursor advance — anchored pieces sit in their own space.
      } else if (isBuildUpChild) {
        childCursorY += gBb.maxY - gBb.minY + 200;
      } else {
        cursorX += gBb.maxX - gBb.minX + 600;
      }
    }
    return out;
  }, [piece, inactivePieces]);

  const activeCentroid = useMemo(() => {
    if (piece.vertices.length === 0) return null;
    let cx = 0;
    let cy = 0;
    for (const v of piece.vertices) {
      cx += v.x;
      cy += v.y;
    }
    return { x: cx / piece.vertices.length, y: cy / piece.vertices.length };
  }, [piece]);

  const scale = 1 / viewport.mmPerPx;
  const layerX = -viewport.panMmX * scale;
  const layerY = -viewport.panMmY * scale;

  const worldMinX = viewport.panMmX;
  const worldMinY = viewport.panMmY;
  const worldMaxX = viewport.panMmX + size.width * viewport.mmPerPx;
  const worldMaxY = viewport.panMmY + size.height * viewport.mmPerPx;

  // ────────────────────────────────────────────────────────────────────
  // Wheel zoom — cursor-anchored, with trackpad pinch detection. The
  // 8 % step (down from 10 % in Round 3A) gives slightly finer control.
  // ────────────────────────────────────────────────────────────────────
  function handleWheel(e: KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const isPinch = e.evt.ctrlKey;
    const stepMul = isPinch
      ? Math.pow(ZOOM_STEP_MULTIPLIER, 0.5)
      : ZOOM_STEP_MULTIPLIER;
    const direction = e.evt.deltaY > 0 ? 1 : -1;
    const factor = direction > 0 ? stepMul : 1 / stepMul;
    const nextMmPerPx = clampNumber(
      viewport.mmPerPx * factor,
      ZOOM_MIN_MM_PER_PX,
      ZOOM_MAX_MM_PER_PX,
    );

    const worldX = viewport.panMmX + pointer.x * viewport.mmPerPx;
    const worldY = viewport.panMmY + pointer.y * viewport.mmPerPx;
    const nextPanX = worldX - pointer.x * nextMmPerPx;
    const nextPanY = worldY - pointer.y * nextMmPerPx;

    setViewport((v) => ({
      ...v,
      mmPerPx: nextMmPerPx,
      panMmX: nextPanX,
      panMmY: nextPanY,
    }));
  }

  // ────────────────────────────────────────────────────────────────────
  // Pan
  // ────────────────────────────────────────────────────────────────────
  const panState = useRef<{
    active: boolean;
    startScreenX: number;
    startScreenY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);

  function handleStageMouseDown(e: KonvaEventObject<MouseEvent>) {
    const stage = e.target.getStage();
    if (!stage) return;
    const isMiddle = e.evt.button === 1;
    const isLeftOnEmpty = e.evt.button === 0 && e.target === stage;
    if (!isMiddle && !isLeftOnEmpty) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    panState.current = {
      active: true,
      startScreenX: pointer.x,
      startScreenY: pointer.y,
      startPanX: viewport.panMmX,
      startPanY: viewport.panMmY,
    };
  }

  function handleStageMouseMove(e: KonvaEventObject<MouseEvent>) {
    const stage = e.target.getStage();
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    if (panState.current?.active) {
      const dxPx = pointer.x - panState.current.startScreenX;
      const dyPx = pointer.y - panState.current.startScreenY;
      setViewport((v) => ({
        ...v,
        panMmX: panState.current!.startPanX - dxPx * v.mmPerPx,
        panMmY: panState.current!.startPanY - dyPx * v.mmPerPx,
      }));
      return;
    }

    if (toolMode.kind === "feature-place") {
      const cursorMmX = viewport.panMmX + pointer.x * viewport.mmPerPx;
      const cursorMmY = viewport.panMmY + pointer.y * viewport.mmPerPx;
      const kind = toolMode.featureKind;
      if (kind === "custom-cutout") {
        if (placementPreview) setPlacementPreview(null);
        return;
      }
      const { widthMm, depthMm } = defaultBboxForKind(kind);
      const preview = computeSnapPreview({
        piece,
        cursorX: cursorMmX,
        cursorY: cursorMmY,
        featureKind: kind,
        featureWidthMm: widthMm,
        featureDepthMm: depthMm,
        thresholdMm: PLACEMENT_SNAP_THRESHOLD_MM,
      });
      setPlacementPreview(preview);
    }
  }

  function handleStageMouseUp() {
    if (panState.current?.active) {
      panState.current = null;
    }
  }

  function handleStageClick(
    e: KonvaEventObject<MouseEvent> | KonvaEventObject<TouchEvent>,
  ) {
    const stage = e.target.getStage();
    if (!stage) return;
    if (e.target !== stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const worldX = viewport.panMmX + pointer.x * viewport.mmPerPx;
    const worldY = viewport.panMmY + pointer.y * viewport.mmPerPx;

    if (toolMode.kind === "feature-place") {
      // Round 6 (Fix 5) — reject placements where the preview already
      // reports the feature won't fit. The banner overlay surfaces the
      // explanation; ignore the click silently so the operator can
      // reposition rather than getting a rubber-band-back surprise.
      if (placementPreview !== null && !placementPreview.fits) {
        return;
      }
      onPlaceFeature(worldX, worldY);
      setPlacementPreview(null);
    } else if (toolMode.kind === "insert-vertex") {
      // No-op on empty stage; edge click handles this case.
    } else if (toolMode.kind === "recess-place") {
      // No-op on empty stage; edge click handles this case.
    } else if (toolMode.kind === "add-arm-pick-edge") {
      // No-op on empty stage; edge click handles this case.
    } else if (toolMode.kind === "structural-place") {
      onPlaceFeature(worldX, worldY);
    } else {
      onClearSelection();
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // Feature drag plumbing — unchanged from Round 1
  // ────────────────────────────────────────────────────────────────────

  function handleFeatureDragStart(featureId: FeatureId): void {
    const p = pieceRef.current;
    const feature = p.features.find((f) => f.id === featureId);
    if (!feature) return;
    if (feature.kind === "custom-cutout") {
      dragContextRef.current = null;
      return;
    }
    const bbox = featureBboxMm(feature);
    const existing = placementsRef.current.get(featureId);
    let inward = existing?.offsetInwardMm;
    if (inward === undefined) {
      const bootstrap = bootstrapPlacementFromPosition(p, feature);
      inward =
        bootstrap?.offsetInwardMm ?? DEFAULT_INWARD_OFFSET_MM[feature.kind];
    }
    dragContextRef.current = {
      featureId,
      featureKind: feature.kind,
      bboxWidthMm: bbox.widthMm,
      bboxDepthMm: bbox.depthMm,
      preservedInwardMm: inward,
      originalCentre: { x: feature.position.x, y: feature.position.y },
    };
  }

  function handleFeatureDragMove(
    featureId: FeatureId,
    centreMmX: number,
    centreMmY: number,
  ): void {
    const ctx = dragContextRef.current;
    if (!ctx || ctx.featureId !== featureId) return;
    const preview = computeSnapPreview({
      piece: pieceRef.current,
      cursorX: centreMmX,
      cursorY: centreMmY,
      featureKind: ctx.featureKind,
      featureWidthMm: ctx.bboxWidthMm,
      featureDepthMm: ctx.bboxDepthMm,
      thresholdMm: DRAG_SNAP_THRESHOLD_MM,
      inwardOffsetMm: ctx.preservedInwardMm,
    });
    setDragPreview(preview);
  }

  function handleFeatureDragEnd(featureId: FeatureId): void {
    const ctx = dragContextRef.current;
    const preview = dragPreview;
    setDragPreview(null);
    dragContextRef.current = null;
    if (!ctx || ctx.featureId !== featureId) return;
    if (!preview || !preview.fits) {
      return;
    }
    onMoveFeature(featureId, preview.placement);
  }

  const dragBoundFunc = useMemo(() => {
    return (stagePos: { x: number; y: number }): { x: number; y: number } => {
      const ctx = dragContextRef.current;
      if (!ctx) return stagePos;
      const v = viewportRef.current;
      const layerScale = 1 / v.mmPerPx;
      const lx = -v.panMmX * layerScale;
      const ly = -v.panMmY * layerScale;
      const mmX = (stagePos.x - lx) * v.mmPerPx;
      const mmY = (stagePos.y - ly) * v.mmPerPx;
      const preview = computeSnapPreview({
        piece: pieceRef.current,
        cursorX: mmX,
        cursorY: mmY,
        featureKind: ctx.featureKind,
        featureWidthMm: ctx.bboxWidthMm,
        featureDepthMm: ctx.bboxDepthMm,
        thresholdMm: DRAG_SNAP_THRESHOLD_MM,
        inwardOffsetMm: ctx.preservedInwardMm,
      });
      if (!preview) return stagePos;
      const snappedStageX = preview.ghostX / v.mmPerPx + lx;
      const snappedStageY = preview.ghostY / v.mmPerPx + ly;
      return { x: snappedStageX, y: snappedStageY };
    };
  }, []);

  function buildDragHandlers(feature: Feature): FeatureDragHandlers {
    const inDrag = dragContextRef.current?.featureId === feature.id;
    const dragInvalid = inDrag && (dragPreview === null || !dragPreview.fits);
    const handlers: FeatureDragHandlers = {
      draggable:
        toolMode.kind !== "feature-place" && feature.kind !== "custom-cutout",
      dragBoundFunc,
      onDragStart: handleFeatureDragStart,
      onDragMove: handleFeatureDragMove,
      onDragEnd: handleFeatureDragEnd,
      ...(dragInvalid ? { dragInvalid: true } : {}),
    };
    return handlers;
  }

  // ────────────────────────────────────────────────────────────────────
  // Hover plumbing → tooltips
  // ────────────────────────────────────────────────────────────────────

  function handleVertexHover(vertexId: VertexId | null): void {
    if (vertexId === null) {
      setVertexHover(null);
      return;
    }
    const v = verticesById.get(vertexId);
    if (!v) return;
    setVertexHover({
      kind: "vertex",
      vertexId,
      worldX: v.x,
      worldY: v.y,
    });
  }

  function handleVertexDragMove(
    vertexId: VertexId,
    x: number,
    y: number,
  ): void {
    setVertexHover({ kind: "vertex", vertexId, worldX: x, worldY: y });
  }

  function handleEdgeHover(edgeId: EdgeId | null): void {
    if (edgeId === null) {
      setEdgeHoverId(null);
      setEdgeTooltipScreen(null);
      return;
    }
    const edge = piece.edges.find((x) => x.id === edgeId);
    if (!edge) return;
    const a = verticesById.get(edge.start);
    const b = verticesById.get(edge.end);
    if (!a || !b) return;
    const midWorld = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const mid = worldToScreen(midWorld, viewport);
    setEdgeHoverId(edgeId);
    setEdgeTooltipScreen({ x: mid.x, y: mid.y });
  }

  function handleFeatureHover(featureId: FeatureId | null): void {
    setFeatureHoverId(featureId);
  }

  // Cursor for the canvas chrome. Round 5 (A4) — when in feature-place
  // mode with a snap preview that doesn't fit, switch to `not-allowed` so
  // the operator gets immediate feedback that the click won't land.
  const placementInvalid =
    toolMode.kind === "feature-place" &&
    placementPreview !== null &&
    !placementPreview.fits;
  const canvasCursor = placementInvalid
    ? "not-allowed"
    : toolMode.kind === "feature-place" ||
        toolMode.kind === "insert-vertex" ||
        toolMode.kind === "recess-place" ||
        toolMode.kind === "structural-place" ||
        toolMode.kind === "add-arm-pick-edge"
      ? "crosshair"
      : "default";

  // Subtle radial gradient centred on the active piece, drawn behind
  // the polygon. Adds depth without competing with the geometry.
  const centroidScreen = activeCentroid
    ? worldToScreen(activeCentroid, viewport)
    : null;
  const gradientStyle = centroidScreen
    ? {
        background: `radial-gradient(ellipse at ${centroidScreen.x}px ${centroidScreen.y}px, #232323 0%, #1E1E1E 45%, #1A1A1A 100%)`,
      }
    : { background: "#1E1E1E" };

  // Build the edge-hover tooltip lines.
  //
  // Round 7A (tooltip price impact): shows the billed *line total*
  // (length × rate) for exposed edges, not just the per-lm rate. The
  // brief asks for "Pencil round · Exposed · 2,400 mm · $84.00" — the
  // $84.00 is the line total at the catalogue rate. For non-exposed
  // edges we omit the price line (they're not billed for profiling).
  const edgeTooltipLines = useMemo(() => {
    if (!edgeHoverId) return [] as readonly CanvasTooltipLine[];
    const edge = piece.edges.find((e) => e.id === edgeHoverId);
    if (!edge) return [];
    const a = verticesById.get(edge.start);
    const b = verticesById.get(edge.end);
    if (!a || !b) return [];
    const lengthMm = Math.hypot(b.x - a.x, b.y - a.y);
    const rate = RATE_BY_PROFILE.get(edge.profile);
    const lines: CanvasTooltipLine[] = [
      {
        label: PROFILE_LABEL[edge.profile],
        value: `· ${EXPOSURE_LABEL[edge.exposure]}`,
      },
      { value: `${Math.round(lengthMm)} mm` },
    ];
    if (rate && edge.exposure === "exposed") {
      const lengthM = new Decimal(lengthMm.toString()).dividedBy("1000");
      const lineTotal = lengthM.times(new Decimal(rate));
      lines.push({ value: formatAud(lineTotal) });
    }
    return lines;
  }, [edgeHoverId, piece, verticesById]);

  // Round 16 (Fix 3) — the always-on "selected-edge profile pill" was
  // retired. The pill rendered the profile name (e.g. "Raw cut") at the
  // edge midpoint, which overlapped the dimension label and made both
  // unreadable. The edge colour already encodes the profile category at
  // a glance, and the 400 ms-delayed edge hover tooltip surfaces the
  // full name + length + price. That matches how professional CAD tools
  // work — minimal on-screen text, detail on demand.

  // Round 5 — vertex tooltip enriched with interior angle + corner radius
  // (brief A1). Interior angle is computed from the incoming and outgoing
  // edge tangents at this vertex via the outer ring traversal.
  const vertexTooltipLines = useMemo(() => {
    if (!vertexHover) return [] as readonly CanvasTooltipLine[];
    const lines: CanvasTooltipLine[] = [
      {
        value: `x ${Math.round(vertexHover.worldX)}  y ${Math.round(vertexHover.worldY)}`,
      },
    ];
    const v = verticesById.get(vertexHover.vertexId);
    if (v) {
      // Locate incoming and outgoing edges via outer-ring traversal.
      const ring = piece.outerRing.edges;
      let inAngle: number | null = null;
      for (let i = 0; i < ring.length; i++) {
        const incomingId = ring[i]!;
        const outgoingId = ring[(i + 1) % ring.length]!;
        const incoming = piece.edges.find((e) => e.id === incomingId);
        const outgoing = piece.edges.find((e) => e.id === outgoingId);
        if (!incoming || !outgoing) continue;
        if (incoming.end === v.id && outgoing.start === v.id) {
          const prev = verticesById.get(incoming.start);
          const next = verticesById.get(outgoing.end);
          if (!prev || !next) break;
          const inDx = v.x - prev.x;
          const inDy = v.y - prev.y;
          const outDx = next.x - v.x;
          const outDy = next.y - v.y;
          // Interior angle = 180° - turn angle between incoming and outgoing.
          const cross = inDx * outDy - inDy * outDx;
          const dot = inDx * outDx + inDy * outDy;
          const turn = Math.atan2(cross, dot);
          inAngle = 180 - (turn * 180) / Math.PI;
          break;
        }
      }
      if (inAngle !== null) {
        lines.push({ value: `${Math.round(inAngle)}°` });
      }
      if (v.cornerRadiusMm && v.cornerRadiusMm > 0) {
        lines.push({ label: "r", value: `${Math.round(v.cornerRadiusMm)} mm` });
      }
    }
    return lines;
  }, [vertexHover, piece, verticesById]);

  // Round 5 — feature tooltip lines (product name + dimensions + price).
  const featureTooltipLines = useMemo(() => {
    if (!featureHoverId) return [] as readonly CanvasTooltipLine[];
    const feature = piece.features.find((f) => f.id === featureHoverId);
    if (!feature) return [];
    const fix = fixtureMetadata.get(featureHoverId);
    const name =
      fix?.brand && fix.model
        ? `${fix.brand} ${fix.model}`
        : featureKindLabel(feature.kind);
    const bboxW =
      feature.kind === "undermount-sink"
        ? feature.bowlWidthMm
        : feature.kind === "overmount-sink" ||
            feature.kind === "cooktop-cutout"
          ? feature.cutoutWidthMm
          : feature.kind === "tap-hole"
            ? feature.diameterMm
            : feature.kind === "window-recess"
              ? feature.widthMm
              : 0;
    const bboxD =
      feature.kind === "undermount-sink"
        ? feature.bowlDepthMm
        : feature.kind === "overmount-sink" ||
            feature.kind === "cooktop-cutout"
          ? feature.cutoutDepthMm
          : feature.kind === "tap-hole"
            ? feature.diameterMm
            : feature.kind === "window-recess"
              ? feature.intrusionMm
              : 0;
    const flatRate = PRICE_BY_KIND.get(feature.kind);
    const lines: CanvasTooltipLine[] = [{ label: name.toUpperCase() }];
    if (bboxW > 0 && bboxD > 0) {
      lines.push({ value: `${Math.round(bboxW)} × ${Math.round(bboxD)} mm` });
    }
    if (flatRate) {
      lines.push({ value: formatAud(new Decimal(flatRate)) });
    }
    return lines;
  }, [featureHoverId, piece, fixtureMetadata]);

  const featureHoverScreen = useMemo(() => {
    if (!featureHoverId) return null;
    const feature = piece.features.find((f) => f.id === featureHoverId);
    if (!feature) return null;
    return worldToScreen(feature.position, viewport);
  }, [featureHoverId, piece, viewport]);

  // Round 7A (FIX 4): tooltip anchors on the shared-edge midpoint, not
  // between piece centroids. Surfaces the V3 mitre angle when present.
  const joinTooltip = useMemo(() => {
    if (!joinHoverId || !joins) return null;
    const join = joins.find((j) => j.id === joinHoverId);
    if (!join) return null;
    if (join.pieceA !== piece.id) return null;
    const edge = piece.edges.find((e) => e.id === join.edgeA);
    if (!edge) return null;
    const a = verticesById.get(edge.start);
    const b = verticesById.get(edge.end);
    if (!a || !b) return null;
    const midWorld = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const screen = worldToScreen(midWorld, viewport);
    const lines: CanvasTooltipLine[] = [
      { label: joinKindLabel(join.kind) },
    ];
    if (join.kind === "MITRE" && join.angleDeg !== undefined) {
      lines.push({ value: `${Math.round(join.angleDeg)}°` });
    }
    return { screen, lines };
  }, [joinHoverId, joins, piece, verticesById, viewport]);

  const ghostTooltip = useMemo(() => {
    if (!ghostHoverId || !inactivePieces) return null;
    const ghost = inactivePieces.find((p) => p.id === ghostHoverId);
    if (!ghost) return null;
    const layout = ghostLayout.find((g) => g.pieceId === ghostHoverId);
    if (!layout) return null;
    const screen = worldToScreen(
      { x: layout.centroidX, y: layout.centroidY },
      viewport,
    );
    const lines: CanvasTooltipLine[] = [
      { label: ghost.name.toUpperCase() },
      { value: `${ghost.thicknessMm} mm · ${pieceRoleLabel(ghost.pieceRole)}` },
    ];
    return { screen, lines };
  }, [ghostHoverId, inactivePieces, ghostLayout, viewport]);

  const vertexHoverScreen = vertexHover
    ? worldToScreen({ x: vertexHover.worldX, y: vertexHover.worldY }, viewport)
    : null;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden ring-1 ring-inset ring-stone-800"
      style={{ ...gradientStyle, cursor: canvasCursor }}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        onWheel={handleWheel}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onMouseLeave={handleStageMouseUp}
        onClick={handleStageClick}
        onTap={handleStageClick}
      >
        <Layer x={layerX} y={layerY} scaleX={scale} scaleY={scale}>
          <GridBackground
            minX={worldMinX}
            minY={worldMinY}
            maxX={worldMaxX}
            maxY={worldMaxY}
            mmPerPx={viewport.mmPerPx}
            visible={gridVisible}
          />

          {/* Ghost inactive pieces — 30 % opacity, click to activate.
              Round 6 (Fix 4): also fires hover so the parent can render
              a tooltip with the piece's name and role. */}
          {ghostLayout.map((g) => (
            <Line
              key={`ghost-${g.pieceId}`}
              points={[...g.points]}
              closed
              fill={materialCategoryTint(materialCategory)}
              opacity={0.3}
              stroke="#78716c"
              strokeWidth={Math.max(1, viewport.mmPerPx * 1.5)}
              onClick={() => onSelectPiece?.(g.pieceId)}
              onTap={() => onSelectPiece?.(g.pieceId)}
              onMouseEnter={() => setGhostHoverId(g.pieceId)}
              onMouseLeave={() => setGhostHoverId(null)}
              listening
            />
          ))}

          {polygonPoints.length >= 6 && (
            <Line
              points={polygonPoints}
              closed
              fill={materialCategoryTint(materialCategory)}
              listening={false}
            />
          )}

          {/* Round 14 (Section A) — visual-only join line annotations
              for reflex (concave) vertices. Shows the mason where the
              natural cut line would land if the polygon were split into
              rectangular pieces for CNC nesting. Implementation: pure
              detection in apps/web/src/lib/join-line-annotations.ts. */}
          {joinLineAnnotations.map((ann) => (
            <JoinLineKonva
              key={`join-line-${ann.atVertexId}`}
              annotation={ann}
              mmPerPx={viewport.mmPerPx}
            />
          ))}

          {/* Round 14 (Section B) — measurement-mode overlays.
              - Feature-to-edge dashed lines (only when a feature is
                selected).
              - Edge subdivision ticks at every feature boundary along
                an edge. Both are gated on measurementMode so toggle off
                cleanly returns the canvas to its standard appearance. */}
          {measurementMode &&
            featureToEdgeLines.map((line, idx) => (
              <MeasurementLineKonva
                key={`meas-line-${idx}-${line.distanceMm.toFixed(0)}`}
                line={line}
                mmPerPx={viewport.mmPerPx}
              />
            ))}
          {measurementMode &&
            edgeSubdivisions.map((sub) => {
              if (sub.segments.length <= 1) return null;
              const edge = piece.edges.find((e) => e.id === sub.edgeId);
              if (!edge) return null;
              const startV = piece.vertices.find((v) => v.id === edge.start);
              const endV = piece.vertices.find((v) => v.id === edge.end);
              if (!startV || !endV) return null;
              const dx = endV.x - startV.x;
              const dy = endV.y - startV.y;
              const len = Math.hypot(dx, dy);
              if (len === 0) return null;
              const tx = dx / len;
              const ty = dy / len;
              // Inward normal (perpendicular to the edge). The sign
              // depends on the polygon's winding; for our screen-down
              // CCW templates the right perpendicular points inward.
              const inx = ty;
              const iny = -tx;
              return (
                <EdgeSubdivisionTicksKonva
                  key={`meas-ticks-${sub.edgeId}`}
                  subdivision={sub}
                  tangentX={tx}
                  tangentY={ty}
                  inwardX={inx}
                  inwardY={iny}
                  mmPerPx={viewport.mmPerPx}
                />
              );
            })}

          {joins &&
            joins.map((join) => {
              // Round 7A (FIX 4): anchor the indicator on the actual
              // shared edge (join.edgeA on the active piece), not the
              // diagonal between centroids. We only render joins where
              // the active piece is `pieceA` AND the edge is still on
              // the parent — if the active piece is `pieceB` of a
              // splashback-corner-mitre, we let the OTHER active-piece
              // render the indicator (avoids drawing the same line
              // twice from different sides).
              if (join.pieceA !== piece.id) return null;
              const edge = piece.edges.find((e) => e.id === join.edgeA);
              if (!edge) return null;
              const start = piece.vertices.find((v) => v.id === edge.start);
              const end = piece.vertices.find((v) => v.id === edge.end);
              if (!start || !end) return null;
              return (
                <JoinIndicator
                  key={`join-${join.id}`}
                  joinId={join.id}
                  startMm={{ x: start.x, y: start.y }}
                  endMm={{ x: end.x, y: end.y }}
                  kind={join.kind}
                  mmPerPx={viewport.mmPerPx}
                  onHover={setJoinHoverId}
                />
              );
            })}

          {/* Edges */}
          {piece.outerRing.edges.map((id) => {
            const edge = piece.edges.find((x) => x.id === id);
            if (!edge) return null;
            const start = verticesById.get(edge.start);
            const end = verticesById.get(edge.end);
            if (!start || !end) return null;
            // Round 15 (Fix 6) — if either endpoint has a corner radius,
            // shorten the straight line to the arc tangent point so the
            // rendered edge meets the arc smoothly. EdgeLine reads .x/.y
            // off the Vertex, so we can synthesise lightweight "ghost"
            // vertices that share the real ID. Edges with their own
            // CurveDescriptor (semicircles on the radius-end peninsula
            // template, circle segments) are left alone — corner arcs and
            // edge curves shouldn't coexist on the same edge in practice.
            const startArc = cornerArcs.get(edge.start);
            const endArc = cornerArcs.get(edge.end);
            const renderStart: Vertex = startArc && !edge.curve
              ? { ...start, x: startArc.arcEnd.x, y: startArc.arcEnd.y }
              : start;
            const renderEnd: Vertex = endArc && !edge.curve
              ? { ...end, x: endArc.arcStart.x, y: endArc.arcStart.y }
              : end;
            const isValidAttachEdge =
              edgeSelectionMode?.validEdgeIds.includes(edge.id) ?? false;
            const isSelectedAttachEdge =
              edgeSelectionMode?.selectedEdgeIds.includes(edge.id) ?? false;
            const isInvalidInSelectionMode =
              edgeSelectionMode !== undefined && !isValidAttachEdge;
            const handleClick = (): void => {
              // Round 6 — edge-selection mode for AddPiecePanel.
              if (edgeSelectionMode) {
                if (isValidAttachEdge) {
                  edgeSelectionMode.onSelectAttachEdge(edge.id);
                }
                return;
              }
              const stage = stageRef.current;
              if (!stage) {
                onSelectEdge(edge.id);
                return;
              }
              const pointer = stage.getPointerPosition();
              const worldPoint = pointer
                ? {
                    x: viewport.panMmX + pointer.x * viewport.mmPerPx,
                    y: viewport.panMmY + pointer.y * viewport.mmPerPx,
                  }
                : null;
              if (toolMode.kind === "insert-vertex" && worldPoint) {
                onInsertVertex(edge.id, worldPoint);
                return;
              }
              if (
                toolMode.kind === "recess-place" &&
                edge.exposure === "wall" &&
                worldPoint
              ) {
                onPlaceRecess(edge.id, worldPoint);
                return;
              }
              if (
                toolMode.kind === "add-arm-pick-edge" &&
                worldPoint &&
                onPickArmEdge
              ) {
                onPickArmEdge(edge.id, worldPoint);
                return;
              }
              onSelectEdge(edge.id);
            };
            const handleDoubleClick = (): void => {
              const stage = stageRef.current;
              if (!stage) return;
              const pointer = stage.getPointerPosition();
              if (!pointer) return;
              const worldPoint = {
                x: viewport.panMmX + pointer.x * viewport.mmPerPx,
                y: viewport.panMmY + pointer.y * viewport.mmPerPx,
              };
              onInsertVertex(edge.id, worldPoint);
            };
            return (
              <EdgeLine
                key={id}
                edge={edge}
                start={renderStart}
                end={renderEnd}
                selected={
                  effectiveSelectedEdgeIds.has(edge.id) ||
                  isSelectedAttachEdge
                }
                mmPerPx={viewport.mmPerPx}
                onSelect={handleClick}
                onDoubleClick={handleDoubleClick}
                onHover={handleEdgeHover}
                attachSelectionState={
                  edgeSelectionMode
                    ? isInvalidInSelectionMode
                      ? "invalid"
                      : isSelectedAttachEdge
                        ? "picked"
                        : "valid"
                    : "off"
                }
              />
            );
          })}

          {/* Round 15 (Fix 6) — Corner arc overlay: one Konva Arc per
              rounded vertex (`cornerRadiusMm > 0`). The straight edges
              above already end at the arc's tangent points; this fills in
              the smooth quarter-or-more arc through the corner. The arc
              is non-interactive — clicking it selects neither the edge
              nor the vertex (the vertex handle owns selection at the
              corner). */}
          {Array.from(cornerArcs.entries()).map(([vId, arc]) => {
            // Konva.Arc renders a sector from `rotation` for `angle`
            // degrees clockwise. Since the arc may sweep either way
            // depending on the polygon's winding, we draw it as an SVG
            // Path on a sibling Line-equivalent — but Konva's <Arc>
            // accepts a single angle, and the geometry helper has
            // already computed `startAngleRad`, `endAngleRad`,
            // `clockwise`, and `sweepRad` for us.
            //
            // Renderer: a thin 1.5 px stone-300 stroke matches the
            // default edge stroke colour (raw profile) so the corner
            // looks continuous with the edges meeting it.
            const startDeg = (arc.startAngleRad * 180) / Math.PI;
            const sweepDeg = (arc.sweepRad * 180) / Math.PI;
            // For a CCW polygon (the templates' standard winding), the
            // arc sweeps clockwise when viewed in screen-down coords.
            // The geometry helper sets `clockwise` accordingly. Konva.Arc
            // uses `angle` as the CCW sweep in math coords (CW in
            // screen-down because the y axis is flipped). Empirically:
            // pass the unsigned sweep and set `rotation` to startDeg when
            // clockwise == true; otherwise rotate to endDeg.
            const rotation = arc.clockwise
              ? startDeg
              : (arc.endAngleRad * 180) / Math.PI;
            return (
              <Arc
                key={`corner-arc-${vId}`}
                x={arc.centre.x}
                y={arc.centre.y}
                innerRadius={arc.radiusMm}
                outerRadius={arc.radiusMm}
                angle={sweepDeg}
                rotation={rotation}
                stroke="#A8A29E"
                strokeWidth={1.5 * viewport.mmPerPx}
                lineCap="round"
                listening={false}
              />
            );
          })}

          {placementPreview && (
            <SnapGuideLine
              edgeStart={placementPreview.edgeStart}
              edgeEnd={placementPreview.edgeEnd}
              mmPerPx={viewport.mmPerPx}
            />
          )}
          {dragPreview && (
            <SnapGuideLine
              edgeStart={dragPreview.edgeStart}
              edgeEnd={dragPreview.edgeEnd}
              mmPerPx={viewport.mmPerPx}
            />
          )}

          {toolMode.kind === "feature-place" && placementPreview && (
            <PlacementGhost
              centreX={placementPreview.ghostX}
              centreY={placementPreview.ghostY}
              kind={toolMode.featureKind}
              fits={placementPreview.fits}
              mmPerPx={viewport.mmPerPx}
              rotationDeg={placementPreview.ghostRotationDeg}
            />
          )}

          {/* Round 5 — sort features so smaller bboxes render last (on top).
              When features overlap (e.g. a tap-hole inside a sink cutout),
              the smaller feature wins selection because it's rendered on
              top of the larger one. */}
          {[...piece.features]
            .sort((a, b) => featureBboxArea(b) - featureBboxArea(a))
            .map((feature) => {
              const confidence = confidenceByFeatureId?.get(feature.id);
              const fixture = fixtureMetadata.get(feature.id);
              const rotationDeg = rotationForFeature(
                piece,
                feature,
                featurePlacements,
              );
              return (
                <FeatureOverlay
                  key={feature.id}
                  feature={feature}
                  selected={feature.id === selectedFeatureId}
                  mmPerPx={viewport.mmPerPx}
                  onSelect={onSelectFeature}
                  onHover={handleFeatureHover}
                  polygonClip={polygonClip}
                  rotationDeg={rotationDeg}
                  {...(onDeleteFeature !== undefined
                    ? { onDelete: onDeleteFeature }
                    : {})}
                  {...(confidence !== undefined ? { confidence } : {})}
                  {...(fixture !== undefined ? { fixture } : {})}
                  drag={buildDragHandlers(feature)}
                  resize={{
                    onResize: onResizeFeature,
                    ...(onResizeFeatureAsymmetric !== undefined
                      ? { onResizeAsymmetric: onResizeFeatureAsymmetric }
                      : {}),
                  }}
                />
              );
            })}

          {piece.vertices.map((vertex) => {
            // Round 17 (Fix 1) — suppress vertex handles on smooth-curve
            // vertices (tessellation joints of a fully-curved arc segment
            // chain, e.g. every vertex on the 32-gon circle). The handle's
            // 16 px hit target completely covers the ~100 mm circumference
            // arc segments, so leaving the handles in place stopped any
            // edge from receiving clicks (Round 16 regression). These
            // joints aren't user-editable corners — they only exist to
            // tessellate the arc — so hiding them is the right answer.
            if (smoothCurveVertexIds.has(vertex.id)) return null;
            // Round 9 (Issue 4 Level 1) — per-vertex dragBoundFunc that
            // computes the proposed mm position from stage coords, runs
            // the angle-snap helper, updates the snap-indicator state,
            // and returns the snapped (or unchanged) stage position.
            const dragBoundFunc = (stagePos: {
              readonly x: number;
              readonly y: number;
            }): { readonly x: number; readonly y: number } => {
              const v = viewportRef.current;
              const layerScaleLocal = 1 / v.mmPerPx;
              const lx = -v.panMmX * layerScaleLocal;
              const ly = -v.panMmY * layerScaleLocal;
              // VertexHandle's draggable Group is inside the Layer that
              // already has the world-to-screen transform applied, so
              // stagePos here is already in the parent (Layer) frame.
              // We need to convert to mm world coords for snap math.
              // Pattern matches the feature dragBoundFunc above.
              const mmX = (stagePos.x - lx) * v.mmPerPx;
              const mmY = (stagePos.y - ly) * v.mmPerPx;
              const result = snapVertexAngle(
                pieceRef.current,
                vertex.id,
                mmX,
                mmY,
              );
              if (result.snappedAngleDeg !== null) {
                setVertexSnapIndicator({
                  vertexId: vertex.id,
                  angleDeg: result.snappedAngleDeg,
                  x: result.x,
                  y: result.y,
                });
                const snappedStageX = result.x / v.mmPerPx + lx;
                const snappedStageY = result.y / v.mmPerPx + ly;
                return { x: snappedStageX, y: snappedStageY };
              }
              setVertexSnapIndicator(null);
              return stagePos;
            };
            const onDragEndClear = (): void => {
              setVertexSnapIndicator(null);
            };
            return (
              <VertexHandle
                key={vertex.id}
                vertex={vertex}
                mmPerPx={viewport.mmPerPx}
                onMove={onMoveVertex}
                selected={effectiveSelectedVertexIds.has(vertex.id)}
                onSelect={onSelectVertex}
                onHover={handleVertexHover}
                onDragMove={handleVertexDragMove}
                dragBoundFunc={dragBoundFunc}
                onDragEnd={onDragEndClear}
              />
            );
          })}

          {/* Round 7A (FIX 6): "R{n}" badge near a selected vertex that
              has a non-zero corner radius. Cues the operator that the
              corner is rounded and surfaces the value at a glance. */}
          {selectedVertexId &&
            (() => {
              const v = piece.vertices.find((x) => x.id === selectedVertexId);
              if (!v || !v.cornerRadiusMm || v.cornerRadiusMm <= 0) return null;
              const offsetMm = 12 * viewport.mmPerPx;
              const badgeW = 38 * viewport.mmPerPx;
              const badgeH = 16 * viewport.mmPerPx;
              return (
                <>
                  <Rect
                    x={v.x + offsetMm}
                    y={v.y - badgeH - offsetMm / 2}
                    width={badgeW}
                    height={badgeH}
                    fill="#1A1913"
                    stroke="#D63F1A"
                    strokeWidth={0.75 * viewport.mmPerPx}
                    cornerRadius={badgeH / 2}
                    listening={false}
                  />
                  <KText
                    x={v.x + offsetMm}
                    y={v.y - badgeH - offsetMm / 2 + 2 * viewport.mmPerPx}
                    width={badgeW}
                    height={badgeH}
                    align="center"
                    text={`R${Math.round(v.cornerRadiusMm)}`}
                    fontSize={10 * viewport.mmPerPx}
                    fontFamily="var(--font-mono), monospace"
                    fontStyle="500"
                    fill="#FAFAF8"
                    listening={false}
                  />
                </>
              );
            })()}

          {/* Round 9 (Issue 4 Level 2) — always-on interior-angle arc
              at the selected vertex. Subtle thin canvas-selection arc
              with the degree value. Hidden during active drag (the
              snap indicator below takes over). */}
          {selectedVertexId &&
            !vertexSnapIndicator &&
            !smoothCurveVertexIds.has(selectedVertexId) &&
            (() => {
              const v = piece.vertices.find(
                (x) => x.id === selectedVertexId,
              );
              if (!v) return null;
              return (
                <VertexAngleArc
                  piece={piece}
                  vertex={v}
                  mmPerPx={viewport.mmPerPx}
                  variant="default"
                />
              );
            })()}

          {/* Round 15 (Fix 5) — always-visible angle annotations. When
              the ANGLES toggle is on, every outer-ring vertex whose
              interior angle isn't ≈ 180° renders a non-interactive
              VertexAngleArc. We skip the currently-selected primary
              (the always-on arc above already covers it) and the
              vertex carrying an active snap indicator.

              Round 16 (Fix 4) — also skip vertices whose two adjacent
              outer-ring edges are BOTH curved. The "angle" between two
              arc segments of a regular curve is just (360 − N segment
              turn) and labelling every one on a 32-segment circle made
              the canvas unreadable. We still surface the corner-arc
              colour-coding for any vertex carrying a real corner. */}
          {anglesVisible &&
            piece.vertices.map((v) => {
              if (v.id === selectedVertexId) return null;
              if (vertexSnapIndicator?.vertexId === v.id) return null;
              if (smoothCurveVertexIds.has(v.id)) return null;
              return (
                <VertexAngleArc
                  key={`angles-on-${v.id}`}
                  piece={piece}
                  vertex={v}
                  mmPerPx={viewport.mmPerPx}
                  variant="default"
                  showLabel
                />
              );
            })}

          {/* Round 9 (Issue 4 Level 1) — active-drag snap indicator.
              Renders the snap-target angle (e.g. "90°") with the arc
              in cinnabar so the operator sees the magnetic snap firing. */}
          {vertexSnapIndicator &&
            (() => {
              const v = piece.vertices.find(
                (x) => x.id === vertexSnapIndicator.vertexId,
              );
              if (!v) return null;
              // Use the DRAG-IN-PROGRESS position (where the snap fires)
              // rather than the stored vertex position so the arc tracks
              // the visual location of the dragged handle.
              const dragV: Vertex = {
                ...v,
                x: vertexSnapIndicator.x,
                y: vertexSnapIndicator.y,
              };
              return (
                <VertexAngleArc
                  piece={piece}
                  vertex={dragV}
                  mmPerPx={viewport.mmPerPx}
                  variant="snapped"
                  overrideAngleDeg={vertexSnapIndicator.angleDeg}
                />
              );
            })()}
        </Layer>
      </Stage>

      {/* HTML overlay — dimension labels + rulers + tooltips. */}
      <div className="pointer-events-none absolute inset-0">
        <CanvasRulers
          viewport={viewport}
          widthPx={size.width}
          heightPx={size.height}
          visible={gridVisible}
        />
        {piece.outerRing.edges.map((id) => {
          const edge = piece.edges.find((x) => x.id === id);
          if (!edge) return null;
          // Round 16 (Fix 7) — suppress the per-segment dimension label
          // on any curved outer-ring edge. The 32-segment circle was
          // rendering 32 "98 mm" pills around its rim — visual noise
          // with no fabrication value. The fully-curved-ring case below
          // renders a single ⌀ diameter label at the centroid instead.
          // Mixed shapes (e.g. L-shape with one round end) still show
          // dimensions on straight edges; curved segments stay quiet.
          if (edge.curve) return null;
          const startVertex = verticesById.get(edge.start);
          const endVertex = verticesById.get(edge.end);
          if (!startVertex || !endVertex) return null;
          return (
            <DimensionLabel
              key={`dim-${id}`}
              edge={edge}
              start={startVertex}
              end={endVertex}
              viewport={viewport}
              onCommit={(newLengthMm) => onSetEdgeLength(edge.id, newLengthMm)}
            />
          );
        })}

        {/* Round 16 (Fix 7) — single diameter label at the centroid for
            fully-curved rings (circle templates). Replaces the suppressed
            per-segment dimensions. The diameter is read off the first
            outer-ring edge's arc radius — every segment of a regular
            n-gon-with-arcs carries the same radius, so any edge would
            do.

            Round 18 (Fix 3) — the label is editable. Clicking it opens
            an input; committing dispatches SCALE_PIECE with the
            new-over-old scale factor and the current centroid, so every
            vertex and every arc radius scales uniformly in one undo
            entry. When the editor parent doesn't supply `onSetDiameter`
            (read-only embeds, tests), we fall back to the inert div. */}
        {isFullyCurvedRing && fullyCurvedDiameterMm !== null && activeCentroid && (() => {
          const screen = worldToScreen(activeCentroid, viewport);
          if (onSetDiameter) {
            const currentDiameterMm = fullyCurvedDiameterMm;
            return (
              <DiameterLabel
                diameterMm={currentDiameterMm}
                screenX={screen.x}
                screenY={screen.y}
                onCommit={(newDiameterMm) => onSetDiameter(newDiameterMm)}
              />
            );
          }
          return (
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded border border-stone-700 bg-stone-900/85 px-2 py-[3px] font-mono text-[12px] leading-none text-white shadow-sm"
              style={{ left: `${screen.x}px`, top: `${screen.y}px` }}
            >
              {`⌀ ${Math.round(fullyCurvedDiameterMm)} mm`}
            </div>
          );
        })()}

        {/* Round 14 (Section A) — join line label, positioned at the
            midpoint of each join annotation. The dashed line itself is
            rendered inside the Konva Layer above; this HTML label
            mirrors DimensionLabel's screen-space-rendering convention
            so it stays crisp at every zoom. */}
        {joinLineAnnotations.map((ann) => {
          const screen = worldToScreen(ann.midMm, viewport);
          return (
            <JoinLineLabel
              key={`join-line-label-${ann.atVertexId}`}
              text={ann.label}
              screenX={screen.x}
              screenY={screen.y}
            />
          );
        })}

        {/* Round 14 (Section B) — measurement-mode HTML labels. */}
        {measurementMode &&
          featureToEdgeLines.map((line, idx) => {
            const screen = worldToScreen(line.labelMm, viewport);
            // Round 15 (Fix 7): when the measurement line has a `kind`,
            // prefix the label with a one-word descriptor so the mason
            // can tell apart the 4 placement measurements (left margin,
            // right margin, back setback, front clearance). Generic
            // cardinal-ray lines (no kind) render as bare "N mm".
            const text = line.kind
              ? `${LINE_KIND_LABEL[line.kind]} ${Math.round(line.distanceMm)} mm`
              : `${Math.round(line.distanceMm)} mm`;
            return (
              <MeasurementLabel
                key={`meas-label-${idx}-${line.distanceMm.toFixed(0)}`}
                text={text}
                screenX={screen.x}
                screenY={screen.y}
              />
            );
          })}
        {measurementMode &&
          edgeSubdivisions.flatMap((sub) =>
            sub.segments.length <= 1
              ? []
              : sub.segments.map((seg, idx) => {
                  const screen = worldToScreen(seg.midpointMm, viewport);
                  const text = seg.feature
                    ? `${featureKindShortLabel(seg.feature.kind)} ${Math.round(seg.lengthMm)} mm`
                    : `${Math.round(seg.lengthMm)} mm`;
                  return (
                    <MeasurementLabel
                      key={`meas-sub-${sub.edgeId}-${idx}`}
                      text={text}
                      screenX={screen.x}
                      screenY={screen.y}
                      emphasis={seg.feature ? "feature" : "default"}
                    />
                  );
                }),
          )}

        {/* Round 11 (Fix 1) — interactive HTML angle label for the
            selected vertex. Suppressed during an active drag snap so
            the Konva-side snap badge owns the visual feedback. */}
        {selectedVertexId &&
          !vertexSnapIndicator &&
          onSetVertexAngle &&
          !smoothCurveVertexIds.has(selectedVertexId) &&
          (() => {
            const v = piece.vertices.find((x) => x.id === selectedVertexId);
            if (!v) return null;
            const anchor = computeAngleLabelAnchor(
              piece,
              v,
              viewport.mmPerPx,
            );
            if (!anchor) return null;
            const screenX =
              (anchor.worldX - viewport.panMmX) / viewport.mmPerPx;
            const screenY =
              (anchor.worldY - viewport.panMmY) / viewport.mmPerPx;
            return (
              <AngleLabel
                angleDeg={anchor.angleDeg}
                screenX={screenX}
                screenY={screenY}
                colour={angleColourBand(anchor.angleDeg)}
                onSetAngle={(newAngleDeg) =>
                  onSetVertexAngle(selectedVertexId, newAngleDeg)
                }
              />
            );
          })()}

        {/* Round 11 (Fix 2) — canvas-level angle-integrity banner.
            Fires when the polygon's angle sum is off by more than
            half a degree. Clicking the banner selects the worst
            vertex; the "Auto-correct" button distributes the error. */}
        {(() => {
          const integrity = checkAngleIntegrity(piece);
          if (Math.abs(integrity.discrepancyDeg) <=
              ANGLE_INTEGRITY_BANNER_THRESHOLD_DEG) {
            return null;
          }
          return (
            <div
              className="pointer-events-auto absolute left-1/2 top-3 z-20 -translate-x-1/2"
              role="status"
            >
              <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50/95 px-3 py-1.5 text-xs text-amber-900 shadow">
                <span aria-hidden="true">⚠</span>
                <span>
                  Geometry:{" "}
                  {formatAngleDisplay(Math.abs(integrity.discrepancyDeg))}{" "}
                  angular discrepancy
                </span>
                {integrity.worstVertexId && (
                  <button
                    type="button"
                    onClick={() => onSelectVertex(integrity.worstVertexId!)}
                    className="rounded border border-amber-400 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:border-amber-500 hover:bg-amber-100"
                  >
                    Find worst corner
                  </button>
                )}
                {onCorrectAngles && (
                  <button
                    type="button"
                    onClick={onCorrectAngles}
                    className="rounded border border-amber-500 bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-200"
                  >
                    Auto-correct
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        {/* Vertex coordinate tooltip — shows during hover and drag.
            CanvasTooltip handles its own 400 ms appear delay. */}
        {vertexHover && vertexHoverScreen && (
          <CanvasTooltip
            visible
            anchorScreenX={vertexHoverScreen.x}
            anchorScreenY={vertexHoverScreen.y - 8}
            lines={vertexTooltipLines}
          />
        )}

        {/* Edge tooltip — appears after 400 ms hover (delay owned by
            CanvasTooltip itself; no outer compounding timer). */}
        {edgeTooltipScreen && (
          <CanvasTooltip
            visible={edgeHoverId !== null}
            anchorScreenX={edgeTooltipScreen.x}
            anchorScreenY={edgeTooltipScreen.y}
            lines={edgeTooltipLines}
          />
        )}

        {/* Feature tooltip — appears after 400 ms hover. */}
        {featureHoverId && featureHoverScreen && (
          <CanvasTooltip
            visible
            anchorScreenX={featureHoverScreen.x}
            anchorScreenY={featureHoverScreen.y - 8}
            lines={featureTooltipLines}
          />
        )}

        {/* Round 6 (Fix 4) — join indicator tooltip. */}
        {joinTooltip && (
          <CanvasTooltip
            visible
            anchorScreenX={joinTooltip.screen.x}
            anchorScreenY={joinTooltip.screen.y - 8}
            lines={joinTooltip.lines}
          />
        )}

        {/* Round 6 (Fix 4) — inactive ghost piece tooltip. */}
        {ghostTooltip && (
          <CanvasTooltip
            visible
            anchorScreenX={ghostTooltip.screen.x}
            anchorScreenY={ghostTooltip.screen.y - 8}
            lines={ghostTooltip.lines}
          />
        )}

        {/* Round 16 (Fix 3) — the always-on selected-edge profile pill
            was retired. See the comment alongside the `selectedEdgeLabel`
            removal upstream. */}
      </div>

      <ZoomControls
        mmPerPx={viewport.mmPerPx}
        onZoomIn={() =>
          setViewport((v) => {
            const next = clampNumber(
              v.mmPerPx / ZOOM_STEP_MULTIPLIER,
              ZOOM_MIN_MM_PER_PX,
              ZOOM_MAX_MM_PER_PX,
            );
            return { ...v, mmPerPx: next };
          })
        }
        onZoomOut={() =>
          setViewport((v) => {
            const next = clampNumber(
              v.mmPerPx * ZOOM_STEP_MULTIPLIER,
              ZOOM_MIN_MM_PER_PX,
              ZOOM_MAX_MM_PER_PX,
            );
            return { ...v, mmPerPx: next };
          })
        }
        onFit={() =>
          setViewport(fitViewport(piece, size.width, size.height))
        }
        {...(onToggleFullScreen !== undefined
          ? {
              onToggleFullScreen,
              fullScreen: fullScreen ?? false,
            }
          : {})}
        {...(onToggleGrid !== undefined
          ? { onToggleGrid, gridVisible }
          : {})}
        {...(onToggleMeasurement !== undefined
          ? {
              onToggleMeasurement,
              measurementVisible: measurementMode,
            }
          : {})}
        {...(onToggleAngles !== undefined
          ? { onToggleAngles, anglesVisible }
          : {})}
      />

      {toolMode.kind === "feature-place" && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-cinnabar-700 bg-cinnabar-500/95 px-3 py-1.5 font-mono text-xs text-stone-50 shadow-md">
          {placementInvalid
            ? buildPlacementRejectionMessage(
                toolMode.featureKind,
                placementPreview,
              )
            : placementPreview
              ? `Click to place: ${toolMode.featureKind}`
              : toolMode.featureKind === "custom-cutout"
                ? "Click anywhere inside the polygon"
                : "Move closer to a valid edge"}
        </div>
      )}
      {toolMode.kind === "insert-vertex" && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-cinnabar-700 bg-cinnabar-500/95 px-3 py-1.5 font-mono text-xs text-stone-50 shadow-md">
          Click on an edge to insert a vertex (or double-click in any mode).
        </div>
      )}
      {toolMode.kind === "recess-place" && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-cinnabar-700 bg-cinnabar-500/95 px-3 py-1.5 font-mono text-xs text-stone-50 shadow-md">
          Click on a wall edge to place a window recess.
        </div>
      )}
      {toolMode.kind === "add-arm-pick-edge" && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-cinnabar-700 bg-cinnabar-500/95 px-3 py-1.5 font-mono text-xs text-stone-50 shadow-md">
          Click an edge to extend a rectangular arm from.
        </div>
      )}
      {toolMode.kind === "structural-place" && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-cinnabar-700 bg-cinnabar-500/95 px-3 py-1.5 font-mono text-xs text-stone-50 shadow-md">
          Click anywhere inside the polygon to place a structural{" "}
          {toolMode.shape}.
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Snap guide line — refined: subtler stroke, slightly elevated glow.
// ─────────────────────────────────────────────────────────────────────────

interface SnapGuideLineProps {
  readonly edgeStart: { readonly x: number; readonly y: number };
  readonly edgeEnd: { readonly x: number; readonly y: number };
  readonly mmPerPx: number;
}

function SnapGuideLine(props: SnapGuideLineProps) {
  const { edgeStart, edgeEnd, mmPerPx } = props;
  // Round 5 (A4) — 3 px cinnabar stroke with a stronger glow so the
  // operator can clearly see which edge a feature will attach to.
  return (
    <Line
      points={[edgeStart.x, edgeStart.y, edgeEnd.x, edgeEnd.y]}
      stroke="#D63F1A"
      strokeWidth={3 * mmPerPx}
      shadowColor="#D63F1A"
      shadowBlur={8 * mmPerPx}
      shadowOpacity={0.75}
      listening={false}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Placement ghost — refined: thinner stroke + dash, semi-transparent fill.
// ─────────────────────────────────────────────────────────────────────────

interface PlacementGhostProps {
  readonly centreX: number;
  readonly centreY: number;
  readonly kind: Feature["kind"];
  readonly fits: boolean;
  readonly mmPerPx: number;
  /**
   * Round 9 (Issue 3) — rotate the ghost to match the snap target's
   * edge tangent so the operator sees the placement orientation before
   * committing. Defaults to 0 for axis-aligned edges and custom-cutout.
   */
  readonly rotationDeg?: number;
}

function PlacementGhost(props: PlacementGhostProps) {
  const { centreX, centreY, kind, fits, mmPerPx, rotationDeg = 0 } = props;
  const { widthMm, depthMm } = defaultBboxForKind(kind);
  const stroke = fits ? "#1D9E75" : "#D63F1A";
  const fill = fits ? "rgba(29, 158, 117, 0.10)" : "rgba(214, 63, 26, 0.10)";
  return (
    <Rect
      x={centreX}
      y={centreY}
      offsetX={widthMm / 2}
      offsetY={depthMm / 2}
      rotation={rotationDeg}
      width={widthMm}
      height={depthMm}
      stroke={stroke}
      strokeWidth={1.25 * mmPerPx}
      fill={fill}
      dash={[6 * mmPerPx, 4 * mmPerPx]}
      opacity={0.85}
      listening={false}
    />
  );
}

// Round 7A (FIX 2): when a feature won't fit, the banner reports the
// specific dimensions involved so the operator can see immediately what
// changed. Example: "Cooktop (600×520) won't fit — edge is only 400 mm long."
function buildPlacementRejectionMessage(
  kind: Feature["kind"],
  preview: SnapPreview | null,
): string {
  const { widthMm, depthMm } = defaultBboxForKind(kind);
  const featureLabel =
    kind === "cooktop-cutout"
      ? "Cooktop"
      : kind === "undermount-sink"
        ? "Undermount sink"
        : kind === "overmount-sink"
          ? "Overmount sink"
          : kind === "tap-hole"
            ? "Tap hole"
            : kind === "window-recess"
              ? "Window recess"
              : "Cutout";
  if (!preview) {
    return `${featureLabel} (${Math.round(widthMm)}×${Math.round(depthMm)}) won't fit here — try a longer edge`;
  }
  const edgeLenMm = Math.hypot(
    preview.edgeEnd.x - preview.edgeStart.x,
    preview.edgeEnd.y - preview.edgeStart.y,
  );
  return `${featureLabel} (${Math.round(widthMm)}×${Math.round(depthMm)}) won't fit here — the edge is only ${Math.round(edgeLenMm)} mm long`;
}

// ─────────────────────────────────────────────────────────────────────────
// VertexAngleArc — Round 9 (Issue 4 Level 2/Level 1) / Round 10 (Fix 3)
//
// Renders a small arc at a vertex with the interior angle. Two variants:
//   - "default"  thin colour-coded arc, for the always-on display when a
//                vertex is selected. Round 10 (Fix 3) adds the colour
//                coding so the operator can read corner status without
//                glancing at the right-hand panel:
//                  · blue   — within 0.5° of {45, 90, 135} (treated as
//                             exact for fabrication)
//                  · amber  — within 2° but more than 0.5° of those
//                             (matches the panel's "this is N° off X°"
//                             warning band)
//                  · white  — non-standard intentional angle (e.g. 60°
//                             on a hexagonal corner)
//                A near-180° "corner" is not a corner at all and renders
//                no arc (the polygon's edge is effectively straight
//                through this vertex).
//   - "snapped"  cinnabar, active during a vertex drag when the angle is
//                magnetised to a standard target.
// ─────────────────────────────────────────────────────────────────────────

/** Primary corner targets that trigger blue/amber colouring on the arc. */
const ARC_PRIMARY_TARGETS_DEG: readonly number[] = [45, 90, 135];

/**
 * Below this margin from 180° (or 0°) the vertex is effectively straight
 * and the angle arc is hidden — a quarter-circle drawn between two
 * collinear edges looks like noise.
 */
const ARC_STRAIGHT_EDGE_MARGIN_DEG = 1.0;

interface VertexAngleArcProps {
  readonly piece: Piece;
  readonly vertex: Vertex;
  readonly mmPerPx: number;
  readonly variant: "default" | "snapped";
  readonly overrideAngleDeg?: number;
  /**
   * Round 15 (Fix 5) — force the in-Konva degree label even on the
   * "default" variant. Used by the ANGLES-on overlay (the canvas
   * renders a non-interactive label at every vertex, distinct from
   * the clickable HTML AngleLabel that appears for the selected
   * vertex). The snap variant already shows its own label.
   */
  readonly showLabel?: boolean;
}

function VertexAngleArc(props: VertexAngleArcProps) {
  const {
    piece,
    vertex,
    mmPerPx,
    variant,
    overrideAngleDeg,
    showLabel: showLabelForced,
  } = props;

  // Find outer-ring neighbours.
  const ring = piece.outerRing.edges;
  let prev: Vertex | null = null;
  let next: Vertex | null = null;
  for (let i = 0; i < ring.length; i++) {
    const incomingId = ring[i]!;
    const outgoingId = ring[(i + 1) % ring.length]!;
    const incoming = piece.edges.find((e) => e.id === incomingId);
    const outgoing = piece.edges.find((e) => e.id === outgoingId);
    if (!incoming || !outgoing) continue;
    if (incoming.end === vertex.id && outgoing.start === vertex.id) {
      prev = piece.vertices.find((x) => x.id === incoming.start) ?? null;
      next = piece.vertices.find((x) => x.id === outgoing.end) ?? null;
      break;
    }
  }
  if (!prev || !next) return null;

  const angle =
    overrideAngleDeg ??
    interiorAngleAtPositionDeg(prev, next, vertex.x, vertex.y);
  if (angle === null) return null;

  // Round 10 (Fix 3) — skip the arc when the corner is effectively a
  // straight edge. A polygon ring vertex with interior angle ≈ 180°
  // (or ≈ 0° on a self-touch — defensively handled) is not a corner an
  // operator would inspect on the canvas, and drawing a hairline arc
  // across two collinear edges only adds visual clutter. The snap
  // (drag-time) variant still renders for the rare case where the snap
  // explicitly targets 0° / 180° via the law-of-sines locus.
  if (
    variant === "default" &&
    (angle >= 180 - ARC_STRAIGHT_EDGE_MARGIN_DEG ||
      angle <= ARC_STRAIGHT_EDGE_MARGIN_DEG)
  ) {
    return null;
  }

  // Tangent angles of the incoming (prev→vertex) and outgoing
  // (vertex→next) edges, in degrees relative to +x axis.
  const incomingDeg =
    (Math.atan2(vertex.y - prev.y, vertex.x - prev.x) * 180) / Math.PI;
  const outgoingDeg =
    (Math.atan2(next.y - vertex.y, next.x - vertex.x) * 180) / Math.PI;

  // Arc bisects the interior. The interior side is determined by the
  // sign of the cross product (vertex's cross > 0 → interior on left).
  // Konva.Arc rotation starts at angle 0 = +x axis and sweeps CW (in
  // screen y-down). We render the arc on the interior side by setting
  // `rotation` to the bisector direction's bearing minus half the
  // angle sweep.
  //
  // Bisector points from vertex INTO the interior. The two ray bearings
  // out of the vertex are:
  //   - back along incoming: incomingDeg + 180 (mod 360)
  //   - forward along outgoing: outgoingDeg
  // Interior bisector is the average (taking the SHORTER arc between them).
  const rayBackDeg = incomingDeg + 180;
  let sweep = outgoingDeg - rayBackDeg;
  // Normalise sweep to [-180, 180].
  while (sweep > 180) sweep -= 360;
  while (sweep < -180) sweep += 360;
  // Cross product to disambiguate interior side.
  const cross =
    (next.x - prev.x) * (vertex.y - prev.y) -
    (next.y - prev.y) * (vertex.x - prev.x);
  // If cross > 0 (vertex on left of AB), interior is on the "left" of
  // the path A → V → B. Konva angles increase CW in y-down. The arc
  // should sweep on the interior side.
  // Empirically: the arc starts at `rayBackDeg` and sweeps by `angle`
  // (the interior angle) toward `outgoingDeg`. The sign of sweep
  // depends on cross.
  const arcSweep = cross > 0 ? -angle : angle;
  const arcStart = cross > 0 ? rayBackDeg : rayBackDeg;

  const arcRadiusMm = Math.max(20, 24 * mmPerPx);

  // Round 10 (Fix 3) — angle-aware colour for the always-on arc. The
  // snap variant always uses cinnabar (it's reporting "magnet has
  // engaged"). The default variant grades the colour by the angle's
  // proximity to {45, 90, 135}:
  //   ≤ 0.5° off → blue, "exact for fabrication"
  //   ≤ 2°   off → amber, "this is close to X° but not exact"
  //   else       → white-stone, "this is an intentional non-standard
  //               angle, no warning needed"
  let primaryDelta = Infinity;
  for (const target of ARC_PRIMARY_TARGETS_DEG) {
    const d = Math.abs(angle - target);
    if (d < primaryDelta) primaryDelta = d;
  }
  const isExact = primaryDelta <= ANGLE_NO_WARN_THRESHOLD_DEG;
  const isWarning =
    !isExact && primaryDelta <= ANGLE_WARNING_THRESHOLD_DEG;
  let colour: string;
  if (variant === "snapped") {
    colour = "#D63F1A"; // cinnabar
  } else if (isExact) {
    colour = "#4A90D9"; // canvas-selection blue
  } else if (isWarning) {
    colour = "#EF9F27"; // amber — matches the panel warning chip
  } else {
    colour = "#FAFAF8"; // stone-50 — non-standard but intentional
  }
  const opacity = variant === "snapped" ? 0.9 : isWarning ? 0.85 : 0.6;
  const strokeWidthMm = (variant === "snapped" ? 1.5 : 1) * mmPerPx;

  // Label sits along the bisector, just past the arc.
  const bisectorDeg = arcStart + arcSweep / 2;
  const bisectorRad = (bisectorDeg * Math.PI) / 180;
  const labelOffsetMm = arcRadiusMm + 6 * mmPerPx;
  const labelX = vertex.x + Math.cos(bisectorRad) * labelOffsetMm;
  const labelY = vertex.y + Math.sin(bisectorRad) * labelOffsetMm;
  const labelW = 36 * mmPerPx;
  const labelH = 14 * mmPerPx;

  // Round 11 (Fix 1) — the clickable HTML `<AngleLabel>` overlay
  // replaces the Konva text for the always-on (selected-vertex)
  // display. The "snapped" variant is transient during a drag, so it
  // keeps the in-canvas Konva label — opening an HTML input mid-drag
  // would be jarring.
  const showKonvaLabel = variant === "snapped" || showLabelForced === true;

  return (
    <>
      <Arc
        x={vertex.x}
        y={vertex.y}
        innerRadius={arcRadiusMm}
        outerRadius={arcRadiusMm}
        angle={Math.abs(arcSweep)}
        rotation={arcSweep < 0 ? arcStart + arcSweep : arcStart}
        stroke={colour}
        strokeWidth={strokeWidthMm}
        opacity={opacity}
        listening={false}
      />
      {showKonvaLabel && (
        <KText
          x={labelX - labelW / 2}
          y={labelY - labelH / 2}
          width={labelW}
          height={labelH}
          align="center"
          verticalAlign="middle"
          text={formatAngleDisplay(angle)}
          fontSize={10 * mmPerPx}
          fontFamily="var(--font-mono), monospace"
          fontStyle="500"
          fill={colour}
          opacity={opacity}
          listening={false}
        />
      )}
    </>
  );
}

/**
 * Round 11 (Fix 1) — shared bisector projection for the angle label.
 *
 * Returns the world-space point at which the HTML `<AngleLabel>`
 * overlay should be anchored — same offset along the angle bisector
 * as the legacy in-Konva text label, so the new overlay sits where
 * the operator already expects to read the degree value.
 *
 * Returns null when the vertex isn't on the outer ring or the angle
 * collapses (straight edge, zero-length neighbour).
 */
function computeAngleLabelAnchor(
  piece: Piece,
  vertex: Vertex,
  mmPerPx: number,
): { readonly worldX: number; readonly worldY: number; readonly angleDeg: number } | null {
  const ring = piece.outerRing.edges;
  let prev: Vertex | null = null;
  let next: Vertex | null = null;
  for (let i = 0; i < ring.length; i++) {
    const incomingId = ring[i]!;
    const outgoingId = ring[(i + 1) % ring.length]!;
    const incoming = piece.edges.find((e) => e.id === incomingId);
    const outgoing = piece.edges.find((e) => e.id === outgoingId);
    if (!incoming || !outgoing) continue;
    if (incoming.end === vertex.id && outgoing.start === vertex.id) {
      prev = piece.vertices.find((x) => x.id === incoming.start) ?? null;
      next = piece.vertices.find((x) => x.id === outgoing.end) ?? null;
      break;
    }
  }
  if (!prev || !next) return null;

  const angle = interiorAngleAtPositionDeg(prev, next, vertex.x, vertex.y);
  if (angle === null) return null;
  if (angle >= 180 - 1 || angle <= 1) return null;

  const incomingDeg =
    (Math.atan2(vertex.y - prev.y, vertex.x - prev.x) * 180) / Math.PI;
  const outgoingDeg =
    (Math.atan2(next.y - vertex.y, next.x - vertex.x) * 180) / Math.PI;
  const rayBackDeg = incomingDeg + 180;
  let sweep = outgoingDeg - rayBackDeg;
  while (sweep > 180) sweep -= 360;
  while (sweep < -180) sweep += 360;
  const cross =
    (next.x - prev.x) * (vertex.y - prev.y) -
    (next.y - prev.y) * (vertex.x - prev.x);
  const arcSweep = cross > 0 ? -angle : angle;
  const arcStart = rayBackDeg;
  const arcRadiusMm = Math.max(20, 24 * mmPerPx);
  const bisectorDeg = arcStart + arcSweep / 2;
  const bisectorRad = (bisectorDeg * Math.PI) / 180;
  // Push the HTML label slightly further out than the Konva variant
  // so the readable text doesn't overlap the arc stroke.
  const labelOffsetMm = arcRadiusMm + 14 * mmPerPx;
  return {
    worldX: vertex.x + Math.cos(bisectorRad) * labelOffsetMm,
    worldY: vertex.y + Math.sin(bisectorRad) * labelOffsetMm,
    angleDeg: angle,
  };
}

/**
 * Round 11 (Fix 1) — map a per-vertex interior angle to the
 * canvas-label colour band. Mirrors the palette in VertexAngleArc so
 * the HTML overlay and the Konva arc stay visually paired.
 */
function angleColourBand(angleDeg: number): AngleLabelColour {
  let primaryDelta = Infinity;
  for (const target of ARC_PRIMARY_TARGETS_DEG) {
    const d = Math.abs(angleDeg - target);
    if (d < primaryDelta) primaryDelta = d;
  }
  if (primaryDelta <= ANGLE_NO_WARN_THRESHOLD_DEG) return "blue";
  if (primaryDelta <= ANGLE_WARNING_THRESHOLD_DEG) return "amber";
  return "white";
}

/**
 * Round 9 (Issue 3) — Derive the rotation a feature should render with,
 * in degrees. The rotation aligns the feature's local frame with the
 * tangent of its reference edge. Custom-cutout has no reference edge,
 * so it always renders axis-aligned. Features without a tracked
 * placement (e.g. legacy Vision-extracted features) fall back to
 * bootstrap — the same path the resize handles already use.
 */
function rotationForFeature(
  piece: Piece,
  feature: Feature,
  placements: ReadonlyMap<FeatureId, FeaturePlacement>,
): number {
  if (feature.kind === "custom-cutout") return 0;
  const placement =
    placements.get(feature.id) ??
    bootstrapPlacementFromPosition(piece, feature) ??
    null;
  if (!placement) return 0;
  return (edgeAngleRad(piece, placement.referenceEdgeId) * 180) / Math.PI;
}

function defaultBboxForKind(kind: Feature["kind"]): {
  widthMm: number;
  depthMm: number;
} {
  switch (kind) {
    case "undermount-sink":
      return { widthMm: 760, depthMm: 450 };
    case "overmount-sink":
      return { widthMm: 760, depthMm: 450 };
    case "cooktop-cutout":
      return { widthMm: 600, depthMm: 520 };
    case "tap-hole":
      return { widthMm: 35, depthMm: 35 };
    case "window-recess":
      return { widthMm: 900, depthMm: 100 };
    case "custom-cutout":
      return { widthMm: 200, depthMm: 200 };
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

// Round 6 (Fix 4) — readable join-kind label for the join tooltip.
// Round 7A: aligned to V3 UPPER_SNAKE_CASE JoinKind literals. The display
// strings stay Australian English title-cased — the literal change is
// schema-internal.
function joinKindLabel(kind: Join["kind"]): string {
  switch (kind) {
    case "BUTT":
      return "Straight butt";
    case "MITRE":
      return "Mitre";
    case "MASON_MITRE":
      return "Mason mitre";
    case "FIELD_JOIN":
      return "Field join";
  }
}

// Round 6 (Fix 4) — readable piece-role label for the ghost tooltip.
function pieceRoleLabel(role: Piece["pieceRole"]): string {
  switch (role) {
    case "BENCHTOP":
      return "Benchtop";
    case "ISLAND_TOP":
      return "Island top";
    case "WATERFALL_END":
      return "Waterfall end";
    case "SPLASHBACK_FULL":
      return "Splashback (full)";
    case "SPLASHBACK_LOW":
      return "Splashback (low)";
    case "UPSTAND":
      return "Upstand";
    case "END_PANEL":
      return "End panel";
    case "WINDOWSILL":
      return "Windowsill";
    case "TOP":
      return "Build-up top";
    case "FASCIA":
      return "Build-up fascia";
    case "RETURN":
      return "Build-up return";
    case "INFILL":
      return "Build-up infill";
    case "CUSTOM":
      return "Custom";
  }
}

// Round 14 (Section B) — short label per feature kind for the
// edge-subdivision dimensions (renders inside a measurement pill at
// 10px, so brevity matters).
function featureKindShortLabel(kind: Feature["kind"]): string {
  switch (kind) {
    case "undermount-sink":
      return "sink";
    case "overmount-sink":
      return "sink";
    case "cooktop-cutout":
      return "cooktop";
    case "tap-hole":
      return "tap";
    case "window-recess":
      return "recess";
    case "custom-cutout":
      return "cutout";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

// Round 5 — display label per feature kind (used by feature hover tooltip).
function featureKindLabel(kind: Feature["kind"]): string {
  switch (kind) {
    case "undermount-sink":
      return "Undermount sink";
    case "overmount-sink":
      return "Overmount sink";
    case "cooktop-cutout":
      return "Cooktop";
    case "tap-hole":
      return "Tap hole";
    case "window-recess":
      return "Window recess";
    case "custom-cutout":
      return "Custom cutout";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

// Round 5 — bbox area used to sort features so smaller features render on
// top of larger ones (a tap-hole on top of a sink). Larger area renders
// first (below). Returns Infinity for the custom-cutout fallback so they
// stay at the bottom.
function featureBboxArea(feature: Feature): number {
  switch (feature.kind) {
    case "undermount-sink":
      return feature.bowlWidthMm * feature.bowlDepthMm;
    case "overmount-sink":
    case "cooktop-cutout":
      return feature.cutoutWidthMm * feature.cutoutDepthMm;
    case "tap-hole":
      return feature.diameterMm * feature.diameterMm;
    case "window-recess":
      return feature.widthMm * feature.intrusionMm;
    case "custom-cutout": {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const pt of feature.outline) {
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
      }
      const w = Number.isFinite(minX) ? maxX - minX : 0;
      const h = Number.isFinite(minY) ? maxY - minY : 0;
      return Math.max(0, w * h);
    }
    default: {
      const _exhaustive: never = feature;
      return _exhaustive;
    }
  }
}
