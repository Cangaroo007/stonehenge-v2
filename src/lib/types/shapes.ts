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
