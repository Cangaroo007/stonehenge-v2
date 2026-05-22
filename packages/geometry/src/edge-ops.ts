// packages/geometry/src/edge-ops.ts
//
// ID-stable edge operations. The discipline of this module is the whole point
// of the prototype: V2 regenerated edge IDs (and silently dropped edge
// metadata) on geometric edits. We do not.
//
// Invariants enforced here:
//   1. `moveVertex` does NOT change any edge IDs and does NOT change edge
//      metadata.
//   2. `splitEdge` retires the parent edge ID and mints two new edges. Both
//      new edges carry the parent's profile, finish, exposure, curve (if any)
//      and buildUp. They are tagged `generatedBy: "split"`.
//   3. `mergeEdges` keeps `edgeA`'s metadata on the merged edge, retires both
//      input IDs and the shared interior vertex, and tags the result
//      `generatedBy: "merge"`.
//   4. `setEdgeProfile` / `setEdgeExposure` change a single edge's metadata
//      by stable ID; the edge's ID and all other metadata are preserved.
//
// All operations return a new Piece. Inputs are not mutated.

import { edgeId, vertexId } from "./ids";
import type {
  Edge,
  EdgeExposure,
  EdgeId,
  EdgeProfile,
  Piece,
  Ring,
  Vertex,
  VertexId,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function replaceEdgeInRing(
  ring: Ring,
  oldId: EdgeId,
  replacement: readonly EdgeId[],
): Ring {
  const next: EdgeId[] = [];
  let replaced = false;
  for (const id of ring.edges) {
    if (id === oldId) {
      next.push(...replacement);
      replaced = true;
    } else {
      next.push(id);
    }
  }
  if (!replaced) return ring;
  return { ...ring, edges: next };
}

function replaceTwoConsecutiveEdgesInRing(
  ring: Ring,
  firstId: EdgeId,
  secondId: EdgeId,
  replacement: EdgeId,
): { ring: Ring; replaced: boolean } {
  const e = ring.edges;
  for (let i = 0; i < e.length; i++) {
    const a = e[i]!;
    const b = e[(i + 1) % e.length]!;
    if (a === firstId && b === secondId) {
      // Build new edge list with [a, b] collapsed to [replacement].
      const next: EdgeId[] = [];
      // We need to walk the ring but skip the (i, i+1) pair and insert the
      // replacement once. Handle the wrap-around case where b is at index 0.
      const wraps = i === e.length - 1;
      for (let j = 0; j < e.length; j++) {
        if (wraps) {
          if (j === i) {
            next.push(replacement);
            continue;
          }
          if (j === 0) continue; // skip the wrapped second edge
          next.push(e[j]!);
        } else {
          if (j === i) {
            next.push(replacement);
            continue;
          }
          if (j === i + 1) continue;
          next.push(e[j]!);
        }
      }
      return { ring: { ...ring, edges: next }, replaced: true };
    }
  }
  return { ring, replaced: false };
}

function findEdge(piece: Piece, id: EdgeId): Edge {
  const e = piece.edges.find((x) => x.id === id);
  if (!e) {
    throw new Error(`edge-ops: edge ${String(id)} not found in piece`);
  }
  return e;
}

function findVertex(piece: Piece, id: VertexId): Vertex {
  const v = piece.vertices.find((x) => x.id === id);
  if (!v) {
    throw new Error(`edge-ops: vertex ${String(id)} not found in piece`);
  }
  return v;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public operations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Splits `edgeId` into two new edges meeting at `splitPoint`. The caller is
 * responsible for choosing the split coordinates and minting the new
 * `VertexId` (typically via `vertexId()`).
 *
 * Both halves inherit the parent edge's profile, finish, exposure, curve (if
 * any), and buildUp. The parent edge's ID is retired.
 *
 * If the parent edge appears in the outer ring or any inner ring, those rings
 * are rewritten to reference the new edge IDs in order
 * `[firstHalf, secondHalf]`.
 */
export function splitEdge(
  piece: Piece,
  targetEdgeId: EdgeId,
  splitPoint: Vertex,
): Piece {
  const original = findEdge(piece, targetEdgeId);

  if (piece.vertices.some((v) => v.id === splitPoint.id)) {
    throw new Error(
      `splitEdge: splitPoint vertex id ${String(splitPoint.id)} already exists`,
    );
  }

  const firstId = edgeId();
  const secondId = edgeId();

  // Inherit metadata. Note we explicitly preserve curve and buildUp when
  // present; in the prototype both halves carry the parent's curve descriptor
  // unchanged, since arc-accurate split is deferred to V3.
  const inheritedFirst: Edge = {
    id: firstId,
    start: original.start,
    end: splitPoint.id,
    ...(original.curve !== undefined ? { curve: original.curve } : {}),
    profile: original.profile,
    finish: original.finish,
    exposure: original.exposure,
    ...(original.buildUp !== undefined
      ? { buildUp: original.buildUp }
      : {}),
    generatedBy: "split",
  };

  const inheritedSecond: Edge = {
    id: secondId,
    start: splitPoint.id,
    end: original.end,
    ...(original.curve !== undefined ? { curve: original.curve } : {}),
    profile: original.profile,
    finish: original.finish,
    exposure: original.exposure,
    ...(original.buildUp !== undefined
      ? { buildUp: original.buildUp }
      : {}),
    generatedBy: "split",
  };

  const nextEdges: Edge[] = [];
  for (const e of piece.edges) {
    if (e.id === targetEdgeId) {
      nextEdges.push(inheritedFirst, inheritedSecond);
    } else {
      nextEdges.push(e);
    }
  }

  const replacement: readonly EdgeId[] = [firstId, secondId];
  const nextOuter = replaceEdgeInRing(piece.outerRing, targetEdgeId, replacement);
  const nextInner = piece.innerRings.map((r) =>
    replaceEdgeInRing(r, targetEdgeId, replacement),
  );

  return {
    ...piece,
    vertices: [...piece.vertices, splitPoint],
    edges: nextEdges,
    outerRing: nextOuter,
    innerRings: nextInner,
  };
}

/**
 * Merges two edges that are consecutive in the same ring (outer or inner)
 * with `edgeA` immediately preceding `edgeB`. The shared interior vertex is
 * removed unless still referenced by another edge. The merged edge takes
 * `edgeA`'s metadata.
 */
export function mergeEdges(
  piece: Piece,
  edgeAId: EdgeId,
  edgeBId: EdgeId,
): Piece {
  const a = findEdge(piece, edgeAId);
  const b = findEdge(piece, edgeBId);
  if (a.end !== b.start) {
    throw new Error(
      `mergeEdges: edges ${String(edgeAId)} and ${String(edgeBId)} are not consecutive (a.end !== b.start)`,
    );
  }

  const mergedId = edgeId();
  const merged: Edge = {
    id: mergedId,
    start: a.start,
    end: b.end,
    ...(a.curve !== undefined ? { curve: a.curve } : {}),
    profile: a.profile,
    finish: a.finish,
    exposure: a.exposure,
    ...(a.buildUp !== undefined ? { buildUp: a.buildUp } : {}),
    generatedBy: "merge",
  };

  // Try to replace the consecutive pair in the outer ring, then any inner.
  let { ring: nextOuter, replaced } = replaceTwoConsecutiveEdgesInRing(
    piece.outerRing,
    edgeAId,
    edgeBId,
    mergedId,
  );
  let nextInner = piece.innerRings;
  if (!replaced) {
    const innerOut: Ring[] = [];
    for (const r of piece.innerRings) {
      if (replaced) {
        innerOut.push(r);
        continue;
      }
      const out = replaceTwoConsecutiveEdgesInRing(r, edgeAId, edgeBId, mergedId);
      innerOut.push(out.ring);
      replaced = out.replaced;
    }
    nextInner = innerOut;
  }
  if (!replaced) {
    throw new Error(
      `mergeEdges: edges ${String(edgeAId)} and ${String(edgeBId)} are not consecutive in any ring`,
    );
  }

  const sharedVertexId = a.end;
  const nextEdges = piece.edges
    .filter((e) => e.id !== edgeAId && e.id !== edgeBId)
    .concat(merged);

  // Drop the shared vertex if no remaining edge references it.
  const stillReferenced = nextEdges.some(
    (e) => e.start === sharedVertexId || e.end === sharedVertexId,
  );
  const nextVertices = stillReferenced
    ? piece.vertices
    : piece.vertices.filter((v) => v.id !== sharedVertexId);

  return {
    ...piece,
    vertices: nextVertices,
    edges: nextEdges,
    outerRing: nextOuter,
    innerRings: nextInner,
  };
}

/**
 * Moves a vertex to new coordinates. **Edge IDs are unchanged. Edge metadata
 * is unchanged.** This is the operation V2 implemented incorrectly.
 */
export function moveVertex(
  piece: Piece,
  targetVertexId: VertexId,
  newX: number,
  newY: number,
): Piece {
  // Confirm the vertex exists.
  findVertex(piece, targetVertexId);
  const nextVertices = piece.vertices.map((v) =>
    v.id === targetVertexId ? { ...v, x: newX, y: newY } : v,
  );
  return { ...piece, vertices: nextVertices };
}

/**
 * Sets the profile on a single edge by stable ID.
 */
export function setEdgeProfile(
  piece: Piece,
  targetEdgeId: EdgeId,
  profile: EdgeProfile,
): Piece {
  findEdge(piece, targetEdgeId);
  const nextEdges = piece.edges.map((e) =>
    e.id === targetEdgeId ? { ...e, profile } : e,
  );
  return { ...piece, edges: nextEdges };
}

/**
 * Sets the exposure on a single edge by stable ID.
 */
export function setEdgeExposure(
  piece: Piece,
  targetEdgeId: EdgeId,
  exposure: EdgeExposure,
): Piece {
  findEdge(piece, targetEdgeId);
  const nextEdges = piece.edges.map((e) =>
    e.id === targetEdgeId ? { ...e, exposure } : e,
  );
  return { ...piece, edges: nextEdges };
}

// Re-export for convenience in tests / consumer that may want to mint a
// vertex without importing ids.ts directly.
export { vertexId };
