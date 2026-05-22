// apps/web/src/types/editor.ts
//
// UI-level types for the editor. State that lives in `usePiece` is defined
// here, plus interaction modes used by feature placement and edge selection.

import type {
  EdgeId,
  Feature,
  FeatureId,
  Job,
  Piece,
  PieceRole,
  VertexId,
} from "@stonehenge-proto/geometry";

/**
 * Round-3A: bookkeeping for window recesses. A recess is a topology
 * mutation that splits one wall edge into 5 edges and inserts 4 vertices.
 * The bookkeeping records which vertex/edge IDs belong to which recess so
 * the editor can reverse the mutation atomically.
 *
 * Per UNCERTAIN-4 [A]: lives on EditorState, mirroring the
 * `featurePlacements` / `fixtureMetadata` pattern. NOT in the geometry
 * package's `Edge.generatedBy`. Snapshot-included for undo/redo.
 *
 * `recessId` is opaque — newly minted on each `CREATE_WINDOW_RECESS`.
 * `backEdgeId` is the central edge of the recess (the windowsill);
 * removing the recess looks up the group by this ID.
 */
export type RecessId = string & { readonly __recessId: unique symbol };

export interface RecessGroup {
  readonly recessId: RecessId;
  /** The 5 edges that make up the recess (along the original wall). */
  readonly edgeIds: readonly EdgeId[];
  /** The 4 vertices inserted to form the notch. */
  readonly vertexIds: readonly VertexId[];
  /** The recess back edge — the windowsill. */
  readonly backEdgeId: EdgeId;
  /** Original wall edge metadata (for restoration if removed). */
  readonly originalEdgeMetadata: {
    readonly profile: import("@stonehenge-proto/geometry").EdgeProfile;
    readonly finish: import("@stonehenge-proto/geometry").EdgeFinish;
    readonly exposure: import("@stonehenge-proto/geometry").EdgeExposure;
  };
}

/**
 * Catalogue-derived metadata for a placed feature.
 *
 * Round 2 — fixture catalogue. The brief originally proposed storing the
 * SKU on the geometry-package `Feature` itself, but `packages/geometry` is
 * out of scope for this round and `Feature` has no `catalogSku` field
 * (Gate 0 audit UNCERTAIN-A [A]). Instead, this is a parallel map on
 * `EditorState`, mirroring the `featurePlacements` pattern: same FeatureId
 * key, same lifecycle, same snapshot inclusion so undo/redo restores it
 * atomically.
 *
 * The shape mirrors the load-bearing fields of a V3 catalogue entry
 * (`_research/2026-05-07-appliance-catalogue/types.ts`) — the SKU plus the
 * minimal display + verification metadata the picker needs to surface to
 * the operator. `catalogueEntryId === null` denotes a "Custom dimensions"
 * placement (no manufacturer record).
 */
export interface FixtureMetadata {
  /** V3 catalogue entry id (e.g. "blanco-etagon-700u"). null = custom dimensions. */
  readonly catalogueEntryId: string | null;
  readonly brand: string | null;
  readonly model: string | null;
  /** V3's `mount_type` field. Used by the canvas label and the picker. */
  readonly mountType: string | null;
  /**
   * True when the manufacturer ships a paper/MDF cutting template and the
   * cutout dimensions are advisory. The picker shows a "Template required"
   * notice on these entries (V3 schema, mostly basins).
   */
  readonly cutoutTemplateSupplied: boolean;
  /**
   * Round-3A: structural-cutout differentiator. When set to "structural",
   * the resize lock on `custom-cutout` features is lifted (UNCERTAIN-8 [A])
   * so the operator can adjust column dimensions without delete/replace.
   * Other installation types behave as before.
   */
  readonly installationType?: "structural";
  /**
   * Round 8A (FIX 1) — default edge profile applied to the *cutout* edge
   * the fabricator cuts into the stone for this feature. Undermount sinks
   * have a visible, touchable cutout edge that must be finished (defaults
   * to "pencil-round"); overmount sinks and cooktops cover the cutout edge
   * with a lip or rim ("raw"); tap holes are drilled (no profile concept).
   *
   * Drives the dashed-outline colour in `FeatureOverlay` (the profile
   * colour from `PROFILE_COLOURS` replaces the per-kind colour when the
   * profile is non-raw) and a "Cutout profiling — {profile} · {lm}" line
   * item in the quote (composed at the `useQuote` layer, not in
   * `packages/pricing`, because the calculator stays out of scope for
   * this round).
   */
  readonly cutoutEdgeProfile?: import("@stonehenge-proto/geometry").EdgeProfile;
}

