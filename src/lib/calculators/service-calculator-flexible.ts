/**
 * Flexible Service Calculator
 * 
 * Supports multiple measurement units for each service type:
 * - Cutting: LINEAR_METER, SQUARE_METER, FIXED_PER_PIECE
 * - Polishing: LINEAR_METER, SQUARE_METER, FIXED_PER_PIECE
 * - Installation: SQUARE_METER, LINEAR_METER, FIXED_PER_PIECE, HOURLY
 * - Templating: FIXED, PER_KILOMETER, SQUARE_METER
 * - Delivery: FIXED_ZONE, PER_KILOMETER, WEIGHT_BASED
 */

import { Decimal } from '@prisma/client/runtime/library';
import {
  ServiceType,
  ServiceCalculation,
  ServiceItem,
  PieceEdgeConfig,
} from './types';
import { ServiceUnitConfig } from '../saas/subscription';

// ============================================================================
// Types
// ============================================================================

export type ServiceUnit = 
  | 'LINEAR_METER'
  | 'SQUARE_METER'
  | 'FIXED'
  | 'FIXED_PER_PIECE'
  | 'HOURLY'
  | 'PER_KILOMETER'
  | 'FIXED_ZONE'
  | 'WEIGHT_BASED';

interface ServiceRate {
  serviceType: ServiceType;
  name: string;
  rate20mm: Decimal;
  rate40mm: Decimal;
  minimumCharge?: Decimal;
}

interface PieceInput {
  pieceId: string;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  edges: Partial<Record<'top' | 'bottom' | 'left' | 'right', string | null>>;
  weightKg?: number;
}

interface ServiceCalculationOptions {
  serviceUnits: ServiceUnitConfig;
  serviceRates: ServiceRate[];
  fabricationDiscountPercent?: number;
  taxRate?: Decimal;
}

interface DistanceCalculation {
  distanceKm: Decimal;
  zoneId?: string;
  zoneName?: string;
}

// ============================================================================
// Calculator Class
// ============================================================================

export class FlexibleServiceCalculator {
  private options: ServiceCalculationOptions;
  private rateMap: Map<ServiceType, ServiceRate>;

  constructor(options: ServiceCalculationOptions) {
    this.options = options;
    this.rateMap = new Map(options.serviceRates.map(r => [r.serviceType, r]));
  }

  /**
   * Calculate all services for a set of pieces
   */
  calculate(pieces: PieceInput[]): ServiceCalculation {
    const items: ServiceItem[] = [];

    // Cutting
    const cuttingItem = this.calculateCutting(pieces);
    if (cuttingItem) items.push(cuttingItem);

    // Polishing
    const polishingItem = this.calculatePolishing(pieces);
    if (polishingItem) items.push(polishingItem);

    // Installation
    const installationItem = this.calculateInstallation(pieces);
    if (installationItem) items.push(installationItem);

    // Waterfall ends
    const waterfallItem = this.calculateWaterfallEnds(pieces);
    if (waterfallItem) items.push(waterfallItem);

    // Joins (for oversized pieces)
    const joinItem = this.calculateJoins(pieces);
    if (joinItem) items.push(joinItem);

    const subtotal = items.reduce((sum, item) => sum.plus(item.subtotal), new Decimal(0));
    const discount = subtotal.times(this.options.fabricationDiscountPercent ?? 0).dividedBy(100);
    const total = subtotal.minus(discount);

    return {
      items,
      subtotal: this.round(subtotal),
      discount: this.round(discount),
      total: this.round(total),
    };
  }

  /**
   * Calculate templating cost
   */
  calculateTemplating(distanceKm: Decimal): ServiceItem | null {
    const unit = this.options.serviceUnits.templating;
    const rate = this.rateMap.get('TEMPLATING');

    if (!rate) return null;

    let quantity: Decimal;
    let unitLabel: string;
    let ratePerUnit: Decimal;

    switch (unit) {
      case 'FIXED':
        quantity = new Decimal(1);
        unitLabel = 'Fixed';
        ratePerUnit = rate.rate20mm;
        break;
      
      case 'PER_KILOMETER':
        quantity = distanceKm;
        unitLabel = 'km';
        ratePerUnit = rate.rate20mm;
        break;
      
      case 'SQUARE_METER':
        // Would need total area passed in
        return null;
      
      default:
        quantity = new Decimal(1);
        unitLabel = 'Fixed';
        ratePerUnit = rate.rate20mm;
    }

    let subtotal = quantity.times(ratePerUnit);
    subtotal = this.applyMinimumCharge(subtotal, rate);

    return this.createServiceItem('TEMPLATING', rate.name, quantity, unitLabel, ratePerUnit, subtotal);
  }

