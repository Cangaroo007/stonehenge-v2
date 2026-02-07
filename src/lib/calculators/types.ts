/**
 * Calculator Types
 * Shared type definitions for all calculators
 */

import { Decimal } from '@prisma/client/runtime/library';

// ============================================================================
// Core Types
// ============================================================================

export type QuoteId = string & { __brand: 'QuoteId' };
export type PieceId = string & { __brand: 'PieceId' };
export type MaterialId = string & { __brand: 'MaterialId' };

export interface Dimensions {
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
}

export interface CalculatedCost {
  subtotal: Decimal;
  discount: Decimal;
  total: Decimal;
  currency: string;
}

// ============================================================================
// Material Pricing
// ============================================================================

export type MaterialPricingBasis = 'PER_SLAB' | 'PER_SQUARE_METRE';

export interface MaterialCalculation {
  strategy: MaterialPricingBasis;
  pieces: PieceMaterialCost[];
  slabCount: number;
  totalAreaSqm: Decimal;
  unitCost: Decimal;
  wasteFactor: number;
  subtotal: Decimal;
  discount: Decimal;
  total: Decimal;
}

export interface PieceMaterialCost {
  pieceId: PieceId;
  areaSqm: Decimal;
  strategy: MaterialPricingBasis;
  unitCost: Decimal;
  totalCost: Decimal;
  isOverride: boolean;
}

export interface SlabEstimate {
  count: number;
  size: { lengthMm: number; widthMm: number };
  totalAreaSqm: Decimal;
  utilizationPercent: number;
}

// ============================================================================
// Edge Pricing
// ============================================================================

export type EdgeSide = 'top' | 'bottom' | 'left' | 'right';

export interface EdgeCalculation {
  byType: EdgeTypeBreakdown[];
  totalLinearMeters: Decimal;
  subtotal: Decimal;
  discount: Decimal;
  total: Decimal;
}

export interface EdgeTypeBreakdown {
  edgeTypeId: string;
  edgeTypeName: string;
  thickness: number;
  linearMeters: Decimal;
  ratePerMeter: Decimal;
  subtotal: Decimal;
  discount: Decimal;
  total: Decimal;
}

export interface PieceEdgeConfig {
  pieceId: PieceId;
  edges: Partial<Record<EdgeSide, string | null>>;
  thicknessMm: number;
  dimensions: Dimensions;
}

// ============================================================================
// Cutout Pricing
// ============================================================================

export interface CutoutCalculation {
  items: CutoutItem[];
  subtotal: Decimal;
  discount: Decimal;
  total: Decimal;
}

export interface CutoutItem {
  cutoutTypeId: string;
  cutoutTypeName: string;
  category: string;
  quantity: number;
  unitPrice: Decimal;
  subtotal: Decimal;
  discount: Decimal;
  total: Decimal;
}

// ============================================================================
// Service Pricing
// ============================================================================

export type ServiceType = 
  | 'CUTTING' 
  | 'POLISHING' 
  | 'INSTALLATION' 
  | 'WATERFALL_END'
  | 'JOIN'
  | 'TEMPLATING'
  | 'DELIVERY';

export interface ServiceCalculation {
  items: ServiceItem[];
  subtotal: Decimal;
  discount: Decimal;
  total: Decimal;
}

export interface ServiceItem {
  serviceType: ServiceType;
  name: string;
  quantity: Decimal;
  unit: string;
  rate: Decimal;
  subtotal: Decimal;
  discount: Decimal;
  total: Decimal;
}

// ============================================================================
// Join Pricing (for oversized pieces)
// ============================================================================

export type JoinStrategy = 'NONE' | 'LENGTHWISE' | 'WIDTHWISE' | 'MULTI_JOIN';

export interface JoinCalculation {
  pieceId: PieceId;
  fitsOnSingleSlab: boolean;
  strategy: JoinStrategy;
  joinCount: number;
  totalJoinLengthMm: number;
  subtotal: Decimal;
  total: Decimal;
  warnings: string[];
}

