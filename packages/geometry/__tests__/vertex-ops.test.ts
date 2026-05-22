// packages/geometry/__tests__/vertex-ops.test.ts

import { describe, expect, it } from "vitest";

import {
  insertVertexAtMidpoint,
  insertVertexOnEdge,
  interiorAngleDeg,
  removeVertex,
  setVertexAngle,
  setVertexCornerRadius,
  validateEdgeIdStability,
  validatePiece,
} from "../src/index.js";

import { L_SHAPE, RECTANGLE_3200X600, buildSimplePiece } from "./_fixtures.js";

describe("vertex-ops — insertVertexOnEdge", () => {
  it("inserts a vertex on a horizontal edge at the projected point", () => {
    const { piece, edgeIds } = buildSimplePiece({
      coords: RECTANGLE_3200X600,
      defaultProfile: "ogee",
      defaultExposure: "exposed",
    });
    const south = edgeIds[0]!; // 3200 mm bottom edge from (0,0) to (3200,0)
    const next = insertVertexOnEdge(piece, south, { x: 1000, y: 50 });
    expect(next).not.toBeNull();
    if (!next) return;

    // One new vertex, one new edge (parent retired, two halves added).
    expect(next.vertices.length).toBe(piece.vertices.length + 1);
    expect(next.edges.length).toBe(piece.edges.length + 1);

    // Parent edge ID is gone.
    expect(next.edges.some((e) => e.id === south)).toBe(false);

    // Both halves carry the parent's metadata.
    const halves = next.edges.filter((e) => e.generatedBy === "split");
    expect(halves).toHaveLength(2);
    for (const h of halves) {
      expect(h.profile).toBe("ogee");
      expect(h.exposure).toBe("exposed");
    }
  });

  it("snaps the projected point onto the edge (off-edge clicks)", () => {
    const { piece, edgeIds } = buildSimplePiece({ coords: RECTANGLE_3200X600 });
    const south = edgeIds[0]!;
    const next = insertVertexOnEdge(piece, south, { x: 1500, y: 250 });
    expect(next).not.toBeNull();
    if (!next) return;

    const newVertex = next.vertices.find(
      (v) => !piece.vertices.some((old) => old.id === v.id),
    );
    expect(newVertex).toBeDefined();
    if (!newVertex) return;
    // Point projects to (1500, 0) on the south edge from (0,0) to (3200,0).
    expect(newVertex.x).toBe(1500);
    expect(newVertex.y).toBe(0);
  });

  it("inserts on a diagonal edge", () => {
    // Triangle so a known diagonal exists.
    const { piece, edgeIds } = buildSimplePiece({
      coords: [
        [0, 0],
        [1000, 0],
        [0, 1000],
      ],
    });
    // Edge 1 is the hypotenuse from (1000,0) to (0,1000).
    const next = insertVertexOnEdge(piece, edgeIds[1]!, { x: 500, y: 500 });
    expect(next).not.toBeNull();
    if (!next) return;
    const newVertex = next.vertices.find(
      (v) => !piece.vertices.some((old) => old.id === v.id),
    );
    expect(newVertex).toBeDefined();
    if (!newVertex) return;
    // Projection of (500,500) onto the line from (1000,0) to (0,1000)
    // is the midpoint (500,500) itself.
    expect(newVertex.x).toBe(500);
    expect(newVertex.y).toBe(500);
  });

  it("returns null on unknown edgeId", () => {
    const { piece } = buildSimplePiece({ coords: RECTANGLE_3200X600 });
    const fake = "00000000-0000-0000-0000-000000000000" as never;
    expect(insertVertexOnEdge(piece, fake, { x: 0, y: 0 })).toBeNull();
  });

  it("preserves IDs of unaffected edges (edge-ID stability)", () => {
    const { piece, edgeIds } = buildSimplePiece({
      coords: RECTANGLE_3200X600,
      defaultProfile: "pencil-round",
    });
    const south = edgeIds[0]!;
    const next = insertVertexOnEdge(piece, south, { x: 1600, y: 0 });
    expect(next).not.toBeNull();
    if (!next) return;
    // Edges 1, 2, 3 still exist with same metadata.
    const untouched = edgeIds.slice(1);
    expect(validateEdgeIdStability(piece, next, untouched)).toBe(true);
  });

  it("the resulting piece passes validatePiece", () => {
    const { piece, edgeIds } = buildSimplePiece({ coords: L_SHAPE });
    const next = insertVertexOnEdge(piece, edgeIds[0]!, { x: 1500, y: 0 });
    expect(next).not.toBeNull();
    if (!next) return;
    const v = validatePiece(next);
    expect(v.valid).toBe(true);
  });
});

