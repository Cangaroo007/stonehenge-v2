"use client";

// apps/web/src/hooks/usePiece.ts
//
// Single source of truth for the editor's polygon state.
//
// Architecture (Phase 2A audit, with Sean's `Job`-level state amendment;
// Phase 2B audit UNCERTAIN-2B-3 [A] adds the APPLY_NL_CHANGES action and
// markup-aware snapshots):
//
//   - State wraps a `Job` plus an `activePieceIndex` plus a markupPercent.
//     Phase 2A always has one piece in the array; the Job container exists
//     so multi-photo stitching (Phase 2B) does not require a state-model
//     rewrite.
//   - All polygon mutations go through this reducer. No other place in the
//     editor code mutates polygon state — vertex drag from Konva, edge
//     profile changes from the panel, NL command application from
//     Phase 2B all dispatch actions here.
//   - Every mutation runs `validatePiece()` on the active piece. If
//     validation fails the action is rejected and the previous state is
//     returned untouched.
//   - Vertex moves call `moveVertex` from `@stonehenge-proto/geometry`,
//     which preserves edge IDs and metadata — the V2 regression contract.
//   - History stores full `EditorSnapshot`s (job + markupPercent). One NL
//     command = one snapshot, so Cmd-Z reverts the whole "extend back
//     edge by 200 mm". Cap is HISTORY_CAP (50, per Phase 2A audit
//     UNCERTAIN-13 [A]); oldest entries are evicted when the cap is hit.

import { useCallback, useMemo, useReducer } from "react";

import {
  computeRoundEndCurve,
  generateBuildUpPieces,
  insertVertexAtMidpoint as insertVertexAtMidpointOp,
  insertVertexOnEdge as insertVertexOnEdgeOp,
  isValidCornerRadius,
  moveVertex as moveVertexOp,
  removeVertex as removeVertexOp,
  setEdgeCurve as setEdgeCurveOp,
  setEdgeExposure as setEdgeExposureOp,
  setEdgeProfile as setEdgeProfileOp,
  setVertexAngle as setVertexAngleOp,
  setVertexCornerRadius as setVertexCornerRadiusOp,
  validatePiece,
} from "@stonehenge-proto/geometry";
import type {
  BuildUpDescriptor,
  Edge,
  EdgeExposure,
  EdgeId,
  EdgeProfile,
  Feature,
  FeatureId,
  Job,
  Join,
  Piece,
  PieceId,
  Vertex,
  VertexId,
} from "@stonehenge-proto/geometry";

import { addArm } from "../lib/add-arm";
import {
  checkAngleIntegrity,
  computeAngleCorrections,
} from "../lib/angle-integrity";
import { computeVertexMoveForEdgeLength } from "../lib/edge-length-edit";
import {
  bootstrapPlacementFromPosition,
  clampFeatureToBounds,
  computeFeaturePosition,
  featureBboxMm,
  featureFitsInPiece,
} from "../lib/feature-placement";
import { recomputeAttachedChildren } from "../lib/secondary-pieces";
import {
  isStructuralFixture,
  resizeStructuralOutline,
} from "../lib/structural-cutout-ops";
import {
  createWindowRecess as createWindowRecessOp,
} from "../lib/window-recess-ops";
import type {
  EditorSnapshot,
  EditorState,
  FeaturePlacement,
  FixtureMetadata,
  RecessGroup,
  RecessId,
  ToolMode,
} from "../types/editor";
import { DEFAULT_MARKUP_PERCENT, selectActivePiece } from "../types/editor";

export const HISTORY_CAP = 50;

// Round 15 (Fix 1): canonical empty-set sentinel for `selectedVertexIds`.
// Frozen so accidental mutations elsewhere blow up at runtime.
const EMPTY_VERTEX_SET: ReadonlySet<VertexId> = Object.freeze(
  new Set<VertexId>(),
) as ReadonlySet<VertexId>;

// ─────────────────────────────────────────────────────────────────────────
// Action union
// ─────────────────────────────────────────────────────────────────────────

