export type ShapeType = 'RECTANGLE' | 'L_SHAPE' | 'U_SHAPE';

export interface LShapeConfig {
  shape: 'L_SHAPE';
  leg1: { length_mm: number; width_mm: number };
  leg2: { length_mm: number; width_mm: number };
}

export interface UShapeConfig {
  shape: 'U_SHAPE';
  leftLeg: { length_mm: number; width_mm: number };
  back:    { length_mm: number; width_mm: number };
  rightLeg: { length_mm: number; width_mm: number };
}

export type ShapeConfig = LShapeConfig | UShapeConfig | null;

// Derived geometry — calculated from shape config
export interface ShapeGeometry {
  totalAreaSqm: number;       // total stone area (corner overlap deducted)
  cuttingPerimeterLm: number; // full outer perimeter for cutting cost
  cornerJoins: number;        // 1 for L-shape, 2 for U-shape
  boundingLength_mm: number;  // longest outer dimension (for optimiser)
  boundingWidth_mm: number;   // widest outer dimension (for optimiser)
}

export function calculateLShapeGeometry(config: LShapeConfig): ShapeGeometry {
  const { leg1, leg2 } = config;
  // Corner overlap = width × width (the square at the join)
  const cornerOverlap = leg1.width_mm * leg2.width_mm / 1_000_000;
  const totalAreaSqm =
    (leg1.length_mm * leg1.width_mm / 1_000_000) +
    (leg2.length_mm * leg2.width_mm / 1_000_000) -
    cornerOverlap;

  // Outer perimeter of L-shape (6 sides)
  // Leg1 runs horizontally, leg2 drops vertically from right end
  const cuttingPerimeterLm = (
    leg1.length_mm +                       // top of leg1
    leg2.width_mm +                        // right side of leg2
    leg2.length_mm +                       // bottom of leg2
    (leg1.length_mm - leg2.width_mm) +     // bottom of leg1 (exposed part)
    leg1.width_mm +                        // left side of leg1
    (leg2.length_mm - leg1.width_mm)       // inner vertical step
  ) / 1000;

  return {
    totalAreaSqm,
    cuttingPerimeterLm,
    cornerJoins: 1,
    boundingLength_mm: leg1.length_mm,
    boundingWidth_mm: leg1.width_mm + leg2.length_mm,
  };
}

export function calculateUShapeGeometry(config: UShapeConfig): ShapeGeometry {
  const { leftLeg, back, rightLeg } = config;
  const corner1Overlap = leftLeg.width_mm * back.width_mm / 1_000_000;
  const corner2Overlap = rightLeg.width_mm * back.width_mm / 1_000_000;
  const totalAreaSqm =
    (leftLeg.length_mm * leftLeg.width_mm / 1_000_000) +
    (back.length_mm    * back.width_mm    / 1_000_000) +
    (rightLeg.length_mm * rightLeg.width_mm / 1_000_000) -
    corner1Overlap - corner2Overlap;

  // Outer perimeter of U-shape (8 sides)
  const cuttingPerimeterLm = (
    back.length_mm +                                          // top/back
    rightLeg.width_mm +                                       // right outer
    rightLeg.length_mm +                                      // right bottom
    (back.length_mm - leftLeg.width_mm - rightLeg.width_mm) + // inner bottom
    leftLeg.length_mm +                                       // left bottom
    leftLeg.width_mm +                                        // left outer
    // inner vertical sides
    (rightLeg.length_mm - back.width_mm) +
    (leftLeg.length_mm - back.width_mm)
  ) / 1000;

  return {
    totalAreaSqm,
    cuttingPerimeterLm,
    cornerJoins: 2,
    boundingLength_mm: back.length_mm,
    boundingWidth_mm: back.width_mm + Math.max(leftLeg.length_mm, rightLeg.length_mm),
  };
}

// ── Optimizer decomposition ─────────────────────────────────────────────────

/** Optimizer-ready rectangle produced by decomposing L/U shapes into component rects */
export interface OptimizerRect {
  width: number;      // mm
  height: number;     // mm
  pieceId: string;    // parent piece ID
  partIndex: number;  // 0 = first rect, 1 = second, etc.
  groupId?: string;   // same as pieceId for L/U shapes; undefined for rectangles
  mustBeAdjacent?: boolean; // true when grain_matched = true on parent piece
  label?: string;     // e.g. "Leg A", "Leg B"
}

/**
 * Decompose a piece into optimizer-ready rectangles.
 * Rectangle pieces return a single rect (bounding box unchanged).
 * L/U shapes return component rects that must share a slab (groupId set).
 */
