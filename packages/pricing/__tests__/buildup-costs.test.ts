// packages/pricing/__tests__/buildup-costs.test.ts
//
// Round 3B — `calcBuildUpCosts` contract.

import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  edgeId,
  pieceId,
  vertexId,
  type Piece,
  type PieceId,
  type Ring,
} from "@stonehenge-proto/geometry";

import { calcBuildUpCosts } from "../src/index.js";
import type { BuildUpRate } from "../src/index.js";

const RATES: readonly BuildUpRate[] = [
  { partRole: "FASCIA", thicknessMm: 40, ratePerLinealMetre: "45.00" },
  { partRole: "RETURN", thicknessMm: 40, ratePerLinealMetre: "35.00" },
  { partRole: "FASCIA", thicknessMm: 60, ratePerLinealMetre: "55.00" },
  { partRole: "INFILL", thicknessMm: 80, ratePerLinealMetre: "30.00" },
];

function makeStrip(
  parentId: PieceId,
  role: Piece["pieceRole"],
  lengthMm: number,
  thicknessMm: number,
): Piece {
  const v0 = { id: vertexId(), x: 0, y: 0 };
  const v1 = { id: vertexId(), x: lengthMm, y: 0 };
  const v2 = { id: vertexId(), x: lengthMm, y: 40 };
  const v3 = { id: vertexId(), x: 0, y: 40 };
  const eS = {
    id: edgeId(),
    start: v0.id,
    end: v1.id,
    profile: "raw" as const,
    finish: "polished" as const,
    exposure: "join" as const,
  };
  const eE = {
    id: edgeId(),
    start: v1.id,
    end: v2.id,
    profile: "raw" as const,
    finish: "polished" as const,
    exposure: "concealed" as const,
  };
  const eN = {
    id: edgeId(),
    start: v2.id,
    end: v3.id,
    profile: "raw" as const,
    finish: "polished" as const,
    exposure: "exposed" as const,
  };
  const eW = {
    id: edgeId(),
    start: v3.id,
    end: v0.id,
    profile: "raw" as const,
    finish: "polished" as const,
    exposure: "concealed" as const,
  };
  const outerRing: Ring = {
    edges: [eS.id, eE.id, eN.id, eW.id],
    orientation: "ccw",
  };
  return {
    id: pieceId(),
    name: `strip-${role}`,
    pieceRole: role,
    materialId: "mat-test",
    thicknessMm,
    parentPieceId: parentId,
    vertices: [v0, v1, v2, v3],
    edges: [eS, eE, eN, eW],
    outerRing,
    innerRings: [],
    features: [],
  };
}

describe("calcBuildUpCosts — Round 3B", () => {
  const parentId = pieceId();
  const parent: Piece = makeStrip(parentId, "BENCHTOP", 3200, 20);
  // override the parent's id + role so it's a slab, not a child.
  const slab: Piece = {
    ...parent,
    id: parentId,
    pieceRole: "BENCHTOP",
  };
  // Discard the parentPieceId on the slab so it doesn't look like a child.
  const { parentPieceId: _drop, ...slabWithoutParent } = slab;
  void _drop;
  const trueSlab: Piece = slabWithoutParent;

  it("bills FASCIA + RETURN for a 40 mm laminated build-up", () => {
    // Child strips for a 40 mm build-up on a 20 mm slab are themselves
    // 40 mm thick (matching the rate catalogue keying).
    const fascia = makeStrip(parentId, "FASCIA", 3200, 20);
    const ret = makeStrip(parentId, "RETURN", 3200, 20);
    const lines = calcBuildUpCosts(trueSlab, [fascia, ret], RATES);
    expect(lines).toHaveLength(2);
    // 3.2 m × 45 = 144.00 for FASCIA, 3.2 m × 35 = 112.00 for RETURN.
    const lineTotal = lines.reduce(
      (acc, l) => acc.plus(l.lineTotal),
      new Decimal("0"),
    );
    expect(lineTotal.toFixed(2)).toBe("256.00");
  });

  it("throws when a child has no matching rate", () => {
    const fascia = makeStrip(parentId, "FASCIA", 3200, 999); // no 999mm rate
    expect(() => calcBuildUpCosts(trueSlab, [fascia], RATES)).toThrow(
      /no rate for FASCIA/,
    );
  });

  it("skips child pieces whose parentPieceId is not the parent", () => {
    const otherParent = pieceId();
    const fascia = makeStrip(otherParent, "FASCIA", 3200, 20);
    const lines = calcBuildUpCosts(trueSlab, [fascia], RATES);
    expect(lines).toEqual([]);
  });
});