export type EditorAction =
  | {
      readonly type: "MOVE_VERTEX";
      readonly vertexId: VertexId;
      readonly x: number;
      readonly y: number;
    }
  | { readonly type: "SELECT_EDGE"; readonly edgeId: EdgeId | null }
  | {
      readonly type: "SELECT_FEATURE";
      readonly featureId: FeatureId | null;
    }
  | {
      readonly type: "SELECT_VERTEX";
      readonly vertexId: VertexId | null;
    }
  | { readonly type: "CLEAR_SELECTION" }
  | {
      readonly type: "SET_EDGE_PROFILE";
      readonly edgeId: EdgeId;
      readonly profile: EdgeProfile;
    }
  | {
      /**
       * Round 16 (Fix 4) — apply the same profile to every edge in a
       * supplied set in ONE snapshot. Used by the curved-edge group
       * selection: clicking any segment of a circle template selects
       * all curved edges and a single panel change updates them all
       * with one undo entry. The reducer chains `setEdgeProfileOp` for
       * each edge ID; the final piece runs through `validatePiece` via
       * `applyToActivePiece`.
       */
      readonly type: "SET_EDGE_PROFILE_BATCH";
      readonly edgeIds: readonly EdgeId[];
      readonly profile: EdgeProfile;
    }
  | {
      readonly type: "SET_EDGE_EXPOSURE";
      readonly edgeId: EdgeId;
      readonly exposure: EdgeExposure;
    }
  | {
      /**
       * Set an edge's length by sliding its END vertex along the edge
       * direction. Anchors the START vertex; the adjacent edge sharing
       * the END vertex updates implicitly. The reducer rejects the
       * action if the new length is invalid (`computeVertexMoveForEdgeLength`
       * returns null) or if the resulting piece fails `validatePiece`.
       */
      readonly type: "SET_EDGE_LENGTH";
      readonly edgeId: EdgeId;
      readonly newLengthMm: number;
    }
  | { readonly type: "SET_MATERIAL"; readonly materialId: string }
  | {
      readonly type: "ADD_FEATURE";
      readonly feature: Feature;
      /**
       * Optional edge-referenced placement for the feature. Palette and
       * snap-driven placements supply this; legacy callers (Vision
       * extraction, NL commands) omit it and the feature falls back to
       * raw `position` rendering until first drag (UNCERTAIN-8 [A]).
       */
      readonly placement?: FeaturePlacement;
      /**
       * Round 2 — fixture catalogue. Picker placements supply this. Omitted
       * for legacy/extraction paths.
       */
      readonly fixtureMetadata?: FixtureMetadata;
    }
  | {
      /**
       * Round 2 — atomic placement of multiple features in one undo entry.
       * Used by the FixturePicker when a sink ships with bench_holes that
       * auto-place a tap. Validates the cumulative result; rejects the
       * entire batch if any feature fails to fit.
       */
      readonly type: "ADD_FEATURES_BATCH";
      readonly features: readonly Feature[];
      readonly placements: ReadonlyMap<FeatureId, FeaturePlacement>;
      readonly fixtureMetadata: ReadonlyMap<FeatureId, FixtureMetadata>;
    }
  | {
      readonly type: "REMOVE_FEATURE";
      readonly featureId: FeatureId;
    }
  | {
      /**
       * Move a feature to a new edge-referenced placement. The reducer
       * computes the new centre from the placement, validates the resulting
       * piece, and commits one snapshot (single undo entry per drag).
       */
      readonly type: "MOVE_FEATURE";
      readonly featureId: FeatureId;
      readonly placement: FeaturePlacement;
    }
  | {
      /**
       * Resize a feature in place. New dimensions are applied to the
       * feature's kind-specific size fields (bowl/cutout/diameter/
       * width-intrusion). The reducer re-validates fit against the
       * existing placement (if any) and rejects if the feature no longer
       * fits or the new dimensions are below the kind's minimum.
       */
      readonly type: "RESIZE_FEATURE";
      readonly featureId: FeatureId;
      readonly widthMm: number;
      readonly depthMm: number;
    }
  | {
      /**
       * Round 5 (A3) — atomic resize + along-edge centre shift. Used by
       * Shift-held window-recess width drags so only the dragged side
       * moves and the opposite side stays anchored. Folds into the same
       * undo entry as plain RESIZE_FEATURE (mergeWithTop) when the same
       * feature is being resized.
       */
      readonly type: "RESIZE_AND_SHIFT_FEATURE";
      readonly featureId: FeatureId;
      readonly widthMm: number;
      readonly depthMm: number;
      readonly alongShiftMm: number;
    }
  | { readonly type: "SET_TOOL_MODE"; readonly toolMode: ToolMode }
  | { readonly type: "SET_MARKUP"; readonly markupPercent: string }
  | {
      /**
       * Atomic apply of a pre-computed NL refinement. The caller (the
       * ConfirmationPanel) invokes `applyChangesToPiece` to compute the
       * delta for preview, and on Accept dispatches this action with the
       * already-computed `nextPiece` and `nextMarkupPercent`. The reducer
       * validates and commits one snapshot — one NL command, one undo
       * entry. (UNCERTAIN-2B-3 [A].)
       */
      readonly type: "APPLY_NL_CHANGES";
      readonly nextPiece: Piece;
      readonly nextMarkupPercent: string;
    }
  | {
      /**
       * Round 9 (Issue 7) — replace a feature's fixture metadata. Used by
       * the FeaturePropertiesPanel when the operator changes the cutout
       * edge profile on an existing sink/cooktop. The metadata payload
       * replaces the existing entry wholesale (the panel reads the
       * current metadata and dispatches the modified copy). The reducer
       * snapshots so undo reverts the change.
       *
       * No-ops when `featureId` is not present on the active piece.
       */
      readonly type: "SET_FIXTURE_METADATA";
      readonly featureId: FeatureId;
      readonly metadata: FixtureMetadata;
    }
  | { readonly type: "UNDO" }
  | { readonly type: "REDO" }
  | { readonly type: "LOAD_PIECE"; readonly piece: Piece }
  // ───── Round-3A actions ─────
  | {
      /**
       * Insert a vertex on an existing edge. Wraps `splitEdge` (per
       * UNCERTAIN-1 [A]). The point is projected onto the edge.
       */
      readonly type: "INSERT_VERTEX";
      readonly edgeId: EdgeId;
      readonly pointMm: { readonly x: number; readonly y: number };
    }
  | {
      readonly type: "INSERT_VERTEX_MIDPOINT";
      readonly edgeId: EdgeId;
    }
  | {
      readonly type: "REMOVE_VERTEX";
      readonly vertexId: VertexId;
    }
  | {
      readonly type: "SET_CORNER_RADIUS";
      readonly vertexId: VertexId;
      readonly radiusMm: number;
    }
  | {
      /**
       * Round 15 (Fix 1) — multi-vertex toggle for Ctrl+Shift+click
       * selection. Adds the vertex to `selectedVertexIds` (or removes
       * it if already present). The "primary" `selectedVertexId` is
       * updated to the toggled vertex when added; on removal it stays
       * on the previous primary unless that primary was the one removed
       * — in which case it picks any remaining member, or null.
       */
      readonly type: "TOGGLE_VERTEX_SELECTION";
      readonly vertexId: VertexId;
    }
  | {
      /**
       * Round 15 (Fix 1) — apply the same corner radius to every vertex
       * in `vertexIds` in a single snapshot, so the multi-corner change
       * lands as ONE undo entry. Vertices that fail the
       * `isValidCornerRadius` check (radius too large for the adjacent
       * edges at that corner) are silently skipped — the batch doesn't
       * abort on a single rejection because the operator may genuinely
       * want to "R50 every corner that can take an R50".
       */
      readonly type: "SET_MULTI_CORNER_RADIUS";
      readonly vertexIds: ReadonlySet<VertexId>;
      readonly radiusMm: number;
    }
  | {
      readonly type: "SET_VERTEX_ANGLE";
      readonly vertexId: VertexId;
      readonly angleDeg: number;
    }
  | {
      /**
       * Round 11 (Fix 2) — batch-correct every outer-ring vertex so the
       * polygon's interior-angle sum returns to `(n − 2) × 180°`. The
       * reducer computes the integrity check, distributes the discrepancy
       * proportionally, and applies each correction through
       * `setVertexAngle` so the entire fix lands in one snapshot/undo
       * entry. No-op when the polygon is already within tolerance.
       */
      readonly type: "CORRECT_ANGLES";
    }
  | {
      /**
       * Toggle a round end on an edge. When `enabled = true` the edge's
       * `curve` is set to a semicircular arc (radius = chord/2);
       * when `enabled = false` the curve is cleared.
       */
      readonly type: "SET_ROUND_END";
      readonly edgeId: EdgeId;
      readonly enabled: boolean;
      /** Bulge direction; defaults to "right". */
      readonly bulge?: "left" | "right";
    }
  | {
      /**
       * Create a window recess on a wall edge. Atomic: 4 new vertices
       * + 5 new edges in one undo entry. Stores a RecessGroup on the
       * snapshot so removal can reverse it.
       */
      readonly type: "CREATE_WINDOW_RECESS";
      readonly wallEdgeId: EdgeId;
      readonly offsetMm: number;
      readonly widthMm: number;
      readonly depthMm: number;
    }
  | {
      readonly type: "REMOVE_WINDOW_RECESS";
      readonly recessId: RecessId;
    }
  | {
      /**
       * Round 10 (Fix 4) — add a rectangular arm to the active piece by
       * mutating its outer-ring topology. The reducer applies `addArm`
       * (apps/web/src/lib/add-arm.ts), validates the result, and commits
       * one snapshot so undo reverts the entire arm in a single step.
       *
       * Rejection paths (state unchanged):
       *   * `addArm` returns null (invalid dimensions / offset overshoot
       *     / topology failure)
       *   * `validatePiece` rejects the resulting piece (shouldn't happen
       *     — `addArm` validates internally — but the reducer double-checks)
       */
      readonly type: "ADD_ARM";
      readonly edgeId: EdgeId;
      readonly widthMm: number;
      readonly lengthMm: number;
      readonly offsetAlongEdgeMm: number;
    }
  // ───── Round-3B actions ─────
  | {
      /**
       * Add a secondary piece to the Job (waterfall, splashback, upstand,
       * end panel, windowsill). The caller pre-builds the Piece + Joins
       * that anchor it, the reducer validates every piece, appends, and
       * snapshots.
       */
      readonly type: "ADD_PIECE";
      readonly piece: Piece;
      readonly joinsToAdd: readonly Join[];
      /**
       * Round 16 (Fix 2) — optional profile updates to apply to the
       * ACTIVE (parent) piece atomically with the new-piece add. Used
       * by mitred join styles (waterfall/end-panel always; mitred
       * splashback opt-in) so the parent's attach edge and the new
       * piece's join-face land on the same profile in a single undo
       * entry. Empty / undefined means "don't touch the parent."
       */
      readonly parentEdgeProfileUpdates?: readonly {
        readonly edgeId: EdgeId;
        readonly profile: EdgeProfile;
      }[];
    }
  | {
      readonly type: "REMOVE_PIECE";
      readonly pieceId: PieceId;
    }
  | {
      readonly type: "SET_ACTIVE_PIECE";
      readonly index: number;
    }
  | {
      readonly type: "SELECT_BUILD_UP_EDGE";
      readonly edgeId: EdgeId | null;
    }
  | {
      /**
       * Attach (or clear, when buildUp === null) a build-up descriptor on
       * an edge. On attach the reducer also synthesises the child pieces
       * via `generateBuildUpPieces` and appends them to `job.pieces`; on
       * clear it removes children whose `parentPieceId === activePiece.id`
       * and which were generated for the same edge length / strip width.
       */
      readonly type: "SET_EDGE_BUILD_UP";
      readonly edgeId: EdgeId;
      readonly buildUp: BuildUpDescriptor | null;
    }
  | {
      /**
       * Round 18 (Fix 3) — scale every vertex of the active piece around
       * `centroid` by `scale`. Edge arc radii (`curve.radiusMm`) and any
       * `cornerRadiusMm` are scaled by the same factor so a circle stays
       * a circle and any R25/R50/R100 fillets keep their visual size
       * relative to the polygon.
       *
       * Used by the editable diameter label on fully-curved (circle)
       * pieces: the operator types a new diameter, the canvas computes
       * `scale = newDiameter / currentDiameter` and the centroid, and
       * the whole transform lands in ONE undo entry.
       *
       * Rejection paths (state unchanged):
       *   * `scale` not finite or `scale <= 0`
       *   * resulting piece fails `validatePiece`
       */
      readonly type: "SCALE_PIECE";
      readonly scale: number;
      readonly centroid: { readonly x: number; readonly y: number };
    };

// ─────────────────────────────────────────────────────────────────────────
// Reducer
// ─────────────────────────────────────────────────────────────────────────

function applyToActivePiece(
  state: EditorState,
  mutate: (piece: Piece) => Piece | null,
): EditorState {
  const piece = selectActivePiece(state);
  const nextPiece = mutate(piece);
  if (!nextPiece) return state;
  const validation = validatePiece(nextPiece);
  if (!validation.valid) return state;
  // Replace the active piece in the job array.
  const updatedActivePieces = state.job.pieces.map((p, i) =>
    i === state.activePieceIndex ? nextPiece : p,
  );
  // Round 7A (2-Gap-1): recompute any anchored child piece (waterfall,
  // splashback, etc.) whose vertices were laid out against the OLD
  // parent's edge endpoints. We pass the OLD parent (`piece`) so the
  // helper can read the OLD anchor edge to recover each child's
  // original extent before rebuilding against the NEW edge. Children
  // whose anchor edge no longer exists are reported as orphans; we
  // cascade-delete them and any joins touching them in the same
  // snapshot.
  const recompute = recomputeAttachedChildren(
    piece,
    nextPiece,
    updatedActivePieces,
    state.job.joins,
  );
  let nextPieces = recompute.pieces;
  let nextJoins = recompute.joins;
  if (recompute.orphanedChildIds.length > 0) {
    const orphaned = new Set(recompute.orphanedChildIds);
    nextPieces = nextPieces.filter((p) => !orphaned.has(p.id));
    nextJoins = nextJoins.filter(
      (j) => !orphaned.has(j.pieceA) && !orphaned.has(j.pieceB),
    );
  }
  const nextJob: Job = { ...state.job, pieces: nextPieces, joins: nextJoins };
  return commitSnapshot(state, {
    job: nextJob,
    markupPercent: state.markupPercent,
    featurePlacements: state.featurePlacements,
    fixtureMetadata: state.fixtureMetadata,
    recessGroups: state.recessGroups,
  });
}

function commitSnapshot(
  state: EditorState,
  snapshot: EditorSnapshot,
  options?: { readonly mergeWithTop?: boolean },
): EditorState {
  if (options?.mergeWithTop && state.history.length > 0) {
    // Replace the most recent snapshot rather than appending. Used by
    // RESIZE_FEATURE to keep one undo entry per drag, regardless of how
    // many frames the drag spans.
    const merged = state.history.slice(0, state.historyIndex);
    merged.push(snapshot);
    return {
      ...state,
      job: snapshot.job,
      markupPercent: snapshot.markupPercent,
      featurePlacements: snapshot.featurePlacements,
      fixtureMetadata: snapshot.fixtureMetadata,
      recessGroups: snapshot.recessGroups,
      history: merged,
      historyIndex: merged.length - 1,
    };
  }
  // Slice history up to (and including) the current index, then push.
  const truncated = state.history.slice(0, state.historyIndex + 1);
  const pushed = [...truncated, snapshot];
  const capped =
    pushed.length > HISTORY_CAP ? pushed.slice(pushed.length - HISTORY_CAP) : pushed;
  return {
    ...state,
    job: snapshot.job,
    markupPercent: snapshot.markupPercent,
    featurePlacements: snapshot.featurePlacements,
    fixtureMetadata: snapshot.fixtureMetadata,
    recessGroups: snapshot.recessGroups,
    history: capped,
    historyIndex: capped.length - 1,
  };
}

