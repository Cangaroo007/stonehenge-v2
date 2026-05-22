// packages/pricing/__tests__/join-costs.test.ts
//
// Round 3B — `calcJoinCosts` contract.

import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  edgeId,
  joinId,
  pieceId,
  vertexId,
  type Join,
  type Piece,
  type Ring,
} from "@stonehenge-proto/geometry";

import { calcJoinCosts } from "../src/index.js";
import type { JoinRate } from "../src/index.js";

const RATES: readonly JoinRate[] = [
  { joinKind: "BUTT", ratePerLinealMetre: "85.00" },
  { joinKind: "MITRE", ratePerLinealMetre: "165.00" },
  { joinKind: "MASON_MITRE", ratePerLinealMetre: "220.00" },
  { joinKind: "FIELD_JOIN", ratePerLinealMetre: "65.00" },
];

function makeRect(name: string, widthMm: number, depthMm: number): Piece {
  const v0 = { id: vertexId(), x: 0, y: 0 };
  const v1 = { id: vertexId(), x: widthMm, y: 0 };
  const v2 = { id: vertexId(), x: widthMm, y: depthMm };
  const v3 = { id: vertexId(), x: 0, y: depthMm };
  const eS = {
    id: edgeId(),
    start: v0.id,
    end: v1.id,
    profile: "raw" as const,
    finish: "polished" as const,
    exposure: "exposed" as const,
  };
  const eE = {
    id: edgeId(),
    start: v1.id,
    end: v2.id,
    profile: "raw" as const,
    finish: "polished" as const,
    exposure: "exposed" as const,
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
    exposure: "exposed" as const,
  };
  return {
    id: pieceId(),
    name,
    pieceRole: "BENCHTOP",
    materialId: "mat-test",
    thicknessMm: 20,
    vertices: [v0, v1, v2, v3],
    edges: [eS, eE, eN, eW],
    outerRing: {
      edges: [eS.id, eE.id, eN.id, eW.id],
      orientation: "ccw",
    } as Ring,
    innerRings: [],
    features: [],
  };
}

describe("calcJoinCosts — Round 3B", () => {
  const benchtop = makeRect("benchtop", 3200, 600);
  const waterfall = makeRect("waterfall", 20, 870);

  it("bills 3.2 m × $165/lm = $528.00 for a single MITRE join", () => {
    const join: Join = {
      id: joinId(),
      pieceA: benchtop.id,
      pieceB: waterfall.id,
      edgeA: benchtop.edges[0]!.id,
      edgeB: waterfall.edges[0]!.id,
      kind: "MITRE",
      reason: "WATERFALL_ATTACHMENT",
    };
    const lines = calcJoinCosts([join], [benchtop, waterfall], RATES);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.unit).toBe("lm");
    expect(lines[0]!.lineTotal.toFixed(2)).toBe("528.00");
  });

  it("throws when no rate matches the join kind", () => {
    const orphan = makeRect("orphan", 1000, 500);
    const join: Join = {
      id: joinId(),
      pieceA: orphan.id,
      pieceB: benchtop.id,
      edgeA: orphan.edges[0]!.id,
      edgeB: benchtop.edges[0]!.id,
      kind: "FIELD_JOIN",
      reason: "PIECE_JOIN",
    };
    expect(() =>
      calcJoinCosts(
        [join],
        [orphan, benchtop],
        [{ joinKind: "MITRE", ratePerLinealMetre: "165.00" }],
      ),
    ).toThrow(/no rate for join kind FIELD_JOIN/);
  });

  it("skips a join whose pieceA is not in the pieces list", () => {
    const join: Join = {
      id: joinId(),
      pieceA: "missing-piece-id" as typeof benchtop.id,
      pieceB: benchtop.id,
      edgeA: benchtop.edges[0]!.id,
      edgeB: benchtop.edges[0]!.id,
      kind: "BUTT",
      reason: "SPLASHBACK_ATTACHMENT",
    };
    const lines = calcJoinCosts([join], [benchtop], RATES);
    expect(lines).toEqual([]);
  });

  it("returns one line per join (deterministic order)", () => {
    const j1: Join = {
      id: joinId(),
      pieceA: benchtop.id,
      pieceB: waterfall.id,
      edgeA: benchtop.edges[0]!.id,
      edgeB: waterfall.edges[0]!.id,
      kind: "MITRE",
      reason: "WATERFALL_ATTACHMENT",
    };
    const j2: Join = {
      id: joinId(),
      pieceA: benchtop.id,
      pieceB: waterfall.id,
      edgeA: benchtop.edges[2]!.id,
      edgeB: waterfall.edges[0]!.id,
      kind: "BUTT",
      reason: "SPLASHBACK_ATTACHMENT",
    };
    const lines = calcJoinCosts([j1, j2], [benchtop, waterfall], RATES);
    expect(lines).toHaveLength(2);
    // Total = (3.2m × $165) + (3.2m × $85) = $528 + $272 = $800.
    const total = lines.reduce(
      (acc, l) => acc.plus(l.lineTotal),
      new Decimal("0"),
    );
    expect(total.toFixed(2)).toBe("800.00");
  });
});
