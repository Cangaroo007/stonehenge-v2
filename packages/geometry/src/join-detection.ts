// packages/geometry/src/join-detection.ts
//
// Round 3B — detect joins between adjacent pieces in a Job.
//
// Joins are not authored by the operator directly: they're an emergent
// property of "this waterfall sits at the right end of that benchtop" or
// "this splashback sits behind that benchtop". The shape of the join (mitre,
// straight-butt, mason-mitre, field-join) is inferred from the role
// combination on each side.
//
// Detection is approximate. The prototype treats two pieces as joined when
// the parent edges of build-up children share a piece, or — for top-level
// pieces — when the role combination is "obviously joined" (BENCHTOP +
// WATERFALL_END, BENCHTOP + SPLASHBACK_*, BENCHTOP + UPSTAND, ...) and the
// operator's intent comes from the AddPiecePanel action that created the
// secondary piece. Pure geometric overlap detection (segment-segment with
// transforms) is deferred to V3.
//
// The function does NOT mutate `job.joins`. The reducer decides what to
// commit; this returns a candidate set.

import { joinId } from "./ids";
import type {
  EdgeId,
  Job,
  Join,
  JoinKind,
  JoinReason,
  Piece,
  PieceId,
  PieceRole,
} from "./types";

/**
 * Round 7A: each role-pair maps to BOTH a kind (how the slabs meet) and a
 * reason (why this join exists). `inferJoin` returns both; the detector
 * passes them through `makeJoin`.
 */
interface InferredJoin {
  readonly kind: JoinKind;
  readonly reason: JoinReason;
}

/**
 * Detect joins between `pieceId` and every other piece in the job that
 * makes geometric sense.
 *
 * Returns an empty array if `pieceId` is not in the job.
 */
export function detectJoinsForPiece(
  job: Job,
  pieceId: PieceId,
): readonly Join[] {
  const target = job.pieces.find((p) => p.id === pieceId);
  if (!target) return [];
  if (target.parentPieceId !== undefined) return []; // child pieces never anchor joins

  const out: Join[] = [];
  for (const other of job.pieces) {
    if (other.id === pieceId) continue;
    if (other.parentPieceId !== undefined) continue;
    const inferred = inferJoin(target.pieceRole, other.pieceRole);
    if (inferred === null) continue;
    // Use the first outer-ring edge of each side as the join's anchor. The
    // prototype doesn't resolve which specific edge is shared (full geometric
    // resolution is V3 work); the canvas uses join.edgeA to draw the
    // indicator along the shared edge.
    const edgeA = target.outerRing.edges[0];
    const edgeB = other.outerRing.edges[0];
    if (!edgeA || !edgeB) continue;
    out.push({
      id: joinId(),
      pieceA: target.id,
      pieceB: other.id,
      edgeA,
      edgeB,
      kind: inferred.kind,
      reason: inferred.reason,
    });
  }
  return out;
}

/**
 * Detect every plausible join across the whole job. Each join appears once
 * (the lower piece-array-index is the A side).
 */
export function detectAllJoins(job: Job): readonly Join[] {
  const out: Join[] = [];
  for (let i = 0; i < job.pieces.length; i++) {
    const a = job.pieces[i]!;
    if (a.parentPieceId !== undefined) continue;
    for (let j = i + 1; j < job.pieces.length; j++) {
      const b = job.pieces[j]!;
      if (b.parentPieceId !== undefined) continue;
      const inferred = inferJoin(a.pieceRole, b.pieceRole);
      if (inferred === null) continue;
      const edgeA = a.outerRing.edges[0];
      const edgeB = b.outerRing.edges[0];
      if (!edgeA || !edgeB) continue;
      out.push({
        id: joinId(),
        pieceA: a.id,
        pieceB: b.id,
        edgeA,
        edgeB,
        kind: inferred.kind,
        reason: inferred.reason,
      });
    }
  }
  return out;
}

