/**
 * Edge Calculator
 * Calculates edge profile costs with thickness variant support
 */

import { Decimal } from '@prisma/client/runtime/library';
import {
  PieceId,
  EdgeSide,
  EdgeCalculation,
  EdgeTypeBreakdown,
  PieceEdgeConfig,
} from './types';

// ============================================================================
// Types
// ============================================================================

interface EdgeTypeInput {
  id: string;
  name: string;
  baseRate: Decimal;
  rate20mm: Decimal | null;
  rate40mm: Decimal | null;
  minimumCharge: Decimal | null;
  minimumLength: Decimal | null;
}

interface EdgeCalculationOptions {
  fabricationDiscountPercent?: number;
}

// Map edge sides to their corresponding dimensions
const EDGE_DIMENSION_MAP: Record<EdgeSide, keyof Dimensions> = {
  top: 'widthMm',
  bottom: 'widthMm',
  left: 'lengthMm',
  right: 'lengthMm',
};

interface Dimensions {
  lengthMm: number;
  widthMm: number;
}

// ============================================================================
// Calculator Class
// ============================================================================

export class EdgeCalculator {
  private edgeTypes: Map<string, EdgeTypeInput>;
  private fabricationDiscountPercent: number;

  constructor(
    edgeTypes: EdgeTypeInput[],
    options: EdgeCalculationOptions = {}
  ) {
    this.edgeTypes = new Map(edgeTypes.map(et => [et.id, et]));
    this.fabricationDiscountPercent = options.fabricationDiscountPercent ?? 0;
  }

  /**
   * Calculate edge costs for a set of pieces
   */
  calculate(pieces: PieceEdgeConfig[]): EdgeCalculation {
    // Group edges by type and thickness
    const edgeGroups = this.groupEdgesByType(pieces);

    // Calculate each group
    const byType: EdgeTypeBreakdown[] = [];
    let totalLinearMeters = new Decimal(0);
    let subtotal = new Decimal(0);

    for (const [, group] of edgeGroups) {
      const breakdown = this.calculateGroup(group);
      byType.push(breakdown);
      totalLinearMeters = totalLinearMeters.plus(breakdown.linearMeters);
      subtotal = subtotal.plus(breakdown.total);
    }

    // Sort by name for consistent output
    byType.sort((a, b) => a.edgeTypeName.localeCompare(b.edgeTypeName));

    const discount = subtotal.times(this.fabricationDiscountPercent).dividedBy(100);
    const total = subtotal.minus(discount);

    return {
      byType,
      totalLinearMeters: this.round(totalLinearMeters),
      subtotal: this.round(subtotal),
      discount: this.round(discount),
      total: this.round(total),
    };
  }

