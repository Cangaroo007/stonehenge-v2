// apps/web/src/lib/secondary-pieces.ts
//
// Round 6 (Fix 2) — explicit-edge secondary-piece builders.
//
// Replaces the Round 3B "find the rightmost edge" / "find the topmost edge"
// auto-detection that misclassified L- and U-shape edges (the rightmost
// edge of an L-shape lives on the return arm; the topmost might be the
// notch's inner corner). The new flow is operator-driven: the canvas
// highlights valid edges, the operator picks one, and the builder anchors
// the new piece to THAT edge.
//
// API:
//   generateWaterfall(parent, attachEdgeId, heightMm?)   → { piece, join }
//   generateEndPanel(parent, attachEdgeId, heightMm?)    → { piece, join }
//   generateSplashback(parent, wallEdgeIds, heightMm?, role?)
//                                                       → { pieces, joins }
//   generateWindowsill(parent, recessBackEdgeId, depthMm?)
//                                                       → { piece, join }
//
// Each builder:
//   1. Looks up the named edge on the parent
//   2. Computes the edge's start/end vertex positions, its tangent (along
//      the edge) and inward perpendicular
//   3. Generates the secondary piece's polygon in parent-local mm
//      coordinates — flush against the edge, extending OUTWARD (i.e. away
//      from the parent polygon's interior). The 2D footprint is what shows
//      on the canvas; the Three.js layer handles the actual vertical
//      orientation in 3D.
//   4. Returns the piece (with parentPieceId set so the canvas knows to
//      render it anchored in place) plus the Join.
//
// Valid-edge helpers — used by AddPiecePanel to highlight which edges the
// operator can pick:
//   getWaterfallValidEdges(piece)
//   getSplashbackValidEdges(piece)
//   getEndPanelValidEdges(piece)

import {
  edgeId,
  makeJoin,
  pieceId,
  vertexId,
} from "@stonehenge-proto/geometry";
import type {
  Edge,
  EdgeExposure,
  EdgeId,
  EdgeProfile,
  Job,
  Join,
  JoinKind,
  JoinReason,
  Piece,
  PieceRole,
  Ring,
  Vertex,
} from "@stonehenge-proto/geometry";

const DEFAULT_PROFILE: EdgeProfile = "raw";

/** Standard cabinet height (waterfall + end-panel default depth). */
const DEFAULT_WATERFALL_HEIGHT_MM = 870;
/** Full-height splashback default. */
const DEFAULT_SPLASHBACK_FULL_HEIGHT_MM = 600;
/** Low splashback default. */
const DEFAULT_SPLASHBACK_LOW_HEIGHT_MM = 200;
/** Upstand default (low strip behind benchtop). */
const DEFAULT_UPSTAND_HEIGHT_MM = 150;
/** Windowsill default depth (inside the recess). */
const DEFAULT_WINDOWSILL_DEPTH_MM = 100;

// ─────────────────────────────────────────────────────────────────────────
// Public API — edge-driven builders
// ─────────────────────────────────────────────────────────────────────────

export interface WaterfallResult {
  readonly piece: Piece;
  readonly join: Join;
  /**
   * Round 16 (Fix 2) — when the secondary piece joins the parent via a
   * mitred face (waterfall / end-panel always; splashback when the
   * operator opts in via the "Mitred (seamless)" toggle), the parent's
   * attach edge should switch from its current profile to `mitre-45`
   * so the canvas shows both faces of the joint with the correct
   * colour band. The editor applies the change atomically with the
   * `ADD_PIECE` snapshot — one undo step covers everything.
   *
   * Absent for flush splashbacks (the standard butt-join — silicone
   * bead, both faces stay `raw`) and any future role where the join
   * doesn't change the parent's profile.
   */
  readonly parentEdgeProfileUpdate?: {
    readonly edgeId: EdgeId;
    readonly profile: EdgeProfile;
  };
}

/**
 * Generate a waterfall end attached to a specific edge.
 *
 * The waterfall is a vertical panel that drops from benchtop height to the
 * floor on the named end edge. In 2D the footprint reads as a rectangle:
 *   - one side flush with the selected edge
 *   - extending outward by `heightMm` (default 870 mm — cabinet height)
 *
 * Returns `null` if the named edge isn't present on the parent.
 */
export function generateWaterfall(
  parent: Piece,
  attachEdgeId: EdgeId,
  heightMm: number = DEFAULT_WATERFALL_HEIGHT_MM,
): WaterfallResult | null {
  // Round 16 (Fix 2): waterfall joins are always mitred. Both the
  // waterfall's join-side face (e0) and the parent's attach edge get
  // `mitre-45` so the canvas reads the joint correctly straight after
  // creation. Earlier rounds left both as "raw", which forced the
  // operator to click each face and change the profile by hand.
  return buildEdgeAnchoredPanel({
    parent,
    attachEdgeId,
    role: "WATERFALL_END",
    extentMm: heightMm,
    joinKind: "MITRE",
    joinReason: "WATERFALL_ATTACHMENT",
    namePrefix: "Waterfall",
    joinFaceProfile: "mitre-45",
  });
}

