export type ShapeType = 'RECTANGLE' | 'L_SHAPE' | 'U_SHAPE' | 'RADIUS_END' | 'FULL_CIRCLE' | 'CONCAVE_ARC' | 'ROUNDED_RECT';

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

export interface RadiusEndConfig {
  shape: 'RADIUS_END';
  length_mm: number;        // long dimension
  width_mm: number;         // short dimension
  radius_mm: number;        // arc radius on curved end(s)
  curved_ends: 'ONE' | 'BOTH';  // which short ends are curved
}

export interface FullCircleConfig {
  shape: 'FULL_CIRCLE';
  diameter_mm: number;
}

export interface ConcaveArcConfig {
  shape: 'CONCAVE_ARC';
  inner_radius_mm: number;  // radius of the inner (concave) arc
  depth_mm: number;         // depth from chord to arc apex
  sweep_deg: number;        // arc sweep angle in degrees (90 | 120 | 180)
  curved_ends: boolean;     // whether the straight ends also have arcs
}

export interface RoundedRectConfig {
  shape: 'ROUNDED_RECT';
  length_mm: number;
  width_mm: number;
  /** Applied to all 4 corners when individual_corners is false */
  corner_radius_mm: number;
  /** When true, use the four per-corner values instead */
  individual_corners: boolean;
  corner_tl_mm: number;
  corner_tr_mm: number;
  corner_br_mm: number;
  corner_bl_mm: number;
}

export type ShapeConfig = LShapeConfig | UShapeConfig | RadiusEndConfig | FullCircleConfig | ConcaveArcConfig | RoundedRectConfig | null;

/** Arc edge profile assignments for curved pieces (stored as JSONB in quote_pieces.edge_arc_config) */
export interface ArcEdgeConfig {
  perimeter?: string | null;        // FULL_CIRCLE — the full circle edge
  arc_end_start?: string | null;    // RADIUS_END — the start arc end
  arc_end_end?: string | null;      // RADIUS_END — the end arc end
  corner_tl?: string | null;        // ROUNDED_RECT — top-left corner
  corner_tr?: string | null;        // ROUNDED_RECT — top-right corner
  corner_bl?: string | null;        // ROUNDED_RECT — bottom-left corner
  corner_br?: string | null;        // ROUNDED_RECT — bottom-right corner
}

// Derived geometry — calculated from shape config
export interface ShapeGeometry {
  totalAreaSqm: number;       // total stone area (corner overlap deducted)
  cuttingPerimeterLm: number; // full outer perimeter for cutting cost
  cornerJoins: number;        // 1 for L-shape, 2 for U-shape
  boundingLength_mm: number;  // longest outer dimension (for optimiser)
  boundingWidth_mm: number;   // widest outer dimension (for optimiser)
}

export function calculateLShapeGeometry(config: LShapeConfig | null | undefined): ShapeGeometry {
  // Guard against null/undefined config or missing leg data
  if (!config || !config.leg1 || !config.leg2) {
    return {
      totalAreaSqm: 0,
      cuttingPerimeterLm: 0,
      cornerJoins: 0,
      boundingLength_mm: 0,
      boundingWidth_mm: 0,
    };
  }
  const { leg1, leg2 } = config;
  // Corner overlap = width × width (the square at the join)
  const cornerOverlap = leg1.width_mm * leg2.width_mm / 1_000_000;
  const totalAreaSqm =
    (leg1.length_mm * leg1.width_mm / 1_000_000) +
    (leg2.length_mm * leg2.width_mm / 1_000_000) -
    cornerOverlap;

  // Cutting perimeter = sum of decomposed leg perimeters (Rule 59A).
  // Each leg is cut on all 4 sides — including the join faces.
  const leg2Net = leg2.length_mm - leg1.width_mm;
  const cuttingPerimeterLm = (
    2 * (leg1.length_mm + leg1.width_mm) +  // Leg 1 full rectangle perimeter
    2 * (leg2Net + leg2.width_mm)            // Leg 2 (net) full rectangle perimeter
  ) / 1000;

  return {
    totalAreaSqm,
    cuttingPerimeterLm,
    cornerJoins: 1,
    boundingLength_mm: leg1.length_mm,
    boundingWidth_mm: leg1.width_mm + leg2.length_mm,
  };
}

