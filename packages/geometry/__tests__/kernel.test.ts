// packages/geometry/__tests__/kernel.test.ts

import { describe, expect, it } from "vitest";
import { Decimal } from "decimal.js";

import {
  computeAreaM2,
  computeAreaMm2,
  computeBoundingBox,
  computeEdgeLengthMm,
  computeExposedPerimeterMm,
  computePerimeterMm,
  setEdgeExposure,
} from "../src/index.js";

import {
  L_SHAPE,
  RECTANGLE_3200X600,
  U_SHAPE,
  buildSimplePiece,
} from "./_fixtures.js";

describe("kernel — area", () => {
  it("3200×600 rectangle is 1,920,000 mm² (1.92 m²)", () => {
    const { piece } = buildSimplePiece({ coords: RECTANGLE_3200X600 });
    const mm2 = computeAreaMm2(piece.vertices, piece.outerRing, piece.edges);
    expect(mm2).toBe(1_920_000);
    const m2 = computeAreaM2(piece.vertices, piece.outerRing, piece.edges);
    expect(m2.equals(new Decimal("1.92"))).toBe(true);
  });

  it("L-shape kitchen footprint is 3,000,000 mm² (3.0 m²)", () => {
    const { piece } = buildSimplePiece({ coords: L_SHAPE });
    const mm2 = computeAreaMm2(piece.vertices, piece.outerRing, piece.edges);
    expect(mm2).toBe(3_000_000);
    const m2 = computeAreaM2(piece.vertices, piece.outerRing, piece.edges);
    expect(m2.equals(new Decimal("3"))).toBe(true);
  });

  it("U-shape kitchen footprint is 4,680,000 mm² (4.68 m²)", () => {
    const { piece } = buildSimplePiece({ coords: U_SHAPE });
    const mm2 = computeAreaMm2(piece.vertices, piece.outerRing, piece.edges);
    expect(mm2).toBe(4_680_000);
    const m2 = computeAreaM2(piece.vertices, piece.outerRing, piece.edges);
    expect(m2.equals(new Decimal("4.68"))).toBe(true);
  });

  it("returns m² as a Decimal so pricing keeps the precision contract", () => {
    const { piece } = buildSimplePiece({ coords: RECTANGLE_3200X600 });
    const m2 = computeAreaM2(piece.vertices, piece.outerRing, piece.edges);
    expect(m2).toBeInstanceOf(Decimal);
  });
});

describe("kernel — perimeter", () => {
  it("3200×600 rectangle perimeter is 7600 mm", () => {
    const { piece } = buildSimplePiece({ coords: RECTANGLE_3200X600 });
    const p = computePerimeterMm(piece.vertices, piece.outerRing, piece.edges);
    expect(p).toBe(7600);
  });

  it("single edge length is the Euclidean distance", () => {
    const { piece, edgeIds } = buildSimplePiece({
      coords: RECTANGLE_3200X600,
    });
    const long = piece.edges.find((e) => e.id === edgeIds[0])!;
    expect(computeEdgeLengthMm(long, piece.vertices)).toBe(3200);
  });

  it("L-shape perimeter is 8800 mm", () => {
    const { piece } = buildSimplePiece({ coords: L_SHAPE });
    const p = computePerimeterMm(piece.vertices, piece.outerRing, piece.edges);
    // 3200 + 600 + 2600 + 1800 + 600 + 2400 = 11200 mm
    // (south, east, north-of-bottom, west-of-vertical-leg, north, west)
    // Recomputed from coords: 3200+600+2600+1800+600+2400 = 11200
    expect(p).toBe(11_200);
  });
});

describe("kernel — exposed perimeter", () => {
  it("only sums edges with exposure === 'exposed'", () => {
    const { piece, edgeIds } = buildSimplePiece({
      coords: RECTANGLE_3200X600,
      defaultExposure: "wall",
    });
    // Mark only the long south edge exposed (3200 mm).
    const expoSouth = setEdgeExposure(piece, edgeIds[0]!, "exposed");
    expect(computeExposedPerimeterMm(expoSouth)).toBe(3200);

    // Add the two short ends.
    const withSides = setEdgeExposure(
      setEdgeExposure(expoSouth, edgeIds[1]!, "exposed"),
      edgeIds[3]!,
      "exposed",
    );
    expect(computeExposedPerimeterMm(withSides)).toBe(3200 + 600 + 600);
  });

  it("returns 0 when no edges are exposed", () => {
    const { piece } = buildSimplePiece({
      coords: RECTANGLE_3200X600,
      defaultExposure: "wall",
    });
    expect(computeExposedPerimeterMm(piece)).toBe(0);
  });
});

describe("kernel — bounding box", () => {
  it("AABB of the L-shape is (0,0)-(3200,2400)", () => {
    const { piece } = buildSimplePiece({ coords: L_SHAPE });
    const bb = computeBoundingBox(piece.vertices);
    expect(bb).toEqual({ minX: 0, minY: 0, maxX: 3200, maxY: 2400 });
  });
});