/**
 * Construct a single Join between two named pieces with a chosen kind +
 * reason. Used by the reducer when the operator drives "Add waterfall to
 * right end" and the intent is unambiguous.
 *
 * Round 7A: `reason` is required so V3 can store the assembly intent;
 * `angleDeg` is optional and only set on MITRE joins where the actual
 * mitre angle was computed from edge directions (2-Gap-3).
 */
export function makeJoin(input: {
  readonly pieceA: PieceId;
  readonly pieceB: PieceId;
  readonly edgeA: EdgeId;
  readonly edgeB: EdgeId;
  readonly kind: JoinKind;
  readonly reason: JoinReason;
  readonly angleDeg?: number;
}): Join {
  return {
    id: joinId(),
    pieceA: input.pieceA,
    pieceB: input.pieceB,
    edgeA: input.edgeA,
    edgeB: input.edgeB,
    kind: input.kind,
    reason: input.reason,
    ...(input.angleDeg !== undefined ? { angleDeg: input.angleDeg } : {}),
  };
}

/**
 * Heuristic: return the canonical JoinKind + JoinReason for a pair of
 * piece roles, or `null` if the pair does not normally produce a join.
 *
 * Round 7A: split from the old `inferJoinKind`. The kind says how the
 * slabs meet (MITRE / BUTT / FIELD_JOIN / MASON_MITRE); the reason says
 * what the join is for in the assembly. V3 reads both.
 */
function inferJoin(
  roleA: PieceRole,
  roleB: PieceRole,
): InferredJoin | null {
  const set = sortedRoles(roleA, roleB);
  // Waterfalls and end panels mitre to benchtops.
  if (matchPair(set, "BENCHTOP", "WATERFALL_END")) {
    return { kind: "MITRE", reason: "WATERFALL_ATTACHMENT" };
  }
  if (matchPair(set, "ISLAND_TOP", "WATERFALL_END")) {
    return { kind: "MITRE", reason: "WATERFALL_ATTACHMENT" };
  }
  if (matchPair(set, "BENCHTOP", "END_PANEL")) {
    return { kind: "MITRE", reason: "WATERFALL_ATTACHMENT" };
  }
  if (matchPair(set, "ISLAND_TOP", "END_PANEL")) {
    return { kind: "MITRE", reason: "WATERFALL_ATTACHMENT" };
  }
  // Splashbacks butt to benchtops.
  if (matchPair(set, "BENCHTOP", "SPLASHBACK_FULL")) {
    return { kind: "BUTT", reason: "SPLASHBACK_ATTACHMENT" };
  }
  if (matchPair(set, "BENCHTOP", "SPLASHBACK_LOW")) {
    return { kind: "BUTT", reason: "SPLASHBACK_ATTACHMENT" };
  }
  if (matchPair(set, "BENCHTOP", "UPSTAND")) {
    return { kind: "BUTT", reason: "SPLASHBACK_ATTACHMENT" };
  }
  // Two benchtops on a long bench → field join.
  if (matchPair(set, "BENCHTOP", "BENCHTOP")) {
    return { kind: "FIELD_JOIN", reason: "PIECE_JOIN" };
  }
  if (matchPair(set, "ISLAND_TOP", "ISLAND_TOP")) {
    return { kind: "FIELD_JOIN", reason: "PIECE_JOIN" };
  }
  // Windowsill sits in the recess, butt-joined to the slab edges.
  if (matchPair(set, "BENCHTOP", "WINDOWSILL")) {
    return { kind: "BUTT", reason: "PIECE_JOIN" };
  }
  return null;
}

function sortedRoles(a: PieceRole, b: PieceRole): readonly [PieceRole, PieceRole] {
  return a <= b ? [a, b] : [b, a];
}

function matchPair(
  set: readonly [PieceRole, PieceRole],
  x: PieceRole,
  y: PieceRole,
): boolean {
  const [xx, yy] = x <= y ? [x, y] : [y, x];
  return set[0] === xx && set[1] === yy;
}