/**
 * Apply new dimensions to a feature, returning a new Feature with the
 * kind-specific size fields updated. Returns `null` if the dimensions are
 * below the kind's minimum (sinks/cooktops/recess: 100×100; tap-hole
 * diameter: 25–65; custom-cutout: only resizable when its fixture
 * metadata marks it as structural per Round-3A UNCERTAIN-8 [A]).
 *
 * `fixtureMetadata` is passed in so we can detect structural columns
 * (the only resizable custom-cutout kind).
 */
function resizeFeature(
  feature: Feature,
  widthMm: number,
  depthMm: number,
  fixtureMetadata: FixtureMetadata | undefined,
): Feature | null {
  switch (feature.kind) {
    case "undermount-sink":
      if (widthMm < 100 || depthMm < 100) return null;
      return { ...feature, bowlWidthMm: widthMm, bowlDepthMm: depthMm };
    case "overmount-sink":
      if (widthMm < 100 || depthMm < 100) return null;
      return { ...feature, cutoutWidthMm: widthMm, cutoutDepthMm: depthMm };
    case "cooktop-cutout":
      if (widthMm < 100 || depthMm < 100) return null;
      return { ...feature, cutoutWidthMm: widthMm, cutoutDepthMm: depthMm };
    case "tap-hole": {
      // Width and depth are both treated as the diameter — the resize handle
      // adjusts a single radial value (§4.3).
      const diameter = widthMm;
      if (diameter < 25 || diameter > 65) return null;
      return { ...feature, diameterMm: diameter };
    }
    case "window-recess":
      if (widthMm < 100 || depthMm < 100) return null;
      return { ...feature, widthMm, intrusionMm: depthMm };
    case "custom-cutout": {
      // Round-3A UNCERTAIN-8 [A]: structural custom-cutouts (columns,
      // poles) are resizable. Detect via fixture metadata.
      if (!isStructuralFixture(fixtureMetadata)) return null;
      if (widthMm < 50 || depthMm < 50) return null;
      // Round 7A (FIX 3): shape detection by outline length —
      // 4 = rectangle, 6 = L-shape, else circle (16-gon).
      const shape: "rectangle" | "l-shape" | "circle" =
        feature.outline.length === 4
          ? "rectangle"
          : feature.outline.length === 6
            ? "l-shape"
            : "circle";
      const newOutline = resizeStructuralOutline(
        feature,
        shape,
        widthMm,
        depthMm,
      );
      return { ...feature, outline: newOutline };
    }
    default: {
      const _exhaustive: never = feature;
      return _exhaustive;
    }
  }
}

/**
 * Compute the centre position for a feature given its placement. Returns
 * `null` if the placement's reference edge is missing or zero-length.
 */
function centreFromPlacement(
  piece: Piece,
  placement: FeaturePlacement,
  feature: Feature,
): { readonly x: number; readonly y: number } | null {
  const { depthMm } = featureBboxMm(feature);
  const pos = computeFeaturePosition(piece, placement, depthMm);
  if (!pos) return null;
  return { x: pos.centreX, y: pos.centreY };
}

/** Drop placements whose feature ID is no longer present in the piece. */
function prunePlacements(
  placements: ReadonlyMap<FeatureId, FeaturePlacement>,
  features: readonly Feature[],
): ReadonlyMap<FeatureId, FeaturePlacement> {
  const ids = new Set(features.map((f) => f.id));
  let changed = false;
  const next = new Map<FeatureId, FeaturePlacement>();
  for (const [id, p] of Array.from(placements.entries())) {
    if (ids.has(id)) next.set(id, p);
    else changed = true;
  }
  return changed ? next : placements;
}

/**
 * Drop fixture metadata whose feature ID is no longer present in the piece.
 * Mirrors `prunePlacements` — same map shape, same FeatureId key, same
 * lifecycle. Round 2 fixture catalogue (UNCERTAIN-A [A]).
 */
function pruneFixtureMetadata(
  metadata: ReadonlyMap<FeatureId, FixtureMetadata>,
  features: readonly Feature[],
): ReadonlyMap<FeatureId, FixtureMetadata> {
  const ids = new Set(features.map((f) => f.id));
  let changed = false;
  const next = new Map<FeatureId, FixtureMetadata>();
  for (const [id, m] of Array.from(metadata.entries())) {
    if (ids.has(id)) next.set(id, m);
    else changed = true;
  }
  return changed ? next : metadata;
}

export function reducer(state: EditorState, action: EditorAction): EditorState {
  const next = reducerInner(state, action);
  // Reset the resize-merge token on any non-RESIZE_FEATURE action. This
  // ensures the next resize drag starts a fresh undo entry, even if it
  // resizes the same feature again later. RESIZE_AND_SHIFT_FEATURE is
  // also a "resize step" — same undo-merge semantics.
  if (
    action.type !== "RESIZE_FEATURE" &&
    action.type !== "RESIZE_AND_SHIFT_FEATURE" &&
    next.resizingFeatureId !== null
  ) {
    return { ...next, resizingFeatureId: null };
  }
  return next;
}

