/**
 * Pricing Calculation Types
 * Types for the quote pricing calculation service
 */

import type { MaterialPricingBasis, ServiceUnit, WaterfallPricingMethod } from '@prisma/client';

export interface PricingOptions {
  customerId?: string;
  priceBookId?: string;
  forceRecalculate?: boolean;
  /** Per-quote option material margin adjustment (additive to base margin) */
  materialMarginAdjustPercent?: number;
}

export interface PricingContext {
  pricingSettingsId: string;
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
  grainMatchingSurchargePercent: number;
  cutoutThicknessMultiplier: number;
  waterfallPricingMethod: WaterfallPricingMethod;
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

export interface ServiceBreakdown {
  serviceType: string;
  fabricationCategory?: string;
  name: string;
  quantity: number;
  unit: string;
  rate: number;
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
  /** Material name for display */
  materialName?: string;
  /** Slab dimensions from the material record (mm) */
  slabLengthMm?: number;
  slabWidthMm?: number;
  /** Whether slab count is from optimiser (true) or naive estimate (false) */
  slabCountFromOptimiser?: boolean;
  /** Margin breakdown — present when margin system is active */
  margin?: {
    /** Base margin percent (from material override or supplier default) */
    baseMarginPercent: number;
    /** Per-quote-option adjustment percent */
    adjustmentPercent: number;
    /** Effective margin percent = base + adjustment */
    effectiveMarginPercent: number;
    /** Total cost price before margin */
    costSubtotal: number;
    /** Total margin amount added */
    marginAmount: number;
  };
  /** Per-material breakdowns when multiple materials are used */
  byMaterial?: MaterialGroupBreakdown[];
}

export interface MaterialGroupBreakdown {
  materialId: number;
  materialName: string;
  pricingBasis: 'PER_SLAB' | 'PER_SQUARE_METRE';
  totalAreaM2: number;
  slabCount?: number;
  slabRate?: number;
  slabLengthMm?: number;
  slabWidthMm?: number;
  slabCountFromOptimiser?: boolean;
  wasteFactorPercent?: number;
  adjustedAreaM2?: number;
  ratePerSqm?: number;
  totalCost: number;
  /** Per-material margin data */
  margin?: {
    baseMarginPercent: number;
    adjustmentPercent: number;
    effectiveMarginPercent: number;
    costSubtotal: number;
    marginAmount: number;
  };
}

export interface CalculationResult {
  quoteId: string;
  subtotal: number;
  totalDiscount: number;
  total: number;
  gstRate: number;
  gstAmount: number;
  totalIncGst: number;
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
    services?: {
      items: ServiceBreakdown[];
      subtotal: number;
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
  fabricationCategory?: string;
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

  oversize?: {
    isOversize: boolean;
    joinCount: number;
    joinLengthLm: number;
    joinRate: number;
    joinCost: number;
    grainMatchingSurchargeRate: number;
    fabricationSubtotalBeforeSurcharge: number;
    grainMatchingSurcharge: number;
    strategy: string;
    warnings: string[];
  };

  cornerJoin?: {
    shapeType: string;
    cornerJoins: number;
    joinLengthLm: number;
    joinRate: number;
    joinCost: number;
    grainMatchingSurchargeRate: number;
    grainMatchingSurcharge: number;
  };

  materials?: {
    areaM2: number;
    baseRate: number;
    thicknessMultiplier: number;
    baseAmount: number;
    discount: number;
    total: number;
    discountPercentage: number;
    pricingBasis?: 'PER_SLAB' | 'PER_SQUARE_METRE';
    slabCount?: number;
    pricePerSlab?: number;
    pricePerSqm?: number;
    /** Rate per m² (for PER_SQUARE_METRE display) */
    ratePerSqm?: number;
    /** Waste factor percent applied (for PER_SQUARE_METRE display) */
    wasteFactorPercent?: number;
    /** Area after waste factor (for PER_SQUARE_METRE display) */
    adjustedAreaM2?: number;
    /** Material name for display (e.g. "Alpha Zero") */
    materialName?: string;
    /** Total slab cost before proportional split (slabCount × pricePerSlab) */
    totalSlabCost?: number;
    /** Sum of areas for all pieces using the same material (denominator) */
    totalMaterialAreaSqm?: number;
    /** This piece's proportional share percentage of the material cost */
    sharePercent?: number;
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
