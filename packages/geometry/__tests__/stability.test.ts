// packages/geometry/__tests__/stability.test.ts
//
// The V2 regression suite. V2 silently regenerated edge IDs (and dropped
// edge metadata) on geometric edits. These tests assert the prototype does
// not.

import { describe, expect, it } from "vitest";

import {
  moveVertex,
  setEdgeExposure,
  setEdgeProfile,
  splitEdge,
  validateEdgeIdStability,
  vertexId,
  type Vertex,
} from "../src/index.js";

import { L_SHAPE, RECTANGLE_3200X600, buildSimplePiece } from "./_fixtures.js";

describe("stability — moveVertex preserves edge IDs and metadata", () => {
  it("rectangle: assign profiles, move a vertex, all profiles intact", () => {
    const { piece, vertexIds, edgeIds } = buildSimplePiece({
      coords: RECTANGLE_3200X600,
    });
    const withProfiles = setEdgeProfile(
      setEdgeProfile(
        setEdgeProfile(piece, edgeIds[0]!, "pencil-round"),
        edgeIds[1]!,
        "ogee",
      ),
      edgeIds[2]!,
      "full-bullnose",
    );
    const exposed = setEdgeExposure(withProfiles, edgeIds[3]!, "wall");

    const moved = moveVertex(exposed, vertexIds[1]!, 3500, 100);

    expect(validateEdgeIdStability(exposed, moved, edgeIds)).toBe(true);

    // Sanity: every original edge ID is still present with its assigned
    // profile.
    expect(moved.edges.find((e) => e.id === edgeIds[0])!.profile).toBe(
      "pencil-round",
    );
    expect(moved.edges.find((e) => e.id === edgeIds[1])!.profile).toBe("ogee");
    expect(moved.edges.find((e) => e.id === edgeIds[2])!.profile).toBe(
      "full-bullnose",
    );
    expect(moved.edges.find((e) => e.id === edgeIds[3])!.exposure).toBe("wall");
  });

  it("L-shape: move every vertex once, all edge IDs survive", () => {
    const { piece, vertexIds, edgeIds } = buildSimplePiece({
      coords: L_SHAPE,
      defaultProfile: "bevel",
    });
    let cur = piece;
    for (let i = 0; i < vertexIds.length; i++) {
      cur = moveVertex(
        cur,
        vertexIds[i]!,
        piece.vertices[i]!.x + 5,
        piece.vertices[i]!.y + 5,
      );
    }
    expect(validateEdgeIdStability(piece, cur, edgeIds)).toBe(true);
    for (const id of edgeIds) {
      expect(cur.edges.find((e) => e.id === id)!.profile).toBe("bevel");
    }
  });
});

describe("stability — splitEdge preserves metadata onto both halves", () => {
  it("after split, both halves carry the parent's profile/finish/exposure", () => {
    const { piece, edgeIds } = buildSimplePiece({
      coords: RECTANGLE_3200X600,
      defaultProfile: "pencil-round",
      defaultExposure: "exposed",
    });
    const parentId = edgeIds[0]!;
    const sv: Vertex = { id: vertexId(), x: 1600, y: 0 };
    const next = splitEdge(piece, parentId, sv);
    const halves = next.edges.filter((e) => e.generatedBy === "split");
    expect(halves.length).toBe(2);
    for (const h of halves) {
      expect(h.profile).toBe("pencil-round");
      expect(h.finish).toBe("polished");
      expect(h.exposure).toBe("exposed");
    }
    // The non-split edges keep their stable IDs and metadata.
    const untouched = edgeIds.slice(1);
    expect(validateEdgeIdStability(piece, next, untouched)).toBe(true);
  });

  it("the parent edge ID is gone from the result", () => {
    const { piece, edgeIds } = buildSimplePiece({
      coords: RECTANGLE_3200X600,
    });
    const sv: Vertex = { id: vertexId(), x: 1600, y: 0 };
    const next = splitEdge(piece, edgeIds[0]!, sv);
    expect(next.edges.some((e) => e.id === edgeIds[0])).toBe(false);
  });
});

describe("stability — validateEdgeIdStability is sensitive", () => {
  it("returns false when an edge's profile changes between before/after", () => {
    const { piece, edgeIds } = buildSimplePiece({
      coords: RECTANGLE_3200X600,
    });
    const tampered = setEdgeProfile(piece, edgeIds[0]!, "ogee");
    expect(validateEdgeIdStability(piece, tampered, [edgeIds[0]!])).toBe(false);
  });

  it("returns false when an edge ID is missing from `after`", () => {
    const { piece, edgeIds } = buildSimplePiece({
      coords: RECTANGLE_3200X600,
    });
    const truncated = { ...piece, edges: piece.edges.slice(1) };
    expect(validateEdgeIdStability(piece, truncated, [edgeIds[0]!])).toBe(false);
  });
});