// ============================================================================
// Delivery & Templating
// ============================================================================

export interface DeliveryCalculation {
  address: string | null;
  distanceKm: Decimal | null;
  zoneId: string | null;
  zoneName: string | null;
  baseCharge: Decimal;
  ratePerKm: Decimal;
  calculatedCost: Decimal;
  overrideCost: Decimal | null;
  finalCost: Decimal;
}

export interface TemplatingCalculation {
  required: boolean;
  distanceKm: Decimal | null;
  baseCharge: Decimal;
  ratePerKm: Decimal;
  calculatedCost: Decimal;
  overrideCost: Decimal | null;
  finalCost: Decimal;
}

// ============================================================================
// Complete Quote Calculation
// ============================================================================

export interface QuoteCalculation {
  quoteId: QuoteId;
  version: number;
  
  // Breakdown by category
  materials: MaterialCalculation;
  edges: EdgeCalculation;
  cutouts: CutoutCalculation;
  services: ServiceCalculation;
  delivery: DeliveryCalculation;
  templating: TemplatingCalculation;
  joins: JoinCalculation[];
  
  // Applied pricing rules
  appliedRules: AppliedPricingRule[];
  
  // Totals
  subtotal: Decimal;
  discount: Decimal;
  tax_rate: Decimal;
  tax_amount: Decimal;
  total: Decimal;
  
  // Metadata
  currency: string;
  calculated_at: Date;
  pricingContext: PricingContext;
}

export interface AppliedPricingRule {
  ruleId: string;
  ruleName: string;
  priority: number;
  discountType: 'percentage' | 'fixed';
  discountValue: Decimal;
  appliesTo: string;
}

// ============================================================================
// Pricing Context
// ============================================================================

export interface PricingContext {
  organisationId: string;
  materialPricingBasis: MaterialPricingBasis;
  currency: string;
  tax_rate: Decimal;
  
  // Client classification
  clientTypeId?: string;
  clientTierId?: string;
  customerId?: string;
  
  // Price book
  priceBookId?: string;
  
  // Volume tier (for unit blocks)
  volumeTierId?: string;
}

// ============================================================================
// Calculator Options
// ============================================================================

export interface CalculationOptions {
  pricingContext?: Partial<PricingContext>;
  forceRecalculate?: boolean;
  includeBreakdown?: boolean;
  cacheResults?: boolean;
}

// ============================================================================
// Unit Block / Project Types
// ============================================================================

export type ProjectType = 'SINGLE_DWELLING' | 'UNIT_BLOCK' | 'COMMERCIAL';

export interface UnitBlockCalculation {
  projectId: string;
  projectType: ProjectType;
  units: UnitCalculation[];
  
  // Volume-based pricing
  volumeTier?: VolumeTier;
  volumeDiscounts: VolumeDiscount[];
  
  // Phased delivery
  phases?: ProjectPhase[];
  
  // Aggregated totals
  aggregate: {
    totalAreaSqm: Decimal;
    totalSlabs: number;
    subtotal: Decimal;
    volumeDiscountTotal: Decimal;
    grandTotal: Decimal;
  };
}

export interface UnitCalculation {
  unitId: string;
  unitNumber: string;
  quoteId: QuoteId;
  areaSqm: Decimal;
  subtotal: Decimal;
}

export interface VolumeTier {
  tierId: string;
  name: string;
  minSquareMeters: Decimal;
  maxSquareMeters: Decimal | null;
  discountPercent: Decimal;
}

export interface VolumeDiscount {
  tierId: string;
  appliesTo: 'MATERIAL' | 'FABRICATION' | 'INSTALLATION' | 'ALL';
  discountPercent: Decimal;
  amount: Decimal;
}

export interface ProjectPhase {
  phaseId: string;
  name: string;
  units: string[]; // Unit IDs
  scheduledStartDate?: Date;
  scheduledEndDate?: Date;
}