/**
 * Generate an end-panel attached to a specific exposed edge. Behaves like
 * a waterfall but billed as an END_PANEL role (joiner UI may treat them
 * differently in V3; in the prototype the geometry is identical).
 */
export function generateEndPanel(
  parent: Piece,
  attachEdgeId: EdgeId,
  heightMm: number = DEFAULT_WATERFALL_HEIGHT_MM,
): WaterfallResult | null {
  // Round 16 (Fix 2): end panels behave like waterfalls — same MITRE
  // join, same auto-profiled mitre-45 on both faces.
  return buildEdgeAnchoredPanel({
    parent,
    attachEdgeId,
    role: "END_PANEL",
    extentMm: heightMm,
    joinKind: "MITRE",
    joinReason: "WATERFALL_ATTACHMENT",
    namePrefix: "End panel",
    joinFaceProfile: "mitre-45",
  });
}

export interface SplashbackResult {
  readonly pieces: readonly Piece[];
  readonly joins: readonly Join[];
  /**
   * Round 16 (Fix 2) — parent edge profile updates, one per generated
   * splashback piece, when the operator chose the mitred join style.
   * Empty for the standard flush (butt-join with silicone) style — the
   * parent's wall edge keeps its current profile and the splashback's
   * bottom edge stays `raw`.
   */
  readonly parentEdgeProfileUpdates: readonly {
    readonly edgeId: EdgeId;
    readonly profile: EdgeProfile;
  }[];
}

export type SplashbackRole = "SPLASHBACK_FULL" | "SPLASHBACK_LOW" | "UPSTAND";

/**
 * Round 16 (Fix 2) — splashback join style. Australian fabrication
 * standard is the butt-join (`"flush"`): the splashback's bottom face
 * sits flat against the back of the benchtop, sealed with silicone.
 * The benchtop's back edge stays `raw` (hidden by the splashback). The
 * `"mitred"` alternative cuts both faces at 45° for a seamless visible
 * join — more expensive (two mitre cuts instead of two raw faces) but
 * sometimes specified for high-end engineered stone.
 */
export type SplashbackJoinStyle = "flush" | "mitred";

/**
 * Generate splashback piece(s) attached to one or more wall edges.
 *
 * For a single edge: one rectangular piece along that edge.
 * For multiple edges: one piece per edge. Each piece is independent (no
 * mitre-join modelling yet — that requires resolving how two wall edges
 * meet at a corner; the prototype just bills them as separate pieces with
 * straight-butt joins to the parent). This is sufficient for the L-shape
 * UX target — the operator can pick the two wall edges and get two
 * splashback billings.
 *
 * Returns an empty result if none of the named edges are present on the
 * parent.
 */
export function generateSplashback(
  parent: Piece,
  wallEdgeIds: readonly EdgeId[],
  heightMm?: number,
  role: SplashbackRole = "SPLASHBACK_FULL",
  joinStyle: SplashbackJoinStyle = "flush",
): SplashbackResult {
  const extentMm = heightMm ?? defaultSplashbackHeight(role);
  const pieces: Piece[] = [];
  const joins: Join[] = [];
  const parentEdgeProfileUpdates: Array<{
    edgeId: EdgeId;
    profile: EdgeProfile;
  }> = [];
  const name =
    role === "SPLASHBACK_FULL"
      ? "Splashback — full height"
      : role === "SPLASHBACK_LOW"
        ? "Splashback — low"
        : "Upstand";
  // Round 16 (Fix 2): only mitred splashbacks set both faces to
  // mitre-45. The default flush join leaves the splashback's bottom
  // edge and the parent's wall edge both as `raw` (the standard
  // silicone-bead butt-join in Australian stone fabrication).
  const mitred = joinStyle === "mitred";
  for (const edgeIdValue of wallEdgeIds) {
    const result = buildEdgeAnchoredPanel({
      parent,
      attachEdgeId: edgeIdValue,
      role,
      extentMm,
      joinKind: "BUTT",
      joinReason: "SPLASHBACK_ATTACHMENT",
      namePrefix: name,
      ...(mitred ? { joinFaceProfile: "mitre-45" as const } : {}),
    });
    if (!result) continue;
    pieces.push(result.piece);
    joins.push(result.join);
    if (result.parentEdgeProfileUpdate) {
      parentEdgeProfileUpdates.push(result.parentEdgeProfileUpdate);
    }
  }
  return { pieces, joins, parentEdgeProfileUpdates };
}

/**
 * Generate a windowsill that sits inside a recess. The named edge is the
 * recess back-edge (the windowsill's depth-into-the-wall direction).
 */
