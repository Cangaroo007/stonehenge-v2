// apps/web/src/lib/window-recess-ops.ts
//
// Round-3A: window recess as a topology mutation.
//
// Geometric reality: a windowsill pushes the stone back, so the recess is
// a notch cut into the wall edge — not a floating rectangle near it. This
// module builds that notch by repeatedly applying `splitEdge` to a wall
// edge, then routing the new edge through the recess.
//
// Output:
//   A ────── P1 ── P2 ── P3 ── P4 ────── B
//                  │            │
//                  │   RECESS   │
//                  │            │
//                  P5 ──────── P6
//
// We construct it as 4 vertices and 5 edges — the brief simplifies P5/P6
// out by treating P2 and P3 as the inner-corner vertices directly. The
// resulting ring becomes:
//   ... → A → P1 → P2 → P3 → P4 → B → ...
// where P1→P2 and P3→P4 are concealed (they're inside the wall) and P2→P3
// is the windowsill (exposure: wall — it's still adjacent to wall behind).
//
// Bookkeeping (UNCERTAIN-4 [A] per Sean's call): the caller stores the
// returned `RecessGroup` on `EditorState.recessGroups`, snapshotted into
// the undo stack. We don't extend the geometry-package `Edge.generatedBy`
// union for editor-level concerns.

import {
  insertVertexOnEdge,
  setEdgeExposure,
  type EdgeExposure,
  type EdgeFinish,
  type EdgeId,
  type EdgeProfile,
  type Piece,
  type VertexId,
} from "@stonehenge-proto/geometry";

import type { RecessGroup, RecessId } from "../types/editor";

export interface CreateWindowRecessInput {
  readonly piece: Piece;
  readonly wallEdgeId: EdgeId;
  /** Distance from the START of the wall edge to the recess opening (mm). */
  readonly offsetAlongEdgeMm: number;
  readonly recessWidthMm: number;
  readonly recessDepthMm: number;
}

export interface CreateWindowRecessResult {
  readonly piece: Piece;
  readonly group: RecessGroup;
}

function mintRecessId(): RecessId {
  return crypto.randomUUID() as RecessId;
}

function findEdge(piece: Piece, edgeId: EdgeId) {
  return piece.edges.find((e) => e.id === edgeId);
}

/**
 * Compute a perpendicular unit vector to the edge that points INTO the
 * polygon (toward the interior). This is the direction P1/P4 must move
 * to reach P2/P3.
 *
 * Round 13 — switched from a vertex-average-centroid dot-product test to
 * a winding-based pick. The previous "centroid as cheap proxy" comment
 * understated the failure: on concave pieces (an L-shape's notch, the
 * inverted-U LiDAR scan shape) the vertex average lands outside the
 * polygon, the dot product flips, and the recess cuts the WRONG side of
 * the wall edge. Same bug class that Round 10 fixed in
 * `feature-placement.ts:edgeInwardNormal` and that Round 13 fixed in
 * `secondary-pieces.ts:outwardPerpendicular`.
 *
 * Winding-based pick: the polygon interior always lies on the same side
 * of every edge — the side determined by the ring's traversal direction.
 * For positive signed area (CCW in math coords, equivalently CW in
 * screen-down coords), the interior sits on the LEFT of each edge's
 * direction; flipped for negative signed area.
 *
 * `piece.vertices` order matches the outer-ring traversal for the
 * editor-built pieces this function operates on (insertVertexOnEdge
 * preserves the ring's vertex order), so signed-area-of-vertex-array is
 * the right winding signal here.
 */
