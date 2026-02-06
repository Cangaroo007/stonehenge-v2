/**
 * Enhanced Material Calculator with Flexible Pricing Strategies
 * 
 * Supports multiple pricing strategies for stone masons:
 * - PER_SQUARE_METER_USED: Charge only for material used
 * - PER_SQUARE_METER_WITH_WASTAGE: Charge for material + wastage
 * - PER_WHOLE_SLAB: Charge full slab price regardless of usage
 * - PER_WHOLE_SLAB_WITH_REMNANT_CREDIT: Full slab with remnant credits
 */

import { Decimal } from '@prisma/client/runtime/library';
import {
  PieceId,
  MaterialPricingBasis,
  MaterialCalculation,
  PieceMaterialCost,
  PricingContext,
  SlabEstimate,
} from '../types';
import { MaterialPricingStrategy, WastageConfig, CompanyPricingConfig } from '../../saas/subscription';
import { getSlabSize } from '@/lib/constants/slab-sizes';

// ============================================================================
// Types
// ============================================================================

interface MaterialInput {
  pieceId: PieceId;
  lengthMm: number;
  widthMm: number;
  material: {
    id: number;
    pricePerSqm: Decimal;
    pricePerSlab?: Decimal | null;
    pricePerSquareMetre?: Decimal | null;
  } | null;
  overrideMaterialCost?: Decimal | null;
}

interface EnhancedMaterialOptions {
  pricingStrategy: MaterialPricingStrategy;
  wastageConfig: WastageConfig;
  slabCount?: number;
  materialCategory?: string;
  trackRemnants?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const SQMM_TO_SQM = 1_000_000;

// ============================================================================
// Enhanced Calculator Class
// ============================================================================

export class EnhancedMaterialCalculator {
  private pricingStrategy: MaterialPricingStrategy;
  private wastageConfig: WastageConfig;
  private slabCount?: number;
  private trackRemnants: boolean;

  constructor(options: EnhancedMaterialOptions) {
    this.pricingStrategy = options.pricingStrategy;
    this.wastageConfig = options.wastageConfig;
    this.slabCount = options.slabCount;
    this.trackRemnants = options.trackRemnants ?? options.wastageConfig.trackRemnants;
  }

  /**
   * Calculate material costs based on the configured pricing strategy
   */
  calculate(pieces: MaterialInput[]): MaterialCalculation {
    switch (this.pricingStrategy) {
      case 'PER_SQUARE_METER_USED':
        return this.calculatePerSquareMeterUsed(pieces);
      
      case 'PER_SQUARE_METER_WITH_WASTAGE':
        return this.calculatePerSquareMeterWithWastage(pieces);
      
      case 'PER_WHOLE_SLAB':
        return this.calculatePerWholeSlab(pieces);
      
      case 'PER_WHOLE_SLAB_WITH_REMNANT_CREDIT':
        return this.calculatePerWholeSlabWithRemnantCredit(pieces);
      
      default:
        return this.calculatePerSquareMeterWithWastage(pieces);
    }
  }

  // ============================================================================
  // Pricing Strategy Implementations
  // ============================================================================

  /**
   * Strategy 1: Charge only for actual material used (no wastage)
   * Best for: Customers who want to pay for exactly what they get
   */
  private calculatePerSquareMeterUsed(pieces: MaterialInput[]): MaterialCalculation {
    const pieceCosts = pieces.map(piece => {
      const areaSqm = this.calculateArea(piece.lengthMm, piece.widthMm);
      
      if (piece.overrideMaterialCost) {
        return this.createPieceCost(piece.pieceId, areaSqm, piece.overrideMaterialCost, true);
      }

      const pricePerSqm = piece.material?.pricePerSquareMetre 
        ?? piece.material?.pricePerSqm 
        ?? new Decimal(0);

      const totalCost = areaSqm.times(pricePerSqm);

      return this.createPieceCost(
        piece.pieceId,
        areaSqm,
        this.applyMinimumCharge(totalCost),
        false,
        pricePerSqm
      );
    });

    return this.aggregateResults(pieceCosts, 'PER_SQUARE_METRE');
  }