  /**
   * Calculate delivery cost
   */
  calculateDelivery(
    distanceKm: Decimal,
    weightKg?: Decimal,
    zoneId?: string
  ): ServiceItem | null {
    const unit = this.options.serviceUnits.delivery;
    const rate = this.rateMap.get('DELIVERY');

    if (!rate) return null;

    let quantity: Decimal;
    let unitLabel: string;
    let ratePerUnit: Decimal;

    switch (unit) {
      case 'FIXED_ZONE':
        quantity = new Decimal(1);
        unitLabel = zoneId || 'Zone';
        ratePerUnit = rate.rate20mm;
        break;
      
      case 'PER_KILOMETER':
        quantity = distanceKm;
        unitLabel = 'km';
        ratePerUnit = rate.rate20mm;
        break;
      
      case 'WEIGHT_BASED':
        quantity = weightKg ?? new Decimal(0);
        unitLabel = 'kg';
        ratePerUnit = rate.rate20mm;
        break;
      
      default:
        quantity = distanceKm;
        unitLabel = 'km';
        ratePerUnit = rate.rate20mm;
    }

    let subtotal = quantity.times(ratePerUnit);
    subtotal = this.applyMinimumCharge(subtotal, rate);

    return this.createServiceItem('DELIVERY', rate.name, quantity, unitLabel, ratePerUnit, subtotal);
  }

  // ============================================================================
  // Individual Service Calculations
  // ============================================================================

  private calculateCutting(pieces: PieceInput[]): ServiceItem | null {
    const unit = this.options.serviceUnits.cutting;
    const rate = this.rateMap.get('CUTTING');

    if (!rate) return null;

    let totalQuantity = new Decimal(0);
    let weightedRate = new Decimal(0);

    for (const piece of pieces) {
      const pieceRate = this.selectRateByThickness(rate, piece.thicknessMm);
      let quantity: Decimal;

      switch (unit) {
        case 'LINEAR_METER':
          // Perimeter
          quantity = new Decimal(2 * (piece.lengthMm + piece.widthMm)).dividedBy(1000);
          break;
        
        case 'SQUARE_METER':
          // Area
          quantity = new Decimal(piece.lengthMm * piece.widthMm).dividedBy(1_000_000);
          break;
        
        case 'FIXED_PER_PIECE':
          quantity = new Decimal(1);
          break;
        
        default:
          quantity = new Decimal(2 * (piece.lengthMm + piece.widthMm)).dividedBy(1000);
      }

      totalQuantity = totalQuantity.plus(quantity);
      weightedRate = weightedRate.plus(pieceRate.times(quantity));
    }

    const effectiveRate = totalQuantity.greaterThan(0)
      ? weightedRate.dividedBy(totalQuantity)
      : rate.rate20mm;

    let subtotal = totalQuantity.times(effectiveRate);
    subtotal = this.applyMinimumCharge(subtotal, rate);

    return this.createServiceItem(
      'CUTTING',
      rate.name,
      this.round(totalQuantity),
      this.getUnitLabel(unit),
      this.round(effectiveRate),
      subtotal
    );
  }

  private calculatePolishing(pieces: PieceInput[]): ServiceItem | null {
    const unit = this.options.serviceUnits.polishing;
    const rate = this.rateMap.get('POLISHING');

    if (!rate) return null;

    let totalQuantity = new Decimal(0);
    let weightedRate = new Decimal(0);

    for (const piece of pieces) {
      const pieceRate = this.selectRateByThickness(rate, piece.thicknessMm);
      let quantity: Decimal;

      switch (unit) {
        case 'LINEAR_METER':
          // Only finished edges
          quantity = this.calculateFinishedEdgeLength(piece);
          break;
        
        case 'SQUARE_METER':
          // Area
          quantity = new Decimal(piece.lengthMm * piece.widthMm).dividedBy(1_000_000);
          break;
        
        case 'FIXED_PER_PIECE':
          quantity = new Decimal(1);
          break;
        
        default:
          quantity = this.calculateFinishedEdgeLength(piece);
      }

      totalQuantity = totalQuantity.plus(quantity);
      weightedRate = weightedRate.plus(pieceRate.times(quantity));
    }

    const effectiveRate = totalQuantity.greaterThan(0)
      ? weightedRate.dividedBy(totalQuantity)
      : rate.rate20mm;

    let subtotal = totalQuantity.times(effectiveRate);
    subtotal = this.applyMinimumCharge(subtotal, rate);

    return this.createServiceItem(
      'POLISHING',
      rate.name,
      this.round(totalQuantity),
      this.getUnitLabel(unit),
      this.round(effectiveRate),
      subtotal
    );
  }