/**
 * Edge-referenced placement for a feature. Outer-edge semantics
 * (UNCERTAIN-2 [A]):
 *   - `referenceEdgeId`   — which edge the feature is anchored to
 *   - `offsetAlongEdgeMm` — distance along the edge from the START vertex
 *                           to the feature's centre, projected onto the
 *                           edge direction
 *   - `offsetInwardMm`    — distance from the reference edge to the
 *                           feature's OUTER face. 0 = flush with the edge.
 *                           The feature's centre is then
 *                           `outer_face + featureDepthMm/2` inward.
 *
 * Features placed via the palette or repositioned via drag carry a
 * placement entry. Legacy features (Vision extraction, NL commands) have
 * no entry until first drag, which bootstraps one (UNCERTAIN-8 [A]).
 */
export interface FeaturePlacement {
  readonly referenceEdgeId: EdgeId;
  readonly offsetAlongEdgeMm: number;
  readonly offsetInwardMm: number;
}

/**
 * Tool mode discriminated union. `select` is the default; `feature-place`
 * carries the `featureKind` payload chosen from the feature palette
 * (Phase 2A audit UNCERTAIN-3 [A]).
 *
 * Vertex drag is not a mode — Konva handles drag interaction inline on the
 * vertex handle itself. Adding `feature-place` per kind keeps the union
 * extensible for Phase 2B NL commands.
 *
 * Round-3A:
 *   - `insert-vertex` arms the canvas to convert hover-on-edge into a
 *     "+" indicator and a click into a vertex insertion. The shortcut is
 *     also the V key (FeaturePalette toggles the mode).
 *   - `recess-place` arms the canvas to place a window-recess notch on
 *     a wall edge. Differs from `feature-place` because the recess is
 *     a topology mutation, not a feature overlay.
 *   - `structural-place` arms the canvas to place a circular or
 *     rectangular structural cutout (column / pole). Stored as a
 *     custom-cutout feature with structural fixture metadata.
 */
export type ToolMode =
  | { readonly kind: "select" }
  | { readonly kind: "feature-place"; readonly featureKind: Feature["kind"] }
  | { readonly kind: "insert-vertex" }
  | { readonly kind: "recess-place" }
  /**
   * Round 10 (Fix 4) — "Add arm" tool. Stage 1 (`pick-edge`): the operator
   * has clicked the Add arm palette entry; all outer-ring edges glow and
   * the canvas treats the next edge click as the chosen reference edge.
   * Stage 2 (`dimensions`): an edge has been picked and the modal is open
   * collecting `widthMm` / `lengthMm` / `offsetAlongEdgeMm`. Confirm fires
   * the ADD_ARM action; cancel returns to `select`. Keeping the two
   * stages distinct lets the canvas render the dimensioned ghost
   * rectangle only during stage 2.
   */
  | { readonly kind: "add-arm-pick-edge" }
  | {
      readonly kind: "add-arm-dimensions";
      readonly edgeId: import("@stonehenge-proto/geometry").EdgeId;
      readonly widthMm: number;
      readonly lengthMm: number;
      readonly offsetAlongEdgeMm: number;
    }
  | {
      /**
       * Round 7A (FIX 3): unified "Cutout" tool. Three shapes supported —
       * rectangle / circle / L-shape (for corner posts and structural
       * notches). Placed via a click anywhere inside the polygon.
       */
      readonly kind: "structural-place";
      readonly shape: "circle" | "rectangle" | "l-shape";
      readonly widthMm: number;
      readonly depthMm: number;
    }
  /**
   * Round 3B (UNCERTAIN-3B-8 [A]): arm the canvas to anchor a new piece
   * (waterfall / splashback / upstand / end-panel / windowsill). `side`
   * is set for left/right-anchored pieces; omitted for centre-anchored
   * pieces (splashback/upstand spans the full back wall).
   */
  | {
      readonly kind: "add-piece";
      readonly role: PieceRole;
      readonly side?: "left" | "right";
    };

/**
 * Round 5 (Part B) — editor view mode. `2d` is the Konva-driven editing
 * canvas (default); `3d` is the read-only Three.js visualisation.
 */
export type ViewMode = "2d" | "3d";

/**
 * Default markup percent when a session boots. Decimal string for
 * Decimal.js round-trip safety.
 */
export const DEFAULT_MARKUP_PERCENT = "15";

/**
 * One frame of the undo stack. Snapshots the job geometry plus the markup
 * plus the feature placements so an NL command (or feature drag) is undone
 * as a single Cmd-Z (UNCERTAIN-2B-3 [A], UNCERTAIN-3 [A]).
 *
 * Placements live in the snapshot — not just on the live state — so undo
 * restores BOTH the feature's `position` (via `Piece.features[].position`)
 * AND its edge-reference metadata atomically. This avoids hidden state
 * drift from visible state.
 */