describe("vertex-ops — insertVertexAtMidpoint", () => {
  it("inserts at the midpoint of a horizontal edge", () => {
    const { piece, edgeIds } = buildSimplePiece({ coords: RECTANGLE_3200X600 });
    const next = insertVertexAtMidpoint(piece, edgeIds[0]!);
    expect(next).not.toBeNull();
    if (!next) return;
    const newVertex = next.vertices.find(
      (v) => !piece.vertices.some((old) => old.id === v.id),
    );
    expect(newVertex).toBeDefined();
    if (!newVertex) return;
    expect(newVertex.x).toBe(1600);
    expect(newVertex.y).toBe(0);
  });
});

describe("vertex-ops — removeVertex", () => {
  it("merges two adjacent edges, inheriting the incoming edge's metadata", () => {
    // Insert a vertex first so we have something safe to remove.
    const { piece, edgeIds } = buildSimplePiece({
      coords: RECTANGLE_3200X600,
      defaultProfile: "pencil-round",
    });
    const inserted = insertVertexAtMidpoint(piece, edgeIds[0]!);
    expect(inserted).not.toBeNull();
    if (!inserted) return;
    const newVertex = inserted.vertices.find(
      (v) => !piece.vertices.some((old) => old.id === v.id),
    );
    expect(newVertex).toBeDefined();
    if (!newVertex) return;

    const merged = removeVertex(inserted, newVertex.id);
    expect(merged).not.toBeNull();
    if (!merged) return;
    // Back to 4 vertices.
    expect(merged.vertices.length).toBe(piece.vertices.length);
    expect(merged.edges.length).toBe(piece.edges.length);
    // The merged edge inherits the first half's profile (pencil-round).
    const survivor = merged.edges.find((e) => e.generatedBy === "merge");
    expect(survivor).toBeDefined();
    if (!survivor) return;
    expect(survivor.profile).toBe("pencil-round");
  });

  it("returns null when the piece would have fewer than 3 vertices", () => {
    // Triangle: cannot remove any vertex.
    const { piece, vertexIds } = buildSimplePiece({
      coords: [
        [0, 0],
        [1000, 0],
        [0, 1000],
      ],
    });
    expect(removeVertex(piece, vertexIds[0]!)).toBeNull();
  });

  it("returns null on unknown vertexId", () => {
    const { piece } = buildSimplePiece({ coords: RECTANGLE_3200X600 });
    const fake = "00000000-0000-0000-0000-000000000000" as never;
    expect(removeVertex(piece, fake)).toBeNull();
  });

  it("the resulting piece passes validatePiece", () => {
    const { piece, edgeIds } = buildSimplePiece({ coords: L_SHAPE });
    const inserted = insertVertexAtMidpoint(piece, edgeIds[0]!);
    expect(inserted).not.toBeNull();
    if (!inserted) return;
    const newVertex = inserted.vertices.find(
      (v) => !piece.vertices.some((old) => old.id === v.id),
    );
    if (!newVertex) return;
    const merged = removeVertex(inserted, newVertex.id);
    expect(merged).not.toBeNull();
    if (!merged) return;
    expect(validatePiece(merged).valid).toBe(true);
  });
});