  private calculateInstallation(pieces: PieceInput[]): ServiceItem | null {
    const unit = this.options.serviceUnits.installation;
    const rate = this.rateMap.get('INSTALLATION');

    if (!rate) return null;

    let totalQuantity = new Decimal(0);
    let weightedRate = new Decimal(0);

    for (const piece of pieces) {
      const pieceRate = this.selectRateByThickness(rate, piece.thicknessMm);
      let quantity: Decimal;

      switch (unit) {
        case 'SQUARE_METER':
          quantity = new Decimal(piece.lengthMm * piece.widthMm).dividedBy(1_000_000);
          break;
        
        case 'LINEAR_METER':
          // Running meter (length only)
          quantity = new Decimal(piece.lengthMm).dividedBy(1000);
          break;
        
        case 'FIXED_PER_PIECE':
          quantity = new Decimal(1);
          break;
        
        case 'HOURLY':
          // Estimate hours based on complexity
          const areaSqm = (piece.lengthMm * piece.widthMm) / 1_000_000;
          quantity = new Decimal(areaSqm * 0.5); // 30 mins per m² as rough estimate
          break;
        
        default:
          quantity = new Decimal(piece.lengthMm * piece.widthMm).dividedBy(1_000_000);
      }

      totalQuantity = totalQuantity.plus(quantity);
      weightedRate = weightedRate.plus(pieceRate.times(quantity));
    }

    const effectiveRate = totalQuantity.greaterThan(0)
      ? weightedRate.dividedBy(totalQuantity)
      : rate.rate20mm;

    let subtotal = totalQuantity.times(effectiveRate);
    subtotal = this.applyMinimumCharge(subtotal, rate);

    return this.createServiceItem(
      'INSTALLATION',
      rate.name,
      this.round(totalQuantity),
      this.getUnitLabel(unit),
      this.round(effectiveRate),
      subtotal
    );
  }

  private calculateWaterfallEnds(pieces: PieceInput[]): ServiceItem | null {
    const rate = this.rateMap.get('WATERFALL_END');
    if (!rate) return null;

    // Count pieces with waterfall edges
    let waterfallCount = 0;

    for (const piece of pieces) {
      // Check if any edge is a waterfall type
      const hasWaterfall = Object.values(piece.edges).some(
        edge => edge && (edge.includes('WATERFALL') || edge.includes('waterfall'))
      );
      if (hasWaterfall) waterfallCount++;
    }

    if (waterfallCount === 0) return null;

    const quantity = new Decimal(waterfallCount);
    const avgThickness = pieces.reduce((sum, p) => sum + p.thicknessMm, 0) / pieces.length;
    const ratePerUnit = this.selectRateByThickness(rate, avgThickness);

    const subtotal = quantity.times(ratePerUnit);

    return this.createServiceItem(
      'WATERFALL_END',
      rate.name,
      quantity,
      'each',
      ratePerUnit,
      subtotal
    );
  }

