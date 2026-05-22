// packages/pricing/__tests__/feature-costs.test.ts

import { describe, expect, it } from "vitest";

import { calcFeatureCosts } from "../src/index.js";

import {
  PROTO_FEATURE_RATES,
  buildWorkedExamplePiece,
} from "./_fixtures.js";

describe("calcFeatureCosts", () => {
  it("1 undermount sink @ $180 + 1 tap hole @ $45 = $225.00", () => {
    const piece = buildWorkedExamplePiece();
    const lines = calcFeatureCosts(piece, PROTO_FEATURE_RATES);
    expect(lines.length).toBe(2);
    const total = lines.reduce(
      (acc, l) => acc + Number(l.lineTotal.toFixed(2)),
      0,
    );
    expect(total).toBe(225);
    // Per-line:
    const sink = lines.find((l) => l.description.startsWith("Undermount sink"));
    const tap = lines.find((l) => l.description.startsWith("Tap hole"));
    expect(sink?.lineTotal.toFixed(2)).toBe("180.00");
    expect(tap?.lineTotal.toFixed(2)).toBe("45.00");
  });
});
