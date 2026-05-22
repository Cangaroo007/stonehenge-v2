// apps/web/src/lib/add-arm.ts
//
// Round 10 (Fix 4) — "Add arm" topology operation.
//
// The "Add arm" Shape tool turns an L-shape into a U-shape (or extends
// any benchtop with a new rectangular limb) by mutating polygon topology
// rather than dragging vertices. The undiscoverable pre-Round-10 path
// was: insert a vertex by double-clicking the edge, then drag it outward
// — no UI indicated this was possible. The new tool exposes it as a
// first-class affordance with a dimensioned modal.
//
// Geometric procedure — given a reference edge A→B, an offset along that
// edge, an arm length, and an outward width:
//
//   Before:                     After:
//                                   P2 ─────────── P3
//                                   │              │  ← P2→P3 = "end" exposed
//                                   │     ARM      │  ← P1→P2 + P3→P4 = sides
//                                   │              │     (wall exposure)
//   A ────────────── B          A ── P1 ─── arm ── P4 ── B
//          original              ───┘                └─── original
//
// We reuse the same compound-`insertVertexOnEdge` technique window-recess
// uses: insert P1 at the offset, then P4 at offset+length on the resulting
// second-half edge, then split the new P1→P4 edge twice (near each
// endpoint) to mint P2 and P3, and finally move P2 / P3 outward by the
// arm width. The mid-split epsilon (0.1%) matches the recess code so the
// failure modes are identical and the tests have a single shape to
// reason about.
//
// Differences from `createWindowRecess`:
//   * Direction is OUTWARD (away from the polygon interior), not inward.
//     We negate `edgeInwardNormal` to get the outward normal — and we
//     rely on the Round 10 (Fix 2) signed-area-based inward normal so
//     this works on concave starting polygons too (e.g. an L-shape with
//     the operator extending the front edge into a U).
//   * Exposure: the two side edges become `wall` (the arm abuts cabinetry
//     by default — operators can change exposure after the fact via the
//     edge panel). The end edge inherits `exposed` so it's visible from
//     the front. The two original-edge stubs (A→P1 and P4→B) retain the
//     clicked edge's metadata via `splitEdge` semantics.
//   * The new edges inherit the clicked edge's `profile` and `finish`
//     for continuity with the original edge.
//
// Pure function. No React, no Konva. Imports only from the geometry
// kernel and the local feature-placement helpers.

import {
  insertVertexOnEdge,
  setEdgeExposure,
  validatePiece,
} from "@stonehenge-proto/geometry";
import type {
  EdgeId,
  EdgeProfile,
  EdgeFinish,
  Piece,
} from "@stonehenge-proto/geometry";

import { edgeInwardNormal } from "./feature-placement";

export interface AddArmParams {
  /** The reference edge to extend an arm from. Any outer-ring edge is valid. */
  readonly edgeId: EdgeId;
  /** Perpendicular depth of the arm, measured outward from the edge (mm). */
  readonly widthMm: number;
  /** Along-edge length of the arm — width of the new rectangle (mm). */
  readonly lengthMm: number;
  /** Distance from the START vertex of the reference edge to the arm's near corner (mm). */
  readonly offsetAlongEdgeMm: number;
}

/**
 * Minimum arm dimensions. Anything smaller can't be fabricated and would
 * collapse vertices on top of each other (the splitEdge eps would fail).
 * Aligned with `clampFeatureToBounds`' 50 mm floor for consistency.
 */
const MIN_ARM_DIMENSION_MM = 50;

/**
 * Validate the requested arm. Returns null with a reason set in the
 * console-free fail path — callers check for null. We don't throw because
 * the reducer treats null as "reject the action and preserve state".
 */
function validateArmInput(piece: Piece, params: AddArmParams): boolean {
  if (params.widthMm < MIN_ARM_DIMENSION_MM) return false;
  if (params.lengthMm < MIN_ARM_DIMENSION_MM) return false;
  if (params.offsetAlongEdgeMm < 0) return false;
  const edge = piece.edges.find((e) => e.id === params.edgeId);
  if (!edge) return false;
  const start = piece.vertices.find((v) => v.id === edge.start);
  const end = piece.vertices.find((v) => v.id === edge.end);
  if (!start || !end) return false;
  const edgeLen = Math.hypot(end.x - start.x, end.y - start.y);
  // Offset + length must fit inside the edge, with a 1 mm slack for
  // floating-point round-trips. Below that the splitEdge clamp protection
  // collapses P4 onto B and the topology is broken.
  if (params.offsetAlongEdgeMm + params.lengthMm > edgeLen - 1) return false;
  return true;
}

