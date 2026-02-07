/**
 * Material Calculator
 * Calculates material costs with support for PER_SLAB and PER_SQUARE_METRE pricing
 */

import { Decimal } from '@prisma/client/runtime/library';
import {
  PieceId,
  MaterialPricingBasis,
  MaterialCalculation,
  PieceMaterialCost,
  PricingContext,
  SlabEstimate,
} from './types';
import { getSlabSize } from '@/lib/constants/slab-sizes';

// ============================================================================
// Types
// ============================================================================

interface MaterialInput {
  pieceId: PieceId;
  lengthMm: number;
  widthMm: number;
  materials: {
    id: number;
    pricePerSqm: Decimal;
    pricePerSlab?: Decimal | null;
    pricePerSquareMetre?: Decimal | null;
  } | null;
  overrideMaterialCost?: Decimal | null;
}

interface MaterialOptions {
  pricingBasis: MaterialPricingBasis;
  slabCount?: number;
  materialCategory?: string;
  wasteFactor?: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_WASTE_FACTOR = 1.15; // 15% waste
const SQMM_TO_SQM = 1_000_000;

// ============================================================================
// Calculator Class
// ============================================================================

export class MaterialCalculator {
  private pricingBasis: MaterialPricingBasis;
  private wasteFactor: number;
  private slabCount?: number;

  constructor(options: MaterialOptions) {
    this.pricingBasis = options.pricingBasis;
    this.wasteFactor = options.wasteFactor ?? DEFAULT_WASTE_FACTOR;
    this.slabCount = options.slabCount;
  }

  /**
   * Calculate material costs for a set of pieces
   */
  calculate(pieces: MaterialInput[]): MaterialCalculation {
    // Handle piece-level overrides first
    const pieceCosts = pieces.map(piece => this.calculatePiece(piece));
    
    // Calculate totals
    const totalAreaSqm = pieceCosts.reduce(
      (sum, p) => sum.plus(p.areaSqm),
      new Decimal(0)
    );

    const hasOverrides = pieceCosts.some(p => p.isOverride);
    
    // For PER_SLAB pricing, recalculate if no overrides
    let finalSubtotal: Decimal;
    let finalUnitCost: Decimal;
    
    if (this.pricingBasis === 'PER_SLAB' && !hasOverrides && this.slabCount) {
      const slabPricing = this.calculateSlabPricing(pieces, this.slabCount);
      finalSubtotal = slabPricing.totalCost;
      finalUnitCost = slabPricing.unitCost;
    } else {
      finalSubtotal = pieceCosts.reduce(
        (sum, p) => sum.plus(p.totalCost),
        new Decimal(0)
      );
      finalUnitCost = totalAreaSqm.greaterThan(0) 
        ? finalSubtotal.dividedBy(totalAreaSqm)
        : new Decimal(0);
    }

    // Apply waste factor
    const wasteAdjustedSubtotal = finalSubtotal.times(this.wasteFactor);

    return {
      strategy: this.pricingBasis,
      pieces: pieceCosts,
      slabCount: this.slabCount ?? 0,
      totalAreaSqm: this.round(totalAreaSqm),
      unitCost: this.round(finalUnitCost),
      wasteFactor: this.wasteFactor,
      subtotal: this.round(wasteAdjustedSubtotal),
      discount: new Decimal(0),
      total: this.round(wasteAdjustedSubtotal),
    };
  }

  /**
   * Calculate cost for a single piece
   */
  private calculatePiece(piece: MaterialInput): PieceMaterialCost {
    const areaSqm = this.calculateArea(piece.lengthMm, piece.widthMm);

    // Check for piece-level override
    if (piece.overrideMaterialCost) {
      return {
        pieceId: piece.pieceId,
        areaSqm: this.round(areaSqm),
        strategy: this.pricingBasis,
        unitCost: piece.overrideMaterialCost.dividedBy(areaSqm),
        totalCost: piece.overrideMaterialCost,
        isOverride: true,
      };
    }

    // Calculate based on pricing strategy
    let unitCost: Decimal;
    let totalCost: Decimal;

    if (this.pricingBasis === 'PER_SLAB') {
      // For per-slab, we calculate proportionally until final aggregation
      const slabPrice = piece.material?.pricePerSlab ?? new Decimal(0);
      const sqmPrice = piece.material?.pricePerSquareMetre 
        ?? piece.material?.pricePerSqm 
        ?? new Decimal(0);
      
      // Use sqm price as fallback if no slab price
      unitCost = slabPrice.greaterThan(0) ? slabPrice.dividedBy(2.5) : sqmPrice; // Approx 2.5 m² per slab
      totalCost = areaSqm.times(unitCost);
    } else {
      // Per square metre pricing
      unitCost = piece.material?.pricePerSquareMetre 
        ?? piece.material?.pricePerSqm 
        ?? new Decimal(0);
      totalCost = areaSqm.times(unitCost);
    }

    return {
      pieceId: piece.pieceId,
      areaSqm: this.round(areaSqm),
      strategy: this.pricingBasis,
      unitCost: this.round(unitCost),
      totalCost: this.round(totalCost),
      isOverride: false,
    };
  }