  /**
   * Strategy 2: Charge for material used + standard wastage percentage
   * Best for: Standard residential work with predictable wastage
   */
  private calculatePerSquareMeterWithWastage(pieces: MaterialInput[]): MaterialCalculation {
    const pieceCosts = pieces.map(piece => {
      const areaSqm = this.calculateArea(piece.lengthMm, piece.widthMm);
      
      if (piece.overrideMaterialCost) {
        return this.createPieceCost(piece.pieceId, areaSqm, piece.overrideMaterialCost, true);
      }

      const pricePerSqm = piece.material?.pricePerSquareMetre 
        ?? piece.material?.pricePerSqm 
        ?? new Decimal(0);

      // Apply wastage factor
      const wastageMultiplier = 1 + (this.wastageConfig.standardWastagePercent / 100);
      const adjustedArea = areaSqm.times(wastageMultiplier);
      
      let totalCost = adjustedArea.times(pricePerSqm);
      totalCost = this.applyMinimumCharge(totalCost);

      return this.createPieceCost(
        piece.pieceId,
        areaSqm,
        totalCost,
        false,
        pricePerSqm,
        adjustedArea
      );
    });

    return this.aggregateResults(pieceCosts, 'PER_SQUARE_METRE');
  }

  /**
   * Strategy 3: Charge for whole slabs regardless of usage
   * Example: Customer uses 1.2 slabs worth of material, pays for 2 full slabs
   * Best for: High-end materials where remnants have limited resale value
   */
  private calculatePerWholeSlab(pieces: MaterialInput[]): MaterialCalculation {
    if (!this.slabCount) {
      // Estimate slab count if not provided
      this.slabCount = this.estimateSlabCount(pieces);
    }

    const pieceCosts = pieces.map(piece => {
      const areaSqm = this.calculateArea(piece.lengthMm, piece.widthMm);
      
      if (piece.overrideMaterialCost) {
        return this.createPieceCost(piece.pieceId, areaSqm, piece.overrideMaterialCost, true);
      }

      // For whole slab pricing, we distribute the slab cost proportionally
      const slabPrice = piece.material?.pricePerSlab ?? new Decimal(0);
      const pricePerSqm = piece.material?.pricePerSquareMetre 
        ?? piece.material?.pricePerSqm 
        ?? new Decimal(0);

      // Calculate effective rate
      const effectiveRate = slabPrice.greaterThan(0) && this.slabCount! > 0
        ? slabPrice.times(this.slabCount!).dividedBy(
            pieces.reduce((sum, p) => sum + this.calculateArea(p.lengthMm, p.widthMm).toNumber(), 0)
          )
        : pricePerSqm;

      const totalCost = areaSqm.times(effectiveRate);

      return this.createPieceCost(
        piece.pieceId,
        areaSqm,
        totalCost,
        false,
        effectiveRate
      );
    });

    const result = this.aggregateResults(pieceCosts, 'PER_SLAB');
    result.slabCount = this.slabCount;
    
    return result;
  }

  /**
   * Strategy 4: Charge for whole slabs but credit back usable remnants
   * Example: Pay for 2 slabs, but get credit for 0.3 slab worth of usable remnant
   * Best for: Builders who can use remnants on other projects
   */
  private calculatePerWholeSlabWithRemnantCredit(pieces: MaterialInput[]): MaterialCalculation {
    // First calculate as whole slabs
    const baseCalculation = this.calculatePerWholeSlab(pieces);
    
    if (!this.trackRemnants || this.wastageConfig.remnantCreditPercent <= 0) {
      return baseCalculation;
    }

    // Calculate remnant value
    const remnants = this.calculateRemnants(pieces);
    const remnantCredit = remnants.totalValue
      .times(this.wastageConfig.remnantCreditPercent)
      .dividedBy(100);

    // Apply credit to total
    const adjustedSubtotal = baseCalculation.subtotal.minus(remnantCredit);
    const adjustedTotal = baseCalculation.total.minus(remnantCredit);

    return {
      ...baseCalculation,
      subtotal: this.round(adjustedSubtotal),
      total: this.round(adjustedTotal),
    };
  }

