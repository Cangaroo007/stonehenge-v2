// packages/geometry/__tests__/buildup-ops.test.ts
//
// Round 3B — `generateBuildUpPieces` contract.

import { describe, expect, it } from "vitest";

import { generateBuildUpPieces } from "../src/index.js";
import { RECTANGLE_3200X600, buildSimplePiece } from "./_fixtures.js";

describe("generateBuildUpPieces — Round 3B", () => {
  const parent = buildSimplePiece({
    name: "benchtop-parent",
    coords: RECTANGLE_3200X600,
  }).piece;
  const targetEdge = parent.outerRing.edges[0]!;

  it("LAMINATED 40 mm on a 20 mm slab → Fascia + Return (no infill)", () => {
    const children = generateBuildUpPieces({
      parentPiece: parent,
      edgeId: targetEdge,
      buildUp: {
        targetThicknessMm: 40,
        method: "LAMINATED",
        stripWidthMm: 40,
      },
    });
    expect(children).toHaveLength(2);
    const roles = children.map((c) => c.pieceRole).sort();
    expect(roles).toEqual(["FASCIA", "RETURN"]);
    // Every child references the parent.
    for (const child of children) {
      expect(child.parentPieceId).toBe(parent.id);
    }
  });

  it("LAMINATED 80 mm on a 20 mm slab → Fascia + Return + Infill", () => {
    const children = generateBuildUpPieces({
      parentPiece: parent,
      edgeId: targetEdge,
      buildUp: {
        targetThicknessMm: 80,
        method: "LAMINATED",
        stripWidthMm: 60,
      },
    });
    expect(children).toHaveLength(3);
    const roles = new Set(children.map((c) => c.pieceRole));
    expect(roles.has("FASCIA")).toBe(true);
    expect(roles.has("RETURN")).toBe(true);
    expect(roles.has("INFILL")).toBe(true);
  });

  it("SOLID build-up generates no child pieces", () => {
    const children = generateBuildUpPieces({
      parentPiece: parent,
      edgeId: targetEdge,
      buildUp: {
        targetThicknessMm: 40,
        method: "SOLID",
        stripWidthMm: 40,
      },
    });
    expect(children).toEqual([]);
  });

  it("returns [] when the strip is wider than half the edge length", () => {
    // A 3200 mm edge × stripWidthMm 2000 → 2000*2 > 3200, rejected.
    const children = generateBuildUpPieces({
      parentPiece: parent,
      edgeId: targetEdge,
      buildUp: {
        targetThicknessMm: 40,
        method: "LAMINATED",
        stripWidthMm: 2000,
      },
    });
    expect(children).toEqual([]);
  });

  it("returns [] when edgeId is not found", () => {
    const children = generateBuildUpPieces({
      parentPiece: parent,
      edgeId: "edge-does-not-exist" as typeof targetEdge,
      buildUp: {
        targetThicknessMm: 40,
        method: "LAMINATED",
        stripWidthMm: 40,
      },
    });
    expect(children).toEqual([]);
  });

  it("FASCIA child reflects the build-up's added thickness, not the slab's", () => {
    const children = generateBuildUpPieces({
      parentPiece: parent,
      edgeId: targetEdge,
      buildUp: {
        targetThicknessMm: 60,
        method: "LAMINATED",
        stripWidthMm: 40,
      },
    });
    const fascia = children.find((c) => c.pieceRole === "FASCIA");
    expect(fascia).toBeDefined();
    // targetThicknessMm 60 − slab 20 = 40 mm fascia
    expect(fascia!.thicknessMm).toBe(40);
  });
});
