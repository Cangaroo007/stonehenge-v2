/**
 * Pricing Calculation Types
 * Types for the quote pricing calculation service
 */

import type { MaterialPricingBasis, ServiceUnit } from '@prisma/client';

export interface PricingOptions {
  customerId?: string;
  priceBookId?: string;
  forceRecalculate?: boolean;
}

export interface PricingContext {
  organisationId: string;
  materialPricingBasis: MaterialPricingBasis;
  cuttingUnit: ServiceUnit;
  polishingUnit: ServiceUnit;
  installationUnit: ServiceUnit;
  currency: string;
  gstRate: number;
  laminatedMultiplier: number;
  mitredMultiplier: number;
  wasteFactorPercent: number;
}

export interface DiscountBreakdown {
  ruleId: string;
  ruleName: string;
  type: 'percentage' | 'fixed' | 'multiplier' | 'price_override';
  value: number;
  appliedTo: 'materials' | 'edges' | 'cutouts' | 'total';
  savings: number;
}

export interface EdgeBreakdown {
  edgeTypeId: string;
  edgeTypeName: string;
  linearMeters: number;
  baseRate: number;
  appliedRate: number;
  subtotal: number;
}

export interface CutoutBreakdown {
  cutoutTypeId: string;
  cutoutTypeName: string;
  quantity: number;
  basePrice: number;
  appliedPrice: number;
  subtotal: number;
}

export interface AppliedRule {
  ruleId: string;
  ruleName: string;
  priority: number;
  effect: string;
}

export interface MaterialBreakdown {
  totalAreaM2: number;
  baseRate: number;
  thicknessMultiplier: number;
  appliedRate: number;
  subtotal: number;
  discount: number;
  total: number;
  pricingBasis: 'PER_SLAB' | 'PER_SQUARE_METRE';
  slabCount?: number;
  slabRate?: number;
  wasteFactorPercent?: number;
  adjustedAreaM2?: number;
}

export interface CalculationResult {
  quoteId: string;
  subtotal: number;
  totalDiscount: number;
  total: number;
  breakdown: {
    materials: MaterialBreakdown;
    edges: {
      totalLinearMeters: number;
      byType: EdgeBreakdown[];
      subtotal: number;
      discount: number;
      total: number;
    };
    cutouts: {
      items: CutoutBreakdown[];
      subtotal: number;
      discount: number;
      total: number;
    };
    delivery?: {
      address: string | null;
      distanceKm: number | null;
      zone: string | null;
      calculatedCost: number | null;
      overrideCost: number | null;
      finalCost: number;
    };
    templating?: {
      required: boolean;
      distanceKm: number | null;
      calculatedCost: number | null;
      overrideCost: number | null;
      finalCost: number;
    };
    pieces?: PiecePricingBreakdown[];
  };
  appliedRules: AppliedRule[];
  discounts: DiscountBreakdown[];
  price_books: { id: string; name: string } | null;
  calculated_at: Date;
}

// ============================================
// PER-PIECE PRICING BREAKDOWN
// ============================================

export interface PiecePricingBreakdown {
  pieceId: number;
  pieceName: string;
  dimensions: {
    lengthMm: number;
    widthMm: number;
    thicknessMm: number;
  };

  fabrication: {
    cutting: {
      quantity: number;
      unit: string;
      rate: number;
      baseAmount: number;
      discount: number;
      total: number;
      discountPercentage: number;
    };
    polishing: {
      quantity: number;
      unit: string;
      rate: number;
      baseAmount: number;
      discount: number;
      total: number;
      discountPercentage: number;
    };
    installation?: {
      quantity: number;
      unit: string;
      rate: number;
      baseAmount: number;
      discount: number;
      total: number;
    };
    lamination?: {
      method: string;
      finishedEdgeLm: number;
      baseRate: number;
      multiplier: number;
      total: number;
    };
    edges: Array<{
      side: 'top' | 'bottom' | 'left' | 'right';
      edgeTypeId: string;
      edgeTypeName: string;
      lengthMm: number;
      linearMeters: number;
      rate: number;
      baseAmount: number;
      discount: number;
      total: number;
      discountPercentage: number;
    }>;
    cutouts: Array<{
      cutoutTypeId: string;
      cutoutTypeName: string;
      quantity: number;
      rate: number;
      baseAmount: number;
      discount: number;
      total: number;
    }>;
    subtotal: number;
  };

  materials?: {
    areaM2: number;
    baseRate: number;
    thicknessMultiplier: number;
    baseAmount: number;
    discount: number;
    total: number;
    discountPercentage: number;
  };

  pieceTotal: number;
}

// Internal types used by the calculation service

export interface QuoteWithDetails {
  id: number;
  customerId: number | null;
  price_book_id: string | null;
  customer: {
    id: number;
    clientTypeId: string | null;
    clientTierId: string | null;
  } | null;
  price_books: {
    id: string;
    name: string;
  } | null;
  rooms: {
    id: number;
    pieces: PieceWithFeatures[];
  }[];
}

export interface PieceWithFeatures {
  id: number;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  materialId: number | null;
  materials: {
    id: number;
    pricePerSqm: { toNumber: () => number };
  } | null;
  piece_features: {
    id: number;
    name: string;
    quantity: number;
    unitPrice: { toNumber: () => number };
    totalPrice: { toNumber: () => number };
  }[];
}

export interface PricingRuleWithOverrides {
  id: string;
  name: string;
  priority: number;
  clientTypeId: string | null;
  clientTierId: string | null;
  customerId: number | null;
  minQuoteValue: { toNumber: () => number } | null;
  maxQuoteValue: { toNumber: () => number } | null;
  thicknessValue: number | null;
  adjustmentType: string;
  adjustmentValue: { toNumber: () => number };
  appliesTo: string;
  isActive: boolean;
  edgeOverrides: {
    id: string;
    edgeTypeId: string;
    customRate: { toNumber: () => number } | null;
    adjustmentType: string | null;
    adjustmentValue: { toNumber: () => number } | null;
  }[];
  cutoutOverrides: {
    id: string;
    cutoutTypeId: string;
    customRate: { toNumber: () => number } | null;
    adjustmentType: string | null;
    adjustmentValue: { toNumber: () => number } | null;
  }[];
  materialOverrides: {
    id: string;
    materialId: number;
    customRate: { toNumber: () => number } | null;
    adjustmentType: string | null;
    adjustmentValue: { toNumber: () => number } | null;
  }[];
}

export interface EdgeTypeWithRate {
  id: string;
  name: string;
  baseRate: { toNumber: () => number };
}

export interface CutoutTypeWithRate {
  id: string;
  name: string;
  baseRate: { toNumber: () => number };
}

export interface ThicknessOptionWithMultiplier {
  id: string;
  value: number;
  multiplier: { toNumber: () => number };
}