  // ============================================================================
  // Remnant Calculation
  // ============================================================================

  private calculateRemnants(pieces: MaterialInput[]): RemnantCalculation {
    // This is a simplified remnant calculation
    // In production, this would use the slab optimizer to determine actual remnants
    
    let totalRemnantAreaSqm = new Decimal(0);
    const remnantPieces: RemnantPiece[] = [];

    for (const piece of pieces) {
      const pieceArea = this.calculateArea(piece.lengthMm, piece.widthMm);
      const slabArea = new Decimal(2.5); // Approximate average slab area
      
      // Simple estimation: if piece is < 50% of slab, remainder might be usable
      if (pieceArea.lessThan(slabArea.times(0.5))) {
        const remnantArea = slabArea.minus(pieceArea);
        
        if (remnantArea.greaterThanOrEqualTo(this.wastageConfig.minimumRemnantSizeSqm)) {
          totalRemnantAreaSqm = totalRemnantAreaSqm.plus(remnantArea);
          remnantPieces.push({
            pieceId: piece.pieceId,
            remnantAreaSqm: remnantArea,
            isUsable: true,
          });
        }
      }
    }

    const pricePerSqm = pieces[0]?.material?.pricePerSqm ?? new Decimal(0);
    const totalValue = totalRemnantAreaSqm.times(pricePerSqm);

    return {
      remnantPieces,
      totalRemnantAreaSqm,
      totalValue,
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private calculateArea(lengthMm: number, widthMm: number): Decimal {
    return new Decimal(lengthMm * widthMm).dividedBy(SQMM_TO_SQM);
  }

  private applyMinimumCharge(cost: Decimal): Decimal {
    const minArea = this.wastageConfig.minimumChargeableAreaSqm;
    if (minArea <= 0) return cost;

    // Get price per sqm from cost (we'd need to pass this through in production)
    // This is simplified
    return cost;
  }

  private createPieceCost(
    pieceId: PieceId,
    areaSqm: Decimal,
    totalCost: Decimal,
    isOverride: boolean,
    unitCost?: Decimal,
    adjustedArea?: Decimal
  ): PieceMaterialCost {
    return {
      pieceId,
      areaSqm: this.round(areaSqm),
      strategy: 'PER_SQUARE_METRE',
      unitCost: unitCost ?? (areaSqm.greaterThan(0) ? totalCost.dividedBy(areaSqm) : new Decimal(0)),
      totalCost: this.round(totalCost),
      isOverride,
    };
  }

  private aggregateResults(
    pieceCosts: PieceMaterialCost[],
    strategy: MaterialPricingBasis
  ): MaterialCalculation {
    const totalAreaSqm = pieceCosts.reduce(
      (sum, p) => sum.plus(p.areaSqm),
      new Decimal(0)
    );

    const subtotal = pieceCosts.reduce(
      (sum, p) => sum.plus(p.totalCost),
      new Decimal(0)
    );

    const unitCost = totalAreaSqm.greaterThan(0)
      ? subtotal.dividedBy(totalAreaSqm)
      : new Decimal(0);

    return {
      strategy,
      pieces: pieceCosts,
      slabCount: this.slabCount ?? 0,
      totalAreaSqm: this.round(totalAreaSqm),
      unitCost: this.round(unitCost),
      wasteFactor: this.wastageConfig.standardWastagePercent / 100,
      subtotal: this.round(subtotal),
      discount: new Decimal(0),
      total: this.round(subtotal),
    };
  }

  private estimateSlabCount(pieces: MaterialInput[]): number {
    // Simple estimation - in production would use optimizer
    const totalArea = pieces.reduce(
      (sum, p) => sum + (p.lengthMm * p.widthMm) / SQMM_TO_SQM,
      0
    );
    return Math.ceil(totalArea / 2.5); // Assume 2.5 m² per slab
  }

  private round(value: Decimal): Decimal {
    return new Decimal(value.toFixed(2));
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Estimate slabs needed for material planning
   */
  estimateSlabs(
    pieces: Array<{ lengthMm: number; widthMm: number }>,
    materialCategory: string
  ): SlabEstimate {
    const slabSize = getSlabSize(materialCategory);
    const slabArea = new Decimal(slabSize.lengthMm * slabSize.widthMm).dividedBy(SQMM_TO_SQM);
    
    const totalPieceArea = pieces.reduce(
      (sum, p) => sum.plus(this.calculateArea(p.lengthMm, p.widthMm)),
      new Decimal(0)
    );

    // Apply wastage
    const wastageMultiplier = 1 + (this.wastageConfig.standardWastagePercent / 100);
    const effectiveArea = totalPieceArea.times(wastageMultiplier);
    
    const estimatedSlabs = Math.ceil(effectiveArea.dividedBy(slabArea).toNumber());

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
      totalAreaSqm: this.round(usedArea),
      utilizationPercent: Math.round(utilizationPercent * 10) / 10,
    };
  }

  /**
   * Generate wastage report for customer transparency
   */
  generateWastageReport(pieces: MaterialInput[]): WastageReport {
    const totalPieceArea = pieces.reduce(
      (sum, p) => sum.plus(this.calculateArea(p.lengthMm, p.widthMm)),
      new Decimal(0)
    );

    const wastageMultiplier = 1 + (this.wastageConfig.standardWastagePercent / 100);
    const adjustedArea = totalPieceArea.times(wastageMultiplier);
    const wastageArea = adjustedArea.minus(totalPieceArea);

    return {
      pieceAreaSqm: this.round(totalPieceArea),
      wastagePercent: this.wastageConfig.standardWastagePercent,
      wastageAreaSqm: this.round(wastageArea),
      totalChargeableAreaSqm: this.round(adjustedArea),
      strategy: this.pricingStrategy,
      explanation: this.getWastageExplanation(),
    };
  }

  private getWastageExplanation(): string {
    switch (this.pricingStrategy) {
      case 'PER_SQUARE_METER_USED':
        return 'You are charged only for the exact material used in your pieces.';
      case 'PER_SQUARE_METER_WITH_WASTAGE':
        return `A ${this.wastageConfig.standardWastagePercent}% wastage factor is applied to account for cutting losses and slab optimization.`;
      case 'PER_WHOLE_SLAB':
        return 'You are charged for complete slabs. Unused portions remain the property of the fabricator.';
      case 'PER_WHOLE_SLAB_WITH_REMNANT_CREDIT':
        return `You are charged for complete slabs. Usable remnants over ${this.wastageConfig.minimumRemnantSizeSqm}m² receive a ${this.wastageConfig.remnantCreditPercent}% credit.`;
      default:
        return '';
    }
  }
}

// ============================================================================
// Supporting Types
// ============================================================================

interface RemnantCalculation {
  remnantPieces: RemnantPiece[];
  totalRemnantAreaSqm: Decimal;
  totalValue: Decimal;
}

interface RemnantPiece {
  pieceId: PieceId;
  remnantAreaSqm: Decimal;
  isUsable: boolean;
}

export interface WastageReport {
  pieceAreaSqm: Decimal;
  wastagePercent: number;
  wastageAreaSqm: Decimal;
  totalChargeableAreaSqm: Decimal;
  strategy: MaterialPricingStrategy;
  explanation: string;
}

// ============================================================================
// Factory
// ============================================================================

export function createMaterialCalculator(
  companyConfig: CompanyPricingConfig,
  options?: { slabCount?: number }
): EnhancedMaterialCalculator {
  return new EnhancedMaterialCalculator({
    pricingStrategy: companyConfig.materialPricingStrategy,
    wastageConfig: companyConfig.wastageConfig,
    slabCount: options?.slabCount,
    trackRemnants: companyConfig.wastageConfig.trackRemnants,
  });
}
