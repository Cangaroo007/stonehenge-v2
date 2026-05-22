// packages/geometry/__tests__/_fixtures.ts
//
// Shared test helpers. Builds a Piece from an ordered list of vertex
// coordinates (CCW for a positive-area outer ring), wiring up consecutive
// edges with default metadata. Each test then mutates per-edge metadata as
// needed via the public edge-ops API.

import {
  edgeId,
  pieceId,
  vertexId,
  type Edge,
  type EdgeExposure,
  type EdgeId,
  type EdgeProfile,
  type Piece,
  type Ring,
  type Vertex,
  type VertexId,
} from "../src/index.js";

export interface BuildPieceInput {
  readonly name?: string;
  readonly materialId?: string;
  readonly coords: ReadonlyArray<readonly [number, number]>;
  readonly defaultProfile?: EdgeProfile;
  readonly defaultExposure?: EdgeExposure;
}

export interface BuiltPiece {
  readonly piece: Piece;
  readonly vertexIds: readonly VertexId[]; // in coords order
  readonly edgeIds: readonly EdgeId[]; // edge[i] connects coords[i] → coords[i+1]
}

export function buildSimplePiece(input: BuildPieceInput): BuiltPiece {
  const profile: EdgeProfile = input.defaultProfile ?? "raw";
  const exposure: EdgeExposure = input.defaultExposure ?? "exposed";

  const vertices: Vertex[] = input.coords.map(([x, y]) => ({
    id: vertexId(),
    x,
    y,
  }));

  const edges: Edge[] = [];
  const edgeIds: EdgeId[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]!;
    const b = vertices[(i + 1) % vertices.length]!;
    const id = edgeId();
    edgeIds.push(id);
    edges.push({
      id,
      start: a.id,
      end: b.id,
      profile,
      finish: "polished",
      exposure,
    });
  }

  const outerRing: Ring = {
    edges: edgeIds,
    orientation: "ccw",
  };

  const piece: Piece = {
    id: pieceId(),
    name: input.name ?? "test-piece",
    pieceRole: "BENCHTOP",
    materialId: input.materialId ?? "mat-test",
    thicknessMm: 20,
    vertices,
    edges,
    outerRing,
    innerRings: [],
    features: [],
  };

  return {
    piece,
    vertexIds: vertices.map((v) => v.id),
    edgeIds,
  };
}

/** Coordinates for the 3200x600 reference rectangle used in the calculator
 *  snapshot. */
export const RECTANGLE_3200X600: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [3200, 0],
  [3200, 600],
  [0, 600],
];

/** L-shape footprint matching `data/mock-lidar/kitchen-l-shape.json`. */
export const L_SHAPE: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [3200, 0],
  [3200, 600],
  [600, 600],
  [600, 2400],
  [0, 2400],
];

/** U-shape footprint (left, top, right runs). Outer perimeter traced CCW. */
export const U_SHAPE: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [600, 0],
  [600, 2400],
  [2400, 2400],
  [2400, 0],
  [3000, 0],
  [3000, 3000],
  [0, 3000],
];
