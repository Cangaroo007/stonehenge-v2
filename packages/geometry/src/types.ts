// packages/geometry/src/types.ts
//
// Polygon primitive — the contract surface for the geometry package.
//
// All coordinates are in millimetres. All ID fields are branded UUID strings;
// edge metadata is owned by the Edge object and is preserved across vertex
// moves and split/merge operations (see edge-ops.ts).
//
// This module declares types only — no runtime values, no logic.

// ─────────────────────────────────────────────────────────────────────────────
// Branded ID types
// ─────────────────────────────────────────────────────────────────────────────

declare const __brand: unique symbol;
type Brand<T, B> = T & { readonly [__brand]: B };

export type VertexId = Brand<string, "VertexId">;
export type EdgeId = Brand<string, "EdgeId">;
export type FeatureId = Brand<string, "FeatureId">;
export type PieceId = Brand<string, "PieceId">;
export type JoinId = Brand<string, "JoinId">;

// ─────────────────────────────────────────────────────────────────────────────
// Edge metadata — string unions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Edge profile — the geometric finish along the edge run. Values match
 * `data/edge-profiles.json`. Pricing reads this to look up the lineal-metre
 * rate.
 */
export type EdgeProfile =
  | "raw"
  | "pencil-round"
  | "half-bullnose"
  | "full-bullnose"
  | "bevel"
  | "ogee"
  | "dupont"
  | "mitre-45";

/**
 * Surface finish on the top face adjacent to the edge. The fabrication
 * implication (extra polishing time, etc.) is downstream — pricing in the
 * prototype uses profile only.
 */
export type EdgeFinish =
  | "polished"
  | "honed"
  | "leathered"
  | "matt"
  | "unfinished";

/**
 * Exposure of the edge in situ. Drives which edges are billable for
 * profiling: only `exposed` edges contribute to `computeExposedPerimeterMm`.
 *
 * - `exposed`  — visible edge (e.g. front of benchtop, waterfall return).
 * - `wall`     — abuts a wall; not profiled.
 * - `concealed`— hidden by an appliance, splashback, or upper cabinetry.
 * - `join`     — shared with another piece via a Join entity.
 */
export type EdgeExposure = "exposed" | "wall" | "concealed" | "join";

// ─────────────────────────────────────────────────────────────────────────────
// Curves and mitres
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Description of a curved edge. Phase-1 supports circular arcs only. The arc
 * runs from `edge.start` to `edge.end` along a circle of the given radius;
 * `bulge` chooses which side of the chord the arc bows toward.
 *
 * For perimeter calculations the prototype linearises to chord length (see
 * `kernel.ts`). Arc-accurate perimeter is deferred to the V3 kernel.
 */
export interface CurveDescriptor {
  readonly kind: "arc";
  readonly radiusMm: number;
  readonly bulge: "left" | "right";
}

/**
 * Mitre joint at a vertex. Used when two edges meeting at a vertex are
 * fabricated as a mitred corner (e.g. waterfall ends).
 */