  private calculateJoins(pieces: PieceInput[]): ServiceItem | null {
    const rate = this.rateMap.get('JOIN');
    if (!rate) return null;

    // This would integrate with the slab optimizer
    // For now, simplified calculation
    let totalJoinLengthMm = 0;

    for (const piece of pieces) {
      const maxDimension = Math.max(piece.lengthMm, piece.widthMm);
      const typicalSlabLength = 3200;
      
      if (maxDimension > typicalSlabLength) {
        // Estimate joins needed
        const joinsNeeded = Math.ceil(maxDimension / typicalSlabLength) - 1;
        const joinLength = Math.min(piece.lengthMm, piece.widthMm);
        totalJoinLengthMm += joinsNeeded * joinLength;
      }
    }

    if (totalJoinLengthMm === 0) return null;

    const quantity = new Decimal(totalJoinLengthMm).dividedBy(1000); // Convert to meters
    const avgThickness = pieces.reduce((sum, p) => sum + p.thicknessMm, 0) / pieces.length;
    const ratePerMeter = this.selectRateByThickness(rate, avgThickness);

    const subtotal = quantity.times(ratePerMeter);

    return this.createServiceItem(
      'JOIN',
      'Join Seams',
      this.round(quantity),
      'linear m',
      ratePerMeter,
      subtotal
    );
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private selectRateByThickness(rate: ServiceRate, thicknessMm: number): Decimal {
    return thicknessMm <= 20 ? rate.rate20mm : rate.rate40mm;
  }

  private calculateFinishedEdgeLength(piece: PieceInput): Decimal {
    let lengthMm = 0;
    
    if (piece.edges.top) lengthMm += piece.widthMm;
    if (piece.edges.bottom) lengthMm += piece.widthMm;
    if (piece.edges.left) lengthMm += piece.lengthMm;
    if (piece.edges.right) lengthMm += piece.lengthMm;

    return new Decimal(lengthMm).dividedBy(1000);
  }

  private applyMinimumCharge(cost: Decimal, rate: ServiceRate): Decimal {
    if (!rate.minimumCharge) return cost;
    return Decimal.max(cost, rate.minimumCharge);
  }

  private getUnitLabel(unit: string): string {
    const labels: Record<string, string> = {
      'LINEAR_METER': 'linear m',
      'SQUARE_METER': 'm²',
      'FIXED': 'fixed',
      'FIXED_PER_PIECE': 'piece',
      'HOURLY': 'hours',
      'PER_KILOMETER': 'km',
      'FIXED_ZONE': 'zone',
      'WEIGHT_BASED': 'kg',
    };
    return labels[unit] || unit;
  }

  private createServiceItem(
    serviceType: ServiceType,
    name: string,
    quantity: Decimal,
    unit: string,
    rate: Decimal,
    subtotal: Decimal
  ): ServiceItem {
    const discount = subtotal.times(this.options.fabricationDiscountPercent ?? 0).dividedBy(100);
    
    return {
      serviceType,
      name,
      quantity: this.round(quantity),
      unit,
      rate: this.round(rate),
      subtotal: this.round(subtotal),
      discount: this.round(discount),
      total: this.round(subtotal.minus(discount)),
    };
  }

  private round(value: Decimal): Decimal {
    return new Decimal(value.toFixed(2));
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createServiceCalculator(
  serviceUnits: ServiceUnitConfig,
  serviceRates: ServiceRate[],
  options?: { fabricationDiscountPercent?: number }
): FlexibleServiceCalculator {
  return new FlexibleServiceCalculator({
    serviceUnits,
    serviceRates,
    fabricationDiscountPercent: options?.fabricationDiscountPercent,
  });
}

// ============================================================================
// Configuration Helpers
// ============================================================================

export const ServiceUnitOptions = {
  cutting: [
    { value: 'LINEAR_METER', label: 'Perimeter (Linear Meters)', description: 'Charge by total edge length' },
    { value: 'SQUARE_METER', label: 'Area (Square Meters)', description: 'Charge by piece area' },
    { value: 'FIXED_PER_PIECE', label: 'Per Piece', description: 'Fixed price per piece' },
  ],
  
  polishing: [
    { value: 'LINEAR_METER', label: 'Finished Edges (Linear Meters)', description: 'Charge by polished edge length' },
    { value: 'SQUARE_METER', label: 'Area (Square Meters)', description: 'Charge by piece area' },
    { value: 'FIXED_PER_PIECE', label: 'Per Piece', description: 'Fixed price per piece' },
  ],
  
  installation: [
    { value: 'SQUARE_METER', label: 'Area (Square Meters)', description: 'Charge by installed area' },
    { value: 'LINEAR_METER', label: 'Running Meter', description: 'Charge by length' },
    { value: 'FIXED_PER_PIECE', label: 'Per Piece', description: 'Fixed price per piece' },
    { value: 'HOURLY', label: 'Hourly Rate', description: 'Time-based billing' },
  ],
  
  templating: [
    { value: 'FIXED', label: 'Fixed Rate', description: 'Standard templating fee' },
    { value: 'PER_KILOMETER', label: 'Distance Based', description: 'Charge by travel distance' },
    { value: 'SQUARE_METER', label: 'Area Based', description: 'Charge by templated area' },
  ],
  
  delivery: [
    { value: 'FIXED_ZONE', label: 'Zone Based', description: 'Fixed rate per zone' },
    { value: 'PER_KILOMETER', label: 'Distance Based', description: 'Charge by km' },
    { value: 'WEIGHT_BASED', label: 'Weight Based', description: 'Charge by total weight' },
  ],
};