  /**
   * Calculate cost for a single piece's edges
   */
  calculatePiece(piece: PieceEdgeConfig): {
    edges: Array<{
      side: EdgeSide;
      edgeTypeId: string;
      lengthMm: number;
      linearMeters: Decimal;
      cost: Decimal;
    }>;
    subtotal: Decimal;
  } {
    const edges: Array<{
      side: EdgeSide;
      edgeTypeId: string;
      lengthMm: number;
      linearMeters: Decimal;
      cost: Decimal;
    }> = [];
    let subtotal = new Decimal(0);

    for (const [side, edgeTypeId] of Object.entries(piece.edges)) {
      if (!edgeTypeId) continue;

      const edgeType = this.edgeTypes.get(edgeTypeId);
      if (!edgeType) continue;

      const sideKey = side as EdgeSide;
      const lengthMm = piece.dimensions[EDGE_DIMENSION_MAP[sideKey]];
      const linearMeters = new Decimal(lengthMm).dividedBy(1000);

      const rate = this.selectRate(edgeType, piece.thicknessMm);
      let cost = linearMeters.times(rate);

      // Apply minimums
      cost = this.applyMinimums(cost, linearMeters, edgeType);

      edges.push({
        side: sideKey,
        edgeTypeId,
        lengthMm,
        linearMeters,
        cost: this.round(cost),
      });

      subtotal = subtotal.plus(cost);
    }

    return { edges, subtotal: this.round(subtotal) };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private groupEdgesByType(
    pieces: PieceEdgeConfig[]
  ): Map<string, EdgeGroup> {
    const groups = new Map<string, EdgeGroup>();

    for (const piece of pieces) {
      for (const [side, edgeTypeId] of Object.entries(piece.edges)) {
        if (!edgeTypeId) continue;

        const edgeType = this.edgeTypes.get(edgeTypeId);
        if (!edgeType) continue;

        const sideKey = side as EdgeSide;
        const lengthMm = piece.dimensions[EDGE_DIMENSION_MAP[sideKey]];
        const key = `${edgeTypeId}_${piece.thicknessMm}`;

        const existing = groups.get(key);
        if (existing) {
          existing.totalLengthMm += lengthMm;
          existing.pieceCount += 1;
        } else {
          groups.set(key, {
            edgeTypeId,
            edgeType,
            thicknessMm: piece.thicknessMm,
            totalLengthMm: lengthMm,
            pieceCount: 1,
          });
        }
      }
    }

    return groups;
  }

  private calculateGroup(group: EdgeGroup): EdgeTypeBreakdown {
    const linearMeters = new Decimal(group.totalLengthMm).dividedBy(1000);
    const rate = this.selectRate(group.edgeType, group.thicknessMm);

    let subtotal = linearMeters.times(rate);

    // Apply minimums
    subtotal = this.applyMinimums(subtotal, linearMeters, group.edgeType);

    const discount = subtotal.times(this.fabricationDiscountPercent).dividedBy(100);
    const total = subtotal.minus(discount);

    return {
      edgeTypeId: group.edgeTypeId,
      edgeTypeName: `${group.edgeType.name} (${group.thicknessMm}mm)`,
      thickness: group.thicknessMm,
      linearMeters: this.round(linearMeters),
      ratePerMeter: rate,
      subtotal: this.round(subtotal),
      discount: this.round(discount),
      total: this.round(total),
    };
  }

  private selectRate(edgeType: EdgeTypeInput, thicknessMm: number): Decimal {
    if (thicknessMm <= 20 && edgeType.rate20mm) {
      return edgeType.rate20mm;
    }
    if (thicknessMm > 20 && edgeType.rate40mm) {
      return edgeType.rate40mm;
    }
    return edgeType.baseRate;
  }

  private applyMinimums(
    cost: Decimal,
    linearMeters: Decimal,
    edgeType: EdgeTypeInput
  ): Decimal {
    let result = cost;

    // Apply minimum length (pad to minimum if below)
    if (edgeType.minimumLength && edgeType.minimumLength.greaterThan(0)) {
      if (linearMeters.lessThan(edgeType.minimumLength)) {
        const rate = cost.dividedBy(linearMeters);
        result = edgeType.minimumLength.times(rate);
      }
    }

    // Apply minimum charge
    if (edgeType.minimumCharge && edgeType.minimumCharge.greaterThan(0)) {
      if (result.lessThan(edgeType.minimumCharge)) {
        result = edgeType.minimumCharge;
      }
    }

    return result;
  }

  private round(value: Decimal): Decimal {
    return new Decimal(value.toFixed(2));
  }
}

// ============================================================================
// Types
// ============================================================================

interface EdgeGroup {
  edgeTypeId: string;
  edgeType: EdgeTypeInput;
  thicknessMm: number;
  totalLengthMm: number;
  pieceCount: number;
}

// ============================================================================
// Factory Function
// ============================================================================

export function createEdgeCalculator(
  edgeTypes: EdgeTypeInput[],
  options?: EdgeCalculationOptions
): EdgeCalculator {
  return new EdgeCalculator(edgeTypes, options);
}

// ============================================================================
// Static Utilities
// ============================================================================

export const EdgeCalculations = {
  /**
   * Get total perimeter of a piece
   */
  perimeter(lengthMm: number, widthMm: number): Decimal {
    return new Decimal(2 * (lengthMm + widthMm)).dividedBy(1000); // in meters
  },

  /**
   * Get finished edge length (edges that have a profile)
   */
  finishedEdgeLength(
    lengthMm: number,
    widthMm: number,
    edges: Partial<Record<EdgeSide, boolean>>
  ): Decimal {
    let total = 0;
    if (edges.top || edges.bottom) {
      total += (edges.top ? widthMm : 0) + (edges.bottom ? widthMm : 0);
    }
    if (edges.left || edges.right) {
      total += (edges.left ? lengthMm : 0) + (edges.right ? lengthMm : 0);
    }
    return new Decimal(total).dividedBy(1000); // in meters
  },

  /**
   * Calculate linear meters from millimeters
   */
  toLinearMeters(mm: number): Decimal {
    return new Decimal(mm).dividedBy(1000);
  },
};