describe("vertex-ops — interiorAngleDeg", () => {
  it("rectangle corner is 90 degrees", () => {
    const { piece, vertexIds } = buildSimplePiece({ coords: RECTANGLE_3200X600 });
    const a = interiorAngleDeg(piece, vertexIds[0]!);
    expect(a).not.toBeNull();
    if (a === null) return;
    expect(a).toBeCloseTo(90, 5);
  });

  it("L-shape inner corner is 90 degrees", () => {
    const { piece, vertexIds } = buildSimplePiece({ coords: L_SHAPE });
    // Vertex at index 3 in L_SHAPE is (600, 600) — the concave inner
    // corner. Interior angle there is 270° geometrically but the
    // unsigned angle returned by interiorAngleRad is the acute 90°.
    const a = interiorAngleDeg(piece, vertexIds[3]!);
    expect(a).not.toBeNull();
    if (a === null) return;
    expect(a).toBeCloseTo(90, 5);
  });

  it("returns null for an unknown vertex", () => {
    const { piece } = buildSimplePiece({ coords: RECTANGLE_3200X600 });
    const fake = "00000000-0000-0000-0000-000000000000" as never;
    expect(interiorAngleDeg(piece, fake)).toBeNull();
  });
});

describe("vertex-ops — setVertexAngle", () => {
  it("changes the interior angle at the target vertex", () => {
    const { piece, vertexIds } = buildSimplePiece({ coords: RECTANGLE_3200X600 });
    // Move vertex at (3200, 0) so the angle at that corner becomes 60°.
    const next = setVertexAngle(piece, vertexIds[1]!, 60);
    expect(next).not.toBeNull();
    if (!next) return;
    const newAngle = interiorAngleDeg(next, vertexIds[1]!);
    expect(newAngle).not.toBeNull();
    if (newAngle === null) return;
    expect(newAngle).toBeCloseTo(60, 0); // 1° tolerance — rounding to mm
  });

  it("returns null for invalid angles", () => {
    const { piece, vertexIds } = buildSimplePiece({ coords: RECTANGLE_3200X600 });
    expect(setVertexAngle(piece, vertexIds[0]!, 0)).toBeNull();
    expect(setVertexAngle(piece, vertexIds[0]!, 180)).toBeNull();
    expect(setVertexAngle(piece, vertexIds[0]!, -10)).toBeNull();
  });
});

describe("vertex-ops — setVertexCornerRadius", () => {
  it("sets a corner radius on a sharp corner", () => {
    const { piece, vertexIds } = buildSimplePiece({ coords: RECTANGLE_3200X600 });
    const next = setVertexCornerRadius(piece, vertexIds[0]!, 50);
    expect(next).not.toBeNull();
    if (!next) return;
    const v = next.vertices.find((x) => x.id === vertexIds[0]);
    expect(v?.cornerRadiusMm).toBe(50);
  });

  it("clears the corner radius when set to 0", () => {
    const { piece, vertexIds } = buildSimplePiece({ coords: RECTANGLE_3200X600 });
    const withRadius = setVertexCornerRadius(piece, vertexIds[0]!, 50);
    if (!withRadius) return;
    const cleared = setVertexCornerRadius(withRadius, vertexIds[0]!, 0);
    expect(cleared).not.toBeNull();
    if (!cleared) return;
    const v = cleared.vertices.find((x) => x.id === vertexIds[0]);
    expect(v?.cornerRadiusMm).toBeUndefined();
  });

  it("does NOT change any edge IDs (preserves the V2 regression rule)", () => {
    const { piece, vertexIds, edgeIds } = buildSimplePiece({
      coords: RECTANGLE_3200X600,
      defaultProfile: "ogee",
    });
    const next = setVertexCornerRadius(piece, vertexIds[0]!, 50);
    expect(next).not.toBeNull();
    if (!next) return;
    expect(validateEdgeIdStability(piece, next, edgeIds)).toBe(true);
  });
});