export function calculateUShapeGeometry(config: UShapeConfig | null | undefined): ShapeGeometry {
  // Guard against null/undefined config or missing leg data
  if (!config || !config.leftLeg || !config.back || !config.rightLeg) {
    return {
      totalAreaSqm: 0,
      cuttingPerimeterLm: 0,
      cornerJoins: 0,
      boundingLength_mm: 0,
      boundingWidth_mm: 0,
    };
  }
  const { leftLeg, back, rightLeg } = config;
  const corner1Overlap = leftLeg.width_mm * back.width_mm / 1_000_000;
  const corner2Overlap = rightLeg.width_mm * back.width_mm / 1_000_000;
  const totalAreaSqm =
    (leftLeg.length_mm * leftLeg.width_mm / 1_000_000) +
    (back.length_mm    * back.width_mm    / 1_000_000) +
    (rightLeg.length_mm * rightLeg.width_mm / 1_000_000) -
    corner1Overlap - corner2Overlap;

  // Cutting perimeter = sum of decomposed leg perimeters (Rule 59A).
  // Each leg is cut on all 4 sides — including the join faces.
  const cuttingPerimeterLm = (
    2 * (leftLeg.length_mm  + leftLeg.width_mm)  +  // Left leg full perimeter
    2 * (back.length_mm     + back.width_mm)      +  // Back full perimeter
    2 * (rightLeg.length_mm + rightLeg.width_mm)     // Right leg full perimeter
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
    if (!cfg || !cfg.leg1 || !cfg.leg2) {
      return [{ width: piece.lengthMm, height: piece.widthMm, pieceId: piece.id, partIndex: 0 }];
    }
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
    if (!cfg || !cfg.leftLeg || !cfg.back || !cfg.rightLeg) {
      return [{ width: piece.lengthMm, height: piece.widthMm, pieceId: piece.id, partIndex: 0 }];
    }
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
    if (!cfg || !cfg.leg1 || !cfg.leg2) {
      return { length: piece.lengthMm, width: piece.widthMm };
    }
    return {
      length: Math.max(cfg.leg1.length_mm, cfg.leg2.length_mm),
      width: cfg.leg1.width_mm + cfg.leg2.width_mm,
    };
  }

  if (piece.shapeType === 'U_SHAPE') {
    const cfg = piece.shapeConfig as UShapeConfig;
    if (!cfg || !cfg.leftLeg || !cfg.back || !cfg.rightLeg) {
      return { length: piece.lengthMm, width: piece.widthMm };
    }
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
    if (!leg1 || !leg2) {
      return { top_mm: length_mm, bottom_mm: length_mm, left_mm: width_mm, right_mm: width_mm };
    }
    return {
      top_mm: leg1.length_mm,
      right_mm: leg2.width_mm,
      bottom_mm: leg2.length_mm + (leg1.length_mm - leg2.width_mm),
      left_mm: leg1.width_mm,
    };
  }
  if (shapeType === 'U_SHAPE' && shapeConfig?.shape === 'U_SHAPE') {
    const { leftLeg, back, rightLeg } = shapeConfig;
    if (!leftLeg || !back || !rightLeg) {
      return { top_mm: length_mm, bottom_mm: length_mm, left_mm: width_mm, right_mm: width_mm };
    }
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

/**
 * Cutting perimeter for pricing.
 *
 * RULE: A fabricator cuts every edge of every physical piece of stone.
 * L/U shapes are made from multiple rectangular legs joined together.
 * Each leg is cut on all 4 sides — including the join faces.
 * Therefore: cutting perimeter = sum of perimeters of all decomposed legs.
 *
 * This correctly charges for cutting the join faces, which the outer L
 * perimeter formula would miss.
 */
export function getCuttingPerimeterLm(
  shapeType: ShapeType,
  shapeConfig: ShapeConfig | null | undefined,
  fallbackLengthMm: number,
  fallbackWidthMm: number
): number {
  // FULL_CIRCLE: entire perimeter is the circumference (π × diameter)
  if (shapeType === 'FULL_CIRCLE') {
    return Math.PI * fallbackLengthMm / 1000;
  }

  // RADIUS_END: two straight long edges + arc end(s)
  if (shapeType === 'RADIUS_END') {
    const shapeC = shapeConfig as Record<string, unknown> | null | undefined;
    const r = Number(shapeC?.radius_mm) || 0;
    const ends = shapeC?.curved_ends === 'BOTH' ? 2 : 1;
    const arcPerim = Math.PI * r * ends;
    const straightPerim = fallbackLengthMm; // two long edges (flat end is join face)
    return (straightPerim + arcPerim) / 1000;
  }

  // ROUNDED_RECT: straight edges + corner arcs
  if (shapeType === 'ROUNDED_RECT') {
    const shapeC = shapeConfig as Record<string, unknown> | null | undefined;
    if (shapeC?.individual_corners) {
      const tl = Number(shapeC.corner_tl_mm) || 0;
      const tr = Number(shapeC.corner_tr_mm) || 0;
      const br = Number(shapeC.corner_br_mm) || 0;
      const bl = Number(shapeC.corner_bl_mm) || 0;
      const arcPerim = (Math.PI / 2) * (tl + tr + br + bl);
      const avgR = (tl + tr + br + bl) / 4;
      const straightPerim = 2 * (fallbackLengthMm + fallbackWidthMm) - 8 * avgR;
      return (straightPerim + arcPerim) / 1000;
    }
    const r = Number(shapeC?.corner_radius_mm) || 50;
    const arcPerim = (Math.PI / 2) * r * 4;
    const straightPerim = 2 * (fallbackLengthMm + fallbackWidthMm) - 8 * r;
    return (straightPerim + arcPerim) / 1000;
  }

  // CONCAVE_ARC: use bounding box (conservative)
  if (shapeType === 'CONCAVE_ARC') {
    return 2 * (fallbackLengthMm + fallbackWidthMm) / 1000;
  }

  if (shapeType === 'L_SHAPE' && shapeConfig && 'leg1' in shapeConfig) {
    const cfg = shapeConfig as LShapeConfig;
    if (!cfg.leg1 || !cfg.leg2) return 0;
    const leg2Net = cfg.leg2.length_mm - cfg.leg1.width_mm;
    const perimA = 2 * (cfg.leg1.length_mm + cfg.leg1.width_mm);
    const perimB = 2 * (leg2Net + cfg.leg2.width_mm);
    return (perimA + perimB) / 1000;
  }
  if (shapeType === 'U_SHAPE' && shapeConfig && 'leftLeg' in shapeConfig) {
    const cfg = shapeConfig as UShapeConfig;
    if (!cfg.leftLeg || !cfg.back || !cfg.rightLeg) return 0;
    const perimLeft  = 2 * (cfg.leftLeg.length_mm  + cfg.leftLeg.width_mm);
    const perimBack  = 2 * (cfg.back.length_mm     + cfg.back.width_mm);
    const perimRight = 2 * (cfg.rightLeg.length_mm + cfg.rightLeg.width_mm);
    return (perimLeft + perimBack + perimRight) / 1000;
  }
  return 2 * (fallbackLengthMm + fallbackWidthMm) / 1000;
}

/**
 * Returns a map of edge-key → length-in-mm for all FINISHABLE edges.
 *
 * RULE: Only outer exposed faces receive edge profiles (polishing, bullnose, etc).
 * Join faces where legs bond together are cut flat but NEVER finished — they are
 * hidden inside the stone joint and never appear in this map.
 *
 * L-shape: 6 finishable edges (top, left, r_top, inner, r_btm, bottom)
 * U-shape: 8 finishable edges (top_left, outer_left, bottom, outer_right,
 *                               top_right, inner_right, back_inner, inner_left)
 * Rectangle: 4 finishable edges (top, right, bottom, left)
 *
 * The 'inner' edge on an L-shape IS finishable — it is the exposed step face
 * visible from the room. It is NOT a join face.
 */
export function getFinishableEdgeLengthsMm(
  shapeType: ShapeType,
  shapeConfig: ShapeConfig | null | undefined,
  fallbackLengthMm: number,
  fallbackWidthMm: number
): Record<string, number> {
  if (shapeType === 'L_SHAPE' && shapeConfig && 'leg1' in shapeConfig) {
    const cfg = shapeConfig as LShapeConfig;
    if (!cfg.leg1 || !cfg.leg2) return {};
    const leg2Net = cfg.leg2.length_mm - cfg.leg1.width_mm;
    return {
      top:    cfg.leg1.length_mm,
      left:   cfg.leg1.width_mm,
      r_top:  cfg.leg2.width_mm,
      inner:  cfg.leg1.length_mm - cfg.leg2.width_mm,
      r_btm:  leg2Net,
      bottom: leg2Net,
    };
  }
  if (shapeType === 'U_SHAPE' && shapeConfig && 'leftLeg' in shapeConfig) {
    const cfg = shapeConfig as UShapeConfig;
    if (!cfg.leftLeg || !cfg.back || !cfg.rightLeg) return {};
    const bottomSpan = cfg.leftLeg.width_mm + cfg.back.length_mm + cfg.rightLeg.width_mm;
    return {
      top_left:    cfg.leftLeg.width_mm,
      outer_left:  cfg.leftLeg.length_mm,
      bottom:      bottomSpan,
      outer_right: cfg.rightLeg.length_mm,
      top_right:   cfg.rightLeg.width_mm,
      inner_right: cfg.rightLeg.length_mm - cfg.back.width_mm,
      back_inner:  cfg.back.length_mm,
      inner_left:  cfg.leftLeg.length_mm - cfg.back.width_mm,
    };
  }
  // Rectangle
  return {
    top:    fallbackLengthMm,
    right:  fallbackWidthMm,
    bottom: fallbackLengthMm,
    left:   fallbackWidthMm,
  };
}

export function getShapeGeometry(
  shapeType: ShapeType,
  shapeConfig: ShapeConfig | null | undefined,
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

// ── Curved shape area helpers ─────────────────────────────────────────────────

/**
 * True area of a RADIUS_END piece in mm².
 * Bounding rectangle minus arc waste on curved ends.
 * Waste per curved end ≈ r² × (π/2 − 1) (quarter-circle minus inscribed triangle).
 * Accuracy within 2 % for typical benchtop radii.
 */
export function computeRadiusEndArea(config: RadiusEndConfig): number {
  const boundingArea = config.length_mm * config.width_mm;
  const wastePerEnd = config.radius_mm * config.radius_mm * (Math.PI / 2 - 1);
  const curvedEndCount = config.curved_ends === 'BOTH' ? 2 : 1;
  return boundingArea - wastePerEnd * curvedEndCount;
}

/** True area of a FULL_CIRCLE in mm². π × r² */
export function computeFullCircleArea(config: FullCircleConfig): number {
  const r = config.diameter_mm / 2;
  return Math.PI * r * r;
}

/**
 * Approximate true area of a CONCAVE_ARC in mm².
 * chord_width × depth − arc_segment_area
 * where arc_segment_area = (r² / 2) × (sweep_rad − sin(sweep_rad))
 */
export function computeConcaveArcArea(config: ConcaveArcConfig): number {
  const sweepRad = (config.sweep_deg * Math.PI) / 180;
  const chordWidth = 2 * config.inner_radius_mm * Math.sin(sweepRad / 2);
  const grossArea = chordWidth * config.depth_mm;
  const arcSegmentArea =
    (config.inner_radius_mm * config.inner_radius_mm / 2) *
    (sweepRad - Math.sin(sweepRad));
  return grossArea - arcSegmentArea;
}

/** Bounding box dimensions for a CONCAVE_ARC in mm. */
export function computeArcBoundingBox(config: ConcaveArcConfig): { width_mm: number; height_mm: number } {
  const sweepRad = (config.sweep_deg * Math.PI) / 180;
  const chordWidth = 2 * config.inner_radius_mm * Math.sin(sweepRad / 2);
  return { width_mm: chordWidth, height_mm: config.depth_mm };
}

// ── Optimizer rects for all shape types ───────────────────────────────────────

/**
 * Returns the bounding rectangle(s) the optimiser should use for placement.
 * Extends the existing decomposeShapeIntoRects() pattern.
 *
 * Curved shapes return a single bounding rect with trueArea_m2 set to
 * the actual stone area (always ≤ bounding area).
 * RECTANGLE / L_SHAPE / U_SHAPE delegate to decomposeShapeIntoRects()
 * with trueArea_m2 = bounding area of each rect.
 */
export function getOptimizerRects(
  shapeType: ShapeType,
  shapeConfig: ShapeConfig,
  pieceId: string,
  label: string
): Array<{ width_mm: number; height_mm: number; trueArea_m2: number }> {
  if (shapeType === 'RADIUS_END' && shapeConfig?.shape === 'RADIUS_END') {
    return [{
      width_mm: shapeConfig.length_mm,
      height_mm: shapeConfig.width_mm,
      trueArea_m2: computeRadiusEndArea(shapeConfig) / 1_000_000,
    }];
  }

  if (shapeType === 'FULL_CIRCLE' && shapeConfig?.shape === 'FULL_CIRCLE') {
    return [{
      width_mm: shapeConfig.diameter_mm,
      height_mm: shapeConfig.diameter_mm,
      trueArea_m2: computeFullCircleArea(shapeConfig) / 1_000_000,
    }];
  }

  if (shapeType === 'CONCAVE_ARC' && shapeConfig?.shape === 'CONCAVE_ARC') {
    const bb = computeArcBoundingBox(shapeConfig);
    return [{
      width_mm: bb.width_mm,
      height_mm: bb.height_mm,
      trueArea_m2: computeConcaveArcArea(shapeConfig) / 1_000_000,
    }];
  }

  if (shapeType === 'ROUNDED_RECT' && shapeConfig?.shape === 'ROUNDED_RECT') {
    const cfg = shapeConfig;
    const tl = cfg.individual_corners ? cfg.corner_tl_mm : cfg.corner_radius_mm;
    const tr = cfg.individual_corners ? cfg.corner_tr_mm : cfg.corner_radius_mm;
    const br = cfg.individual_corners ? cfg.corner_br_mm : cfg.corner_radius_mm;
    const bl = cfg.individual_corners ? cfg.corner_bl_mm : cfg.corner_radius_mm;
    const cornerArea = (Math.PI / 4) * (tl ** 2 + tr ** 2 + br ** 2 + bl ** 2);
    return [{
      width_mm:    cfg.length_mm,
      height_mm:   cfg.width_mm,
      trueArea_m2: (cfg.length_mm * cfg.width_mm - cornerArea) / 1_000_000,
    }];
  }

  // RECTANGLE / L_SHAPE / U_SHAPE — delegate to existing decomposition
  const rects = decomposeShapeIntoRects({
    id: pieceId,
    lengthMm: 0,
    widthMm: 0,
    shapeType,
    shapeConfig,
  });
  return rects.map((r) => ({
    width_mm: r.width,
    height_mm: r.height,
    trueArea_m2: (r.width * r.height) / 1_000_000,
  }));
}