export function generateWindowsill(
  parent: Piece,
  recessBackEdgeId: EdgeId,
  depthMm: number = DEFAULT_WINDOWSILL_DEPTH_MM,
): WaterfallResult | null {
  return buildEdgeAnchoredPanel({
    parent,
    attachEdgeId: recessBackEdgeId,
    role: "WINDOWSILL",
    extentMm: depthMm,
    joinKind: "BUTT",
    joinReason: "PIECE_JOIN",
    namePrefix: "Windowsill",
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Valid-edge helpers (drive the AddPiecePanel highlight)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Edges where a waterfall can attach. The brief calls for "exposed end
 * edges" — exposed edges that are the shorter of two perpendicular edges
 * meeting at a vertex. For the prototype we accept any exposed straight
 * edge: an operator may reasonably want to drop a waterfall on a long
 * side of an island. The downstream geometry doesn't care.
 *
 * Round 7A (2-Gap-4): curved edges are excluded — a waterfall's rectangular
 * footprint can't sensibly mitre to an arc, and the V2 fabrication shop
 * doesn't have a sane treatment for it. The operator can straighten the
 * edge first (set corner radius to 0 / clear the round end) and try again.
 *
 * The exclusion: never offer wall, concealed, join, or curved edges.
 */
export function getWaterfallValidEdges(piece: Piece): readonly EdgeId[] {
  return piece.outerRing.edges.filter((id) => {
    const e = piece.edges.find((x) => x.id === id);
    return (
      e !== undefined && e.exposure === "exposed" && e.curve === undefined
    );
  });
}

/**
 * Edges where a splashback can attach. By definition splashbacks sit
 * against a wall, so this matches `exposure === "wall"`. Round 7A
 * (2-Gap-4): curved edges excluded for consistency with waterfalls.
 */
export function getSplashbackValidEdges(piece: Piece): readonly EdgeId[] {
  return piece.outerRing.edges.filter((id) => {
    const e = piece.edges.find((x) => x.id === id);
    return e !== undefined && e.exposure === "wall" && e.curve === undefined;
  });
}

/**
 * Edges where an end-panel can attach. Same shape as waterfall valid
 * edges — exposed straight edges.
 */
export function getEndPanelValidEdges(piece: Piece): readonly EdgeId[] {
  return getWaterfallValidEdges(piece);
}

// ─────────────────────────────────────────────────────────────────────────
// Round 7A (2-Gap-6) — one-attachment-per-edge guard
// ─────────────────────────────────────────────────────────────────────────

export type EdgeAttachment =
  | { readonly yes: true; readonly attachedRole: PieceRole; readonly attachedName: string }
  | { readonly yes: false };

/**
 * Is `edgeId` already the anchor edge (the `join.edgeA`) for some join
 * in the Job? When yes, reports the role + name of the attached piece
 * so the UI can produce a tailored "This edge already has a [waterfall]"
 * message.
 */
export function isEdgeAlreadyAttached(
  job: Job,
  parentPieceId: Piece["id"],
  edgeId: EdgeId,
): EdgeAttachment {
  for (const j of job.joins) {
    if (j.pieceA !== parentPieceId) continue;
    if (j.edgeA !== edgeId) continue;
    const other = job.pieces.find((p) => p.id === j.pieceB);
    if (!other) continue;
    return { yes: true, attachedRole: other.pieceRole, attachedName: other.name };
  }
  return { yes: false };
}

// ─────────────────────────────────────────────────────────────────────────
// Round 7A (2-Gap-3) — splashback corner-mitre detection on second add
// ─────────────────────────────────────────────────────────────────────────

const SPLASHBACK_ROLES: ReadonlySet<PieceRole> = new Set<PieceRole>([
  "SPLASHBACK_FULL",
  "SPLASHBACK_LOW",
  "UPSTAND",
]);

/**
 * After a splashback is added, scan the Job for any existing splashback
 * whose anchor edge is adjacent (shares a vertex) to the new splashback's
 * anchor edge. If found, emit a MITRE join between the two splashbacks
 * with `angleDeg` computed from the parent edge directions.
 *
 * Returns a list of new joins (zero or one in the common case; could be
 * two if both ends of the new splashback abut existing splashbacks).
 * The caller (editor/page.tsx handleConfirmSplashback) appends them in
 * the same `addPiece` snapshot so the corner-mitre is atomic with the
 * add.
 */
export function detectSplashbackCornerMitres(
  job: Job,
  parent: Piece,
  newSplashback: Piece,
  newSplashbackAttachEdgeId: EdgeId,
): readonly Join[] {
  if (!SPLASHBACK_ROLES.has(newSplashback.pieceRole)) return [];
  const newAttachEdge = parent.edges.find(
    (e) => e.id === newSplashbackAttachEdgeId,
  );
  if (!newAttachEdge) return [];
  const newStart = parent.vertices.find((v) => v.id === newAttachEdge.start);
  const newEnd = parent.vertices.find((v) => v.id === newAttachEdge.end);
  if (!newStart || !newEnd) return [];
  const newDir = { x: newEnd.x - newStart.x, y: newEnd.y - newStart.y };

  const out: Join[] = [];
  for (const existing of job.pieces) {
    if (existing.id === newSplashback.id) continue;
    if (existing.parentPieceId !== parent.id) continue;
    if (!SPLASHBACK_ROLES.has(existing.pieceRole)) continue;
    // Find the join that anchors `existing` to `parent` so we know the
    // existing splashback's parent-side anchor edge.
    const anchorJoin = job.joins.find(
      (j) => j.pieceA === parent.id && j.pieceB === existing.id,
    );
    if (!anchorJoin) continue;
    const existingAttachEdge = parent.edges.find(
      (e) => e.id === anchorJoin.edgeA,
    );
    if (!existingAttachEdge) continue;
    if (existingAttachEdge.id === newAttachEdge.id) continue; // same edge — guarded elsewhere
    // Adjacency: do the two edges share a vertex on the parent?
    const sharedVertexId =
      existingAttachEdge.start === newAttachEdge.start ||
      existingAttachEdge.start === newAttachEdge.end
        ? existingAttachEdge.start
        : existingAttachEdge.end === newAttachEdge.start ||
            existingAttachEdge.end === newAttachEdge.end
          ? existingAttachEdge.end
          : null;
    if (!sharedVertexId) continue;
    // Existing edge direction.
    const exStart = parent.vertices.find(
      (v) => v.id === existingAttachEdge.start,
    );
    const exEnd = parent.vertices.find(
      (v) => v.id === existingAttachEdge.end,
    );
    if (!exStart || !exEnd) continue;
    const exDir = { x: exEnd.x - exStart.x, y: exEnd.y - exStart.y };
    const angleDeg = computeMitreAngleDeg(exDir, newDir);
    // Pick an edge ID on each splashback as the corner anchor. The
    // splashback's first outer-ring edge is the shared-with-parent edge
    // (`e0` in `buildEdgeAnchoredPanel`); the perpendicular sides are e1
    // (further-end) and e3 (closer-end). The corner mitre is between
    // the two splashbacks' perpendicular sides — for the prototype we
    // anchor on the first outer-ring edge of each side, which the
    // canvas's JoinIndicator uses to draw the join line.
    const newAnchor = newSplashback.outerRing.edges[1] ?? newSplashback.outerRing.edges[0];
    const existingAnchor =
      existing.outerRing.edges[3] ?? existing.outerRing.edges[0];
    if (!newAnchor || !existingAnchor) continue;
    out.push(
      makeJoin({
        pieceA: existing.id,
        pieceB: newSplashback.id,
        edgeA: existingAnchor,
        edgeB: newAnchor,
        kind: "MITRE",
        reason: "SPLASHBACK_ATTACHMENT",
        angleDeg,
      }),
    );
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Round 7A (2-Gap-1) — recompute attached children when parent edges move
// ─────────────────────────────────────────────────────────────────────────

const ANCHORED_ROLES: ReadonlySet<PieceRole> = new Set<PieceRole>([
  "WATERFALL_END",
  "SPLASHBACK_FULL",
  "SPLASHBACK_LOW",
  "UPSTAND",
  "END_PANEL",
  "WINDOWSILL",
]);

interface RecomputeResult {
  readonly pieces: readonly Piece[];
  readonly joins: readonly Join[];
  /** IDs of children whose attach edge no longer exists. The caller may
   *  cascade-delete them via REMOVE_PIECE. */
  readonly orphanedChildIds: readonly Piece["id"][];
}

/**
 * When `nextParent` differs from `oldParent` (a vertex moved, an edge
 * length changed, a vertex was inserted, etc.), walk every anchored
 * child piece (waterfall / splashback / etc. with `parentPieceId === parent.id`)
 * and rebuild it so its vertices follow the new edge endpoints.
 *
 * Returns a Job-shaped `{ pieces, joins }` plus a list of orphaned child
 * IDs (children whose anchor edge no longer exists in `nextParent`). The
 * caller decides whether to cascade-delete the orphans.
 *
 * Inputs:
 *   - `oldParent`         the parent BEFORE the mutation — used to read the
 *                         OLD anchor edge endpoints so we can recover the
 *                         child's original extent (perpendicular distance
 *                         from outward vertices to the OLD edge line).
 *   - `nextParent`        the post-mutation parent
 *   - `pieces`/`joins`    the current job arrays
 *
 * The child's preserved extent (height / depth / 600 mm splashback /
 * 870 mm waterfall) is recovered by projecting each child vertex onto
 * the OLD anchor edge and taking the maximum perpendicular distance.
 * The child's role + join kind + join reason are preserved.
 */
export function recomputeAttachedChildren(
  oldParent: Piece,
  nextParent: Piece,
  pieces: readonly Piece[],
  joins: readonly Join[],
): RecomputeResult {
  const nextPieces: Piece[] = [];
  const nextJoins: Join[] = [...joins];
  const orphanedChildIds: Piece["id"][] = [];

  for (const piece of pieces) {
    // Pass-through for pieces that aren't anchored children of `nextParent`.
    if (
      piece.parentPieceId !== nextParent.id ||
      !ANCHORED_ROLES.has(piece.pieceRole)
    ) {
      nextPieces.push(piece);
      continue;
    }
    // Find the join that anchors this child to the parent.
    const anchorJoinIdx = nextJoins.findIndex(
      (j) => j.pieceA === nextParent.id && j.pieceB === piece.id,
    );
    if (anchorJoinIdx < 0) {
      nextPieces.push(piece);
      continue;
    }
    const anchorJoin = nextJoins[anchorJoinIdx]!;
    // Has the anchor edge survived in the NEW parent?
    const edge = nextParent.edges.find((e) => e.id === anchorJoin.edgeA);
    if (!edge) {
      // Edge gone — orphan the child. Caller cascade-deletes.
      orphanedChildIds.push(piece.id);
      // Skip pushing the child into nextPieces; also drop the join.
      nextJoins.splice(anchorJoinIdx, 1);
      continue;
    }
    // Recover the OLD extent. Look up the OLD anchor edge on `oldParent`
    // and measure the maximum perpendicular distance from any child
    // vertex to that line. For an unmutated rectangle child this equals
    // the original extent (600 / 870 / etc.) regardless of how the
    // CCW-reorder in buildEdgeAnchoredPanel laid the vertices out.
    const oldEdge = oldParent.edges.find((e) => e.id === anchorJoin.edgeA);
    let extentMm = 0;
    if (oldEdge) {
      const oldStart = oldParent.vertices.find((v) => v.id === oldEdge.start);
      const oldEnd = oldParent.vertices.find((v) => v.id === oldEdge.end);
      if (oldStart && oldEnd) {
        const oedx = oldEnd.x - oldStart.x;
        const oedy = oldEnd.y - oldStart.y;
        const oedLenSq = oedx * oedx + oedy * oedy;
        if (oedLenSq > 0) {
          for (const cv of piece.vertices) {
            // Perpendicular distance from cv to the line through
            // (oldStart, oldEnd). Project onto the edge direction,
            // then |cv - projection|.
            const t =
              ((cv.x - oldStart.x) * oedx + (cv.y - oldStart.y) * oedy) /
              oedLenSq;
            const projX = oldStart.x + t * oedx;
            const projY = oldStart.y + t * oedy;
            const perp = Math.hypot(cv.x - projX, cv.y - projY);
            if (perp > extentMm) extentMm = perp;
          }
        }
      }
    }
    if (extentMm <= 0) {
      // Couldn't recover an extent — leave the old child in place rather
      // than rebuilding with a degenerate value.
      nextPieces.push(piece);
      continue;
    }
    // Regenerate the child using buildEdgeAnchoredPanel against the
    // (mutated) parent. We can't reuse `generateWaterfall` etc. because
    // those each impose a default extent.
    const rebuilt = buildEdgeAnchoredPanel({
      parent: nextParent,
      attachEdgeId: anchorJoin.edgeA,
      role: piece.pieceRole,
      extentMm,
      joinKind: anchorJoin.kind,
      joinReason: anchorJoin.reason,
      namePrefix: piece.name,
    });
    if (!rebuilt) {
      // Couldn't rebuild — leave the old child in place so we don't lose data.
      nextPieces.push(piece);
      continue;
    }
    // Preserve the original child's ID + name so existing references
    // (joins between sibling splashbacks, undo snapshots) stay valid.
    const replaced: Piece = {
      ...rebuilt.piece,
      id: piece.id,
      name: piece.name,
    };
    nextPieces.push(replaced);
    // Replace the anchor join with one that points at the rebuilt
    // edgeB but keeps the original join ID.
    nextJoins[anchorJoinIdx] = {
      ...anchorJoin,
      edgeB: rebuilt.join.edgeB,
      ...(rebuilt.join.angleDeg !== undefined
        ? { angleDeg: rebuilt.join.angleDeg }
        : {}),
    };
  }

  return { pieces: nextPieces, joins: nextJoins, orphanedChildIds };
}

// ─────────────────────────────────────────────────────────────────────────
// Backwards-compatibility shim
// ─────────────────────────────────────────────────────────────────────────

export interface BuildSecondaryInput {
  readonly parent: Piece;
  readonly role: PieceRole;
  readonly side?: "left" | "right";
  readonly heightMm?: number;
}

export interface BuildSecondaryResult {
  readonly piece: Piece;
  readonly join: Join;
}

/**
 * Round 3B legacy entry point. Retained so the existing editor wiring
 * still compiles; new callers should use the edge-driven builders above.
 *
 * Picks an edge using the simple "rightmost/topmost" heuristic from
 * Round 3B, then delegates to the new builders. Returns `null` if no
 * suitable edge can be found.
 */
export function buildSecondaryPiece(
  input: BuildSecondaryInput,
): BuildSecondaryResult | null {
  const { parent, role, side, heightMm } = input;
  switch (role) {
    case "WATERFALL_END": {
      const edges = getWaterfallValidEdges(parent);
      const targetId = pickEdgeForSide(parent, edges, side ?? "right");
      if (!targetId) return null;
      return generateWaterfall(parent, targetId, heightMm);
    }
    case "END_PANEL": {
      const edges = getEndPanelValidEdges(parent);
      const targetId = pickEdgeForSide(parent, edges, side ?? "right");
      if (!targetId) return null;
      return generateEndPanel(parent, targetId, heightMm);
    }
    case "SPLASHBACK_FULL":
    case "SPLASHBACK_LOW":
    case "UPSTAND": {
      const walls = getSplashbackValidEdges(parent);
      if (walls.length === 0) return null;
      // Legacy callers expect a single piece; pick the topmost wall edge.
      const targetId = pickEdgeForBack(parent, walls);
      if (!targetId) return null;
      const result = generateSplashback(parent, [targetId], heightMm, role);
      const piece = result.pieces[0];
      const join = result.joins[0];
      if (!piece || !join) return null;
      return { piece, join };
    }
    case "WINDOWSILL": {
      // Legacy windowsill picked the first edge — keep that behaviour so
      // existing call sites still produce a result.
      const firstEdgeId = parent.outerRing.edges[0];
      if (!firstEdgeId) return null;
      return generateWindowsill(parent, firstEdgeId, heightMm ?? DEFAULT_WINDOWSILL_DEPTH_MM);
    }
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Internals — edge-anchored panel builder
// ─────────────────────────────────────────────────────────────────────────

interface EdgeAnchoredInput {
  readonly parent: Piece;
  readonly attachEdgeId: EdgeId;
  readonly role: PieceRole;
  readonly extentMm: number;
  /**
   * Round 7A: V3 join taxonomy. `MITRE` for waterfall/end-panel anchors,
   * `BUTT` for splashback/upstand/windowsill anchors.
   */
  readonly joinKind: JoinKind;
  readonly joinReason: JoinReason;
  readonly namePrefix: string;
  /**
   * Round 16 (Fix 2) — when set, overrides the default `raw` profile
   * on the new piece's join-side edge (`e0`) AND emits a
   * `parentEdgeProfileUpdate` so the caller can set the parent's
   * attach edge to the same profile in the same snapshot. The two
   * faces of a real joint always carry the same profile in
   * fabrication.
   */
  readonly joinFaceProfile?: EdgeProfile;
}

/**
 * Build a rectangular secondary piece flush against the parent's named
 * edge, extending outward (away from the parent's interior) by `extentMm`.
 *
 * The panel's vertices are laid out in piece-local mm so that vertex 0 sits
 * on the parent's edge.start, vertex 1 on edge.end, vertex 2 perpendicular
 * outward from edge.end, vertex 3 perpendicular outward from edge.start.
 * That gives the panel a CCW ring when viewed with the inward normal
 * pointing into the parent.
 *
 * The piece's `parentPieceId` is set so the canvas knows to render it
 * anchored (it doesn't tile beside the parent — its vertices already sit
 * in the right place in parent-local coords).
 */
function buildEdgeAnchoredPanel(input: EdgeAnchoredInput): WaterfallResult | null {
  const {
    parent,
    attachEdgeId,
    role,
    extentMm,
    joinKind,
    joinReason,
    namePrefix,
    joinFaceProfile,
  } = input;
  const edge = parent.edges.find((e) => e.id === attachEdgeId);
  if (!edge) return null;
  const start = parent.vertices.find((v) => v.id === edge.start);
  const end = parent.vertices.find((v) => v.id === edge.end);
  if (!start || !end) return null;

  const edgeDx = end.x - start.x;
  const edgeDy = end.y - start.y;
  const edgeLen = Math.hypot(edgeDx, edgeDy);
  if (edgeLen === 0) return null;

  // Outward perpendicular unit vector (negation of inward normal).
  const outward = outwardPerpendicular(parent, start, end);
  if (outward.x === 0 && outward.y === 0) return null;

  // Lay out four CCW vertices in parent-local mm:
  //   v0 = start                              (on the edge)
  //   v1 = end                                (on the edge)
  //   v2 = end + outward * extent             (away from parent)
  //   v3 = start + outward * extent           (away from parent)
  //
  // When the outward direction points downward in screen coords, this
  // ring is clockwise visually but the geometry validator only checks
  // ring orientation, which we set to `ccw` and verify against a winding
  // computation. For our axis-aligned cases the four-vertex rectangle is
  // always a valid CCW outer ring when traversed in this order.
  const v0: Vertex = {
    id: vertexId(),
    x: Math.round(start.x),
    y: Math.round(start.y),
  };
  const v1: Vertex = {
    id: vertexId(),
    x: Math.round(end.x),
    y: Math.round(end.y),
  };
  const v2: Vertex = {
    id: vertexId(),
    x: Math.round(end.x + outward.x * extentMm),
    y: Math.round(end.y + outward.y * extentMm),
  };
  const v3: Vertex = {
    id: vertexId(),
    x: Math.round(start.x + outward.x * extentMm),
    y: Math.round(start.y + outward.y * extentMm),
  };

  // Force CCW orientation by flipping vertex order if the signed area is
  // negative. Konva renders either orientation correctly; geometry
  // validation requires the outer ring's stated orientation to match the
  // winding.
  const ordered = signedArea([v0, v1, v2, v3]) > 0
    ? [v0, v1, v2, v3]
    : [v0, v3, v2, v1];

  // Round 16 (Fix 2) — the join-face profile defaults to `raw` (the
  // standard butt-join case) but is overridden when the caller supplies
  // `joinFaceProfile` (waterfall/end-panel always; mitred splashback
  // opt-in). When overridden, the parent's attach edge is updated to
  // the same profile via `parentEdgeProfileUpdate` below so both faces
  // of the joint read the same colour band on the canvas.
  const joinSideProfile: EdgeProfile = joinFaceProfile ?? DEFAULT_PROFILE;
  const e0: Edge = {
    id: edgeId(),
    start: ordered[0]!.id,
    end: ordered[1]!.id,
    profile: joinSideProfile,
    finish: "polished",
    // The edge attached to the parent — joined.
    exposure: "join",
  };
  const e1: Edge = {
    id: edgeId(),
    start: ordered[1]!.id,
    end: ordered[2]!.id,
    profile: DEFAULT_PROFILE,
    finish: "polished",
    exposure: pickExposureForOuter(role),
  };
  const e2: Edge = {
    id: edgeId(),
    start: ordered[2]!.id,
    end: ordered[3]!.id,
    profile: DEFAULT_PROFILE,
    finish: "polished",
    exposure: pickExposureForOuter(role),
  };
  const e3: Edge = {
    id: edgeId(),
    start: ordered[3]!.id,
    end: ordered[0]!.id,
    profile: DEFAULT_PROFILE,
    finish: "polished",
    exposure: pickExposureForOuter(role),
  };

  const ring: Ring = {
    edges: [e0.id, e1.id, e2.id, e3.id],
    orientation: "ccw",
  };

  const piece: Piece = {
    id: pieceId(),
    name: namePrefix,
    pieceRole: role,
    parentPieceId: parent.id,
    materialId: parent.materialId,
    thicknessMm: parent.thicknessMm,
    vertices: ordered,
    edges: [e0, e1, e2, e3],
    outerRing: ring,
    innerRings: [],
    features: [],
  };

  // Round 7A (2-Gap-3): for MITRE joins, compute the actual mitre angle
  // from the parent edge and the waterfall's outer-edge direction. For
  // axis-aligned cases this collapses to 45°; for non-perpendicular
  // attaches the angle reflects the real geometry. For BUTT joins the
  // angle is undefined.
  const angleDeg =
    joinKind === "MITRE"
      ? computeMitreAngleDeg(
          { x: edgeDx, y: edgeDy },
          { x: outward.x, y: outward.y },
        )
      : undefined;

  const join = makeJoin({
    pieceA: parent.id,
    pieceB: piece.id,
    edgeA: attachEdgeId,
    edgeB: e0.id,
    kind: joinKind,
    reason: joinReason,
    ...(angleDeg !== undefined ? { angleDeg } : {}),
  });
  // Round 16 (Fix 2): when the join-face profile was overridden, hand
  // the same profile back so the editor's ADD_PIECE dispatch can update
  // the parent's attach edge atomically (one undo step). Flush splash-
  // backs and the historical "no joinFaceProfile" callers leave this
  // field undefined → no parent edge change.
  const parentEdgeProfileUpdate =
    joinFaceProfile !== undefined
      ? { edgeId: attachEdgeId, profile: joinFaceProfile }
      : undefined;
  return {
    piece,
    join,
    ...(parentEdgeProfileUpdate !== undefined
      ? { parentEdgeProfileUpdate }
      : {}),
  };
}

/**
 * Round 7A (2-Gap-3): compute the mitre angle (degrees) between two edge
 * directions. The mitre angle splits the exterior corner — for two
 * perpendicular edges it's 45°; for a 60° interior corner it's 60°.
 *
 *   mitreAngle = (180° − angleBetween) / 2
 *
 * Inputs need not be unit vectors; the implementation normalises via
 * acos(dot / (|a| · |b|)).
 */
export function computeMitreAngleDeg(
  a: { readonly x: number; readonly y: number },
  b: { readonly x: number; readonly y: number },
): number {
  const lenA = Math.hypot(a.x, a.y);
  const lenB = Math.hypot(b.x, b.y);
  if (lenA === 0 || lenB === 0) return 45;
  const dot = a.x * b.x + a.y * b.y;
  const cos = Math.max(-1, Math.min(1, dot / (lenA * lenB)));
  const angleBetweenRad = Math.acos(cos);
  return ((Math.PI - angleBetweenRad) / 2) * (180 / Math.PI);
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function defaultSplashbackHeight(role: SplashbackRole): number {
  switch (role) {
    case "SPLASHBACK_FULL":
      return DEFAULT_SPLASHBACK_FULL_HEIGHT_MM;
    case "SPLASHBACK_LOW":
      return DEFAULT_SPLASHBACK_LOW_HEIGHT_MM;
    case "UPSTAND":
      return DEFAULT_UPSTAND_HEIGHT_MM;
  }
}

/**
 * Outer faces of a secondary piece are exposed by default (waterfall ends,
 * splashback fronts). Roles whose outer faces sit against another surface
 * (windowsill, mostly) get "wall" instead.
 */
function pickExposureForOuter(role: PieceRole): EdgeExposure {
  if (role === "WINDOWSILL") return "wall";
  return "exposed";
}

/**
 * Outward perpendicular unit vector for the given edge of `parent`.
 *
 * Round 13 — switched from a vertex-average-centroid dot-product test to a
 * winding-based pick. The previous implementation averaged all vertices to
 * find a "centre", then chose whichever perpendicular pointed AWAY from
 * that centre. On a concave polygon (an L-shape's peninsula, a U-shape's
 * notch) the vertex-average lands inside the concavity — outside the
 * polygon — and the dot product flips. The result: waterfalls generated
 * on the wrong side of an L-shape's peninsula, splashbacks facing into
 * the kitchen instead of the wall behind. Same bug class that Round 10
 * fixed in `feature-placement.ts:edgeInwardNormal`.
 *
 * The winding-based fix is robust for any simple polygon: a polygon's
 * interior always lies on the same side of every edge — the side picked
 * out by the ring's traversal direction. `signedArea` returns positive
 * when `parent.vertices` is wound so that the math-coords interpretation
 * is CCW (equivalently CW in screen-down coords, matching the convention
 * documented in `feature-placement.ts:outerSignedArea`). For that
 * winding, the OUTWARD perpendicular of an edge `(dx, dy)` is the RIGHT
 * perpendicular `(dy, -dx)`; for the opposite winding (negative signed
 * area), OUTWARD is the LEFT perpendicular `(-dy, dx)`.
 */
function outwardPerpendicular(
  parent: Piece,
  start: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number },
): { readonly x: number; readonly y: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: 0, y: 0 };

  // Signed area determines winding. Positive = CCW in math coords
  // (equivalently CW in screen-down coords).
  const area = signedArea(parent.vertices);
  if (area > 0) {
    // CCW (math coords): outward is the RIGHT perpendicular.
    return { x: dy / len, y: -dx / len };
  }
  // CW (math coords): outward is the LEFT perpendicular.
  return { x: -dy / len, y: dx / len };
}

/** Signed area (positive = CCW). */
function signedArea(verts: readonly Vertex[]): number {
  let s = 0;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i]!;
    const b = verts[(i + 1) % verts.length]!;
    s += (b.x - a.x) * (b.y + a.y);
  }
  // Note: this convention treats positive cross-product (CCW) as positive.
  // We use a different shoelace formulation; the sign convention is what
  // matters. Flip if needed.
  return -s;
}

function pickEdgeForSide(
  parent: Piece,
  candidates: readonly EdgeId[],
  side: "left" | "right",
): EdgeId | null {
  if (candidates.length === 0) return null;
  const xs = parent.vertices.map((v) => v.x);
  const targetX = side === "left" ? Math.min(...xs) : Math.max(...xs);
  let bestId: EdgeId | null = null;
  let bestDist = Infinity;
  for (const id of candidates) {
    const edge = parent.edges.find((e) => e.id === id);
    if (!edge) continue;
    const a = parent.vertices.find((v) => v.id === edge.start);
    const b = parent.vertices.find((v) => v.id === edge.end);
    if (!a || !b) continue;
    const midX = (a.x + b.x) / 2;
    const d = Math.abs(midX - targetX);
    if (d < bestDist) {
      bestDist = d;
      bestId = id;
    }
  }
  return bestId;
}

function pickEdgeForBack(
  parent: Piece,
  candidates: readonly EdgeId[],
): EdgeId | null {
  if (candidates.length === 0) return null;
  let bestId: EdgeId | null = null;
  let bestY = -Infinity;
  for (const id of candidates) {
    const edge = parent.edges.find((e) => e.id === id);
    if (!edge) continue;
    const a = parent.vertices.find((v) => v.id === edge.start);
    const b = parent.vertices.find((v) => v.id === edge.end);
    if (!a || !b) continue;
    const midY = (a.y + b.y) / 2;
    if (midY > bestY) {
      bestY = midY;
      bestId = id;
    }
  }
  return bestId;
}
