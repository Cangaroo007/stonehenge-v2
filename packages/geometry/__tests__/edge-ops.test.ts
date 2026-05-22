// packages/geometry/__tests__/edge-ops.test.ts

import { describe, expect, it } from "vitest";

import {
  mergeEdges,
  moveVertex,
  setEdgeExposure,
  setEdgeProfile,
  splitEdge,
  vertexId,
  type Vertex,
} from "../src/index.js";

import { RECTANGLE_3200X600, buildSimplePiece } from "./_fixtures.js";

describe("edge-ops — splitEdge", () => {
  it("retires the parent edge, mints two new edges, both inheriting metadata", () => {
    const { piece, edgeIds } = buildSimplePiece({
      coords: RECTANGLE_3200X600,
      defaultProfile: "pencil-round",
      defaultExposure: "exposed",
    });
    const parentId = edgeIds[0]!; // 3200 mm south edge
    const splitVertex: Vertex = { id: vertexId(), x: 1600, y: 0 };

    const next = splitEdge(piece, parentId, splitVertex);

    expect(next.edges.find((e) => e.id === parentId)).toBeUndefined();
    expect(next.edges.length).toBe(piece.edges.length + 1);
    expect(next.vertices.length).toBe(piece.vertices.length + 1);

    const halves = next.edges.filter((e) => e.generatedBy === "split");
    expect(halves.length).toBe(2);
    for (const h of halves) {
      expect(h.profile).toBe("pencil-round");
      expect(h.exposure).toBe("exposed");
      expect(h.finish).toBe("polished");
    }

    // Outer ring includes both halves where the parent used to sit.
    expect(next.outerRing.edges).toContain(halves[0]!.id);
    expect(next.outerRing.edges).toContain(halves[1]!.id);
    expect(next.outerRing.edges).not.toContain(parentId);
  });

  it("preserves a curve descriptor onto both halves", () => {
    const { piece, edgeIds } = buildSimplePiece({
      coords: RECTANGLE_3200X600,
    });
    // Authored curve on the south edge (an arc bulging south).
    const withCurve = {
      ...piece,
      edges: piece.edges.map((e) =>
        e.id === edgeIds[0]
          ? { ...e, curve: { kind: "arc" as const, radiusMm: 5000, bulge: "right" as const } }
          : e,
      ),
    };
    const sv: Vertex = { id: vertexId(), x: 1600, y: 0 };
    const next = splitEdge(withCurve, edgeIds[0]!, sv);
    const halves = next.edges.filter((e) => e.generatedBy === "split");
    for (const h of halves) {
      expect(h.curve).toEqual({ kind: "arc", radiusMm: 5000, bulge: "right" });
    }
  });
});

describe("edge-ops — moveVertex", () => {
  it("does NOT change any edge IDs (the V2 regression rule)", () => {
    const { piece, vertexIds, edgeIds } = buildSimplePiece({
      coords: RECTANGLE_3200X600,
    });
    const next = moveVertex(piece, vertexIds[1]!, 3500, 100);

    expect(next.edges.map((e) => e.id)).toEqual(piece.edges.map((e) => e.id));
    // Edges still reference the same vertex IDs.
    for (let i = 0; i < piece.edges.length; i++) {
      expect(next.edges[i]!.start).toBe(piece.edges[i]!.start);
      expect(next.edges[i]!.end).toBe(piece.edges[i]!.end);
    }
    expect(edgeIds.length).toBe(piece.edges.length);
  });

  it("does NOT change edge metadata", () => {
    const { piece, vertexIds, edgeIds } = buildSimplePiece({
      coords: RECTANGLE_3200X600,
      defaultProfile: "ogee",
    });
    const withProfiles = setEdgeProfile(piece, edgeIds[0]!, "full-bullnose");
    const next = moveVertex(withProfiles, vertexIds[1]!, 2500, 0);
    expect(next.edges.find((e) => e.id === edgeIds[0])!.profile).toBe(
      "full-bullnose",
    );
    expect(next.edges.find((e) => e.id === edgeIds[1])!.profile).toBe("ogee");
  });

  it("updates only the targeted vertex coordinates", () => {
    const { piece, vertexIds } = buildSimplePiece({
      coords: RECTANGLE_3200X600,
    });
    const next = moveVertex(piece, vertexIds[1]!, 3500, 100);
    const moved = next.vertices.find((v) => v.id === vertexIds[1])!;
    expect(moved.x).toBe(3500);
    expect(moved.y).toBe(100);
    // Other vertices untouched.
    expect(next.vertices.find((v) => v.id === vertexIds[0])).toEqual(
      piece.vertices.find((v) => v.id === vertexIds[0]),
    );
  });
});

describe("edge-ops — mergeEdges", () => {
  it("keeps edgeA's metadata and tags the result generatedBy='merge'", () => {
    // Build a 4-vertex rectangle, then split south edge so we have two
    // consecutive halves we can merge.
    const { piece, edgeIds } = buildSimplePiece({
      coords: RECTANGLE_3200X600,
      defaultProfile: "pencil-round",
    });
    const sv: Vertex = { id: vertexId(), x: 1600, y: 0 };
    const split = splitEdge(piece, edgeIds[0]!, sv);
    const halves = split.outerRing.edges
      .map((id) => split.edges.find((e) => e.id === id)!)
      .filter((e) => e.generatedBy === "split");
    expect(halves.length).toBe(2);

    // Reset edgeA to an unmistakable profile so we can confirm inheritance.
    const tagged = setEdgeProfile(split, halves[0]!.id, "ogee");

    const merged = mergeEdges(tagged, halves[0]!.id, halves[1]!.id);
    const survivor = merged.edges.find((e) => e.generatedBy === "merge")!;
    expect(survivor.profile).toBe("ogee");
    // Shared interior vertex (1600,0) should be gone.
    expect(merged.vertices.find((v) => v.id === sv.id)).toBeUndefined();
  });

  it("rejects non-consecutive edges", () => {
    const { piece, edgeIds } = buildSimplePiece({
      coords: RECTANGLE_3200X600,
    });
    expect(() => mergeEdges(piece, edgeIds[0]!, edgeIds[2]!)).toThrow();
  });
});

describe("edge-ops — setEdgeProfile / setEdgeExposure", () => {
  it("changes only the targeted edge by stable ID", () => {
    const { piece, edgeIds } = buildSimplePiece({
      coords: RECTANGLE_3200X600,
    });
    const a = setEdgeProfile(piece, edgeIds[0]!, "ogee");
    expect(a.edges.find((e) => e.id === edgeIds[0])!.profile).toBe("ogee");
    expect(a.edges.find((e) => e.id === edgeIds[1])!.profile).toBe("raw");

    const b = setEdgeExposure(a, edgeIds[2]!, "wall");
    expect(b.edges.find((e) => e.id === edgeIds[2])!.exposure).toBe("wall");
    expect(b.edges.find((e) => e.id === edgeIds[0])!.profile).toBe("ogee");
  });
});