function reducerInner(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "MOVE_VERTEX":
      return applyToActivePiece(state, (piece) =>
        moveVertexOp(piece, action.vertexId, action.x, action.y),
      );

    case "SELECT_EDGE":
      return {
        ...state,
        selectedEdgeId: action.edgeId,
        selectedFeatureId: null,
        selectedVertexId: null,
        selectedVertexIds: EMPTY_VERTEX_SET,
      };

    case "SELECT_FEATURE":
      return {
        ...state,
        selectedFeatureId: action.featureId,
        selectedEdgeId: null,
        selectedVertexId: null,
        selectedVertexIds: EMPTY_VERTEX_SET,
      };

    case "SELECT_VERTEX":
      return {
        ...state,
        selectedVertexId: action.vertexId,
        selectedEdgeId: null,
        selectedFeatureId: null,
        selectedVertexIds:
          action.vertexId === null
            ? EMPTY_VERTEX_SET
            : new Set<VertexId>([action.vertexId]),
      };

    case "TOGGLE_VERTEX_SELECTION": {
      const next = new Set<VertexId>(state.selectedVertexIds);
      if (next.has(action.vertexId)) {
        next.delete(action.vertexId);
      } else {
        next.add(action.vertexId);
      }
      // Determine the new primary: prefer the toggled vertex if added,
      // otherwise keep the prior primary if still in the set, otherwise
      // pick any remaining member.
      let nextPrimary: VertexId | null;
      if (next.has(action.vertexId)) {
        nextPrimary = action.vertexId;
      } else if (
        state.selectedVertexId !== null &&
        next.has(state.selectedVertexId)
      ) {
        nextPrimary = state.selectedVertexId;
      } else {
        const first = next.values().next();
        nextPrimary = first.done ? null : first.value;
      }
      return {
        ...state,
        selectedVertexId: nextPrimary,
        selectedVertexIds: next,
        selectedEdgeId: null,
        selectedFeatureId: null,
      };
    }

    case "CLEAR_SELECTION":
      return {
        ...state,
        selectedEdgeId: null,
        selectedFeatureId: null,
        selectedVertexId: null,
        selectedVertexIds: EMPTY_VERTEX_SET,
        toolMode: { kind: "select" },
      };

    case "SET_EDGE_PROFILE":
      return applyToActivePiece(state, (piece) =>
        setEdgeProfileOp(piece, action.edgeId, action.profile),
      );

    case "SET_EDGE_PROFILE_BATCH":
      return applyToActivePiece(state, (piece) => {
        // Round 16 (Fix 4): chain the kernel-level helper so every edge
        // in the supplied set lands with the same profile. The result
        // runs through `validatePiece` once at the end of applyToActivePiece
        // — no per-edge re-validation needed because setEdgeProfile is
        // strictly metadata.
        let next: Piece = piece;
        for (const id of Array.from(action.edgeIds)) {
          next = setEdgeProfileOp(next, id, action.profile);
        }
        return next;
      });

    case "SET_EDGE_EXPOSURE":
      return applyToActivePiece(state, (piece) =>
        setEdgeExposureOp(piece, action.edgeId, action.exposure),
      );

    case "SET_EDGE_LENGTH": {
      const piece = selectActivePiece(state);
      const move = computeVertexMoveForEdgeLength(
        piece,
        action.edgeId,
        action.newLengthMm,
      );
      if (!move) return state;
      return applyToActivePiece(state, (p) =>
        moveVertexOp(p, move.vertexId, move.newX, move.newY),
      );
    }

    case "SET_MATERIAL":
      return applyToActivePiece(state, (piece) => ({
        ...piece,
        materialId: action.materialId,
      }));

    case "ADD_FEATURE": {
      const piece = selectActivePiece(state);
      // If a placement is supplied, recompute the feature's centre from it
      // so the rendered position matches the placement's outer-edge
      // semantics regardless of what the caller passed in `feature.position`.
      let featureToAdd = action.feature;
      if (action.placement) {
        const centre = centreFromPlacement(
          piece,
          action.placement,
          action.feature,
        );
        if (centre) {
          featureToAdd = {
            ...action.feature,
            position: { x: centre.x, y: centre.y },
          };
        }
      }
      const nextPiece: Piece = {
        ...piece,
        features: [...piece.features, featureToAdd],
      };
      const validation = validatePiece(nextPiece);
      if (!validation.valid) return state;
      const nextPieces = state.job.pieces.map((p, i) =>
        i === state.activePieceIndex ? nextPiece : p,
      );
      const nextJob: Job = { ...state.job, pieces: nextPieces };
      const nextPlacements = action.placement
        ? new Map<FeatureId, FeaturePlacement>([
            ...Array.from(state.featurePlacements.entries()),
            [featureToAdd.id, action.placement],
          ])
        : state.featurePlacements;
      const nextFixtureMetadata = action.fixtureMetadata
        ? new Map<FeatureId, FixtureMetadata>([
            ...Array.from(state.fixtureMetadata.entries()),
            [featureToAdd.id, action.fixtureMetadata],
          ])
        : state.fixtureMetadata;
      return commitSnapshot(state, {
        job: nextJob,
        markupPercent: state.markupPercent,
        featurePlacements: nextPlacements,
        fixtureMetadata: nextFixtureMetadata,
        recessGroups: state.recessGroups,
      });
    }

    case "ADD_FEATURES_BATCH": {
      // Atomic placement of multiple features. Used by the FixturePicker
      // when a sink ships with bench_holes that auto-place a tap. Reject
      // the entire batch if validation fails — one undo entry per batch.
      const piece = selectActivePiece(state);
      // Recompute each feature's centre from its placement (same semantics
      // as ADD_FEATURE).
      const featuresToAdd: Feature[] = action.features.map((f) => {
        const placement = action.placements.get(f.id);
        if (!placement) return f;
        const centre = centreFromPlacement(piece, placement, f);
        return centre ? { ...f, position: { x: centre.x, y: centre.y } } : f;
      });
      const nextPiece: Piece = {
        ...piece,
        features: [...piece.features, ...featuresToAdd],
      };
      const validation = validatePiece(nextPiece);
      if (!validation.valid) return state;
      const nextPieces = state.job.pieces.map((p, i) =>
        i === state.activePieceIndex ? nextPiece : p,
      );
      const nextJob: Job = { ...state.job, pieces: nextPieces };
      const nextPlacements = new Map<FeatureId, FeaturePlacement>(
        state.featurePlacements,
      );
      for (const [id, p] of Array.from(action.placements.entries())) nextPlacements.set(id, p);
      const nextFixtureMetadata = new Map<FeatureId, FixtureMetadata>(
        state.fixtureMetadata,
      );
      for (const [id, m] of Array.from(action.fixtureMetadata.entries())) {
        nextFixtureMetadata.set(id, m);
      }
      return commitSnapshot(state, {
        job: nextJob,
        markupPercent: state.markupPercent,
        featurePlacements: nextPlacements,
        fixtureMetadata: nextFixtureMetadata,
        recessGroups: state.recessGroups,
      });
    }

    case "REMOVE_FEATURE": {
      const piece = selectActivePiece(state);
      const nextPiece: Piece = {
        ...piece,
        features: piece.features.filter((f) => f.id !== action.featureId),
      };
      const validation = validatePiece(nextPiece);
      if (!validation.valid) return state;
      const nextPieces = state.job.pieces.map((p, i) =>
        i === state.activePieceIndex ? nextPiece : p,
      );
      const nextJob: Job = { ...state.job, pieces: nextPieces };
      const nextPlacements = prunePlacements(
        state.featurePlacements,
        nextPiece.features,
      );
      const nextFixtureMetadata = pruneFixtureMetadata(
        state.fixtureMetadata,
        nextPiece.features,
      );
      return commitSnapshot(state, {
        job: nextJob,
        markupPercent: state.markupPercent,
        featurePlacements: nextPlacements,
        fixtureMetadata: nextFixtureMetadata,
        recessGroups: state.recessGroups,
      });
    }

    case "MOVE_FEATURE": {
      const piece = selectActivePiece(state);
      const feature = piece.features.find((f) => f.id === action.featureId);
      if (!feature) return state;
      const bbox = featureBboxMm(feature);
      const fits = featureFitsInPiece(
        piece,
        action.placement,
        bbox.widthMm,
        bbox.depthMm,
      );
      if (!fits) return state;
      const centre = centreFromPlacement(piece, action.placement, feature);
      if (!centre) return state;
      const nextFeatures = piece.features.map((f) =>
        f.id === action.featureId
          ? { ...f, position: { x: centre.x, y: centre.y } }
          : f,
      );
      const nextPiece: Piece = { ...piece, features: nextFeatures };
      const validation = validatePiece(nextPiece);
      if (!validation.valid) return state;
      const nextPieces = state.job.pieces.map((p, i) =>
        i === state.activePieceIndex ? nextPiece : p,
      );
      const nextJob: Job = { ...state.job, pieces: nextPieces };
      const nextPlacements = new Map<FeatureId, FeaturePlacement>([
        ...Array.from(state.featurePlacements.entries()),
        [action.featureId, action.placement],
      ]);
      return commitSnapshot(state, {
        job: nextJob,
        markupPercent: state.markupPercent,
        featurePlacements: nextPlacements,
        fixtureMetadata: state.fixtureMetadata,
        recessGroups: state.recessGroups,
      });
    }

    case "RESIZE_FEATURE": {
      const piece = selectActivePiece(state);
      const feature = piece.features.find((f) => f.id === action.featureId);
      if (!feature) return state;
      const fixtureMetadata = state.fixtureMetadata.get(action.featureId);
      // Round 5 — clamp dimensions to polygon bounds instead of rejecting.
      // If the user tries to make a 900 mm sink on a 700 mm edge, the
      // resize stops at the edge boundary rather than rubber-banding.
      //
      // Round 7A (FIX 2 Level 3): if no placement exists (e.g. a
      // Vision-extracted feature pre-Round-2, or a feature added before
      // placement tracking landed), bootstrap one from the feature's
      // current centre so the clamp can still find a polygon edge.
      let placement = state.featurePlacements.get(action.featureId);
      if (!placement) {
        const bootstrap = bootstrapPlacementFromPosition(piece, feature);
        if (bootstrap) placement = bootstrap;
      }
      let clampedWidth = action.widthMm;
      let clampedDepth = action.depthMm;
      if (placement) {
        const clamp = clampFeatureToBounds(
          piece,
          placement,
          action.widthMm,
          action.depthMm,
        );
        clampedWidth = clamp.widthMm;
        clampedDepth = clamp.depthMm;
      }
      const resized = resizeFeature(
        feature,
        clampedWidth,
        clampedDepth,
        fixtureMetadata,
      );
      if (!resized) return state;
      // Consecutive RESIZE_FEATURE actions on the same feature merge into
      // one undo entry — see EditorState.resizingFeatureId.
      const mergeWithTop = state.resizingFeatureId === action.featureId;
      const newBbox = featureBboxMm(resized);
      let nextFeature: Feature;
      if (placement) {
        const fits = featureFitsInPiece(
          piece,
          placement,
          newBbox.widthMm,
          newBbox.depthMm,
        );
        if (!fits) return state;
        const centre = centreFromPlacement(piece, placement, resized);
        if (!centre) return state;
        nextFeature = {
          ...resized,
          position: { x: centre.x, y: centre.y },
        };
      } else {
        nextFeature = resized;
      }
      const nextFeatures = piece.features.map((f) =>
        f.id === action.featureId ? nextFeature : f,
      );
      const nextPiece: Piece = { ...piece, features: nextFeatures };
      const validation = validatePiece(nextPiece);
      if (!validation.valid) return state;
      const nextPieces = state.job.pieces.map((p, i) =>
        i === state.activePieceIndex ? nextPiece : p,
      );
      const nextJob: Job = { ...state.job, pieces: nextPieces };
      const next = commitSnapshot(
        state,
        {
          job: nextJob,
          markupPercent: state.markupPercent,
          featurePlacements: state.featurePlacements,
          fixtureMetadata: state.fixtureMetadata,
          recessGroups: state.recessGroups,
        },
        { mergeWithTop },
      );
      return { ...next, resizingFeatureId: action.featureId };
    }

    case "RESIZE_AND_SHIFT_FEATURE": {
      // Round 5 (A3) — asymmetric window-recess resize. Combines a
      // RESIZE_FEATURE step with a placement.offsetAlongEdgeMm shift so
      // the opposite side stays anchored.
      const piece = selectActivePiece(state);
      const feature = piece.features.find((f) => f.id === action.featureId);
      if (!feature) return state;
      const placement = state.featurePlacements.get(action.featureId);
      if (!placement) return state;
      const fixtureMetadata = state.fixtureMetadata.get(action.featureId);
      // Shifted placement (along-edge centre shift).
      const shiftedPlacement: FeaturePlacement = {
        ...placement,
        offsetAlongEdgeMm: placement.offsetAlongEdgeMm + action.alongShiftMm,
      };
      // Clamp dimensions to bounds at the shifted placement.
      const clamp = clampFeatureToBounds(
        piece,
        shiftedPlacement,
        action.widthMm,
        action.depthMm,
      );
      const resized = resizeFeature(
        feature,
        clamp.widthMm,
        clamp.depthMm,
        fixtureMetadata,
      );
      if (!resized) return state;
      const newBbox = featureBboxMm(resized);
      const fits = featureFitsInPiece(
        piece,
        shiftedPlacement,
        newBbox.widthMm,
        newBbox.depthMm,
      );
      if (!fits) return state;
      const centre = centreFromPlacement(piece, shiftedPlacement, resized);
      if (!centre) return state;
      const nextFeature: Feature = {
        ...resized,
        position: { x: centre.x, y: centre.y },
      };
      const nextFeatures = piece.features.map((f) =>
        f.id === action.featureId ? nextFeature : f,
      );
      const nextPiece: Piece = { ...piece, features: nextFeatures };
      const validation = validatePiece(nextPiece);
      if (!validation.valid) return state;
      const nextPieces = state.job.pieces.map((p, i) =>
        i === state.activePieceIndex ? nextPiece : p,
      );
      const nextJob: Job = { ...state.job, pieces: nextPieces };
      const nextPlacements = new Map<FeatureId, FeaturePlacement>([
        ...Array.from(state.featurePlacements.entries()),
        [action.featureId, shiftedPlacement],
      ]);
      const mergeWithTop = state.resizingFeatureId === action.featureId;
      const next = commitSnapshot(
        state,
        {
          job: nextJob,
          markupPercent: state.markupPercent,
          featurePlacements: nextPlacements,
          fixtureMetadata: state.fixtureMetadata,
          recessGroups: state.recessGroups,
        },
        { mergeWithTop },
      );
      return { ...next, resizingFeatureId: action.featureId };
    }

    case "SET_TOOL_MODE":
      return { ...state, toolMode: action.toolMode };

    case "SET_MARKUP": {
      // Reject empty/non-decimal strings; trust the catalogue otherwise.
      if (!/^\d+(\.\d+)?$/.test(action.markupPercent)) return state;
      return commitSnapshot(state, {
        job: state.job,
        markupPercent: action.markupPercent,
        featurePlacements: state.featurePlacements,
        fixtureMetadata: state.fixtureMetadata,
        recessGroups: state.recessGroups,
      });
    }

    case "SET_FIXTURE_METADATA": {
      // Round 9 (Issue 7) — replace fixture metadata for an existing
      // feature without touching geometry. No-op when the target feature
      // isn't on the active piece. Commits a snapshot so undo reverts.
      const piece = selectActivePiece(state);
      if (!piece.features.some((f) => f.id === action.featureId)) {
        return state;
      }
      const nextFixtureMetadata = new Map<FeatureId, FixtureMetadata>(
        state.fixtureMetadata,
      );
      nextFixtureMetadata.set(action.featureId, action.metadata);
      return commitSnapshot(state, {
        job: state.job,
        markupPercent: state.markupPercent,
        featurePlacements: state.featurePlacements,
        fixtureMetadata: nextFixtureMetadata,
        recessGroups: state.recessGroups,
      });
    }

    case "APPLY_NL_CHANGES": {
      const validation = validatePiece(action.nextPiece);
      if (!validation.valid) return state;
      const nextPieces = state.job.pieces.map((p, i) =>
        i === state.activePieceIndex ? action.nextPiece : p,
      );
      const nextJob: Job = { ...state.job, pieces: nextPieces };
      // NL commands may add or remove features without supplying
      // placements. Prune both maps to features that still exist.
      const nextPlacements = prunePlacements(
        state.featurePlacements,
        action.nextPiece.features,
      );
      const nextFixtureMetadata = pruneFixtureMetadata(
        state.fixtureMetadata,
        action.nextPiece.features,
      );
      return commitSnapshot(state, {
        job: nextJob,
        markupPercent: action.nextMarkupPercent,
        featurePlacements: nextPlacements,
        fixtureMetadata: nextFixtureMetadata,
        recessGroups: state.recessGroups,
      });
    }

    case "UNDO": {
      if (state.historyIndex <= 0) return state;
      const targetIndex = state.historyIndex - 1;
      const target = state.history[targetIndex];
      if (!target) return state;
      return {
        ...state,
        job: target.job,
        markupPercent: target.markupPercent,
        featurePlacements: target.featurePlacements,
        fixtureMetadata: target.fixtureMetadata,
        recessGroups: target.recessGroups,
        historyIndex: targetIndex,
        selectedEdgeId: null,
        selectedFeatureId: null,
        selectedVertexId: null,
        selectedVertexIds: EMPTY_VERTEX_SET,
      };
    }

    case "REDO": {
      if (state.historyIndex >= state.history.length - 1) return state;
      const targetIndex = state.historyIndex + 1;
      const target = state.history[targetIndex];
      if (!target) return state;
      return {
        ...state,
        job: target.job,
        markupPercent: target.markupPercent,
        featurePlacements: target.featurePlacements,
        fixtureMetadata: target.fixtureMetadata,
        recessGroups: target.recessGroups,
        historyIndex: targetIndex,
        selectedEdgeId: null,
        selectedFeatureId: null,
        selectedVertexId: null,
        selectedVertexIds: EMPTY_VERTEX_SET,
      };
    }

    case "LOAD_PIECE": {
      // Replace the active piece. Resets history to a single snapshot and
      // discards all feature placements + fixture metadata (both only make
      // sense against the new piece's edge IDs / feature IDs).
      const validation = validatePiece(action.piece);
      if (!validation.valid) return state;
      const nextPieces = state.job.pieces.map((p, i) =>
        i === state.activePieceIndex ? action.piece : p,
      );
      const nextJob: Job = { ...state.job, pieces: nextPieces };
      const emptyPlacements: ReadonlyMap<FeatureId, FeaturePlacement> =
        new Map();
      const emptyFixtureMetadata: ReadonlyMap<FeatureId, FixtureMetadata> =
        new Map();
      const emptyRecessGroups: ReadonlyMap<RecessId, RecessGroup> = new Map();
      const seedSnapshot: EditorSnapshot = {
        job: nextJob,
        markupPercent: DEFAULT_MARKUP_PERCENT,
        featurePlacements: emptyPlacements,
        fixtureMetadata: emptyFixtureMetadata,
        recessGroups: emptyRecessGroups,
      };
      return {
        ...state,
        job: nextJob,
        markupPercent: DEFAULT_MARKUP_PERCENT,
        featurePlacements: emptyPlacements,
        fixtureMetadata: emptyFixtureMetadata,
        recessGroups: emptyRecessGroups,
        history: [seedSnapshot],
        historyIndex: 0,
        selectedEdgeId: null,
        selectedFeatureId: null,
        selectedVertexId: null,
        selectedVertexIds: EMPTY_VERTEX_SET,
        selectedBuildUpEdgeId: null,
        toolMode: { kind: "select" },
        resizingFeatureId: null,
      };
    }

    // ───── Round-3A handlers ─────

    case "INSERT_VERTEX":
      return applyToActivePiece(state, (piece) =>
        insertVertexOnEdgeOp(piece, action.edgeId, action.pointMm),
      );

    case "INSERT_VERTEX_MIDPOINT":
      return applyToActivePiece(state, (piece) =>
        insertVertexAtMidpointOp(piece, action.edgeId),
      );

    case "REMOVE_VERTEX":
      return applyToActivePiece(state, (piece) =>
        removeVertexOp(piece, action.vertexId),
      );

    case "SET_CORNER_RADIUS": {
      // Validate the radius BEFORE applying. The geometry's `validatePiece`
      // will also catch out-of-range radii, but doing the check here gives
      // the editor a chance to silently no-op rather than rejecting via
      // the reducer's validation gate.
      const piece = selectActivePiece(state);
      const v = piece.vertices.find((x) => x.id === action.vertexId);
      if (!v) return state;
      // Find prev/next via outer ring traversal.
      const ring = piece.outerRing.edges;
      let prev: typeof piece.vertices[number] | undefined;
      let next: typeof piece.vertices[number] | undefined;
      for (let i = 0; i < ring.length; i++) {
        const incomingId = ring[i]!;
        const outgoingId = ring[(i + 1) % ring.length]!;
        const incoming = piece.edges.find((e) => e.id === incomingId);
        const outgoing = piece.edges.find((e) => e.id === outgoingId);
        if (!incoming || !outgoing) continue;
        if (incoming.end === action.vertexId && outgoing.start === action.vertexId) {
          prev = piece.vertices.find((x) => x.id === incoming.start);
          next = piece.vertices.find((x) => x.id === outgoing.end);
          break;
        }
      }
      if (action.radiusMm > 0 && prev && next) {
        if (!isValidCornerRadius(v, prev, next, action.radiusMm)) {
          return state;
        }
      }
      return applyToActivePiece(state, (p) =>
        setVertexCornerRadiusOp(p, action.vertexId, action.radiusMm),
      );
    }

    case "SET_MULTI_CORNER_RADIUS": {
      // Round 15 (Fix 1) — batch corner-radius application across every
      // vertex in `action.vertexIds`. Runs `setVertexCornerRadiusOp` in
      // sequence on a single Piece reference, so the entire change is
      // ONE snapshot and ONE undo entry. Vertices that fail the
      // `isValidCornerRadius` check are skipped (the operator may want
      // to "round every corner that can take an R50").
      const piece = selectActivePiece(state);
      let next: Piece = piece;
      const ring = piece.outerRing.edges;
      for (const vertexIdValue of Array.from(action.vertexIds)) {
        const v = next.vertices.find((x) => x.id === vertexIdValue);
        if (!v) continue;
        // Validate against the CURRENT (running) piece state, not the
        // initial state — earlier iterations may have moved nothing, but
        // future passes should still see the same neighbours since
        // setVertexCornerRadiusOp doesn't move vertices.
        let prev: Vertex | undefined;
        let nbr: Vertex | undefined;
        for (let i = 0; i < ring.length; i++) {
          const incomingId = ring[i]!;
          const outgoingId = ring[(i + 1) % ring.length]!;
          const incoming = next.edges.find((e) => e.id === incomingId);
          const outgoing = next.edges.find((e) => e.id === outgoingId);
          if (!incoming || !outgoing) continue;
          if (
            incoming.end === vertexIdValue &&
            outgoing.start === vertexIdValue
          ) {
            prev = next.vertices.find((x) => x.id === incoming.start);
            nbr = next.vertices.find((x) => x.id === outgoing.end);
            break;
          }
        }
        if (action.radiusMm > 0 && prev && nbr) {
          if (!isValidCornerRadius(v, prev, nbr, action.radiusMm)) {
            continue;
          }
        }
        const stepped = setVertexCornerRadiusOp(
          next,
          vertexIdValue,
          action.radiusMm,
        );
        if (!stepped) continue;
        next = stepped;
      }
      if (next === piece) return state;
      const validation = validatePiece(next);
      if (!validation.valid) return state;
      const updatedPieces = state.job.pieces.map((p, i) =>
        i === state.activePieceIndex ? next : p,
      );
      const nextJob: Job = { ...state.job, pieces: updatedPieces };
      return commitSnapshot(state, {
        job: nextJob,
        markupPercent: state.markupPercent,
        featurePlacements: state.featurePlacements,
        fixtureMetadata: state.fixtureMetadata,
        recessGroups: state.recessGroups,
      });
    }

    case "SET_VERTEX_ANGLE":
      return applyToActivePiece(state, (piece) =>
        setVertexAngleOp(piece, action.vertexId, action.angleDeg),
      );

    case "CORRECT_ANGLES": {
      // Round 11 (Fix 2) — batch angle correction in one snapshot.
      // Chain setVertexAngle through every (vertexId, correctedAngle)
      // pair the integrity helper returned. Each kernel call is a
      // local fix-up; if any step rejects we abandon the batch so the
      // history doesn't end up in a half-corrected state.
      const piece = selectActivePiece(state);
      const integrity = checkAngleIntegrity(piece);
      if (integrity.isClean) return state;
      const corrections = computeAngleCorrections(piece, integrity);
      if (corrections.size === 0) return state;
      let next: Piece = piece;
      for (const [vid, targetDeg] of Array.from(corrections.entries())) {
        const stepped = setVertexAngleOp(next, vid, targetDeg);
        if (!stepped) {
          // setVertexAngle returned null (degenerate triangle for that
          // vertex). Skip — proportional correction does not require
          // every vertex to move, and the next iteration's reading of
          // the polygon already accounts for previous adjustments.
          continue;
        }
        next = stepped;
      }
      if (next === piece) return state;
      const validation = validatePiece(next);
      if (!validation.valid) return state;
      const updatedPieces = state.job.pieces.map((p, i) =>
        i === state.activePieceIndex ? next : p,
      );
      const recompute = recomputeAttachedChildren(
        piece,
        next,
        updatedPieces,
        state.job.joins,
      );
      let nextPieces = recompute.pieces;
      let nextJoins = recompute.joins;
      if (recompute.orphanedChildIds.length > 0) {
        const orphaned = new Set(recompute.orphanedChildIds);
        nextPieces = nextPieces.filter((p) => !orphaned.has(p.id));
        nextJoins = nextJoins.filter(
          (j) => !orphaned.has(j.pieceA) && !orphaned.has(j.pieceB),
        );
      }
      const nextJob: Job = {
        ...state.job,
        pieces: nextPieces,
        joins: nextJoins,
      };
      return commitSnapshot(state, {
        job: nextJob,
        markupPercent: state.markupPercent,
        featurePlacements: state.featurePlacements,
        fixtureMetadata: state.fixtureMetadata,
        recessGroups: state.recessGroups,
      });
    }

    case "SET_ROUND_END": {
      const piece = selectActivePiece(state);
      const edge = piece.edges.find((e) => e.id === action.edgeId);
      if (!edge) return state;
      if (action.enabled) {
        const start = piece.vertices.find((v) => v.id === edge.start);
        const end = piece.vertices.find((v) => v.id === edge.end);
        if (!start || !end) return state;
        const curve = computeRoundEndCurve(
          { x: start.x, y: start.y },
          { x: end.x, y: end.y },
          action.bulge ?? "right",
        );
        return applyToActivePiece(state, (p) =>
          setEdgeCurveOp(p, action.edgeId, curve),
        );
      }
      return applyToActivePiece(state, (p) =>
        setEdgeCurveOp(p, action.edgeId, null),
      );
    }

    case "CREATE_WINDOW_RECESS": {
      const piece = selectActivePiece(state);
      const result = createWindowRecessOp({
        piece,
        wallEdgeId: action.wallEdgeId,
        offsetAlongEdgeMm: action.offsetMm,
        recessWidthMm: action.widthMm,
        recessDepthMm: action.depthMm,
      });
      if ("error" in result) return state;
      const validation = validatePiece(result.piece);
      if (!validation.valid) return state;
      const nextPieces = state.job.pieces.map((p, i) =>
        i === state.activePieceIndex ? result.piece : p,
      );
      const nextJob: Job = { ...state.job, pieces: nextPieces };
      const nextRecessGroups = new Map<RecessId, RecessGroup>(
        state.recessGroups,
      );
      nextRecessGroups.set(result.group.recessId, result.group);
      return commitSnapshot(state, {
        job: nextJob,
        markupPercent: state.markupPercent,
        featurePlacements: state.featurePlacements,
        fixtureMetadata: state.fixtureMetadata,
        recessGroups: nextRecessGroups,
      });
    }

    case "REMOVE_WINDOW_RECESS": {
      // Removal is a deferred-feature: we mark the group removed in the
      // bookkeeping map but leave the geometry as-is. A full restore of
      // the original wall edge would require merging the 5 edges back to
      // one — possible via repeated `mergeEdges` calls, but each merge
      // step changes ring chains and the canvas would flicker. For
      // Round-3A we drop the group entry; the edges are still profiled
      // edges in their own right and the operator can adjust them
      // individually if they want.
      //
      // Future work: a `merge-recess-back` button on the back edge that
      // does the topology reversal.
      const next = new Map<RecessId, RecessGroup>(state.recessGroups);
      next.delete(action.recessId);
      return commitSnapshot(state, {
        job: state.job,
        markupPercent: state.markupPercent,
        featurePlacements: state.featurePlacements,
        fixtureMetadata: state.fixtureMetadata,
        recessGroups: next,
      });
    }

    case "ADD_ARM": {
      // Round 10 (Fix 4) — atomic topology mutation. addArm returns null
      // if the dimensions don't fit on the chosen edge or any intermediate
      // splitEdge fails; the reducer treats null as "reject the action and
      // preserve state" so undo doesn't accumulate a no-op entry.
      const result = applyToActivePiece(state, (piece) =>
        addArm(piece, {
          edgeId: action.edgeId,
          widthMm: action.widthMm,
          lengthMm: action.lengthMm,
          offsetAlongEdgeMm: action.offsetAlongEdgeMm,
        }),
      );
      // applyToActivePiece short-circuits to the original state if the
      // operation returns null OR fails revalidation, so we return its
      // result directly.
      return result;
    }

    // ───── Round-3B cases ─────

    case "ADD_PIECE": {
      // Validate the incoming piece first; reject the action wholesale if
      // it fails. Build-up child pieces (with a parentPieceId) skip the
      // geometric validation because they are simple authored rectangles.
      const newPiece = action.piece;
      if (newPiece.parentPieceId === undefined) {
        const validation = validatePiece(newPiece);
        if (!validation.valid) return state;
      }
      // Round 16 (Fix 2): apply any parent-edge profile updates to the
      // ACTIVE piece in the same snapshot. Used by mitred joins so
      // both faces of the joint switch to `mitre-45` atomically. The
      // mutated parent runs through validatePiece — strictly speaking
      // setEdgeProfile is metadata-only and can't break validity, but
      // the cost is negligible and keeps the guarantee uniform with
      // every other mutation path.
      let nextActivePieces: readonly Piece[] = state.job.pieces;
      const parentEdgeProfileUpdates = action.parentEdgeProfileUpdates;
      if (
        parentEdgeProfileUpdates !== undefined &&
        parentEdgeProfileUpdates.length > 0
      ) {
        const activeParent = selectActivePiece(state);
        let mutatedParent: Piece = activeParent;
        for (const update of parentEdgeProfileUpdates) {
          mutatedParent = setEdgeProfileOp(
            mutatedParent,
            update.edgeId,
            update.profile,
          );
        }
        const parentValidation = validatePiece(mutatedParent);
        if (!parentValidation.valid) return state;
        nextActivePieces = state.job.pieces.map((p, i) =>
          i === state.activePieceIndex ? mutatedParent : p,
        );
      }
      const nextPieces: readonly Piece[] = [...nextActivePieces, newPiece];
      const nextJoins: readonly Join[] = [
        ...state.job.joins,
        ...action.joinsToAdd,
      ];
      const nextJob: Job = { pieces: nextPieces, joins: nextJoins };
      return commitSnapshot(state, {
        job: nextJob,
        markupPercent: state.markupPercent,
        featurePlacements: state.featurePlacements,
        fixtureMetadata: state.fixtureMetadata,
        recessGroups: state.recessGroups,
      });
    }

    case "REMOVE_PIECE": {
      const idx = state.job.pieces.findIndex((p) => p.id === action.pieceId);
      if (idx < 0) return state;
      // Drop the piece + any child pieces parented to it + any joins
      // touching it.
      const nextPieces = state.job.pieces.filter(
        (p) => p.id !== action.pieceId && p.parentPieceId !== action.pieceId,
      );
      if (nextPieces.length === 0) return state; // never leave the Job empty
      const nextJoins = state.job.joins.filter(
        (j) => j.pieceA !== action.pieceId && j.pieceB !== action.pieceId,
      );
      const nextJob: Job = { pieces: nextPieces, joins: nextJoins };
      // Clamp the active index to the new pieces array.
      const clampedActive = Math.min(
        state.activePieceIndex,
        nextPieces.length - 1,
      );
      const intermediate: EditorState = {
        ...state,
        activePieceIndex: clampedActive,
      };
      return commitSnapshot(intermediate, {
        job: nextJob,
        markupPercent: state.markupPercent,
        featurePlacements: state.featurePlacements,
        fixtureMetadata: state.fixtureMetadata,
        recessGroups: state.recessGroups,
      });
    }

    case "SET_ACTIVE_PIECE": {
      if (
        action.index < 0 ||
        action.index >= state.job.pieces.length
      ) {
        return state;
      }
      return {
        ...state,
        activePieceIndex: action.index,
        selectedEdgeId: null,
        selectedFeatureId: null,
        selectedVertexId: null,
        selectedVertexIds: EMPTY_VERTEX_SET,
        selectedBuildUpEdgeId: null,
      };
    }

    case "SELECT_BUILD_UP_EDGE":
      return { ...state, selectedBuildUpEdgeId: action.edgeId };

    case "SET_EDGE_BUILD_UP": {
      const activePiece = selectActivePiece(state);
      const targetEdge = activePiece.edges.find(
        (e) => e.id === action.edgeId,
      );
      if (!targetEdge) return state;

      // Update the parent piece's edge: attach or clear the descriptor.
      const nextEdges: Edge[] = activePiece.edges.map((e) => {
        if (e.id !== action.edgeId) return e;
        if (action.buildUp === null) {
          // Build a fresh edge without the buildUp field — `delete` would
          // violate exactOptionalPropertyTypes.
          const cleared: Edge = {
            id: e.id,
            start: e.start,
            end: e.end,
            profile: e.profile,
            finish: e.finish,
            exposure: e.exposure,
            ...(e.curve !== undefined ? { curve: e.curve } : {}),
            ...(e.generatedBy !== undefined
              ? { generatedBy: e.generatedBy }
              : {}),
          };
          return cleared;
        }
        return { ...e, buildUp: action.buildUp };
      });
      const nextParent: Piece = { ...activePiece, edges: nextEdges };
      const validation = validatePiece(nextParent);
      if (!validation.valid) return state;

      // Synthesise child pieces. If we're clearing, drop any existing
      // children parented to this piece for the same edge (we identify
      // those by parentPieceId; the edge link is implicit since each
      // piece edge gets at most one build-up). If we're setting, generate
      // fresh children to replace any prior set for this edge.
      const childrenForOtherEdges = state.job.pieces.filter(
        (p) => p.parentPieceId !== activePiece.id,
      );
      // Drop ALL children of this parent and re-generate; a build-up
      // change applies to one edge at a time, but Round 3B doesn't yet
      // mark which edge a child belongs to. Treating the parent's
      // children atomically per the brief §4.3 is acceptable for the
      // prototype.
      const newChildren =
        action.buildUp === null
          ? []
          : generateBuildUpPieces({
              parentPiece: nextParent,
              edgeId: action.edgeId,
              buildUp: action.buildUp,
            });

      const nextPieces: readonly Piece[] = state.job.pieces.map((p) =>
        p.id === activePiece.id ? nextParent : p,
      );
      // Drop existing children, append fresh ones.
      const trimmed = nextPieces.filter(
        (p) =>
          p.id === activePiece.id ||
          p.parentPieceId !== activePiece.id,
      );
      void childrenForOtherEdges; // kept for clarity; trimming uses parentPieceId
      const finalPieces: readonly Piece[] = [...trimmed, ...newChildren];
      const nextJob: Job = { ...state.job, pieces: finalPieces };
      return commitSnapshot(state, {
        job: nextJob,
        markupPercent: state.markupPercent,
        featurePlacements: state.featurePlacements,
        fixtureMetadata: state.fixtureMetadata,
        recessGroups: state.recessGroups,
      });
    }

    case "SCALE_PIECE": {
      if (!Number.isFinite(action.scale) || action.scale <= 0) return state;
      const { x: cx, y: cy } = action.centroid;
      return applyToActivePiece(state, (piece) => {
        const nextVertices = piece.vertices.map((v) => {
          const scaled: Vertex = {
            id: v.id,
            x: Math.round(cx + (v.x - cx) * action.scale),
            y: Math.round(cy + (v.y - cy) * action.scale),
            ...(v.mitre !== undefined ? { mitre: v.mitre } : {}),
            ...(v.cornerRadiusMm !== undefined
              ? { cornerRadiusMm: v.cornerRadiusMm * action.scale }
              : {}),
          };
          return scaled;
        });
        const nextEdges = piece.edges.map((e) => {
          if (e.curve === undefined) return e;
          const scaledCurve = {
            ...e.curve,
            radiusMm: e.curve.radiusMm * action.scale,
          };
          return { ...e, curve: scaledCurve };
        });
        return { ...piece, vertices: nextVertices, edges: nextEdges };
      });
    }

    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────

export interface UsePieceApi {
  readonly state: EditorState;
  readonly piece: Piece;
  readonly markupPercent: string;
  readonly featurePlacements: ReadonlyMap<FeatureId, FeaturePlacement>;
  readonly fixtureMetadata: ReadonlyMap<FeatureId, FixtureMetadata>;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly dispatch: (action: EditorAction) => void;
  readonly moveVertex: (vertexId: VertexId, x: number, y: number) => void;
  readonly selectEdge: (edgeId: EdgeId | null) => void;
  readonly selectFeature: (featureId: FeatureId | null) => void;
  readonly selectVertex: (vertexId: VertexId | null) => void;
  readonly clearSelection: () => void;
  readonly setEdgeProfile: (edgeId: EdgeId, profile: EdgeProfile) => void;
  /**
   * Round 16 (Fix 4) — atomic multi-edge profile change. Used by the
   * curved-edge group selection (circle template) to re-profile every
   * segment in one undo entry.
   */
  readonly setEdgeProfileBatch: (
    edgeIds: readonly EdgeId[],
    profile: EdgeProfile,
  ) => void;
  readonly setEdgeExposure: (edgeId: EdgeId, exposure: EdgeExposure) => void;
  readonly setEdgeLength: (edgeId: EdgeId, newLengthMm: number) => void;
  readonly setMaterial: (materialId: string) => void;
  readonly addFeature: (
    feature: Feature,
    placement?: FeaturePlacement,
    fixtureMetadata?: FixtureMetadata,
  ) => void;
  /**
   * Atomic placement of multiple features in one undo entry. Used by the
   * FixturePicker for sinks that ship with bench_holes auto-placing taps.
   */
  readonly addFeaturesBatch: (
    features: readonly Feature[],
    placements: ReadonlyMap<FeatureId, FeaturePlacement>,
    fixtureMetadata: ReadonlyMap<FeatureId, FixtureMetadata>,
  ) => void;
  readonly removeFeature: (featureId: FeatureId) => void;
  readonly moveFeature: (
    featureId: FeatureId,
    placement: FeaturePlacement,
  ) => void;
  readonly resizeFeature: (
    featureId: FeatureId,
    widthMm: number,
    depthMm: number,
  ) => void;
  /**
   * Round 9 (Issue 7) — replace fixture metadata for an existing feature.
   * Used by FeaturePropertiesPanel when the operator changes the cutout
   * edge profile after placement.
   */
  readonly setFixtureMetadata: (
    featureId: FeatureId,
    metadata: FixtureMetadata,
  ) => void;
  /**
   * Round 5 (A3) — asymmetric window-recess resize. Atomic with placement
   * shift so the opposite side stays anchored. See RESIZE_AND_SHIFT_FEATURE.
   */
  readonly resizeAndShiftFeature: (
    featureId: FeatureId,
    widthMm: number,
    depthMm: number,
    alongShiftMm: number,
  ) => void;
  readonly setToolMode: (toolMode: ToolMode) => void;
  readonly setMarkup: (percent: string) => void;
  /**
   * Commit a pre-computed NL refinement. The caller invokes
   * `applyChangesToPiece` first to compute the next piece + markup, shows
   * the diff in ConfirmationPanel, and on Accept calls this function with
   * the already-computed values. One snapshot, one undo entry.
   */
  readonly applyNlChanges: (
    nextPiece: Piece,
    nextMarkupPercent: string,
  ) => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly loadPiece: (piece: Piece) => void;
  // ───── Round-3A API ─────
  readonly recessGroups: ReadonlyMap<RecessId, RecessGroup>;
  readonly insertVertex: (
    edgeId: EdgeId,
    pointMm: { readonly x: number; readonly y: number },
  ) => void;
  readonly insertVertexMidpoint: (edgeId: EdgeId) => void;
  readonly removeVertex: (vertexId: VertexId) => void;
  readonly setCornerRadius: (vertexId: VertexId, radiusMm: number) => void;
  /**
   * Round 15 (Fix 1) — apply `radiusMm` to every vertex in `vertexIds`
   * as a single undo entry. Vertices that fail the validity check are
   * skipped; the rest commit together.
   */
  readonly setMultiCornerRadius: (
    vertexIds: ReadonlySet<VertexId>,
    radiusMm: number,
  ) => void;
  /**
   * Round 15 (Fix 1) — toggle a vertex in/out of `selectedVertexIds`.
   * Used by Ctrl+Shift+click on a vertex handle to build a multi-vertex
   * selection for `setMultiCornerRadius`.
   */
  readonly toggleVertexSelection: (vertexId: VertexId) => void;
  readonly setVertexAngle: (vertexId: VertexId, angleDeg: number) => void;
  /**
   * Round 11 (Fix 2) — distribute any angle-sum discrepancy across all
   * outer-ring vertices in a single snapshot/undo entry. No-op on
   * already-clean polygons.
   */
  readonly correctAngles: () => void;
  readonly setRoundEnd: (
    edgeId: EdgeId,
    enabled: boolean,
    bulge?: "left" | "right",
  ) => void;
  readonly createWindowRecess: (
    wallEdgeId: EdgeId,
    offsetMm: number,
    widthMm: number,
    depthMm: number,
  ) => void;
  readonly removeWindowRecess: (recessId: RecessId) => void;
  // ───── Round-3B API ─────
  readonly addPiece: (
    piece: Piece,
    joinsToAdd: readonly Join[],
    /**
     * Round 16 (Fix 2) — optional parent-edge profile updates applied
     * atomically with the new-piece add (one undo step). Used by
     * mitred join styles.
     */
    parentEdgeProfileUpdates?: readonly {
      readonly edgeId: EdgeId;
      readonly profile: EdgeProfile;
    }[],
  ) => void;
  readonly removePiece: (pieceId: PieceId) => void;
  readonly setActivePiece: (index: number) => void;
  readonly selectBuildUpEdge: (edgeId: EdgeId | null) => void;
  readonly setEdgeBuildUp: (
    edgeId: EdgeId,
    buildUp: BuildUpDescriptor | null,
  ) => void;
  /**
   * Round 18 (Fix 3) — uniform scale of the active piece around a centroid.
   * Used by the editable diameter label on circle pieces. One undo entry.
   */
  readonly scalePiece: (
    scale: number,
    centroid: { readonly x: number; readonly y: number },
  ) => void;
}

export function initialEditorState(initialPiece: Piece): EditorState {
  const job: Job = { pieces: [initialPiece], joins: [] };
  const emptyPlacements: ReadonlyMap<FeatureId, FeaturePlacement> = new Map();
  const emptyFixtureMetadata: ReadonlyMap<FeatureId, FixtureMetadata> =
    new Map();
  const emptyRecessGroups: ReadonlyMap<RecessId, RecessGroup> = new Map();
  const seed: EditorSnapshot = {
    job,
    markupPercent: DEFAULT_MARKUP_PERCENT,
    featurePlacements: emptyPlacements,
    fixtureMetadata: emptyFixtureMetadata,
    recessGroups: emptyRecessGroups,
  };
  return {
    job,
    markupPercent: DEFAULT_MARKUP_PERCENT,
    featurePlacements: emptyPlacements,
    fixtureMetadata: emptyFixtureMetadata,
    recessGroups: emptyRecessGroups,
    activePieceIndex: 0,
    selectedEdgeId: null,
    selectedFeatureId: null,
    selectedVertexId: null,
    selectedVertexIds: EMPTY_VERTEX_SET,
    selectedBuildUpEdgeId: null,
    toolMode: { kind: "select" },
    history: [seed],
    historyIndex: 0,
    resizingFeatureId: null,
  };
}

export function usePiece(initialPiece: Piece): UsePieceApi {
  const [state, dispatch] = useReducer(reducer, initialPiece, initialEditorState);
  const piece = useMemo(() => selectActivePiece(state), [state]);

  const moveVertex = useCallback(
    (vertexId: VertexId, x: number, y: number) =>
      dispatch({ type: "MOVE_VERTEX", vertexId, x, y }),
    [],
  );
  const selectEdge = useCallback(
    (edgeId: EdgeId | null) => dispatch({ type: "SELECT_EDGE", edgeId }),
    [],
  );
  const selectFeature = useCallback(
    (featureId: FeatureId | null) =>
      dispatch({ type: "SELECT_FEATURE", featureId }),
    [],
  );
  const selectVertex = useCallback(
    (vertexId: VertexId | null) =>
      dispatch({ type: "SELECT_VERTEX", vertexId }),
    [],
  );
  const clearSelection = useCallback(
    () => dispatch({ type: "CLEAR_SELECTION" }),
    [],
  );
  const setEdgeProfile = useCallback(
    (edgeId: EdgeId, profile: EdgeProfile) =>
      dispatch({ type: "SET_EDGE_PROFILE", edgeId, profile }),
    [],
  );
  const setEdgeProfileBatch = useCallback(
    (edgeIds: readonly EdgeId[], profile: EdgeProfile) =>
      dispatch({ type: "SET_EDGE_PROFILE_BATCH", edgeIds, profile }),
    [],
  );
  const setEdgeExposure = useCallback(
    (edgeId: EdgeId, exposure: EdgeExposure) =>
      dispatch({ type: "SET_EDGE_EXPOSURE", edgeId, exposure }),
    [],
  );
  const setEdgeLength = useCallback(
    (edgeId: EdgeId, newLengthMm: number) =>
      dispatch({ type: "SET_EDGE_LENGTH", edgeId, newLengthMm }),
    [],
  );
  const setMaterial = useCallback(
    (materialId: string) => dispatch({ type: "SET_MATERIAL", materialId }),
    [],
  );
  const addFeature = useCallback(
    (
      feature: Feature,
      placement?: FeaturePlacement,
      fixtureMetadata?: FixtureMetadata,
    ) => {
      // Build the action payload conditionally so optional keys are absent
      // rather than `undefined` — keeps action shapes JSON-clean for tests
      // that snapshot them.
      if (placement && fixtureMetadata) {
        dispatch({
          type: "ADD_FEATURE",
          feature,
          placement,
          fixtureMetadata,
        });
        return;
      }
      if (placement) {
        dispatch({ type: "ADD_FEATURE", feature, placement });
        return;
      }
      if (fixtureMetadata) {
        dispatch({ type: "ADD_FEATURE", feature, fixtureMetadata });
        return;
      }
      dispatch({ type: "ADD_FEATURE", feature });
    },
    [],
  );
  const addFeaturesBatch = useCallback(
    (
      features: readonly Feature[],
      placements: ReadonlyMap<FeatureId, FeaturePlacement>,
      fixtureMetadata: ReadonlyMap<FeatureId, FixtureMetadata>,
    ) =>
      dispatch({
        type: "ADD_FEATURES_BATCH",
        features,
        placements,
        fixtureMetadata,
      }),
    [],
  );
  const removeFeature = useCallback(
    (featureId: FeatureId) =>
      dispatch({ type: "REMOVE_FEATURE", featureId }),
    [],
  );
  const moveFeature = useCallback(
    (featureId: FeatureId, placement: FeaturePlacement) =>
      dispatch({ type: "MOVE_FEATURE", featureId, placement }),
    [],
  );
  const resizeFeature = useCallback(
    (featureId: FeatureId, widthMm: number, depthMm: number) =>
      dispatch({ type: "RESIZE_FEATURE", featureId, widthMm, depthMm }),
    [],
  );
  const setFixtureMetadata = useCallback(
    (featureId: FeatureId, metadata: FixtureMetadata) =>
      dispatch({ type: "SET_FIXTURE_METADATA", featureId, metadata }),
    [],
  );
  const resizeAndShiftFeature = useCallback(
    (
      featureId: FeatureId,
      widthMm: number,
      depthMm: number,
      alongShiftMm: number,
    ) =>
      dispatch({
        type: "RESIZE_AND_SHIFT_FEATURE",
        featureId,
        widthMm,
        depthMm,
        alongShiftMm,
      }),
    [],
  );
  const setToolMode = useCallback(
    (toolMode: ToolMode) => dispatch({ type: "SET_TOOL_MODE", toolMode }),
    [],
  );
  const setMarkup = useCallback(
    (percent: string) => dispatch({ type: "SET_MARKUP", markupPercent: percent }),
    [],
  );
  const applyNlChanges = useCallback(
    (nextPiece: Piece, nextMarkupPercent: string) =>
      dispatch({ type: "APPLY_NL_CHANGES", nextPiece, nextMarkupPercent }),
    [],
  );
  const undo = useCallback(() => dispatch({ type: "UNDO" }), []);
  const redo = useCallback(() => dispatch({ type: "REDO" }), []);
  const loadPiece = useCallback(
    (next: Piece) => dispatch({ type: "LOAD_PIECE", piece: next }),
    [],
  );

  // ───── Round-3A dispatchers ─────
  const insertVertex = useCallback(
    (edgeId: EdgeId, pointMm: { readonly x: number; readonly y: number }) =>
      dispatch({ type: "INSERT_VERTEX", edgeId, pointMm }),
    [],
  );
  const insertVertexMidpoint = useCallback(
    (edgeId: EdgeId) => dispatch({ type: "INSERT_VERTEX_MIDPOINT", edgeId }),
    [],
  );
  const removeVertexCb = useCallback(
    (vertexId: VertexId) => dispatch({ type: "REMOVE_VERTEX", vertexId }),
    [],
  );
  const setCornerRadius = useCallback(
    (vertexId: VertexId, radiusMm: number) =>
      dispatch({ type: "SET_CORNER_RADIUS", vertexId, radiusMm }),
    [],
  );
  const setMultiCornerRadius = useCallback(
    (vertexIds: ReadonlySet<VertexId>, radiusMm: number) =>
      dispatch({ type: "SET_MULTI_CORNER_RADIUS", vertexIds, radiusMm }),
    [],
  );
  const toggleVertexSelection = useCallback(
    (vertexId: VertexId) =>
      dispatch({ type: "TOGGLE_VERTEX_SELECTION", vertexId }),
    [],
  );
  const setVertexAngleCb = useCallback(
    (vertexId: VertexId, angleDeg: number) =>
      dispatch({ type: "SET_VERTEX_ANGLE", vertexId, angleDeg }),
    [],
  );
  const correctAnglesCb = useCallback(
    () => dispatch({ type: "CORRECT_ANGLES" }),
    [],
  );
  const setRoundEnd = useCallback(
    (edgeId: EdgeId, enabled: boolean, bulge?: "left" | "right") => {
      if (bulge) {
        dispatch({ type: "SET_ROUND_END", edgeId, enabled, bulge });
      } else {
        dispatch({ type: "SET_ROUND_END", edgeId, enabled });
      }
    },
    [],
  );
  const createWindowRecess = useCallback(
    (
      wallEdgeId: EdgeId,
      offsetMm: number,
      widthMm: number,
      depthMm: number,
    ) =>
      dispatch({
        type: "CREATE_WINDOW_RECESS",
        wallEdgeId,
        offsetMm,
        widthMm,
        depthMm,
      }),
    [],
  );
  const removeWindowRecess = useCallback(
    (recessId: RecessId) =>
      dispatch({ type: "REMOVE_WINDOW_RECESS", recessId }),
    [],
  );

  // ───── Round-3B callbacks ─────
  const addPiece = useCallback(
    (
      newPiece: Piece,
      joinsToAdd: readonly Join[],
      parentEdgeProfileUpdates?: readonly {
        readonly edgeId: EdgeId;
        readonly profile: EdgeProfile;
      }[],
    ) =>
      dispatch({
        type: "ADD_PIECE",
        piece: newPiece,
        joinsToAdd,
        ...(parentEdgeProfileUpdates !== undefined
          ? { parentEdgeProfileUpdates }
          : {}),
      }),
    [],
  );
  const removePiece = useCallback(
    (pieceIdArg: PieceId) =>
      dispatch({ type: "REMOVE_PIECE", pieceId: pieceIdArg }),
    [],
  );
  const setActivePiece = useCallback(
    (index: number) => dispatch({ type: "SET_ACTIVE_PIECE", index }),
    [],
  );
  const selectBuildUpEdge = useCallback(
    (edgeId: EdgeId | null) =>
      dispatch({ type: "SELECT_BUILD_UP_EDGE", edgeId }),
    [],
  );
  const setEdgeBuildUp = useCallback(
    (edgeId: EdgeId, buildUp: BuildUpDescriptor | null) =>
      dispatch({ type: "SET_EDGE_BUILD_UP", edgeId, buildUp }),
    [],
  );
  const scalePiece = useCallback(
    (scale: number, centroid: { readonly x: number; readonly y: number }) =>
      dispatch({ type: "SCALE_PIECE", scale, centroid }),
    [],
  );

  return {
    state,
    piece,
    markupPercent: state.markupPercent,
    featurePlacements: state.featurePlacements,
    fixtureMetadata: state.fixtureMetadata,
    recessGroups: state.recessGroups,
    canUndo: state.historyIndex > 0,
    canRedo: state.historyIndex < state.history.length - 1,
    dispatch,
    moveVertex,
    selectEdge,
    selectFeature,
    selectVertex,
    clearSelection,
    setEdgeProfile,
    setEdgeProfileBatch,
    setEdgeExposure,
    setEdgeLength,
    setMaterial,
    addFeature,
    addFeaturesBatch,
    removeFeature,
    moveFeature,
    resizeFeature,
    setFixtureMetadata,
    resizeAndShiftFeature,
    setToolMode,
    setMarkup,
    applyNlChanges,
    undo,
    redo,
    loadPiece,
    insertVertex,
    insertVertexMidpoint,
    removeVertex: removeVertexCb,
    setCornerRadius,
    setMultiCornerRadius,
    toggleVertexSelection,
    setVertexAngle: setVertexAngleCb,
    correctAngles: correctAnglesCb,
    setRoundEnd,
    createWindowRecess,
    removeWindowRecess,
    addPiece,
    removePiece,
    setActivePiece,
    selectBuildUpEdge,
    setEdgeBuildUp,
    scalePiece,
  };
}
