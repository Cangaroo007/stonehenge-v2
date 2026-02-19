/**
 * Unit Block Calculator
 * 
 * Handles calculations for multi-unit developments (apartments, townhouses).
 * Supports volume-based pricing tiers, phased delivery, and consolidated billing.
 */

import { Decimal } from '@prisma/client/runtime/library';
import {
  UnitBlockCalculation,
  UnitCalculation,
  VolumeTier,
  VolumeDiscount,
  ProjectPhase,
  ProjectType,
  QuoteCalculation,
} from './types';
import { QuoteCalculator } from './index';

// ============================================================================
// Types
// ============================================================================

interface UnitBlockOptions {
  projectId: string;
  projectType: ProjectType;
  unitQuoteIds: string[];
  phases?: ProjectPhaseInput[];
  pricingTierOverrides?: VolumeTierOverride[];
}

interface ProjectPhaseInput {
  name: string;
  unitIndices: number[]; // Indices into unitQuoteIds array
  scheduledStartDate?: Date;
  scheduledEndDate?: Date;
}

interface VolumeTierOverride {
  minSquareMeters: number;
  maxSquareMeters: number | null;
  discountPercent: number;
}

interface UnitQuoteData {
  unitId: string;
  unitNumber: string;
  floor?: number;
  building?: string;
  quoteId: string;
}

// ============================================================================
// Volume Tier Configuration
// ============================================================================

const DEFAULT_VOLUME_TIERS: VolumeTier[] = [
  {
    tierId: 'small',
    name: 'Small Project',
    minSquareMeters: new Decimal(0),
    maxSquareMeters: new Decimal(50),
    discountPercent: new Decimal(0),
  },
  {
    tierId: 'medium',
    name: 'Medium Project',
    minSquareMeters: new Decimal(50),
    maxSquareMeters: new Decimal(200),
    discountPercent: new Decimal(5),
  },
  {
    tierId: 'large',
    name: 'Large Project',
    minSquareMeters: new Decimal(200),
    maxSquareMeters: new Decimal(500),
    discountPercent: new Decimal(10),
  },
  {
    tierId: 'enterprise',
    name: 'Enterprise',
    minSquareMeters: new Decimal(500),
    maxSquareMeters: null,
    discountPercent: new Decimal(15),
  },
];

// ============================================================================
// Calculator Class
// ============================================================================

export class UnitBlockCalculator {
  private options: UnitBlockOptions;
  private volumeTiers: VolumeTier[];

  constructor(options: UnitBlockOptions) {
    this.options = options;
    this.volumeTiers = DEFAULT_VOLUME_TIERS;
  }

  /**
   * Set custom volume tiers (e.g., from database configuration)
   */
  setVolumeTiers(tiers: VolumeTier[]): void {
    this.volumeTiers = tiers;
  }

