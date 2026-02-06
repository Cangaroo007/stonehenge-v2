/**
 * UI Contract Types
 * 
 * UI-specific interfaces that extend core pricing types without modifying them.
 * These add presentation-layer concerns like formatted strings, status colors,
 * and display helpers while keeping business logic pristine.
 * 
 * IMPORTANT: This file is the interface layer between pricing logic and UI.
 * DO NOT modify core pricing types - only extend them here with UI-only fields.
 */

import type {
  CalculationResult,
  MaterialBreakdown,
  EdgeBreakdown,
  CutoutBreakdown,
  PiecePricingBreakdown,
  PricingContext,
  AppliedRule,
  DiscountBreakdown,
} from './pricing';
import type { EnhancedCalculationResult, ServiceBreakdown } from '@/lib/services/pricing-calculator-v2';

// ============================================
// CURRENCY & FORMATTING
// ============================================

/**
 * Pre-formatted currency string with symbol
 * Example: "$1,234.56" or "£999.00"
 */
export type FormattedCurrency = string;

/**
 * Pre-formatted percentage string
 * Example: "15%" or "0%"
 */
export type FormattedPercentage = string;

/**
 * Pre-formatted dimension string
 * Example: "1200mm × 800mm × 20mm" or "1.2m × 0.8m"
 */
export type FormattedDimension = string;

// ============================================
// STATUS & STATE COLORS (Linear Design System)
// ============================================

/**
 * Status color variants for UI components
 * Based on Linear's status color system
 */
export type StatusColor = 
  | 'default'     // zinc-600 - neutral state
  | 'primary'     // amber-600 - primary action
  | 'success'     // green-600 - completed, valid
  | 'warning'     // yellow-600 - attention needed
  | 'danger'      // red-600 - error, invalid
  | 'info'        // blue-600 - informational
  | 'muted';      // zinc-400 - de-emphasized

/**
 * Badge variant styles (maps to StatusColor)
 */
export interface BadgeStyle {
  color: StatusColor;
  label: string;
  icon?: string; // Optional icon name/component
}

// ============================================
// QUOTE DISPLAY DATA
// ============================================

/**
 * Quote display data with UI-friendly formatted values
 * Extends CalculationResult with presentation layer
 */
export interface QuoteDisplayData extends EnhancedCalculationResult {
  // Formatted currency values
  formatted: {
    subtotal: FormattedCurrency;
    totalDiscount: FormattedCurrency;
    total: FormattedCurrency;
    gst: FormattedCurrency;
    grandTotal: FormattedCurrency;
  };
  
  // Visual status indicators
  status: {
    pricing: BadgeStyle;
    discount: BadgeStyle | null;
    override: BadgeStyle | null;
  };
  
  // Quick reference flags
  flags: {
    hasOverrides: boolean;
    hasDiscounts: boolean;
    hasDelivery: boolean;
    hasTemplating: boolean;
    requiresApproval: boolean;
  };
  
  // Metadata for UI display
  meta: {
    lastCalculated: string; // Formatted timestamp
    priceBookName: string | null;
    currency: string;
    gstRate: number;
  };
}

// ============================================
// PRICING BREAKDOWN VIEW
// ============================================

/**
 * Material breakdown with UI formatting
 */
export interface MaterialBreakdownView extends MaterialBreakdown {
  formatted: {
    totalAreaM2: string;
    baseRate: FormattedCurrency;
    appliedRate: FormattedCurrency;
    subtotal: FormattedCurrency;
    discount: FormattedCurrency;
    total: FormattedCurrency;
    slabRate?: FormattedCurrency;
  };
  
  status: BadgeStyle;
  
  display: {
    pricingBasisLabel: string; // "Per Slab" or "Per Square Metre"
    areaLabel: string; // "12.5 m²" or "5 slabs"
    rateLabel: string; // "$450 per slab" or "$85 per m²"
  };
}

/**
 * Edge breakdown with UI formatting
 */
export interface EdgeBreakdownView extends EdgeBreakdown {
  formatted: {
    linearMeters: string;
    baseRate: FormattedCurrency;
    appliedRate: FormattedCurrency;
    subtotal: FormattedCurrency;
  };
  
  display: {
    thicknessLabel: string; // Extracted from name, e.g. "20mm"
    quantityLabel: string; // "12.5 linear metres"
  };
}

/**
 * Edge section breakdown with UI formatting
 */
export interface EdgeSectionView {
  totalLinearMeters: number;
  byType: EdgeBreakdownView[];
  subtotal: number;
  discount: number;
  total: number;
  
  formatted: {
    totalLinearMeters: string;
    subtotal: FormattedCurrency;
    discount: FormattedCurrency;
    total: FormattedCurrency;
  };
}

/**
 * Cutout breakdown with UI formatting
 */
