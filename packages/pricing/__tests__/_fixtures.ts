// packages/pricing/__tests__/_fixtures.ts
//
// Test fixtures: a 3200×600 rectangle with three exposed pencil-round edges,
// one wall-abutted north edge, an undermount sink and a tap hole. This is
// the worked-example shape from Gate 0 §6 and underpins the calculator
// snapshot test.

import {
  edgeId,
  featureId,
  pieceId,
  setEdgeExposure,
  setEdgeProfile,
  vertexId,
  type Edge,
  type EdgeId,
  type Feature,
  type Piece,
  type Ring,
  type Vertex,
} from "@stonehenge-proto/geometry";

import type {
  EdgeProfileRate,
  FeatureRate,
  MaterialRate,
} from "../src/index.js";

export const CAESARSTONE_5143: MaterialRate = {
  materialId: "mat-caesarstone-5143",
  name: "Caesarstone White Attica 5143",
  ratePerM2: "450.00",
  category: "Engineered",
};

export const PROTO_EDGE_RATES: readonly EdgeProfileRate[] = [
  { profile: "raw", ratePerLinealMetre: "0.00", description: "Raw cut — no profiling" },
  { profile: "pencil-round", ratePerLinealMetre: "35.00", description: "Pencil round (3mm radius)" },
  { profile: "half-bullnose", ratePerLinealMetre: "45.00", description: "Half bullnose (10mm radius)" },
  { profile: "full-bullnose", ratePerLinealMetre: "65.00", description: "Full bullnose (20mm radius)" },
  { profile: "bevel", ratePerLinealMetre: "40.00", description: "Bevel (45° chamfer, 3mm)" },
  { profile: "ogee", ratePerLinealMetre: "85.00", description: "Ogee (decorative S-curve)" },
  { profile: "dupont", ratePerLinealMetre: "90.00", description: "DuPont (stepped ogee)" },
  { profile: "mitre-45", ratePerLinealMetre: "55.00", description: "45° mitre for apron/waterfall" },
];

export const PROTO_FEATURE_RATES: readonly FeatureRate[] = [
  { featureKind: "undermount-sink", flatRate: "180.00", description: "Undermount sink cutout + polish" },
  { featureKind: "overmount-sink", flatRate: "120.00", description: "Overmount sink cutout" },
  { featureKind: "cooktop-cutout", flatRate: "160.00", description: "Cooktop cutout + radius corners" },
  { featureKind: "tap-hole", flatRate: "45.00", description: "Tap hole (35mm standard)" },
  { featureKind: "window-recess", flatRate: "220.00", description: "Window recess — sill return" },
  { featureKind: "custom-cutout", flatRate: "200.00", description: "Custom cutout — price on application" },
];

/**
 * Builds the worked-example piece used by the calculator snapshot:
 *   - 3200×600 rectangle in Caesarstone (materialId only — rate is supplied
 *     to `calculateQuote` separately).
 *   - South + east + west edges exposed with pencil-round profile.
 *   - North edge against a wall (no profiling).
 *   - One undermount sink at (1200, 50).
 *   - One tap hole at (2000, 50).
 *
 * Total exposed pencil-round perimeter = 3200 + 600 + 600 = 4400 mm = 4.4 lm.
 */
export function buildWorkedExamplePiece(): Piece {
  // Vertices CCW: SW, SE, NE, NW.
  const vSW: Vertex = { id: vertexId(), x: 0, y: 0 };
  const vSE: Vertex = { id: vertexId(), x: 3200, y: 0 };
  const vNE: Vertex = { id: vertexId(), x: 3200, y: 600 };
  const vNW: Vertex = { id: vertexId(), x: 0, y: 600 };
  const vertices = [vSW, vSE, vNE, vNW] as const;

  // Edges, in ring order: south, east, north, west.
  const eSouth: Edge = {
    id: edgeId(),
    start: vSW.id,
    end: vSE.id,
    profile: "pencil-round",
    finish: "polished",
    exposure: "exposed",
  };
  const eEast: Edge = {
    id: edgeId(),
    start: vSE.id,
    end: vNE.id,
    profile: "pencil-round",
    finish: "polished",
    exposure: "exposed",
  };
  const eNorth: Edge = {
    id: edgeId(),
    start: vNE.id,
    end: vNW.id,
    profile: "raw",
    finish: "unfinished",
    exposure: "wall",
  };
  const eWest: Edge = {
    id: edgeId(),
    start: vNW.id,
    end: vSW.id,
    profile: "pencil-round",
    finish: "polished",
    exposure: "exposed",
  };

  const edges = [eSouth, eEast, eNorth, eWest] as const;
  const edgeOrder: readonly EdgeId[] = [eSouth.id, eEast.id, eNorth.id, eWest.id];
  const outerRing: Ring = { edges: edgeOrder, orientation: "ccw" };

  const sink: Feature = {
    id: featureId(),
    kind: "undermount-sink",
    position: { x: 1200, y: 50 },
    bowlWidthMm: 760,
    bowlDepthMm: 450,
  };
  const tap: Feature = {
    id: featureId(),
    kind: "tap-hole",
    position: { x: 2000, y: 50 },
    diameterMm: 35,
  };

  const piece: Piece = {
    id: pieceId(),
    name: "worked-example-rectangle",
    pieceRole: "BENCHTOP",
    materialId: CAESARSTONE_5143.materialId,
    thicknessMm: 20,
    vertices: [...vertices],
    edges: [...edges],
    outerRing,
    innerRings: [],
    features: [sink, tap],
  };

  // Touch the immutable-edit helpers so test breakage on those surfaces
  // immediately. (No-op: re-assigning the same profile and exposure is a
  // safe identity operation.)
  const sanity = setEdgeExposure(setEdgeProfile(piece, eSouth.id, "pencil-round"), eNorth.id, "wall");
  return sanity;
}
