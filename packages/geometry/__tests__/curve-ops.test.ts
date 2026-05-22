// packages/geometry/__tests__/curve-ops.test.ts

import { describe, expect, it } from "vitest";

import {
  computeCornerArc,
  computeRoundEndCurve,
  curvedEdgeArcLengthMm,
  curvedEdgeSegmentArea,
  computeAreaMm2,
  computePerimeterMm,
  isValidCornerRadius,
  setVertexCornerRadius,
  vertexId,
  type Vertex,
} from "../src/index.js";

import { RECTANGLE_3200X600, buildSimplePiece } from "./_fixtures.js";

function v(x: number, y: number): Vertex {
  return { id: vertexId(), x, y };
}

describe("curve-ops — computeCornerArc", () => {
  it("90° corner with 50 mm radius produces correct tangent length and sweep", () => {
    // Corner at origin with edges along +x and +y. Interior angle = 90°.
    const corner = v(0, 0);
    const prev = v(-100, 0);
    const next = v(0, -100);
    const arc = computeCornerArc(corner, prev, next, 50);
    expect(arc).not.toBeNull();
    if (!arc) return;

    // tangent length = r / tan(45°) = r.
    expect(arc.arcStart.x).toBeCloseTo(-50, 5);
    expect(arc.arcStart.y).toBeCloseTo(0, 5);
    expect(arc.arcEnd.x).toBeCloseTo(0, 5);
    expect(arc.arcEnd.y).toBeCloseTo(-50, 5);

    // For 90° interior angle, sweep = π − π/2 = π/2.
    expect(arc.sweepRad).toBeCloseTo(Math.PI / 2, 5);
    expect(arc.radiusMm).toBe(50);
  });

  it("returns null for radius too large to fit on adjacent edges", () => {
    // Same 90° corner, but edges are only 60 mm long. radius 100 → tangent
    // length 100 mm, exceeds edge length.
    const corner = v(0, 0);
    const prev = v(-60, 0);
    const next = v(0, -60);
    const arc = computeCornerArc(corner, prev, next, 100);
    expect(arc).toBeNull();
  });

  it("returns null for collinear vertices (no corner to round)", () => {
    const corner = v(0, 0);
    const prev = v(-100, 0);
    const next = v(100, 0); // collinear with prev → corner
    const arc = computeCornerArc(corner, prev, next, 10);
    expect(arc).toBeNull();
  });

  it("returns null for non-positive radius", () => {
    const corner = v(0, 0);
    const prev = v(-100, 0);
    const next = v(0, -100);
    expect(computeCornerArc(corner, prev, next, 0)).toBeNull();
    expect(computeCornerArc(corner, prev, next, -10)).toBeNull();
  });

  it("135° corner produces correct tangent length", () => {
    const corner = v(0, 0);
    const prev = v(-100, 0);
    // Outgoing direction at 45° below horizontal (outgoing edge going to
    // (100, -100) gives interior angle 135° when prev is along -x).
    const next = v(100, -100);
    const arc = computeCornerArc(corner, prev, next, 30);
    expect(arc).not.toBeNull();
    if (!arc) return;
    // sweep = π − 135°(in rad) = π − 3π/4 = π/4.
    expect(arc.sweepRad).toBeCloseTo(Math.PI / 4, 4);
  });
});

describe("curve-ops — isValidCornerRadius", () => {
  it("returns true for a 50 mm radius on a 90° corner with 100 mm edges", () => {
    const corner = v(0, 0);
    const prev = v(-100, 0);
    const next = v(0, -100);
    expect(isValidCornerRadius(corner, prev, next, 50)).toBe(true);
  });

  it("returns false when the radius is too large", () => {
    const corner = v(0, 0);
    const prev = v(-60, 0);
    const next = v(0, -60);
    expect(isValidCornerRadius(corner, prev, next, 100)).toBe(false);
  });

  it("returns true for radius = 0 (sharp corner)", () => {
    const corner = v(0, 0);
    const prev = v(-100, 0);
    const next = v(0, -100);
    expect(isValidCornerRadius(corner, prev, next, 0)).toBe(true);
  });
});

describe("curve-ops — round end (computeRoundEndCurve + arc length)", () => {
  it("a horizontal 600 mm edge round-end has radius 300", () => {
    const curve = computeRoundEndCurve({ x: 0, y: 0 }, { x: 600, y: 0 });
    expect(curve.kind).toBe("arc");
    expect(curve.radiusMm).toBe(300);
  });

  it("arc length of a semicircle is π × radius = π × chord/2", () => {
    const curve = computeRoundEndCurve({ x: 0, y: 0 }, { x: 600, y: 0 });
    const len = curvedEdgeArcLengthMm({ x: 0, y: 0 }, { x: 600, y: 0 }, curve);
    expect(len).toBeCloseTo(Math.PI * 300, 5);
  });

  it("circular segment area for a semicircle is (π × r²) / 2", () => {
    const curve = computeRoundEndCurve({ x: 0, y: 0 }, { x: 600, y: 0 });
    const segArea = curvedEdgeSegmentArea(
      { x: 0, y: 0 },
      { x: 600, y: 0 },
      curve,
    );
    expect(segArea).toBeCloseTo((Math.PI * 300 * 300) / 2, 5);
  });
});

describe("curve-ops — kernel integration (rounded corners change area + perimeter)", () => {
  it("rectangle with no corner radii returns the same area as before", () => {
    const { piece } = buildSimplePiece({ coords: RECTANGLE_3200X600 });
    const area = computeAreaMm2(piece.vertices, piece.outerRing, piece.edges);
    expect(area).toBe(1_920_000);
  });

  it("rounding all four corners of a rectangle subtracts material", () => {
    const { piece, vertexIds } = buildSimplePiece({ coords: RECTANGLE_3200X600 });
    let next = piece;
    for (const vid of vertexIds) {
      const r = setVertexCornerRadius(next, vid, 50);
      if (!r) throw new Error("setVertexCornerRadius returned null");
      next = r;
    }
    const area = computeAreaMm2(next.vertices, next.outerRing, next.edges);
    // Each 90° corner with r=50 removes triangleArea − segmentArea
    // = (1/2)·50²·sin(π/2) − (50²/2)·(π/2 − sin(π/2))
    // = 1250 − 1250·(π/2 − 1)
    // ≈ 1250 − 712.388...
    // ≈ 537.611...
    // × 4 corners ≈ 2150.4 mm² removed.
    const sharpArea = 1_920_000;
    const expectedRemoved =
      4 * (1250 - 1250 * (Math.PI / 2 - 1));
    expect(area).toBeCloseTo(sharpArea - expectedRemoved, 1);
  });

  it("rounding all four corners shortens the perimeter", () => {
    const { piece, vertexIds } = buildSimplePiece({ coords: RECTANGLE_3200X600 });
    let next = piece;
    for (const vid of vertexIds) {
      const r = setVertexCornerRadius(next, vid, 50);
      if (!r) throw new Error("setVertexCornerRadius returned null");
      next = r;
    }
    const perim = computePerimeterMm(next.vertices, next.outerRing, next.edges);
    // Each corner: arc = r·sweep = 50·π/2; tangents = 2·50.
    // Net per corner: arc − 2·tangent = 25π − 100 ≈ −21.46.
    // × 4 corners ≈ −85.84 mm.
    const sharpPerim = 7600;
    const expectedDelta = 4 * (50 * (Math.PI / 2) - 100);
    expect(perim).toBeCloseTo(sharpPerim + expectedDelta, 2);
  });
});