export interface CutoutBreakdownView extends CutoutBreakdown {
  formatted: {
    basePrice: FormattedCurrency;
    appliedPrice: FormattedCurrency;
    subtotal: FormattedCurrency;
  };
  
  display: {
    categoryLabel: string; // Extracted from name, e.g. "Tap Hole"
    quantityLabel: string; // "3 cutouts"
  };
}

/**
 * Cutout section breakdown with UI formatting
 */
export interface CutoutSectionView {
  items: CutoutBreakdownView[];
  subtotal: number;
  discount: number;
  total: number;
  
  formatted: {
    subtotal: FormattedCurrency;
    discount: FormattedCurrency;
    total: FormattedCurrency;
  };
}

/**
 * Service breakdown with UI formatting
 */
export interface ServiceBreakdownView extends ServiceBreakdown {
  formatted: {
    quantity: string;
    rate: FormattedCurrency;
    subtotal: FormattedCurrency;
  };
  
  display: {
    serviceTypeLabel: string; // "Cutting" | "Polishing" | "Join" etc.
    quantityLabel: string; // "12.5 linear metres" or "5.3 m²"
    unitLabel: string; // "per linear metre" or "per m²"
  };
}

/**
 * Service section breakdown with UI formatting
 */
export interface ServiceSectionView {
  items: ServiceBreakdownView[];
  subtotal: number;
  total: number;
  
  formatted: {
    subtotal: FormattedCurrency;
    total: FormattedCurrency;
  };
}

/**
 * Delivery breakdown with UI formatting
 */
export interface DeliveryBreakdownView {
  address: string | null;
  distanceKm: number | null;
  zone: string | null;
  calculatedCost: number | null;
  overrideCost: number | null;
  finalCost: number;
  
  formatted: {
    distanceKm: string | null;
    calculatedCost: FormattedCurrency | null;
    overrideCost: FormattedCurrency | null;
    finalCost: FormattedCurrency;
  };
  
  display: {
    zoneLabel: string | null; // "Zone A - Metro" or null
    distanceLabel: string | null; // "15.5 km" or null
    isOverridden: boolean;
  };
  
  status: BadgeStyle | null;
}

/**
 * Templating breakdown with UI formatting
 */
export interface TemplatingBreakdownView {
  required: boolean;
  distanceKm: number | null;
  calculatedCost: number | null;
  overrideCost: number | null;
  finalCost: number;
  
  formatted: {
    distanceKm: string | null;
    calculatedCost: FormattedCurrency | null;
    overrideCost: FormattedCurrency | null;
    finalCost: FormattedCurrency;
  };
  
  display: {
    distanceLabel: string | null; // "15.5 km" or null
    isOverridden: boolean;
    statusLabel: string; // "Required" | "Not Required"
  };
  
  status: BadgeStyle;
}

// ============================================
// PER-PIECE DISPLAY DATA
// ============================================

/**
 * Piece fabrication display data with UI formatting
 */
export interface PieceFabricationView {
  cutting: {
    linearMeters: number;
    rate: number;
    baseAmount: number;
    discount: number;
    total: number;
    discountPercentage: number;
    
    formatted: {
      linearMeters: string;
      rate: FormattedCurrency;
      baseAmount: FormattedCurrency;
      discount: FormattedCurrency;
      total: FormattedCurrency;
      discountPercentage: FormattedPercentage;
    };
    
    display: {
      quantityLabel: string; // "12.5 linear metres"
      discountLabel: string | null; // "15% discount" or null
    };
  };
  
  polishing: {
    linearMeters: number;
    rate: number;
    baseAmount: number;
    discount: number;
    total: number;
    discountPercentage: number;
    
    formatted: {
      linearMeters: string;
      rate: FormattedCurrency;
      baseAmount: FormattedCurrency;
      discount: FormattedCurrency;
      total: FormattedCurrency;
      discountPercentage: FormattedPercentage;
    };
    
    display: {
      quantityLabel: string; // "8.5 linear metres"
      discountLabel: string | null; // "15% discount" or null
    };
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
    
    formatted: {
      lengthMm: string;
      linearMeters: string;
      rate: FormattedCurrency;
      baseAmount: FormattedCurrency;
      discount: FormattedCurrency;
      total: FormattedCurrency;
      discountPercentage: FormattedPercentage;
    };
    
    display: {
      sideLabel: string; // "Top Edge" | "Bottom Edge" etc.
      quantityLabel: string; // "1.2 linear metres"
      discountLabel: string | null;
    };
  }>;
  
  cutouts: Array<{
    cutoutTypeId: string;
    cutoutTypeName: string;
    quantity: number;
    rate: number;
    baseAmount: number;
    discount: number;
    total: number;
    
    formatted: {
      rate: FormattedCurrency;
      baseAmount: FormattedCurrency;
      discount: FormattedCurrency;
      total: FormattedCurrency;
    };
    
    display: {
      quantityLabel: string; // "3 cutouts"
    };
  }>;
  
