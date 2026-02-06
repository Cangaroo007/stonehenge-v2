/**
 * Shared types and enums for the AI price interpreter.
 * This file is safe to import from client components ('use client')
 * because it contains no server-side dependencies (e.g., Anthropic SDK).
 */

/**
 * Service category enums matching our database schema
 */
export enum ServiceCategory {
  SLAB = 'SLAB',
  CUTTING = 'CUTTING',
  POLISHING = 'POLISHING',
  CUTOUT = 'CUTOUT',
  DELIVERY = 'DELIVERY',
  INSTALLATION = 'INSTALLATION',
}

export enum CutoutType {
  HOTPLATE = 'HOTPLATE',
  GPO = 'GPO',
  TAP_HOLE = 'TAP_HOLE',
  DROP_IN_SINK = 'DROP_IN_SINK',
  UNDERMOUNT_SINK = 'UNDERMOUNT_SINK',
  FLUSH_COOKTOP = 'FLUSH_COOKTOP',
  BASIN = 'BASIN',
  DRAINER_GROOVES = 'DRAINER_GROOVES',
  OTHER = 'OTHER',
}

/**
 * Price mapping structure returned by AI
 */
export interface PriceMapping {
  // Original data from spreadsheet
  originalCategory: string;
  originalName: string;
  originalRate: number;
  originalUnit?: string;

  // Mapped to our internal system
  serviceCategory: ServiceCategory;
  cutoutType?: CutoutType; // Only for CUTOUT category

  // Standardized pricing
  rate20mm?: number; // For thickness-specific services
  rate40mm?: number;
  ratePerLinearMetre?: number;
  ratePerSquareMetre?: number;
  fixedRate?: number;

  // Metadata
  unit: 'Metre' | 'Millimetre' | 'Square Metre' | 'Fixed'; // Australian spelling
  confidence: 'high' | 'medium' | 'low';
  notes?: string;
}

/**
 * Tier-specific price mapping for persistence to customPriceList JSON field.
 * Uses the same structure as PriceMapping but typed for database storage.
 */
export interface TierPriceMapping {
  originalCategory: string;
  originalName: string;
  originalRate: number;
  originalUnit?: string;
  serviceCategory: ServiceCategory;
  cutoutType?: CutoutType;
  rate20mm?: number;
  rate40mm?: number;
  ratePerLinearMetre?: number;
  ratePerSquareMetre?: number;
  fixedRate?: number;
  unit: 'Metre' | 'Millimetre' | 'Square Metre' | 'Fixed';
  confidence: 'high' | 'medium' | 'low';
  notes?: string;
}

/**
 * AI interpretation result
 */
export interface InterpretationResult {
  mappings: PriceMapping[];
  summary: {
    totalItems: number;
    categoryCounts: Record<ServiceCategory, number>;
    uniqueCategories: ServiceCategory[];
    averageConfidence: number;
    warnings: string[];
  };
  rawData: string; // Original file content for debugging
}