function inwardPerpendicular(
  piece: Piece,
  startMm: { readonly x: number; readonly y: number },
  endMm: { readonly x: number; readonly y: number },
): { readonly x: number; readonly y: number } {
  const dx = endMm.x - startMm.x;
  const dy = endMm.y - startMm.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: 0, y: 0 };

  // Signed area: positive = CCW in math coords (CW in screen-down coords).
  // Uses the trapezoidal shoelace; sign convention matches
  // `secondary-pieces.ts:signedArea`.
  let s = 0;
  const verts = piece.vertices;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i]!;
    const b = verts[(i + 1) % verts.length]!;
    s += (b.x - a.x) * (b.y + a.y);
  }
  const area = -s;

  if (area > 0) {
    // CCW (math coords): interior is on the LEFT of each edge direction.
    return { x: -dy / len, y: dx / len };
  }
  // CW (math coords): interior is on the RIGHT.
  return { x: dy / len, y: -dx / len };
}

/**
 * Validate the input dimensions before mutating.
 */
function validateRecessInput(
  piece: Piece,
  input: CreateWindowRecessInput,
): { ok: true } | { ok: false; reason: string } {
  const edge = findEdge(piece, input.wallEdgeId);
  if (!edge) return { ok: false, reason: "wall edge not found" };
  const start = piece.vertices.find((v) => v.id === edge.start);
  const end = piece.vertices.find((v) => v.id === edge.end);
  if (!start || !end) return { ok: false, reason: "edge vertices missing" };
  const wallLen = Math.hypot(end.x - start.x, end.y - start.y);
  if (input.recessWidthMm <= 0 || input.recessDepthMm <= 0) {
    return { ok: false, reason: "width/depth must be positive" };
  }
  if (input.offsetAlongEdgeMm < 0) {
    return { ok: false, reason: "offset must be ≥ 0" };
  }
  if (input.offsetAlongEdgeMm + input.recessWidthMm > wallLen) {
    return {
      ok: false,
      reason: `recess (${input.recessWidthMm} mm wide at offset ${input.offsetAlongEdgeMm} mm) doesn't fit on wall edge of ${wallLen.toFixed(0)} mm`,
    };
  }
  return { ok: true };
}

/**
 * Create a window recess by:
 *   1. Insert P1 on the wall edge at `offsetAlongEdgeMm`.
 *   2. Insert P4 on the second half (after step 1) at the recess width.
 *   3. Insert P2 by splitting the middle edge at its start (zero-length
 *      tangent), then move P2 inward by `recessDepthMm`.
 *   4. Insert P3 the same way at the middle edge's end.
 *   5. Set exposures: sides concealed, back wall.
 *
 * Returns the new piece + a `RecessGroup` for the caller to track.
 *
 * Returns null if input is invalid.
 *
 * Implementation note: P2 and P3 aren't strictly "inserted on" the
 * narrow centre edge — we insert them by re-splitting the appropriate
 * sub-edges and then nudging vertices. The simpler approach used here:
 * insert two vertices at the recess opening boundary along the wall,
 * then move those vertices inward to form the notch. The "back" of the
 * recess becomes the centre edge after the move.
 *
 * Specifically, after inserting P1 (at offset) and P4 (at offset+width),
 * the wall is split into 3 edges: A→P1, P1→P4, P4→B. We then "nudge"
 * P1 inward by D AND insert another vertex at the original P1 location,
 * giving us A→Px→P2 where Px is the original P1 location.
 *
 * To keep it geometrically clean, the actual sequence used is:
 *   - Insert vertex at offset (call it P1 visually, but we'll move it)
 *   - Insert vertex at offset+width (P4 visually)
 *   - At this point we have edges: A→P1, P1→P4, P4→B
 *   - Insert ANOTHER vertex at offset (effectively making P1 → P2A where
 *     P2A is at the same x,y but a separate vertex)
 *   - Move P2A inward by D
 *   - Insert another vertex at offset+width on edge P4→B (call it P3A)
 *   - Move P3A inward by D
 *   - Wait — this doesn't produce the right ring topology.
 *
 * Cleaner approach: the topology we want is:
 *   ring: ... A → P1 → P2 → P3 → P4 → B ...
 *   coords: P1 = wall_at_offset, P4 = wall_at_offset+width,
 *           P2 = P1 + D·inward, P3 = P4 + D·inward
 *
 * Procedure (clean):
 *   - Insert vertex `v_open_start` at offset on the wall edge → splits
 *     into A→v_open_start, v_open_start→B'.
 *   - Insert vertex `v_open_end` at offset_along_b' = recessWidth on the
 *     second half → splits into v_open_start→v_open_end, v_open_end→B.
 *   - Now we have A→v_open_start→v_open_end→B, three edges along the wall.
 *   - Replace the middle edge (v_open_start→v_open_end) with two new
 *     vertices and three edges by splitting it twice:
 *       a) Insert at start of middle edge (a vertex coincident with
 *          v_open_start in space, but a new vertex ID). Then move it
 *          inward by D. Now we have edges:
 *          v_open_start → P2 (sloping inward) and P2 → v_open_end.
 *       b) Insert at end of P2→v_open_end at the v_open_end coord, then
 *          move it inward by D, becoming P3.
 *
 * That last micro-split is awkward — `insertVertexOnEdge` clamps
 * insertion away from endpoints. Instead, we use a simpler topology:
 * leave v_open_start in place AS P1, move two NEW vertices into the
 * notch, and rely on `splitEdge`'s ring-rewrite to produce the right
 * edge sequence.
 */