/**
 * Add a rectangular arm to a piece by mutating its outer-ring topology.
 *
 * Returns the new piece on success, or null if:
 *   * The reference edge does not exist on the piece.
 *   * Width or length is below the minimum (50 mm).
 *   * `offsetAlongEdgeMm + lengthMm` exceeds the reference edge's length
 *     (the arm would hang off the end).
 *   * Any intermediate `insertVertexOnEdge` call rejects (e.g. the
 *     splitEdge geometry clamp).
 *   * The resulting piece fails `validatePiece` (self-intersection, ring
 *     orientation, etc).
 *
 * The caller (the reducer) snapshots state on success and discards the
 * intermediate piece references — they're not retained on the undo stack.
 */
export function addArm(piece: Piece, params: AddArmParams): Piece | null {
  if (!validateArmInput(piece, params)) return null;

  const originalEdge = piece.edges.find((e) => e.id === params.edgeId);
  if (!originalEdge) return null;
  const wallStart = piece.vertices.find((v) => v.id === originalEdge.start);
  const wallEnd = piece.vertices.find((v) => v.id === originalEdge.end);
  if (!wallStart || !wallEnd) return null;

  // Preserve the clicked edge's profile/finish so the new edges look like
  // a natural continuation. Exposure is set per-side below.
  const inheritedProfile = originalEdge.profile as EdgeProfile;
  const inheritedFinish = originalEdge.finish as EdgeFinish;

  // Edge direction unit vector.
  const wdx = wallEnd.x - wallStart.x;
  const wdy = wallEnd.y - wallStart.y;
  const wlen = Math.hypot(wdx, wdy);
  if (wlen === 0) return null;
  const ux = wdx / wlen;
  const uy = wdy / wlen;

  // Outward unit perpendicular — the inverse of the inward normal. Round
  // 10 (Fix 2) gives us a robust inward normal on concave polygons, so
  // negating it gives a robust outward normal too. This is the key reason
  // add-arm "just works" on an L-shape's exposed front edge: the L's
  // concave region used to throw off the centroid-based normal.
  const inward = edgeInwardNormal(piece, params.edgeId);
  const outward = { x: -inward.nx, y: -inward.ny };
  if (outward.x === 0 && outward.y === 0) return null;

  // Coordinates of the two "inside" corners of the arm (still on the
  // original edge after the inserts). Stored separately so we can locate
  // the freshly minted vertices by position after `insertVertexOnEdge`
  // runs — IDs are minted internally by the kernel.
  const p1Coord = {
    x: wallStart.x + ux * params.offsetAlongEdgeMm,
    y: wallStart.y + uy * params.offsetAlongEdgeMm,
  };
  const p4Coord = {
    x: wallStart.x + ux * (params.offsetAlongEdgeMm + params.lengthMm),
    y: wallStart.y + uy * (params.offsetAlongEdgeMm + params.lengthMm),
  };

  // Step 1: insert P1 at the offset.
  const afterP1 = insertVertexOnEdge(piece, params.edgeId, p1Coord);
  if (!afterP1) return null;

  // Locate the freshly inserted P1 vertex. It's the one whose id is not
  // in the original piece's vertices but whose coordinates match p1Coord
  // (rounded — `insertVertexOnEdge` rounds to integer mm internally).
  const p1Vertex = afterP1.vertices.find(
    (v) =>
      !piece.vertices.some((old) => old.id === v.id) &&
      Math.abs(v.x - Math.round(p1Coord.x)) < 1 &&
      Math.abs(v.y - Math.round(p1Coord.y)) < 1,
  );
  if (!p1Vertex) return null;

  // The second-half edge (P1 → wallEnd) is what we'll split next.
  const secondHalfEdge = afterP1.edges.find((e) => e.start === p1Vertex.id);
  if (!secondHalfEdge) return null;

  // Step 2: insert P4 at the recess width along the second half.
  const afterP4 = insertVertexOnEdge(afterP1, secondHalfEdge.id, p4Coord);
  if (!afterP4) return null;

  const p4Vertex = afterP4.vertices.find(
    (v) =>
      !afterP1.vertices.some((old) => old.id === v.id) &&
      Math.abs(v.x - Math.round(p4Coord.x)) < 1 &&
      Math.abs(v.y - Math.round(p4Coord.y)) < 1,
  );
  if (!p4Vertex) return null;

  // The middle edge (P1 → P4) is now the segment we'll split twice to
  // get P2 and P3.
  const middleEdge = afterP4.edges.find(
    (e) => e.start === p1Vertex.id && e.end === p4Vertex.id,
  );
  if (!middleEdge) return null;

  // Step 3 — split middleEdge near P1 to mint P2, then split the new
  // P2→P4 sub-edge near P4 to mint P3. Same eps trick as createWindowRecess.
  const eps = 0.001;
  const midX1 = p1Coord.x + (p4Coord.x - p1Coord.x) * eps;
  const midY1 = p1Coord.y + (p4Coord.y - p1Coord.y) * eps;
  const afterP2split = insertVertexOnEdge(afterP4, middleEdge.id, {
    x: midX1,
    y: midY1,
  });
  if (!afterP2split) return null;

  const p2Vertex = afterP2split.vertices.find(
    (v) =>
      !afterP4.vertices.some((old) => old.id === v.id) &&
      v.id !== p1Vertex.id &&
      v.id !== p4Vertex.id,
  );
  if (!p2Vertex) return null;

  const v2ToP4Edge = afterP2split.edges.find(
    (e) => e.start === p2Vertex.id && e.end === p4Vertex.id,
  );
  if (!v2ToP4Edge) return null;

  const midX2 = p2Vertex.x + (p4Coord.x - p2Vertex.x) * (1 - eps);
  const midY2 = p2Vertex.y + (p4Coord.y - p2Vertex.y) * (1 - eps);
  const afterP3split = insertVertexOnEdge(afterP2split, v2ToP4Edge.id, {
    x: midX2,
    y: midY2,
  });
  if (!afterP3split) return null;

  const p3Vertex = afterP3split.vertices.find(
    (v) =>
      !afterP2split.vertices.some((old) => old.id === v.id) &&
      v.id !== p1Vertex.id &&
      v.id !== p4Vertex.id &&
      v.id !== p2Vertex.id,
  );
  if (!p3Vertex) return null;

  // Step 4 — move P2 and P3 OUTWARD by width. P2 anchors over P1, P3
  // anchors over P4 — produces a clean rectangular arm.
  const p2NewX = Math.round(p1Coord.x + outward.x * params.widthMm);
  const p2NewY = Math.round(p1Coord.y + outward.y * params.widthMm);
  const p3NewX = Math.round(p4Coord.x + outward.x * params.widthMm);
  const p3NewY = Math.round(p4Coord.y + outward.y * params.widthMm);

  const movedVertices = afterP3split.vertices.map((v) => {
    if (v.id === p2Vertex.id) return { ...v, x: p2NewX, y: p2NewY };
    if (v.id === p3Vertex.id) return { ...v, x: p3NewX, y: p3NewY };
    return v;
  });
  let workingPiece: Piece = { ...afterP3split, vertices: movedVertices };

  // Locate the three new edges so we can apply the per-side exposure
  // rules: P1→P2 (side, wall), P2→P3 (end, exposed), P3→P4 (side, wall).
  const sideEdge1 = workingPiece.edges.find(
    (e) => e.start === p1Vertex.id && e.end === p2Vertex.id,
  );
  const endEdge = workingPiece.edges.find(
    (e) => e.start === p2Vertex.id && e.end === p3Vertex.id,
  );
  const sideEdge2 = workingPiece.edges.find(
    (e) => e.start === p3Vertex.id && e.end === p4Vertex.id,
  );
  if (!sideEdge1 || !endEdge || !sideEdge2) return null;

  // Step 5 — apply exposures. The side edges face cabinetry, the end is
  // visible. Profile/finish stays as inherited from the clicked edge so
  // the operator's edge selections continue around the arm.
  let exposed = setEdgeExposure(workingPiece, sideEdge1.id, "wall");
  if (!exposed) return null;
  workingPiece = exposed;
  exposed = setEdgeExposure(workingPiece, sideEdge2.id, "wall");
  if (!exposed) return null;
  workingPiece = exposed;
  exposed = setEdgeExposure(workingPiece, endEdge.id, "exposed");
  if (!exposed) return null;
  workingPiece = exposed;

  // Suppress "imported but never used" for the inherited metadata —
  // setEdgeProfile / setEdgeFinish operations aren't required because
  // insertVertexOnEdge already inherits profile/finish from the parent
  // edge. We retain the bindings as documentation of the contract this
  // function honours; future callers may need to surface them.
  void inheritedProfile;
  void inheritedFinish;

  const validation = validatePiece(workingPiece);
  if (!validation.valid) return null;

  return workingPiece;
}