export interface EditorSnapshot {
  readonly job: Job;
  readonly markupPercent: string;
  readonly featurePlacements: ReadonlyMap<FeatureId, FeaturePlacement>;
  /**
   * Round 2 fixture catalogue. Pruned in lockstep with `featurePlacements`
   * after every mutation that adds/removes features.
   */
  readonly fixtureMetadata: ReadonlyMap<FeatureId, FixtureMetadata>;
  /**
   * Round-3A — recess bookkeeping. Maps recessId → group. Snapshot-included
   * so undo restores the mapping atomically with the geometry.
   */
  readonly recessGroups: ReadonlyMap<RecessId, RecessGroup>;
}

/**
 * Editor state — a single source of truth for the canvas. Wraps a `Job`
 * with bookkeeping for selection, tool mode, markup, and undo/redo history.
 *
 * Architecture note: Phase 2A has exactly one piece, but we keep the Job
 * container so multi-photo stitching (Phase 2B) does not require a state
 * model rewrite.
 */
export interface EditorState {
  readonly job: Job;
  /**
   * Markup percent as a Decimal-safe string (e.g. "15" for 15 %). Wired
   * into `useQuote` so the quote panel reflects markup edits live. Phase
   * 2B introduces NL commands that can mutate this value.
   */
  readonly markupPercent: string;
  /**
   * Edge-referenced placements per feature ID. Mirrors the active
   * snapshot's `featurePlacements`. Pruned to existing feature IDs after
   * NL commands (which may add/remove features without supplying
   * placements).
   */
  readonly featurePlacements: ReadonlyMap<FeatureId, FeaturePlacement>;
  /**
   * Round 2 — fixture catalogue. Mirrors the active snapshot's
   * `fixtureMetadata`. Pruned to existing feature IDs after any mutation.
   */
  readonly fixtureMetadata: ReadonlyMap<FeatureId, FixtureMetadata>;
  /**
   * Round-3A — window-recess bookkeeping. Per UNCERTAIN-4 [A], lives on
   * the editor state (not on geometry-package types). Mirrors the active
   * snapshot's `recessGroups`.
   */
  readonly recessGroups: ReadonlyMap<RecessId, RecessGroup>;
  readonly activePieceIndex: number;
  readonly selectedEdgeId: EdgeId | null;
  readonly selectedFeatureId: FeatureId | null;
  readonly selectedVertexId: VertexId | null;
  /**
   * Round 15 (Fix 1) — multi-vertex selection. Ctrl+Shift+click adds
   * vertices to this set; plain click resets it to a single-element set.
   * `selectedVertexId` stays as the "primary" (most recently clicked) for
   * downstream UI that still expects a single ID — single-select code paths
   * continue to work unchanged. Multi-vertex operations
   * (SET_MULTI_CORNER_RADIUS) read this set directly.
   */
  readonly selectedVertexIds: ReadonlySet<VertexId>;
  /**
   * Round 3B (UNCERTAIN-3B-8 [A]): transient UI state — which edge has its
   * BuildUpPanel open. Snapshot-excluded (build-up structural state lives
   * on `Edge.buildUp` in the geometry package).
   */
  readonly selectedBuildUpEdgeId: EdgeId | null;
  readonly toolMode: ToolMode;
  /** Undo stack of editor snapshots. Capped at HISTORY_CAP (50). */
  readonly history: readonly EditorSnapshot[];
  readonly historyIndex: number;
  /**
   * The feature ID of an in-progress resize. RESIZE_FEATURE actions on the
   * same feature replace the top of the history stack rather than appending
   * — so a 2 s resize drag at 60 fps still produces exactly one undo
   * entry. Cleared on any non-RESIZE_FEATURE action.
   */
  readonly resizingFeatureId: FeatureId | null;
}

/**
 * Selector helper — returns the active piece. Consumers should read this
 * via `useActivePiece` rather than reaching into `state.job.pieces`.
 */
export function selectActivePiece(state: EditorState): Piece {
  const piece = state.job.pieces[state.activePieceIndex];
  if (!piece) {
    throw new Error(
      `selectActivePiece: activePieceIndex ${state.activePieceIndex} out of range (job has ${state.job.pieces.length} pieces)`,
    );
  }
  return piece;
}

/**
 * Bounding box of all rendered geometry across the entire Job. Used by the
 * canvas to fit the camera on first load.
 */
export interface CanvasViewport {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly mmPerPx: number;
  readonly panMmX: number;
  readonly panMmY: number;
}