  /**
   * Calculate complete unit block pricing
   */
  async calculate(): Promise<UnitBlockCalculation> {
    // Calculate each unit's quote
    const unitCalculations: UnitCalculation[] = [];
    const quoteCalculations: QuoteCalculation[] = [];

    for (let i = 0; i < this.options.unitQuoteIds.length; i++) {
      const quoteId = this.options.unitQuoteIds[i];
      const unitData = await this.getUnitData(i);

      const calculator = await QuoteCalculator.create(quoteId);
      const quoteCalc = await calculator.calculate();

      unitCalculations.push({
        unitId: unitData.unitId,
        unitNumber: unitData.unitNumber,
        quoteId: quoteId as any,
        areaSqm: quoteCalc.materials.totalAreaSqm,
        subtotal: quoteCalc.subtotal,
      });

      quoteCalculations.push(quoteCalc);
    }

    // Determine volume tier
    const totalArea = unitCalculations.reduce(
      (sum, u) => sum.plus(u.areaSqm),
      new Decimal(0)
    );

    const volumeTier = this.determineVolumeTier(totalArea);

    // Calculate volume discounts
    const volumeDiscounts = this.calculateVolumeDiscounts(
      volumeTier,
      quoteCalculations
    );

    // Calculate phased delivery if specified
    const phases = this.options.phases 
      ? this.buildPhases(unitCalculations)
      : undefined;

    // Calculate aggregates
    const subtotal = unitCalculations.reduce(
      (sum, u) => sum.plus(u.subtotal),
      new Decimal(0)
    );

    const volumeDiscountTotal = volumeDiscounts.reduce(
      (sum, d) => sum.plus(d.amount),
      new Decimal(0)
    );

    return {
      projectId: this.options.projectId,
      projectType: this.options.projectType,
      units: unitCalculations,
      volumeTier,
      volumeDiscounts,
      phases,
      aggregate: {
        totalAreaSqm: this.round(totalArea),
        totalSlabs: quoteCalculations.reduce(
          (sum, q) => sum + q.materials.slabCount,
          0
        ),
        subtotal: this.round(subtotal),
        volumeDiscountTotal: this.round(volumeDiscountTotal),
        grandTotal: this.round(subtotal.minus(volumeDiscountTotal)),
      },
    };
  }

  /**
   * Calculate consolidated material order for entire project
   * This optimizes slab ordering across all units
   */
  async calculateConsolidatedMaterials(): Promise<ConsolidatedMaterialsResult> {
    const unitCalc = await this.calculate();

    // Group by material type
    const materialGroups = new Map<string, MaterialGroup>();

    for (const unit of unitCalc.units) {
      const calculator = await QuoteCalculator.create(unit.quoteId as string);
      // Access internal data to get material breakdown
      // This would need to be exposed from QuoteCalculator
    }

    // Calculate optimal slab order across all units
    const totalSlabs = unitCalc.aggregate.totalSlabs;
    const volumeDiscount = unitCalc.volumeDiscounts.find(
      d => d.appliesTo === 'MATERIAL'
    );

    return {
      totalSlabs,
      estimatedSavings: volumeDiscount?.amount || new Decimal(0),
      recommendation: totalSlabs > 20 
        ? 'Order all slabs together for maximum volume discount'
        : 'Standard ordering process',
    };
  }

  /**
   * Generate phased installation schedule
   */
  generatePhasedSchedule(phases: ProjectPhase[]): PhasedScheduleResult {
    const schedule: PhaseSchedule[] = [];
    let cumulativeStartDate = new Date();

    for (const phase of phases) {
      const phaseUnits = phase.units.length;
      const estimatedDays = phaseUnits * 2; // 2 days per unit

      const endDate = new Date(cumulativeStartDate);
      endDate.setDate(endDate.getDate() + estimatedDays);

      schedule.push({
        phaseId: phase.phaseId,
        phaseName: phase.name,
        unitCount: phaseUnits,
        unitIds: phase.units,
        startDate: new Date(cumulativeStartDate),
        endDate,
        estimatedDays,
      });

      cumulativeStartDate = new Date(endDate);
      cumulativeStartDate.setDate(cumulativeStartDate.getDate() + 1); // Gap between phases
    }

    return {
      phases: schedule,
      totalDurationDays: schedule.reduce((sum, p) => sum + p.estimatedDays, 0),
      completionDate: schedule[schedule.length - 1]?.endDate || new Date(),
    };
  }

