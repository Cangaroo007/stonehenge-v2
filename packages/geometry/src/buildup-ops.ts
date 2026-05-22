// packages/geometry/src/buildup-ops.ts
//
// Round 3B — build-up child piece generation.
//
// Given a parent slab (e.g. a BENCHTOP), an edge ID on that slab, and a
// `BuildUpDescriptor`, this module synthesises the child pieces that
// represent the laminated strips making up the apparent thickness:
//
//   - Part B (FASCIA) — strip glued to the visible vertical face of the slab.
//                       Width along the edge, depth equal to the build-up's
//                       `stripWidthMm`.
//   - Part C (RETURN) — strip glued to the underside of the slab, set back
//                       from the front by `stripWidthMm`. Same length as
//                       fascia, depth `stripWidthMm + 20` (a 60 mm-thick
//                       look gets a 60 mm-wide return strip).
//   - Part D (INFILL) — only when `targetThicknessMm > 60`. Fills the void
//                       between fascia and return for very thick build-ups.
//
// `method: 'SOLID'` returns no child pieces — the build-up is intrinsic to
// the slab cut (V-groove + fold).
//
// Output pieces all carry `parentPieceId` pointing at the parent slab, and
// `pieceRole` set to `FASCIA | RETURN | INFILL`. Each is a simple rectangle
// in piece-local mm coordinates anchored at (0, 0). Render-time placement
// (alongside the parent on the canvas) is the canvas's responsibility.

import { edgeId, pieceId, vertexId } from "./ids";
import type {
  BuildUpDescriptor,
  Edge,
  EdgeId,
  Piece,
  PieceId,
  PieceRole,
  Ring,
  Vertex,
} from "./types";

export interface GenerateBuildUpInput {
  readonly parentPiece: Piece;
  readonly edgeId: EdgeId;
  readonly buildUp: BuildUpDescriptor;
}

/**
 * Generate the child pieces for a build-up on `edgeId` of `parentPiece`.
 *
 * Returns an empty array when:
 *   - The descriptor's `method` is `"SOLID"` (no separate strips).
 *   - The target edge can't be found on the parent piece.
 *   - The build-up's `stripWidthMm` exceeds half the parent edge's length
 *     (geometrically unsupportable; the caller should reject the configuration).
 */
export function generateBuildUpPieces(
  input: GenerateBuildUpInput,
): readonly Piece[] {
  const { parentPiece, edgeId: targetEdgeId, buildUp } = input;

  if (buildUp.method === "SOLID") return [];

  const edge = parentPiece.edges.find((e) => e.id === targetEdgeId);
  if (!edge) return [];

  const lengthMm = edgeLengthMm(parentPiece, edge);
  if (lengthMm <= 0) return [];
  if (buildUp.stripWidthMm * 2 > lengthMm) return [];

  const pieces: Piece[] = [];

  // Part B — FASCIA. Length × stripWidthMm rectangle.
  pieces.push(
    makeStripPiece({
      name: `Build-up FASCIA (${buildUp.targetThicknessMm}mm) on ${parentPiece.name}`,
      pieceRole: "FASCIA",
      lengthMm,
      depthMm: buildUp.stripWidthMm,
      thicknessMm: buildUp.targetThicknessMm - parentPiece.thicknessMm,
      parentPieceId: parentPiece.id,
      materialId: parentPiece.materialId,
    }),
  );

  // Part C — RETURN. Length × (stripWidthMm + 20mm) rectangle.
  pieces.push(
    makeStripPiece({
      name: `Build-up RETURN (${buildUp.targetThicknessMm}mm) on ${parentPiece.name}`,
      pieceRole: "RETURN",
      lengthMm,
      depthMm: buildUp.stripWidthMm + 20,
      thicknessMm: parentPiece.thicknessMm,
      parentPieceId: parentPiece.id,
      materialId: parentPiece.materialId,
    }),
  );

  // Part D — INFILL — only for very thick build-ups.
  if (buildUp.targetThicknessMm > 60) {
    pieces.push(
      makeStripPiece({
        name: `Build-up INFILL (${buildUp.targetThicknessMm}mm) on ${parentPiece.name}`,
        pieceRole: "INFILL",
        lengthMm,
        depthMm: buildUp.stripWidthMm,
        thicknessMm:
          buildUp.targetThicknessMm - parentPiece.thicknessMm - 20,
        parentPieceId: parentPiece.id,
        materialId: parentPiece.materialId,
      }),
    );
  }

  return pieces;
}

interface MakeStripInput {
  readonly name: string;
  readonly pieceRole: PieceRole;
  readonly lengthMm: number;
  readonly depthMm: number;
  readonly thicknessMm: number;
  readonly parentPieceId: PieceId;
  readonly materialId: string;
}

function makeStripPiece(input: MakeStripInput): Piece {
  const v0: Vertex = { id: vertexId(), x: 0, y: 0 };
  const v1: Vertex = { id: vertexId(), x: input.lengthMm, y: 0 };
  const v2: Vertex = { id: vertexId(), x: input.lengthMm, y: input.depthMm };
  const v3: Vertex = { id: vertexId(), x: 0, y: input.depthMm };

  const eS: Edge = {
    id: edgeId(),
    start: v0.id,
    end: v1.id,
    profile: "raw",
    finish: "polished",
    exposure: "join",
  };
  const eE: Edge = {
    id: edgeId(),
    start: v1.id,
    end: v2.id,
    profile: "raw",
    finish: "polished",
    exposure: "concealed",
  };
  const eN: Edge = {
    id: edgeId(),
    start: v2.id,
    end: v3.id,
    profile: "raw",
    finish: "polished",
    exposure: "exposed",
  };
  const eW: Edge = {
    id: edgeId(),
    start: v3.id,
    end: v0.id,
    profile: "raw",
    finish: "polished",
    exposure: "concealed",
  };

  const outerRing: Ring = {
    edges: [eS.id, eE.id, eN.id, eW.id],
    orientation: "ccw",
  };

  return {
    id: pieceId(),
    name: input.name,
    pieceRole: input.pieceRole,
    materialId: input.materialId,
    thicknessMm: input.thicknessMm,
    parentPieceId: input.parentPieceId,
    vertices: [v0, v1, v2, v3],
    edges: [eS, eE, eN, eW],
    outerRing,
    innerRings: [],
    features: [],
  };
}

function edgeLengthMm(piece: Piece, edge: Edge): number {
  const a = piece.vertices.find((v) => v.id === edge.start);
  const b = piece.vertices.find((v) => v.id === edge.end);
  if (!a || !b) return 0;
  return Math.hypot(b.x - a.x, b.y - a.y);
}