  subtotal: number;
  
  formatted: {
    subtotal: FormattedCurrency;
  };
}

/**
 * Piece pricing breakdown with UI formatting
 */
export interface PiecePricingBreakdownView extends PiecePricingBreakdown {
  formatted: {
    dimensions: FormattedDimension;
    pieceTotal: FormattedCurrency;
  };
  
  fabricationView: PieceFabricationView;
  
  display: {
    pieceLabel: string; // "Kitchen Benchtop - 1200×800×20mm"
    areaLabel: string; // "0.96 m²"
    perimeterLabel: string; // "4.0 linear metres"
  };
  
  status: BadgeStyle;
}

// ============================================
// PRICING BREAKDOWN VIEW (COMPLETE)
// ============================================

/**
 * Complete pricing breakdown with all sections formatted for UI
 */
export interface PricingBreakdownView {
  materials: MaterialBreakdownView;
  edges: EdgeSectionView;
  cutouts: CutoutSectionView;
  services: ServiceSectionView;
  delivery: DeliveryBreakdownView | null;
  templating: TemplatingBreakdownView | null;
  pieces: PiecePricingBreakdownView[];
}

// ============================================
// APPLIED RULES & DISCOUNTS
// ============================================

/**
 * Applied rule with UI formatting
 */
export interface AppliedRuleView extends AppliedRule {
  status: BadgeStyle;
  
  display: {
    priorityLabel: string; // "Priority 1" or "High Priority"
    effectLabel: string; // Human-readable effect description
  };
}

/**
 * Discount breakdown with UI formatting
 */
export interface DiscountBreakdownView extends DiscountBreakdown {
  formatted: {
    value: string; // Could be currency or percentage based on type
    savings: FormattedCurrency;
  };
  
  status: BadgeStyle;
  
  display: {
    typeLabel: string; // "Percentage Discount" | "Fixed Amount" etc.
    appliedToLabel: string; // "Applied to Materials" etc.
  };
}

// ============================================
// PRICING CONTEXT VIEW
// ============================================

/**
 * Pricing context with UI-friendly labels
 */
export interface PricingContextView extends PricingContext {
  display: {
    materialPricingLabel: string; // "Per Slab" or "Per Square Metre"
    cuttingUnitLabel: string; // "Linear Metre" | "Square Metre" etc.
    polishingUnitLabel: string;
    installationUnitLabel: string;
    currencySymbol: string; // "$" | "£" | "€" etc.
    gstLabel: string; // "GST (10%)" or "VAT (20%)"
  };
}

// ============================================
// UTILITY TYPES
// ============================================

/**
 * Sorting options for pricing breakdowns
 */
export type PricingSort = 
  | 'cost-desc'      // Highest cost first
  | 'cost-asc'       // Lowest cost first
  | 'name-asc'       // Alphabetical
  | 'type'           // Group by type
  | 'default';       // Natural order

/**
 * Grouping options for piece breakdowns
 */
export type PieceGrouping = 
  | 'none'           // No grouping
  | 'room'           // Group by room
  | 'material'       // Group by material type
  | 'thickness';     // Group by thickness

/**
 * Filter options for breakdown display
 */
export interface BreakdownFilter {
  showZeroCost?: boolean;        // Show items with $0 cost
  showDiscountedOnly?: boolean;  // Only show items with discounts
  minCost?: number;              // Minimum cost threshold
  types?: string[];              // Filter by specific types
}

/**
 * Display preferences for pricing views
 */
export interface PricingDisplayPreferences {
  currency: string;
  locale: string;              // For number formatting, e.g. "en-AU"
  showGST: boolean;
  showDiscountDetails: boolean;
  showPieceBreakdown: boolean;
  compactMode: boolean;        // Condensed view
  groupPiecesBy: PieceGrouping;
  sortBy: PricingSort;
  filter?: BreakdownFilter;
}

// ============================================
// HELPER TYPE GUARDS
// ============================================

/**
 * Type guard for checking if breakdown has delivery
 */
export function hasDelivery(breakdown: PricingBreakdownView): breakdown is PricingBreakdownView & { delivery: DeliveryBreakdownView } {
  return breakdown.delivery !== null;
}

/**
 * Type guard for checking if breakdown has templating
 */
export function hasTemplating(breakdown: PricingBreakdownView): breakdown is PricingBreakdownView & { templating: TemplatingBreakdownView } {
  return breakdown.templating !== null;
}

/**
 * Type guard for checking if quote has overrides
 */
export function hasOverrides(quote: QuoteDisplayData): boolean {
  return quote.flags.hasOverrides;
}

/**
 * Type guard for checking if quote has discounts
 */
export function hasDiscounts(quote: QuoteDisplayData): boolean {
  return quote.flags.hasDiscounts;
}
