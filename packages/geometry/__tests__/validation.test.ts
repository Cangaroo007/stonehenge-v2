// packages/geometry/__tests__/validation.test.ts

import { describe, expect, it } from "vitest";

import { isSimplePolygon, validatePiece } from "../src/index.js";

import { L_SHAPE, RECTANGLE_3200X600, buildSimplePiece } from "./_fixtures.js";

describe("validation — validatePiece", () => {
  it("a well-formed rectangle passes", () => {
    const { piece } = buildSimplePiece({ coords: RECTANGLE_3200X600 });
    const r = validatePiece(piece);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("flags an edge that references an unknown vertex", () => {
    const { piece } = buildSimplePiece({ coords: RECTANGLE_3200X600 });
    const broken = {
      ...piece,
      edges: piece.edges.map((e, i) =>
        i === 0 ? { ...e, start: "not-a-vertex" as never } : e,
      ),
    };
    const r = validatePiece(broken);
    expect(r.valid).toBe(false);
    expect(r.errors.some((m) => m.includes("unknown start vertex"))).toBe(true);
  });

  it("flags duplicate edge IDs", () => {
    const { piece } = buildSimplePiece({ coords: RECTANGLE_3200X600 });
    const dupe = {
      ...piece,
      edges: [...piece.edges, piece.edges[0]!],
    };
    const r = validatePiece(dupe);
    expect(r.valid).toBe(false);
    expect(r.errors.some((m) => m.includes("duplicate edge id"))).toBe(true);
  });

  it("flags a ring whose edges do not chain", () => {
    const { piece, edgeIds } = buildSimplePiece({ coords: L_SHAPE });
    // Reverse two edges in the ring order so they no longer chain.
    const swapped = {
      ...piece,
      outerRing: {
        ...piece.outerRing,
        edges: [edgeIds[0]!, edgeIds[2]!, edgeIds[1]!, ...edgeIds.slice(3)],
      },
    };
    const r = validatePiece(swapped);
    expect(r.valid).toBe(false);
    expect(r.errors.some((m) => m.includes("do not chain"))).toBe(true);
  });
});

describe("validation — isSimplePolygon", () => {
  it("a convex rectangle is simple", () => {
    const { piece } = buildSimplePiece({ coords: RECTANGLE_3200X600 });
    expect(isSimplePolygon(piece)).toBe(true);
  });

  it("a non-convex L-shape is still simple (no self-intersection)", () => {
    const { piece } = buildSimplePiece({ coords: L_SHAPE });
    expect(isSimplePolygon(piece)).toBe(true);
  });

  it("a self-crossing bowtie is rejected", () => {
    // Bowtie quadrilateral: vertices in (0,0),(1000,1000),(1000,0),(0,1000) order.
    const { piece } = buildSimplePiece({
      coords: [
        [0, 0],
        [1000, 1000],
        [1000, 0],
        [0, 1000],
      ],
    });
    expect(isSimplePolygon(piece)).toBe(false);
  });
});
