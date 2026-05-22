// packages/pricing/__tests__/calculator.multi-piece.test.ts
//
// Round 3B — `calculateQuote` with a multi-piece Job. Asserts the optional
// `job` / `buildUpRates` / `joinRates` plumbing adds line items without
// disturbing the Phase 1 single-piece path.

import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  edgeId,
  joinId,
  pieceId,
  vertexId,
  type Edge,
  type Job,
  type Join,
  type Piece,
  type Ring,
  type Vertex,
} from "@stonehenge-proto/geometry";

import { calculateQuote } from "../src/index.js";
import type {
  BuildUpRate,
  EdgeProfileRate,
  FeatureRate,
  JoinRate,
  MaterialRate,
} from "../src/index.js";

const MATERIAL: MaterialRate = {
  materialId: "mat-test",
  name: "Test",
  ratePerM2: "450.00",
  category: "Engineered",
};

const EDGE_RATES: readonly EdgeProfileRate[] = [
  { profile: "raw", ratePerLinealMetre: "0.00", description: "Raw cut" },
  {
    profile: "pencil-round",
    ratePerLinealMetre: "35.00",
    description: "Pencil round",
  },
];

const FEATURE_RATES: readonly FeatureRate[] = [];

const BUILD_UP_RATES: readonly BuildUpRate[] = [
  { partRole: "FASCIA", thicknessMm: 40, ratePerLinealMetre: "45.00" },
  { partRole: "RETURN", thicknessMm: 40, ratePerLinealMetre: "35.00" },
];

const JOIN_RATES: readonly JoinRate[] = [
  { joinKind: "MITRE", ratePerLinealMetre: "165.00" },
  { joinKind: "BUTT", ratePerLinealMetre: "85.00" },
];

function buildRect(name: string, widthMm: number, depthMm: number): Piece {
  const v0: Vertex = { id: vertexId(), x: 0, y: 0 };
  const v1: Vertex = { id: vertexId(), x: widthMm, y: 0 };
  const v2: Vertex = { id: vertexId(), x: widthMm, y: depthMm };
  const v3: Vertex = { id: vertexId(), x: 0, y: depthMm };
  const eS: Edge = {
    id: edgeId(),
    start: v0.id,
    end: v1.id,
    profile: "raw",
    finish: "polished",
    exposure: "exposed",
  };
  const eE: Edge = {
    id: edgeId(),
    start: v1.id,
    end: v2.id,
    profile: "raw",
    finish: "polished",
    exposure: "exposed",
  };
  const eN: Edge = {
    id: edgeId(),
    start: v2.id,
    end: v3.id,
    profile: "raw",
    finish: "polished",
    exposure: "exposed",
  };
  const eW: Edge = {
    id: edgeId(),
    start: v3.id,
    end: v0.id,
    profile: "raw",
    finish: "polished",
    exposure: "exposed",
  };
  const ring: Ring = {
    edges: [eS.id, eE.id, eN.id, eW.id],
    orientation: "ccw",
  };
  return {
    id: pieceId(),
    name,
    pieceRole: "BENCHTOP",
    materialId: MATERIAL.materialId,
    thicknessMm: 20,
    vertices: [v0, v1, v2, v3],
    edges: [eS, eE, eN, eW],
    outerRing: ring,
    innerRings: [],
    features: [],
  };
}

describe("calculateQuote with multi-piece Job — Round 3B", () => {
  const benchtop = buildRect("benchtop", 3200, 600);
  const waterfall = buildRect("waterfall", 20, 870);
  const fascia: Piece = {
    ...buildRect("fascia", 3200, 40),
    pieceRole: "FASCIA",
    thicknessMm: 20, // parent 20 + child 20 = target 40mm
    parentPieceId: benchtop.id,
  };
  const retn: Piece = {
    ...buildRect("return", 3200, 60),
    pieceRole: "RETURN",
    thicknessMm: 20, // parent 20 + child 20 = target 40mm
    parentPieceId: benchtop.id,
  };
  const mitre: Join = {
    id: joinId(),
    pieceA: benchtop.id,
    pieceB: waterfall.id,
    edgeA: benchtop.edges[0]!.id,
    edgeB: waterfall.edges[0]!.id,
    kind: "MITRE",
    reason: "WATERFALL_ATTACHMENT",
  };
  const job: Job = {
    pieces: [benchtop, waterfall, fascia, retn],
    joins: [mitre],
  };

  it("Phase-1 path (no job) → no build-up or join lines (regression guard)", () => {
    const summary = calculateQuote({
      piece: benchtop,
      materialRate: MATERIAL,
      edgeRates: EDGE_RATES,
      featureRates: FEATURE_RATES,
      markupPercent: "15",
    });
    // No "Build-up — ..." or "Join — ..." descriptions.
    for (const line of summary.lineItems) {
      expect(line.description).not.toMatch(/^Build-up — /);
      expect(line.description).not.toMatch(/^Join — /);
    }
  });

  it("Job path adds build-up + join lines and recomputes the total", () => {
    const summary = calculateQuote({
      piece: benchtop,
      materialRate: MATERIAL,
      edgeRates: EDGE_RATES,
      featureRates: FEATURE_RATES,
      markupPercent: "15",
      job,
      buildUpRates: BUILD_UP_RATES,
      joinRates: JOIN_RATES,
    });
    const descs = summary.lineItems.map((l) => l.description);
    expect(descs.some((d) => d.startsWith("Build-up — FASCIA"))).toBe(true);
    expect(descs.some((d) => d.startsWith("Build-up — RETURN"))).toBe(true);
    expect(descs.some((d) => d.startsWith("Join — MITRE"))).toBe(true);
    // Subtotal must be strictly larger than the Phase-1 path.
    const phase1 = calculateQuote({
      piece: benchtop,
      materialRate: MATERIAL,
      edgeRates: EDGE_RATES,
      featureRates: FEATURE_RATES,
      markupPercent: "15",
    });
    expect(new Decimal(summary.subtotal).gt(new Decimal(phase1.subtotal))).toBe(
      true,
    );
  });

  it("Job with only build-up children (no joins) still adds the strip lines", () => {
    const jobBuildOnly: Job = {
      pieces: [benchtop, fascia, retn],
      joins: [],
    };
    const summary = calculateQuote({
      piece: benchtop,
      materialRate: MATERIAL,
      edgeRates: EDGE_RATES,
      featureRates: FEATURE_RATES,
      markupPercent: "15",
      job: jobBuildOnly,
      buildUpRates: BUILD_UP_RATES,
      joinRates: JOIN_RATES,
    });
    const descs = summary.lineItems.map((l) => l.description);
    expect(descs.some((d) => d.startsWith("Build-up — FASCIA"))).toBe(true);
    // No join lines.
    expect(descs.some((d) => d.startsWith("Join — "))).toBe(false);
  });
});
