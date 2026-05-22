// packages/pricing/__tests__/edge-profiling.test.ts

import { describe, expect, it } from "vitest";

import { calcEdgeProfiling } from "../src/index.js";

import {
  PROTO_EDGE_RATES,
  buildWorkedExamplePiece,
} from "./_fixtures.js";

describe("calcEdgeProfiling", () => {
  it("3 exposed pencil-round edges totalling 4.4 lm @ $35/lm = $154.00", () => {
    const piece = buildWorkedExamplePiece();
    const lines = calcEdgeProfiling(piece, PROTO_EDGE_RATES);
    expect(lines.length).toBe(1);
    const line = lines[0]!;
    expect(line.unit).toBe("lm");
    expect(line.quantity.toFixed(2)).toBe("4.40");
    expect(line.unitRate.toFixed(2)).toBe("35.00");
    expect(line.lineTotal.toFixed(2)).toBe("154.00");
  });

  it("emits no line when no exposed edges share the rate's profile", () => {
    // Build a piece with all edges as 'raw' (rate 0) and not exposed.
    const piece = buildWorkedExamplePiece();
    const stripped = {
      ...piece,
      edges: piece.edges.map((e) => ({ ...e, exposure: "wall" as const })),
    };
    const lines = calcEdgeProfiling(stripped, PROTO_EDGE_RATES);
    expect(lines.length).toBe(0);
  });
});