  /**
   * Compare per-unit pricing vs project-level pricing
   */
  async comparePricingModels(): Promise<PricingComparison> {
    const unitCalc = await this.calculate();

    // Calculate what it would cost as individual quotes (no volume discounts)
    const individualTotal = unitCalc.aggregate.subtotal;
    
    // Calculate with volume discounts
    const projectTotal = unitCalc.aggregate.grandTotal;
    
    const savings = individualTotal.minus(projectTotal);
    const savingsPercent = savings.dividedBy(individualTotal).times(100);

    return {
      individualTotal: this.round(individualTotal),
      projectTotal: this.round(projectTotal),
      savings: this.round(savings),
      savingsPercent: this.round(savingsPercent),
      recommended: projectTotal.lessThan(individualTotal) ? 'PROJECT' : 'INDIVIDUAL',
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async getUnitData(index: number): Promise<UnitQuoteData> {
    // In production, this would fetch from database
    return {
      unitId: `unit-${index}`,
      unitNumber: `Unit ${index + 1}`,
      quoteId: this.options.unitQuoteIds[index],
    };
  }

  private determineVolumeTier(totalAreaSqm: Decimal): VolumeTier {
    for (const tier of this.volumeTiers) {
      const min = tier.minSquareMeters;
      const max = tier.maxSquareMeters;

      const aboveMin = totalAreaSqm.greaterThanOrEqualTo(min);
      const belowMax = max === null || totalAreaSqm.lessThan(max);

      if (aboveMin && belowMax) {
        return tier;
      }
    }

    return this.volumeTiers[this.volumeTiers.length - 1];
  }

  private calculateVolumeDiscounts(
    tier: VolumeTier,
    quoteCalculations: QuoteCalculation[]
  ): VolumeDiscount[] {
    const discounts: VolumeDiscount[] = [];

    // Material discount
    const materialTotal = quoteCalculations.reduce(
      (sum, q) => sum.plus(q.materials.total),
      new Decimal(0)
    );

    const materialDiscount = materialTotal
      .times(tier.discountPercent)
      .dividedBy(100);

    discounts.push({
      tierId: tier.tierId,
      appliesTo: 'MATERIAL',
      discountPercent: tier.discountPercent,
      amount: this.round(materialDiscount),
    });

    // Fabrication discount (applied to edges + cutouts + services)
    const fabricationTotal = quoteCalculations.reduce(
      (sum, q) => sum.plus(q.edges.total).plus(q.cutouts.total).plus(q.services.total),
      new Decimal(0)
    );

    const fabricationDiscount = fabricationTotal
      .times(tier.discountPercent)
      .dividedBy(100);

    discounts.push({
      tierId: tier.tierId,
      appliesTo: 'FABRICATION',
      discountPercent: tier.discountPercent,
      amount: this.round(fabricationDiscount),
    });

    return discounts;
  }

  private buildPhases(unitCalculations: UnitCalculation[]): ProjectPhase[] {
    if (!this.options.phases) return [];

    return this.options.phases.map((phase, index) => ({
      phaseId: `phase-${index}`,
      name: phase.name,
      units: phase.unitIndices.map(i => unitCalculations[i]?.unitId || ''),
    }));
  }

  private round(value: Decimal): Decimal {
    return new Decimal(value.toFixed(2));
  }
}

// ============================================================================
// Result Types
// ============================================================================

interface ConsolidatedMaterialsResult {
  totalSlabs: number;
  estimatedSavings: Decimal;
  recommendation: string;
}

interface PhasedScheduleResult {
  phases: PhaseSchedule[];
  totalDurationDays: number;
  completionDate: Date;
}

interface PhaseSchedule {
  phaseId: string;
  phaseName: string;
  unitCount: number;
  unitIds: string[];
  startDate: Date;
  endDate: Date;
  estimatedDays: number;
}

interface PricingComparison {
  individualTotal: Decimal;
  projectTotal: Decimal;
  savings: Decimal;
  savingsPercent: Decimal;
  recommended: 'PROJECT' | 'INDIVIDUAL';
}

interface MaterialGroup {
  materialId: string;
  totalAreaSqm: Decimal;
  unitCount: number;
}

// ============================================================================
// Factory
// ============================================================================

export function createUnitBlockCalculator(
  options: UnitBlockOptions
): UnitBlockCalculator {
  return new UnitBlockCalculator(options);
}