export function decomposeShapeIntoRects(piece: {
  id: string;
  lengthMm: number;
  widthMm: number;
  shapeType?: string | null;
  shapeConfig?: unknown;
  grainMatched?: boolean | null;
}): OptimizerRect[] {
  const mustBeAdjacent = piece.grainMatched === true;

  if (!piece.shapeType || piece.shapeType === 'RECTANGLE' || !piece.shapeConfig) {
    return [{
      width: piece.lengthMm,
      height: piece.widthMm,
      pieceId: piece.id,
      partIndex: 0,
    }];
  }

  if (piece.shapeType === 'L_SHAPE') {
    const cfg = piece.shapeConfig as LShapeConfig;
    return [
      {
        width: cfg.leg1.length_mm,
        height: cfg.leg1.width_mm,
        pieceId: piece.id,
        partIndex: 0,
        groupId: piece.id,
        mustBeAdjacent,
        label: 'Leg A',
      },
      {
        width: cfg.leg2.length_mm,
        height: cfg.leg2.width_mm,
        pieceId: piece.id,
        partIndex: 1,
        groupId: piece.id,
        mustBeAdjacent,
        label: 'Leg B',
      },
    ];
  }

  if (piece.shapeType === 'U_SHAPE') {
    const cfg = piece.shapeConfig as UShapeConfig;
    return [
      {
        width: cfg.back.length_mm,
        height: cfg.back.width_mm,
        pieceId: piece.id,
        partIndex: 0,
        groupId: piece.id,
        mustBeAdjacent,
        label: 'Back',
      },
      {
        width: cfg.leftLeg.length_mm,
        height: cfg.leftLeg.width_mm,
        pieceId: piece.id,
        partIndex: 1,
        groupId: piece.id,
        mustBeAdjacent,
        label: 'Left Leg',
      },
      {
        width: cfg.rightLeg.length_mm,
        height: cfg.rightLeg.width_mm,
        pieceId: piece.id,
        partIndex: 2,
        groupId: piece.id,
        mustBeAdjacent,
        label: 'Right Leg',
      },
    ];
  }

  // Fallback — unknown shape type, treat as rectangle
  return [{
    width: piece.lengthMm,
    height: piece.widthMm,
    pieceId: piece.id,
    partIndex: 0,
  }];
}

/**
 * Get bounding box dimensions without running full geometry.
 * Used by grain match feasibility check.
 */
export function getBoundingBox(piece: {
  lengthMm: number;
  widthMm: number;
  shapeType?: string | null;
  shapeConfig?: unknown;
}): { length: number; width: number } {
  if (!piece.shapeType || piece.shapeType === 'RECTANGLE' || !piece.shapeConfig) {
    return { length: piece.lengthMm, width: piece.widthMm };
  }

  if (piece.shapeType === 'L_SHAPE') {
    const cfg = piece.shapeConfig as LShapeConfig;
    return {
      length: Math.max(cfg.leg1.length_mm, cfg.leg2.length_mm),
      width: cfg.leg1.width_mm + cfg.leg2.width_mm,
    };
  }

  if (piece.shapeType === 'U_SHAPE') {
    const cfg = piece.shapeConfig as UShapeConfig;
    return {
      length: cfg.back.length_mm,
      width: cfg.leftLeg.width_mm + cfg.back.width_mm + cfg.rightLeg.width_mm,
    };
  }

  return { length: piece.lengthMm, width: piece.widthMm };
}

/**
 * Returns the actual edge length (in mm) for each of the 4 DB edge positions
 * mapped to the real shape segments. Inner step/concave edges are NOT mapped
 * (they are always RAW — not polished or laminated).
 *
 * L-shape (leg1 horizontal, leg2 drops vertically from right end):
 *   TOP    = leg1.length_mm                     (outer top)
 *   RIGHT  = leg2.width_mm                      (right side of leg2)
 *   BOTTOM = leg2.length_mm + (leg1.length_mm - leg2.width_mm)  (both bottom runs)
 *   LEFT   = leg1.width_mm                      (left side)
 *
 * U-shape (back across top, two legs drop down):
 *   TOP    = back.length_mm                     (back/top edge)
 *   RIGHT  = rightLeg.width_mm                  (right outer side)
 *   BOTTOM = leftLeg.length_mm + rightLeg.length_mm
 *            + (back.length_mm - leftLeg.width_mm - rightLeg.width_mm)
 *   LEFT   = leftLeg.width_mm                   (left outer side)
 */
export function getShapeEdgeLengths(
  shapeType: ShapeType,
  shapeConfig: ShapeConfig,
  length_mm: number,
  width_mm: number
): { top_mm: number; bottom_mm: number; left_mm: number; right_mm: number } {
  if (shapeType === 'L_SHAPE' && shapeConfig?.shape === 'L_SHAPE') {
    const { leg1, leg2 } = shapeConfig;
    return {
      top_mm: leg1.length_mm,
      right_mm: leg2.width_mm,
      bottom_mm: leg2.length_mm + (leg1.length_mm - leg2.width_mm),
      left_mm: leg1.width_mm,
    };
  }
  if (shapeType === 'U_SHAPE' && shapeConfig?.shape === 'U_SHAPE') {
    const { leftLeg, back, rightLeg } = shapeConfig;
    return {
      top_mm: back.length_mm,
      right_mm: rightLeg.width_mm,
      bottom_mm: leftLeg.length_mm + rightLeg.length_mm +
        (back.length_mm - leftLeg.width_mm - rightLeg.width_mm),
      left_mm: leftLeg.width_mm,
    };
  }
  // RECTANGLE — same as the default formula
  return {
    top_mm: length_mm,
    bottom_mm: length_mm,
    left_mm: width_mm,
    right_mm: width_mm,
  };
}

export function getShapeGeometry(
  shapeType: ShapeType,
  shapeConfig: ShapeConfig,
  length_mm: number,
  width_mm: number
): ShapeGeometry {
  if (shapeType === 'L_SHAPE' && shapeConfig?.shape === 'L_SHAPE') {
    return calculateLShapeGeometry(shapeConfig);
  }
  if (shapeType === 'U_SHAPE' && shapeConfig?.shape === 'U_SHAPE') {
    return calculateUShapeGeometry(shapeConfig);
  }
  // RECTANGLE fallback
  return {
    totalAreaSqm: (length_mm * width_mm) / 1_000_000,
    cuttingPerimeterLm: (2 * (length_mm + width_mm)) / 1000,
    cornerJoins: 0,
    boundingLength_mm: length_mm,
    boundingWidth_mm: width_mm,
  };
}