  /**
   * Calculate slab-based pricing when slab count is known
   */
  private calculateSlabPricing(
    pieces: MaterialInput[],
    slabCount: number
  ): { totalCost: Decimal; unitCost: Decimal } {
    // Find the material price from first piece with material
    const materialWithPricing = pieces.find(
      p => p.material?.pricePerSlab && p.material.pricePerSlab.greaterThan(0)
    );

    if (!materialWithPricing?.material?.pricePerSlab) {
      // Fallback to per-m² pricing
      const totalArea = pieces.reduce(
        (sum, p) => sum.plus(this.calculateArea(p.lengthMm, p.widthMm)),
        new Decimal(0)
      );
      const avgPricePerSqm = pieces.reduce((sum, p) => {
        const price = p.material?.pricePerSquareMetre ?? p.material?.pricePerSqm ?? new Decimal(0);
        return sum.plus(price);
      }, new Decimal(0)).dividedBy(pieces.length || 1);
      
      return {
        totalCost: totalArea.times(avgPricePerSqm),
        unitCost: avgPricePerSqm,
      };
    }

    const slabPrice = materialWithPricing.material.pricePerSlab;
    const totalCost = slabPrice.times(slabCount);

    // Calculate effective unit cost
    const totalArea = pieces.reduce(
      (sum, p) => sum.plus(this.calculateArea(p.lengthMm, p.widthMm)),
      new Decimal(0)
    );
    const unitCost = totalArea.greaterThan(0) 
      ? totalCost.dividedBy(totalArea)
      : new Decimal(0);

    return { totalCost, unitCost };
  }

  /**
   * Estimate number of slabs needed for a set of pieces
   */
  estimateSlabs(
    pieces: Array<{ lengthMm: number; widthMm: number }>,
    materialCategory: string
  ): SlabEstimate {
    const slabSize = getSlabSize(materialCategory);
    const slabArea = new Decimal(slabSize.lengthMm * slabSize.widthMm).dividedBy(SQMM_TO_SQM);
    
    // Calculate total piece area
    const totalPieceArea = pieces.reduce(
      (sum, p) => sum.plus(this.calculateArea(p.lengthMm, p.widthMm)),
      new Decimal(0)
    );

    // Estimate slabs needed (with waste factor)
    const effectiveArea = totalPieceArea.times(this.wasteFactor);
    const estimatedSlabs = Math.ceil(effectiveArea.dividedBy(slabArea).toNumber());

    // Calculate utilization
    const usedArea = slabArea.times(estimatedSlabs);
    const utilizationPercent = usedArea.greaterThan(0)
      ? totalPieceArea.dividedBy(usedArea).times(100).toNumber()
      : 0;

    return {
      count: estimatedSlabs,
      size: {
        lengthMm: slabSize.lengthMm,
        widthMm: slabSize.widthMm,
      },
      totalAreaSqm: this.round(slabArea.times(estimatedSlabs)),
      utilizationPercent: Math.round(utilizationPercent * 10) / 10,
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private calculateArea(lengthMm: number, widthMm: number): Decimal {
    return new Decimal(lengthMm * widthMm).dividedBy(SQMM_TO_SQM);
  }

  private round(value: Decimal): Decimal {
    return new Decimal(value.toFixed(2));
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createMaterialCalculator(
  context: PricingContext,
  options?: { slabCount?: number; wasteFactor?: number }
): MaterialCalculator {
  return new MaterialCalculator({
    pricingBasis: context.materialPricingBasis,
    slabCount: options?.slabCount,
    wasteFactor: options?.wasteFactor,
  });
}

// ============================================================================
// Static Utilities
// ============================================================================

export const MaterialCalculations = {
  /**
   * Calculate area from dimensions
   */
  area(lengthMm: number, widthMm: number): Decimal {
    return new Decimal(lengthMm * widthMm).dividedBy(SQMM_TO_SQM);
  },

  /**
   * Apply waste factor to area
   */
  withWaste(areaSqm: Decimal, wasteFactor: number = DEFAULT_WASTE_FACTOR): Decimal {
    return areaSqm.times(wasteFactor);
  },

  /**
   * Compare two material calculations
   */
  diff(
    original: MaterialCalculation,
    updated: MaterialCalculation
  ): { field: string; old: string; new: string }[] {
    const differences: { field: string; old: string; new: string }[] = [];

    if (!original.subtotal.equals(updated.subtotal)) {
      differences.push({
        field: 'subtotal',
        old: original.subtotal.toString(),
        new: updated.subtotal.toString(),
      });
    }

    if (original.slabCount !== updated.slabCount) {
      differences.push({
        field: 'slabCount',
        old: original.slabCount.toString(),
        new: updated.slabCount.toString(),
      });
    }

    return differences;
  },
};