export interface MitreDescriptor {
  readonly angleDeg: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Vertex / Edge / Ring
// ─────────────────────────────────────────────────────────────────────────────

export interface Vertex {
  readonly id: VertexId;
  readonly x: number; // mm
  readonly y: number; // mm
  readonly mitre?: MitreDescriptor;
  /**
   * Round-3A: optional corner radius. When present and > 0, the corner at
   * this vertex is fabricated as a circular arc tangent to both adjacent
   * edges. The arc is constructed at render / kernel time from the radius
   * plus the prev/next vertex positions (see `curve-ops.computeCornerArc`).
   *
   * Sharp corners omit the field. `0` is treated as sharp. Validation
   * (`validatePiece`) rejects radii that exceed half the length of either
   * adjacent edge — that bound prevents two corner arcs on a shared edge
   * from overlapping.
   */
  readonly cornerRadiusMm?: number;
}

export interface Edge {
  readonly id: EdgeId;
  readonly start: VertexId;
  readonly end: VertexId;
  readonly curve?: CurveDescriptor;
  readonly profile: EdgeProfile;
  readonly finish: EdgeFinish;
  readonly exposure: EdgeExposure;
  /**
   * Round 3B (UNCERTAIN-3B-2 [A]): structural build-up descriptor for this
   * edge. When present, the edge is fabricated with additional laminated
   * strips (Parts B/C/D in the canonical part vocabulary). Pricing reads
   * this to add build-up line items; `generateBuildUpPieces` reads this to
   * synthesise child pieces.
   *
   * Replaces the Phase-1 `buildUpRef?: string` opaque-string slot
   * (no runtime call sites used the previous shape).
   */
  readonly buildUp?: BuildUpDescriptor;
  /**
   * Provenance: the operation that produced this edge. Used to trace edges
   * back through split/merge history. `undefined` for original authored edges.
   */
  readonly generatedBy?: "split" | "merge" | "import";
}

export interface Ring {
  readonly edges: readonly EdgeId[];
  readonly orientation: "ccw" | "cw";
}

// ─────────────────────────────────────────────────────────────────────────────
// Features — 6-arm discriminated union
// ─────────────────────────────────────────────────────────────────────────────

interface FeatureBase {
  readonly id: FeatureId;
  /** Local position within the parent piece, mm. */
  readonly position: { readonly x: number; readonly y: number };
}

export interface UndermountSink extends FeatureBase {
  readonly kind: "undermount-sink";
  readonly bowlWidthMm: number;
  readonly bowlDepthMm: number;
}

export interface OvermountSink extends FeatureBase {
  readonly kind: "overmount-sink";
  readonly cutoutWidthMm: number;
  readonly cutoutDepthMm: number;
}

export interface CooktopCutout extends FeatureBase {
  readonly kind: "cooktop-cutout";
  readonly cutoutWidthMm: number;
  readonly cutoutDepthMm: number;
  readonly cornerRadiusMm: number;
}

export interface TapHole extends FeatureBase {
  readonly kind: "tap-hole";
  readonly diameterMm: number;
}

export interface WindowRecess extends FeatureBase {
  readonly kind: "window-recess";
  readonly widthMm: number;
  readonly depthMm: number;
  /** Depth of the recess into the stone, mm. */
  readonly intrusionMm: number;
}

export interface CustomCutout extends FeatureBase {
  readonly kind: "custom-cutout";
  /** Free-form polygon outline in piece-local coordinates, mm. */
  readonly outline: ReadonlyArray<{ readonly x: number; readonly y: number }>;
}

export type Feature =
  | UndermountSink
  | OvermountSink
  | CooktopCutout
  | TapHole
  | WindowRecess
  | CustomCutout;

export type FeatureKind = Feature["kind"];

// ─────────────────────────────────────────────────────────────────────────────
// Joins
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Round 7A (V3 §14, ADR-07): JoinKind upgraded to UPPER_SNAKE_CASE to align
 * with the V3 Prisma schema. The four shop-floor join kinds are unchanged
 * in meaning — only the literals change:
 *
 *   Round 3B literal       Round 7A literal
 *   ─────────────────      ────────────────
 *   "straight-butt"   →    "BUTT"
 *   "mitre-45"        →    "MITRE"
 *   "mason-mitre"     →    "MASON_MITRE"
 *   "field-join"      →    "FIELD_JOIN"
 *
 * `data/join-rates.json` is keyed on this vocabulary.
 */
export type JoinKind = "MITRE" | "BUTT" | "MASON_MITRE" | "FIELD_JOIN";

/**
 * Round 7A (V3 §14): orthogonal classification of *why* a join exists.
 * Kind says how the slabs meet at the fabrication shop (mitre vs butt
 * vs field-join); reason says what the join is for in the assembly
 * (waterfall, splashback, piece-to-piece run, build-up strip). V3 reads
 * both — the prototype previously had only kind.
 */
export type JoinReason =
  | "WATERFALL_ATTACHMENT"
  | "SPLASHBACK_ATTACHMENT"
  | "PIECE_JOIN"
  | "BUILD_UP";

export interface Join {
  readonly id: JoinId;
  /**
   * Round 3B (UNCERTAIN-3B-4 [A]): pieceA / pieceB carry the parent piece
   * IDs so join lookups are O(1). Tiny redundancy with the edge IDs is
   * justified by the first runtime use of `Join` landing in Round 3B.
   */
  readonly pieceA: PieceId;
  readonly pieceB: PieceId;
  readonly edgeA: EdgeId;
  readonly edgeB: EdgeId;
  readonly kind: JoinKind;
  /**
   * Round 7A: reason this join exists. See `JoinReason`. Required so V3
   * can store/render the assembly intent alongside the fabrication kind.
   */
  readonly reason: JoinReason;
  /**
   * Round 7A (2-Gap-3): for MITRE joins, the actual mitre angle in degrees,
   * computed from the two adjoining edge directions (not hardcoded 45).
   * Omitted for non-mitre joins.
   */
  readonly angleDeg?: number;
  readonly sealant?: string;
  readonly gapMm?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Piece roles, build-ups, and the Piece / Job containers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Round 3B: structural role of a Piece in a Job. Drives the "Add piece"
 * panel, drives `generateBuildUpPieces`, and informs join detection
 * (a BENCHTOP+WATERFALL_END pair detects a mitre-45 join; a
 * BENCHTOP+SPLASHBACK_FULL pair detects a straight-butt join).
 *
 * The four part roles (`TOP`, `FASCIA`, `RETURN`, `INFILL`) are reserved
 * for child pieces synthesised by `generateBuildUpPieces`. They carry a
 * `parentPieceId` pointing at the slab they belong to.
 */
export type PieceRole =
  | "BENCHTOP"
  | "ISLAND_TOP"
  | "WATERFALL_END"
  | "SPLASHBACK_FULL"
  | "SPLASHBACK_LOW"
  | "UPSTAND"
  | "END_PANEL"
  | "WINDOWSILL"
  | "TOP"
  | "FASCIA"
  | "RETURN"
  | "INFILL"
  | "CUSTOM";

/**
 * Round 3B: edge build-up descriptor. Attached to `Edge.buildUp`; consumed
 * by `generateBuildUpPieces` (geometry) and `calcBuildUpCosts` (pricing).
 *
 *   - `targetThicknessMm` — fabricated thickness of the finished edge
 *     (typically 40, 60, or 80 mm).
 *   - `method` — `LAMINATED` glues strips to the slab face; `SOLID` is
 *     a V-groove + fold from a single slab cut (no separate child strips).
 *   - `stripWidthMm` — front-to-back depth of the fascia/return strip
 *     (typically 40–80 mm).
 */
export interface BuildUpDescriptor {
  readonly targetThicknessMm: number;
  readonly method: "LAMINATED" | "SOLID";
  readonly stripWidthMm: number;
}

export interface PieceTransform {
  readonly translateMm?: { readonly x: number; readonly y: number };
  readonly rotationRad?: number;
}

export interface Piece {
  readonly id: PieceId;
  readonly name: string;
  /**
   * Round 3B: structural role. Drives the "Add piece" affordances and the
   * join-detection heuristics. Phase-1 fixtures default to `"BENCHTOP"`.
   */
  readonly pieceRole: PieceRole;
  /** Material catalogue ID, matches `data/materials.json`. */
  readonly materialId: string;
  /**
   * Round 3B: slab thickness in mm. Phase-1 default is `20`. A build-up on
   * an edge can target a thicker finished appearance (e.g. 40 mm) without
   * changing this number — the strips are separate child pieces.
   */
  readonly thicknessMm: number;
  /**
   * Round 3B: when this piece is a build-up child (Fascia/Return/Infill),
   * the parent slab's id. Omitted for top-level pieces (BENCHTOP,
   * WATERFALL_END, SPLASHBACK_*, etc.). Mirrors the V3 Prisma schema where
   * `parent_piece_id` is the cascading FK for atomic remove-on-parent.
   */
  readonly parentPieceId?: PieceId;
  readonly vertices: readonly Vertex[];
  readonly edges: readonly Edge[];
  readonly outerRing: Ring;
  readonly innerRings: readonly Ring[];
  readonly features: readonly Feature[];
  readonly transform?: PieceTransform;
}

export interface Job {
  readonly pieces: readonly Piece[];
  readonly joins: readonly Join[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometric helpers (used by kernel + edge-ops; declared here for sharing)
// ─────────────────────────────────────────────────────────────────────────────

export interface BoundingBoxMm {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}