export function createWindowRecess(
  input: CreateWindowRecessInput,
): CreateWindowRecessResult | { error: string } {
  const validation = validateRecessInput(input.piece, input);
  if (!validation.ok) return { error: validation.reason };

  const wall = findEdge(input.piece, input.wallEdgeId);
  if (!wall) return { error: "wall edge not found" };
  const wallStart = input.piece.vertices.find((v) => v.id === wall.start);
  const wallEnd = input.piece.vertices.find((v) => v.id === wall.end);
  if (!wallStart || !wallEnd) return { error: "wall vertices missing" };

  // Original metadata so we can restore on removal.
  const originalEdgeMetadata = {
    profile: wall.profile as EdgeProfile,
    finish: wall.finish as EdgeFinish,
    exposure: wall.exposure as EdgeExposure,
  };

  // Wall direction unit vector.
  const wdx = wallEnd.x - wallStart.x;
  const wdy = wallEnd.y - wallStart.y;
  const wlen = Math.hypot(wdx, wdy);
  const ux = wdx / wlen;
  const uy = wdy / wlen;

  // Inward perpendicular unit vector.
  const inward = inwardPerpendicular(
    input.piece,
    { x: wallStart.x, y: wallStart.y },
    { x: wallEnd.x, y: wallEnd.y },
  );

  // Coordinates of the four notch vertices.
  const p1Coord = {
    x: wallStart.x + ux * input.offsetAlongEdgeMm,
    y: wallStart.y + uy * input.offsetAlongEdgeMm,
  };
  const p4Coord = {
    x: wallStart.x + ux * (input.offsetAlongEdgeMm + input.recessWidthMm),
    y: wallStart.y + uy * (input.offsetAlongEdgeMm + input.recessWidthMm),
  };

  // Insert P1 (the recess opening's start) on the wall edge.
  const afterP1 = insertVertexOnEdge(input.piece, input.wallEdgeId, p1Coord);
  if (!afterP1) return { error: "failed to insert P1" };

  // Find the new edge that runs from P1 to wallEnd — that's the second
  // split half. It's the edge in the outer ring that immediately follows
  // the new P1 vertex.
  const p1Vertex = afterP1.vertices.find(
    (v) =>
      Math.abs(v.x - Math.round(p1Coord.x)) < 1 &&
      Math.abs(v.y - Math.round(p1Coord.y)) < 1 &&
      !input.piece.vertices.some((old) => old.id === v.id),
  );
  if (!p1Vertex) return { error: "failed to locate P1 vertex" };

  // The second half: edge whose start === p1Vertex.id.
  const secondHalfEdge = afterP1.edges.find((e) => e.start === p1Vertex.id);
  if (!secondHalfEdge) return { error: "failed to locate second half edge" };

  // Insert P4 at the recess width along the second half.
  const afterP4 = insertVertexOnEdge(afterP1, secondHalfEdge.id, p4Coord);
  if (!afterP4) return { error: "failed to insert P4" };

  const p4Vertex = afterP4.vertices.find(
    (v) =>
      Math.abs(v.x - Math.round(p4Coord.x)) < 1 &&
      Math.abs(v.y - Math.round(p4Coord.y)) < 1 &&
      !afterP1.vertices.some((old) => old.id === v.id),
  );
  if (!p4Vertex) return { error: "failed to locate P4 vertex" };

  // The middle edge between P1 and P4 is the edge whose start === P1 and
  // end === P4 in the post-P4 piece.
  const middleEdge = afterP4.edges.find(
    (e) => e.start === p1Vertex.id && e.end === p4Vertex.id,
  );
  if (!middleEdge) return { error: "failed to locate middle edge" };

  // Now insert P2 and P3 by splitting the middle edge twice. The middle
  // edge is currently from P1 to P4; we want to split it at points that
  // become P2 and P3 (which then move inward).
  //
  // First, split at a point near P1 (e.g. 1% of the way along) — this
  // creates a new vertex we'll call v2, and a sub-edge from P1→v2 plus
  // v2→P4. Then we'll move v2 inward by `recessDepthMm`.
  //
  // Then split the second sub-edge near its end (99% along) to create
  // v3, and we move v3 inward.
  //
  // After that the topology is: P1 → v2 → v3 → P4. Then we move v2 and
  // v3 inward, and the ring becomes the notch.
  const eps = 0.001; // 0.1 % along
  const midX1 = p1Coord.x + (p4Coord.x - p1Coord.x) * eps;
  const midY1 = p1Coord.y + (p4Coord.y - p1Coord.y) * eps;
  const afterP2split = insertVertexOnEdge(afterP4, middleEdge.id, {
    x: midX1,
    y: midY1,
  });
  if (!afterP2split) return { error: "failed to split for P2" };

  const p2Vertex = afterP2split.vertices.find(
    (v) =>
      !afterP4.vertices.some((old) => old.id === v.id) &&
      v.id !== p1Vertex.id &&
      v.id !== p4Vertex.id,
  );
  if (!p2Vertex) return { error: "failed to locate P2 vertex" };

  // The second sub-edge (v2 → P4).
  const v2ToP4Edge = afterP2split.edges.find(
    (e) => e.start === p2Vertex.id && e.end === p4Vertex.id,
  );
  if (!v2ToP4Edge) return { error: "failed to locate v2→P4 edge" };

  const midX2 = p2Vertex.x + (p4Coord.x - p2Vertex.x) * (1 - eps);
  const midY2 = p2Vertex.y + (p4Coord.y - p2Vertex.y) * (1 - eps);
  const afterP3split = insertVertexOnEdge(afterP2split, v2ToP4Edge.id, {
    x: midX2,
    y: midY2,
  });
  if (!afterP3split) return { error: "failed to split for P3" };

  const p3Vertex = afterP3split.vertices.find(
    (v) =>
      !afterP2split.vertices.some((old) => old.id === v.id) &&
      v.id !== p1Vertex.id &&
      v.id !== p4Vertex.id &&
      v.id !== p2Vertex.id,
  );
  if (!p3Vertex) return { error: "failed to locate P3 vertex" };

  // Move P2 and P3 inward by recessDepthMm.
  const p2NewX = Math.round(p1Coord.x + inward.x * input.recessDepthMm);
  const p2NewY = Math.round(p1Coord.y + inward.y * input.recessDepthMm);
  const p3NewX = Math.round(p4Coord.x + inward.x * input.recessDepthMm);
  const p3NewY = Math.round(p4Coord.y + inward.y * input.recessDepthMm);

  const movedVertices = afterP3split.vertices.map((v) => {
    if (v.id === p2Vertex.id) return { ...v, x: p2NewX, y: p2NewY };
    if (v.id === p3Vertex.id) return { ...v, x: p3NewX, y: p3NewY };
    return v;
  });
  let workingPiece: Piece = { ...afterP3split, vertices: movedVertices };

  // Identify the 5 edges that make up the recess in the outer ring:
  //   A→P1, P1→P2, P2→P3, P3→P4, P4→B
  // Walk the outer ring to find them.
  const ring = workingPiece.outerRing.edges;
  const recessEdgeIds: EdgeId[] = [];
  for (let i = 0; i < ring.length; i++) {
    const id = ring[i]!;
    const e = workingPiece.edges.find((x) => x.id === id);
    if (!e) continue;
    const endsInRecess =
      e.start === p1Vertex.id ||
      e.end === p1Vertex.id ||
      e.start === p2Vertex.id ||
      e.end === p2Vertex.id ||
      e.start === p3Vertex.id ||
      e.end === p3Vertex.id ||
      e.start === p4Vertex.id ||
      e.end === p4Vertex.id;
    if (endsInRecess) recessEdgeIds.push(id);
  }

  // Identify specific sub-edges by their endpoints.
  const sideEdge1 = workingPiece.edges.find(
    (e) => e.start === p1Vertex.id && e.end === p2Vertex.id,
  );
  const backEdge = workingPiece.edges.find(
    (e) => e.start === p2Vertex.id && e.end === p3Vertex.id,
  );
  const sideEdge2 = workingPiece.edges.find(
    (e) => e.start === p3Vertex.id && e.end === p4Vertex.id,
  );
  if (!sideEdge1 || !backEdge || !sideEdge2) {
    return { error: "failed to locate recess sub-edges after move" };
  }

  // Set exposures: sides concealed, back wall (it's still adjacent to
  // wall behind the windowsill).
  let exposed: Piece | undefined = setEdgeExposure(
    workingPiece,
    sideEdge1.id,
    "concealed",
  );
  if (!exposed) return { error: "failed to set sideEdge1 exposure" };
  workingPiece = exposed;
  exposed = setEdgeExposure(workingPiece, sideEdge2.id, "concealed");
  if (!exposed) return { error: "failed to set sideEdge2 exposure" };
  workingPiece = exposed;
  exposed = setEdgeExposure(workingPiece, backEdge.id, "wall");
  if (!exposed) return { error: "failed to set backEdge exposure" };
  workingPiece = exposed;

  const group: RecessGroup = {
    recessId: mintRecessId(),
    edgeIds: recessEdgeIds,
    vertexIds: [p1Vertex.id, p2Vertex.id, p3Vertex.id, p4Vertex.id],
    backEdgeId: backEdge.id,
    originalEdgeMetadata,
  };

  return { piece: workingPiece, group };
}

/**
 * Helper: find a recess group by its back edge ID. The editor's "remove
 * recess" button reads this to know which group to retire.
 */
export function findRecessByBackEdge(
  groups: ReadonlyMap<RecessId, RecessGroup>,
  edgeId: EdgeId,
): RecessGroup | null {
  for (const group of groups.values()) {
    if (group.backEdgeId === edgeId) return group;
  }
  return null;
}

/**
 * Helper: check if an edge ID belongs to any recess group. Used by the
 * canvas to colour recess edges distinctly.
 */
export function edgeBelongsToRecess(
  groups: ReadonlyMap<RecessId, RecessGroup>,
  edgeId: EdgeId,
): boolean {
  for (const group of groups.values()) {
    if (group.edgeIds.some((id) => id === edgeId)) return true;
  }
  return false;
}
