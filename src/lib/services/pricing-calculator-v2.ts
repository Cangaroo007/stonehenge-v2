/**
 * Pricing Calculation Service V2
 *
 * Enhanced to include:
 * - PricingSettings (org-level configuration)
 * - Configurable material pricing: PER_SLAB vs PER_SQUARE_METRE
 * - Configurable service units per organisation
 * - ServiceRate (cutting, polishing, installation, waterfall)
 * - EdgeType thickness variants (20mm vs 40mm+)
 * - CutoutType categories with minimum charges
 * - Delivery cost calculation
 * - Templating cost calculation
 * - Manual overrides at quote and piece level
 */

import prisma from '@/lib/db';
import { calculateCutPlan } from './multi-slab-calculator';
import {
  calculateQuote as calculateEngineQuote,
  type PricingEngineInput,
  type EngineSettings,
  type EngineServiceRate,
  type EngineEdgeCategoryRate,
  type EngineCutoutRate,
  type EnginePiece,
  type EngineCutout,
} from './pricing-rules-engine';
import type { DiscountType, DiscountAppliesTo } from '@/lib/types/quote-adjustments';
import {
  calculateDistance,
  getDeliveryZone,
  calculateDeliveryCost as calculateDeliveryCostFn,
  calculateTemplatingCost as calculateTemplatingCostFn,
} from './distance-service';
import type { MaterialPricingBasis } from '@prisma/client';
import { getShapeGeometry, getBoundingBox, getShapeEdgeLengths, decomposeShapeIntoRects, getCuttingPerimeterLm, getFinishableEdgeLengthsMm, computeRadiusEndArea, computeFullCircleArea, computeConcaveArcArea, type ShapeConfig, type ShapeType, type RadiusEndConfig, type FullCircleConfig, type ConcaveArcConfig, type ArcEdgeConfig } from '@/lib/types/shapes';
import type {
  PricingOptions,
  PricingContext,
  CalculationResult,
  AppliedRule,
  EdgeBreakdown,
  CutoutBreakdown,
  MaterialBreakdown,
  MaterialGroupBreakdown,
  PricingRuleWithOverrides,
  PiecePricingBreakdown,
  GrainMatchResult,
} from '@/lib/types/pricing';

/** Margin resolution result — tracks which source provided the margin */
export interface MarginResolution {
  effectiveMarginPercent: number;
  marginSource: 'quote_override' | 'client_tier' | 'material' | 'supplier' | 'none';
  marginAdjustPercent: number;
  finalMarginPercent: number;
  marginMultiplier: number;
  materialCostBeforeMargin: number;
  materialCostAfterMargin: number;
  availableMargins: {
    quoteOverride: number | null;
    clientTier: number | null;
    tierName: string | null;
    material: number | null;
    supplier: number | null;
    supplierName: string | null;
  };
  warning: string | null;
}

// Hardcoded delivery zones matching seed data (shared with /api/distance/calculate)
const DELIVERY_ZONES = [
  { id: '1', name: 'Local', maxDistanceKm: 30, baseCharge: 50.0, ratePerKm: 2.5, isActive: true },
  { id: '2', name: 'Regional', maxDistanceKm: 100, baseCharge: 75.0, ratePerKm: 3.0, isActive: true },
  { id: '3', name: 'Remote', maxDistanceKm: 500, baseCharge: 100.0, ratePerKm: 3.5, isActive: true },
];

const TEMPLATING_RATE = { id: '1', baseCharge: 150.0, ratePerKm: 2.0 };

const COMPANY_ADDRESS =
  process.env.COMPANY_ADDRESS || '20 Hitech Drive, KUNDA PARK Queensland 4556, Australia';

// Grain matching surcharge rate is now tenant-configurable via pricing_settings.
// See pricingContext.grainMatchingSurchargePercent (stored as percentage, e.g. 15.0 = 15%).

// ── Curved shape helpers (C6) ─────────────────────────────────────────────────

const CURVED_SHAPE_TYPES = new Set(['RADIUS_END', 'FULL_CIRCLE', 'CONCAVE_ARC', 'ROUNDED_RECT']);

function isCurvedShape(shapeType?: string | null): boolean {
  return !!shapeType && CURVED_SHAPE_TYPES.has(shapeType);
}

/**
 * Calculate true stone area in m² for a curved piece.
 * Uses exact geometry — not bounding box.
 * Returns null if config is missing or invalid.
 */
function getCurvedTrueAreaM2(shapeType: string, shapeConfig: unknown): number | null {
  if (!shapeConfig || typeof shapeConfig !== 'object') return null;
  try {
    switch (shapeType) {
      case 'RADIUS_END':
        return computeRadiusEndArea(shapeConfig as RadiusEndConfig) / 1_000_000;
      case 'FULL_CIRCLE':
        return computeFullCircleArea(shapeConfig as FullCircleConfig) / 1_000_000;
      case 'CONCAVE_ARC':
        return computeConcaveArcArea(shapeConfig as ConcaveArcConfig) / 1_000_000;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * Calculate arc length in metres for a curved piece.
 * Returns 0 if config is missing or invalid.
 */
function calcArcLengthM(shapeType: string, shapeConfig: unknown): number {
  if (!shapeConfig || typeof shapeConfig !== 'object') return 0;
  const cfg = shapeConfig as Record<string, unknown>;
  switch (shapeType) {
    case 'RADIUS_END': {
      const r = Number(cfg.radius_mm) || 0;
      const ends = cfg.curved_ends === 'BOTH' ? 2 : 1;
      return (Math.PI * r * ends) / 1000; // mm → metres
    }
    case 'FULL_CIRCLE': {
      const d = Number(cfg.diameter_mm) || 0;
      return (Math.PI * d) / 1000; // mm → metres
    }
    case 'CONCAVE_ARC': {
      const r = Number(cfg.inner_radius_mm) || 0;
      const sweep = Number(cfg.sweep_deg) || 0;
      return ((sweep / 360) * 2 * Math.PI * r) / 1000; // mm → metres
    }
    case 'ROUNDED_RECT': {
      const cfg2 = shapeConfig as Record<string, unknown>;
      if (cfg2.individual_corners) {
        const tl = Number(cfg2.corner_tl_mm) || 0;
        const tr = Number(cfg2.corner_tr_mm) || 0;
        const br = Number(cfg2.corner_br_mm) || 0;
        const bl = Number(cfg2.corner_bl_mm) || 0;
        return ((Math.PI / 2) * (tl + tr + br + bl)) / 1000;
      }
      const r = Number(cfg2.corner_radius_mm) || 0;
      return ((Math.PI / 2) * r * 4) / 1000;
    }
    default:
      return 0;
  }
}

/**
 * Enhanced pricing calculation result
 */
interface MissingRate {
  code: string;
  pieceId: string;
  pieceName: string;
  description: string;
}

export interface EnhancedCalculationResult extends CalculationResult {
  missingRates?: MissingRate[];
  fabricationCategory?: string;
  baseSubtotal?: number;
  customCharges?: Array<{ id: number; description: string; amount: number }>;
  customChargesTotal?: number;
  discountType?: string | null;
  discountValue?: number;
  discountAppliesTo?: string;
  discountAmount?: number;
  rulesDiscount?: number;
  rulesAdjustedSubtotal?: number;
  breakdown: CalculationResult['breakdown'] & {
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
  pricingContext?: PricingContext;
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

/**
 * Shape of a service_rates record used for rate lookups.
 * Includes fabricationCategory for material-specific pricing.
 */
type ServiceRateRecord = {
  serviceType: string;
  fabricationCategory: string;
  name: string;
  rate20mm: { toNumber: () => number };
  rate40mm: { toNumber: () => number };
  minimumCharge: { toNumber: () => number } | null;
};

/**
 * Load pricing context for an organisation.
 * Returns org-level pricing settings or sensible defaults.
 */
export async function loadPricingContext(organisationId: string): Promise<PricingContext> {
  const settings = await prisma.pricing_settings.findUnique({
    where: { organisation_id: organisationId },
  });

  if (settings) {
    return {
      pricingSettingsId: settings.id,
      organisationId: settings.organisation_id,
      materialPricingBasis: settings.material_pricing_basis,
      cuttingUnit: settings.cutting_unit,
      polishingUnit: settings.polishing_unit,
      installationUnit: settings.installation_unit,
      currency: settings.currency,
      gstRate: Number(settings.gst_rate),
      laminatedMultiplier: Number(settings.laminated_multiplier),
      mitredMultiplier: Number(settings.mitred_multiplier),
      wasteFactorPercent: Number(settings.waste_factor_percent),
      grainMatchingSurchargePercent: Number(settings.grain_matching_surcharge_percent),
      cutoutThicknessMultiplier: Number(settings.cutout_thickness_multiplier),
      waterfallPricingMethod: settings.waterfall_pricing_method,
      stripToPieceThresholdMm: settings.strip_to_piece_threshold_mm ?? 300,
      curvedCuttingMode: settings.curved_cutting_mode,
      curvedPolishingMode: settings.curved_polishing_mode,
    };
  }

  // No settings found — fail loudly instead of defaulting to hardcoded values
  throw new Error(
    'Pricing settings not configured for this organisation. ' +
    'Configure in Pricing Admin → Settings before creating quotes.'
  );
}

/**
 * Calculate material cost based on pricing basis.
 * PER_SLAB: uses slab count from optimiser × price per slab
 * PER_SQUARE_METRE: uses total area × price per m²
 */
export function calculateMaterialCost(
  pieces: Array<{
    length_mm: number;
    width_mm: number;
    thickness_mm: number;
    material_id?: number | null;
    materials: {
      id?: number;
      name?: string;
      slab_length_mm?: number | null;
      slab_width_mm?: number | null;
      price_per_sqm: { toNumber: () => number };
      price_per_slab?: { toNumber: () => number } | null;
      price_per_square_metre?: { toNumber: () => number } | null;
      margin_override_percent?: { toNumber: () => number } | null;
      supplier?: {
        id: string;
        default_margin_percent: { toNumber: () => number } | null;
      } | null;
    } | null;
    overrideMaterialCost?: { toNumber: () => number } | null;
  }>,
  pricingBasis: MaterialPricingBasis = 'PER_SLAB',
  slabCount?: number,
  wasteFactorPercent?: number,
  slabCountFromOptimiser?: boolean,
  materialMarginAdjustPercent: number = 0,
  pieceAreaOverrides?: number[],
  /** Pre-resolved margin from quote or tier level (takes priority over material/supplier) */
  resolvedMarginOverride?: { quoteMarginOverride: number | null; tierMarginPercent: number | null; tierName: string | null } | null,
): MaterialBreakdown & { marginResolution: MarginResolution } {
  let totalAreaM2 = 0;
  let overriddenCost = 0;
  let calculatedCost = 0;

  for (let idx = 0; idx < pieces.length; idx++) {
    const piece = pieces[idx];
    const areaSqm = pieceAreaOverrides?.[idx] ?? (piece.length_mm * piece.width_mm) / 1_000_000;
    totalAreaM2 += areaSqm;

    // Check for piece-level override — margin does NOT apply to overrides
    if (piece.overrideMaterialCost) {
      overriddenCost += piece.overrideMaterialCost.toNumber();
      continue;
    }

    if (pricingBasis === 'PER_SLAB' && slabCount !== undefined) {
      // Per-slab pricing: use slab count × price per slab
      const slabPrice = piece.materials?.price_per_slab?.toNumber() ?? 0;
      if (slabPrice > 0 && slabCount > 0) {
        // Distribute slab cost proportionally across pieces by area
        const totalPieceArea = areaSqm;
        // This will be summed across all pieces, then replaced below
        calculatedCost += totalPieceArea * (slabPrice / (totalAreaM2 || 1));
      } else {
        // Fallback to per-m² if no slab price set
        const baseRate = piece.materials?.price_per_square_metre?.toNumber()
          ?? piece.materials?.price_per_sqm.toNumber()
          ?? 0;
        calculatedCost += areaSqm * baseRate;
      }
    } else {
      // Per square metre pricing
      const baseRate = piece.materials?.price_per_square_metre?.toNumber()
        ?? piece.materials?.price_per_sqm.toNumber()
        ?? 0;
      calculatedCost += areaSqm * baseRate;
    }
  }

  // For PER_SLAB, recalculate as slabCount × slabPrice if available
  if (pricingBasis === 'PER_SLAB' && slabCount !== undefined && slabCount > 0) {
    // Find the slab price from the first piece with a material
    const materialWithSlabPrice = pieces.find(p => p.materials?.price_per_slab?.toNumber());
    if (materialWithSlabPrice) {
      const slabPrice = materialWithSlabPrice.materials!.price_per_slab!.toNumber();
      // Only override if no piece-level overrides were applied
      const hasOverrides = pieces.some(p => p.overrideMaterialCost);
      if (!hasOverrides) {
        calculatedCost = Math.ceil(slabCount) * slabPrice;
      }
    }
  }

  // Margin resolution hierarchy:
  // 1. Quote-level override (user explicitly set margin for this quote)
  // 2. Client tier margin (customer's tier has a default material margin)
  // 3. Material-level override (per-material margin)
  // 4. Supplier default margin
  // 5. 0% (with warning flag)
  const firstMat = pieces.find(p => p.materials)?.materials;

  const quoteMarginOverride = resolvedMarginOverride?.quoteMarginOverride ?? null;
  const tierMarginPercent = resolvedMarginOverride?.tierMarginPercent ?? null;
  const materialMarginPercent = firstMat?.margin_override_percent?.toNumber() ?? null;
  const supplierMarginPercent = firstMat?.supplier?.default_margin_percent?.toNumber() ?? null;

  // Resolve with priority
  let baseMarginPercent: number;
  let marginSource: MarginResolution['marginSource'];

  if (quoteMarginOverride != null) {
    baseMarginPercent = quoteMarginOverride;
    marginSource = 'quote_override';
  } else if (tierMarginPercent != null) {
    baseMarginPercent = tierMarginPercent;
    marginSource = 'client_tier';
  } else if (materialMarginPercent != null) {
    baseMarginPercent = materialMarginPercent;
    marginSource = 'material';
  } else if (supplierMarginPercent != null) {
    baseMarginPercent = supplierMarginPercent;
    marginSource = 'supplier';
  } else {
    baseMarginPercent = 0;
    marginSource = 'none';
  }

  // Apply the quote_options adjustment on top of base margin
  const effectiveMarginPercent = baseMarginPercent + materialMarginAdjustPercent;
  const marginMultiplier = 1 + effectiveMarginPercent / 100;

  // Store cost before margin
  const costBeforeMargin = calculatedCost;

  // Apply margin to calculated cost (not overrides)
  const marginalizedCost = roundToTwo(calculatedCost * marginMultiplier);
  let subtotal = overriddenCost + marginalizedCost;

  const effectiveRate = totalAreaM2 > 0 ? roundToTwo(subtotal / totalAreaM2) : 0;

  // Apply waste factor for PER_SQUARE_METRE pricing only
  let finalSubtotalWithWaste = subtotal;
  let adjustedAreaM2: number | undefined;
  let appliedWastePercent: number | undefined;

  if (pricingBasis === 'PER_SQUARE_METRE' && wasteFactorPercent !== undefined && wasteFactorPercent > 0) {
    const clampedWaste = Math.max(0, Math.min(50, wasteFactorPercent));
    if (clampedWaste !== wasteFactorPercent) {
      console.warn(
        `Waste factor ${wasteFactorPercent}% is outside normal range (0-50%). Clamping to ${clampedWaste}%.`
      );
    }
    const wasteMultiplier = 1 + clampedWaste / 100;
    adjustedAreaM2 = roundToTwo(totalAreaM2 * wasteMultiplier);
    finalSubtotalWithWaste = roundToTwo(subtotal * wasteMultiplier);
    appliedWastePercent = clampedWaste;
  }

  // Margin breakdown data
  const costSubtotal = roundToTwo(overriddenCost + costBeforeMargin);
  const marginAmount = roundToTwo(marginalizedCost - costBeforeMargin);

  // Extract material metadata from the first piece with a material
  const firstMaterial = pieces.find(p => p.materials)?.materials;
  const materialName = (firstMaterial as unknown as { name?: string } | null)?.name
    // Fallback to denormalized material_name field on the piece
    || (pieces.find(p => (p as unknown as { material_name?: string | null }).material_name) as unknown as { material_name?: string })?.material_name
    || undefined;
  const slabLengthMm = (firstMaterial as unknown as { slab_length_mm?: number | null } | null)?.slab_length_mm ?? undefined;
  const slabWidthMm = (firstMaterial as unknown as { slab_width_mm?: number | null } | null)?.slab_width_mm ?? undefined;

  // Build per-material groupings for multi-material quotes
  const hasNullMaterialPieces = pieces.some(p => !(p as any).material_id && !p.overrideMaterialCost);
  const byMaterial = buildMaterialGroupings(pieces, pricingBasis, slabCount, wasteFactorPercent, slabCountFromOptimiser, slabLengthMm, slabWidthMm, materialMarginAdjustPercent, pieceAreaOverrides, resolvedMarginOverride, hasNullMaterialPieces);

  // For multi-material quotes, the single-material calculation above
  // (slabCount × firstSlabPrice) is wrong — it uses one material's price for all slabs.
  // Use the sum of per-material-group costs from buildMaterialGroupings() instead.
  // buildMaterialGroupings already handles margin and waste per group.
  let authoritativeSubtotal = roundToTwo(finalSubtotalWithWaste);
  let authoritativeSlabCount = pricingBasis === 'PER_SLAB' && slabCount !== undefined ? Math.ceil(slabCount) : undefined;
  if (byMaterial.length > 1 || pricingBasis === 'PER_SLAB') {
    authoritativeSubtotal = roundToTwo(byMaterial.reduce((sum, g) => sum + g.totalCost, 0));
    // Sum per-group slab counts for multi-material (more accurate than single aggregate)
    if (pricingBasis === 'PER_SLAB') {
      authoritativeSlabCount = byMaterial.reduce((sum, g) => sum + (g.slabCount ?? 0), 0);
    }
  }

  return {
    totalAreaM2: roundToTwo(totalAreaM2),
    baseRate: effectiveRate,
    thicknessMultiplier: 1,
    appliedRate: effectiveRate,
    subtotal: authoritativeSubtotal,
    discount: 0,
    total: authoritativeSubtotal,
    pricingBasis,
    slabCount: authoritativeSlabCount,
    slabRate: pricingBasis === 'PER_SLAB' && authoritativeSlabCount
      ? roundToTwo(authoritativeSubtotal / authoritativeSlabCount)
      : undefined,
    wasteFactorPercent: appliedWastePercent,
    adjustedAreaM2,
    margin: effectiveMarginPercent !== 0 ? {
      baseMarginPercent,
      adjustmentPercent: materialMarginAdjustPercent,
      effectiveMarginPercent,
      costSubtotal,
      marginAmount,
    } : undefined,
    materialName,
    slabLengthMm: slabLengthMm ?? undefined,
    slabWidthMm: slabWidthMm ?? undefined,
    slabCountFromOptimiser: slabCountFromOptimiser ?? false,
    byMaterial: byMaterial.length > 1 ? byMaterial : undefined,
    marginResolution: {
      effectiveMarginPercent: roundToTwo(baseMarginPercent),
      marginSource,
      marginAdjustPercent: roundToTwo(materialMarginAdjustPercent),
      finalMarginPercent: roundToTwo(effectiveMarginPercent),
      marginMultiplier: roundToTwo(marginMultiplier * 100) / 100,
      materialCostBeforeMargin: roundToTwo(costBeforeMargin),
      materialCostAfterMargin: roundToTwo(marginalizedCost),
      availableMargins: {
        quoteOverride: quoteMarginOverride,
        clientTier: tierMarginPercent,
        tierName: resolvedMarginOverride?.tierName ?? null,
        material: materialMarginPercent,
        supplier: supplierMarginPercent,
        supplierName: (firstMat?.supplier as unknown as { name?: string } | null)?.name ?? null,
      },
      warning: marginSource === 'none'
        ? 'No material margin is set. Client is being billed at cost price. Set a margin on the supplier, material, client tier, or this quote.'
        : null,
    },
  };
}

/**
 * Group pieces by material and calculate per-material breakdowns.
 * Only meaningful when multiple materials are used in a quote.
 */
function buildMaterialGroupings(
  pieces: Parameters<typeof calculateMaterialCost>[0],
  pricingBasis: MaterialPricingBasis,
  slabCount: number | undefined,
  wasteFactorPercent: number | undefined,
  slabCountFromOptimiser: boolean | undefined,
  defaultSlabLengthMm: number | null | undefined,
  defaultSlabWidthMm: number | null | undefined,
  materialMarginAdjustPercent: number = 0,
  pieceAreaOverrides?: number[],
  resolvedMarginOverride?: { quoteMarginOverride: number | null; tierMarginPercent: number | null; tierName: string | null } | null,
  hasNullMaterialPieces?: boolean,
): MaterialGroupBreakdown[] {
  // Group pieces by materialId
  const groups = new Map<number, {
    materialId: number;
    materialName: string;
    slabLengthMm: number | undefined;
    slabWidthMm: number | undefined;
    slabPrice: number;
    ratePerSqm: number;
    totalAreaM2: number;
    baseMarginPercent: number;
  }>();

  for (let idx = 0; idx < pieces.length; idx++) {
    const piece = pieces[idx];
    const mat = piece.materials;
    if (!mat) continue;
    const matId = (mat as unknown as { id?: number }).id ?? 0;
    const matName = (mat as unknown as { name?: string }).name ?? 'Unknown';
    const slabLenMm = (mat as unknown as { slab_length_mm?: number | null }).slab_length_mm ?? undefined;
    const slabWMm = (mat as unknown as { slab_width_mm?: number | null }).slab_width_mm ?? undefined;
    const slabPrice = mat.price_per_slab?.toNumber() ?? 0;
    const ratePerSqm = mat.price_per_square_metre?.toNumber() ?? mat.price_per_sqm.toNumber() ?? 0;
    const areaSqm = pieceAreaOverrides?.[idx] ?? (piece.length_mm * piece.width_mm) / 1_000_000;

    // Resolve margin with same hierarchy as main calculator
    // Quote override and tier override take priority over per-material values
    const matBaseMargin =
      resolvedMarginOverride?.quoteMarginOverride
      ?? resolvedMarginOverride?.tierMarginPercent
      ?? mat.margin_override_percent?.toNumber()
      ?? mat.supplier?.default_margin_percent?.toNumber()
      ?? 0;

    const existing = groups.get(matId);
    if (existing) {
      existing.totalAreaM2 += areaSqm;
    } else {
      groups.set(matId, {
        materialId: matId,
        materialName: matName,
        slabLengthMm: slabLenMm,
        slabWidthMm: slabWMm,
        slabPrice,
        ratePerSqm,
        totalAreaM2: areaSqm,
        baseMarginPercent: matBaseMargin,
      });
    }
  }

  const result: MaterialGroupBreakdown[] = [];
  const groupValues = Array.from(groups.values());
  for (const group of groupValues) {
    const areaM2 = roundToTwo(group.totalAreaM2);

    let totalCost: number;
    let groupSlabCount: number | undefined;
    let groupAdjustedArea: number | undefined;
    let groupWaste: number | undefined;

    if (pricingBasis === 'PER_SLAB') {
      // For per-slab, estimate slab count per material using naive calculation
      const slabAreaM2 = (group.slabLengthMm ?? defaultSlabLengthMm ?? 3000)
        * (group.slabWidthMm ?? defaultSlabWidthMm ?? 1400) / 1_000_000;
      // Only use optimiser slab count when ALL pieces have materials.
      // If null-material pieces exist, they inflated the optimiser count — recalculate from area.
      if (groups.size === 1 && slabCount !== undefined && !hasNullMaterialPieces) {
        groupSlabCount = Math.ceil(slabCount);
      } else {
        groupSlabCount = Math.ceil(areaM2 / slabAreaM2);
      }
      totalCost = roundToTwo(groupSlabCount * group.slabPrice);
    } else {
      // PER_SQUARE_METRE
      const waste = wasteFactorPercent ?? 0;
      const wasteMultiplier = 1 + Math.max(0, Math.min(50, waste)) / 100;
      groupAdjustedArea = roundToTwo(areaM2 * wasteMultiplier);
      groupWaste = waste;
      totalCost = roundToTwo(areaM2 * group.ratePerSqm * wasteMultiplier);
    }

    // Apply per-material margin
    const effectiveMarginPercent = group.baseMarginPercent + materialMarginAdjustPercent;
    const costBeforeMargin = totalCost;
    if (effectiveMarginPercent !== 0) {
      totalCost = roundToTwo(totalCost * (1 + effectiveMarginPercent / 100));
    }
    const marginAmount = roundToTwo(totalCost - costBeforeMargin);

    result.push({
      materialId: group.materialId,
      materialName: group.materialName,
      pricingBasis,
      totalAreaM2: areaM2,
      slabCount: groupSlabCount,
      slabRate: group.slabPrice > 0 ? group.slabPrice : undefined,
      slabLengthMm: group.slabLengthMm,
      slabWidthMm: group.slabWidthMm,
      slabCountFromOptimiser: groups.size === 1 ? (slabCountFromOptimiser ?? false) : false,
      wasteFactorPercent: groupWaste,
      adjustedAreaM2: groupAdjustedArea,
      ratePerSqm: group.ratePerSqm > 0 ? group.ratePerSqm : undefined,
      totalCost,
      margin: effectiveMarginPercent !== 0 ? {
        baseMarginPercent: group.baseMarginPercent,
        adjustmentPercent: materialMarginAdjustPercent,
        effectiveMarginPercent,
        costSubtotal: costBeforeMargin,
        marginAmount,
      } : undefined,
    });
  }

  return result;
}

/**
 * Main export: Calculate enhanced quote price
 */
export async function calculateQuotePrice(
  quoteId: string,
  options?: PricingOptions
): Promise<EnhancedCalculationResult> {
  const quoteIdNum = parseInt(quoteId, 10);

  if (isNaN(quoteIdNum)) {
    throw new Error('Invalid quote ID');
  }

  // Fetch the quote with all related data
  const quote = await prisma.quotes.findUnique({
    where: { id: quoteIdNum },
    include: {
      customers: {
        include: {
          client_types: true,
          client_tiers: true,
        },
      },
      price_books: true,

      quote_rooms: {
        include: {
          quote_pieces: {
            // Scalar fields (promoted_from_piece_id, promoted_edge_position,
            // piece_type, etc.) are returned automatically with `include`.
            include: {
              materials: {
                include: {
                  supplier: {
                    select: { id: true, default_margin_percent: true },
                  },
                },
              },
              piece_features: {
                include: {
                  pricing_rules: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!quote) {
    throw new Error('Quote not found');
  }

  // Load pricing context using the quote's company
  const organisationId = `company-${quote.company_id}`;
  const pricingContext = await loadPricingContext(organisationId);

  // Get pricing data
  const [edgeTypes, cutoutTypes, serviceRates, cutoutCategoryRates, edgeCategoryRates] = await Promise.all([
    prisma.edge_types.findMany({ where: { isActive: true } }),
    prisma.cutout_types.findMany({ where: { isActive: true } }),
    prisma.service_rates.findMany({ where: { isActive: true } }),
    prisma.cutout_category_rates.findMany({
      where: { pricingSettingsId: pricingContext.pricingSettingsId },
    }),
    prisma.edge_type_category_rates.findMany({
      where: { pricingSettingsId: pricingContext.pricingSettingsId },
    }),
  ]);

  // Validate required service rates exist — never silently return $0
  const requiredServiceTypes = ['CUTTING', 'POLISHING', 'INSTALLATION'];
  const loadedServiceTypes: string[] = Array.from(new Set(serviceRates.map(r => r.serviceType as string)));
  const missingServiceTypes = requiredServiceTypes.filter(t => !loadedServiceTypes.includes(t));

  if (missingServiceTypes.length > 0) {
    throw new Error(
      `Missing required service rates: ${missingServiceTypes.join(', ')}. ` +
      `Configure these in Pricing Admin → Service Rates before creating quotes.`
    );
  }

  // Flatten all pieces
  const allPieces = quote.quote_rooms.flatMap(room => room.quote_pieces);

  // Task C safeguard: build a map of promoted edge positions per parent piece ID.
  // Even if no_strip_edges wasn't patched correctly, this prevents double-charging
  // lamination on edges that have been promoted to standalone pieces.
  const promotedEdgesByParent = new Map<number, string[]>();
  for (const p of allPieces) {
    // Scalar fields come through automatically via Prisma include (promoted_from_piece_id, promoted_edge_position, piece_type)
    if ((p as any).promoted_from_piece_id && (p as any).promoted_edge_position) {
      const existing = promotedEdgesByParent.get((p as any).promoted_from_piece_id) ?? [];
      existing.push((p as any).promoted_edge_position);
      promotedEdgesByParent.set((p as any).promoted_from_piece_id, existing);
    }
  }

  // Track missing rates instead of crashing
  const missingRates: MissingRate[] = [];

  // Pre-compute shape geometry for each piece (L/U shapes use getShapeGeometry).
  // RECTANGLE returns identical values to the old length×width formula.
  const pieceGeometries = allPieces.map((piece: any) => {
    const shapeType = (piece.shape_type ?? 'RECTANGLE') as ShapeType;
    const shapeConfig = piece.shape_config as unknown as ShapeConfig;
    return getShapeGeometry(shapeType, shapeConfig, piece.length_mm, piece.width_mm);
  });

  // Get slab count from latest optimization (for PER_SLAB pricing)
  let slabCount: number | undefined;
  let slabCountFromOptimiser = false;
  if (pricingContext.materialPricingBasis === 'PER_SLAB') {
    const optimization = await prisma.slab_optimizations.findFirst({
      where: { quoteId: quoteIdNum },
      orderBy: { createdAt: 'desc' },
      select: { totalSlabs: true },
    });
    slabCount = optimization?.totalSlabs;
    slabCountFromOptimiser = slabCount !== undefined;

    // Estimate slab count from piece areas when no optimization exists
    if (slabCount === undefined && allPieces.length > 0) {
      const firstMat = allPieces.find((p: { materials?: unknown }) => p.materials)?.materials as unknown as
        { slab_length_mm?: number | null; slab_width_mm?: number | null } | null;
      if (firstMat?.slab_length_mm && firstMat?.slab_width_mm) {
        const slabAreaM2 = (firstMat.slab_length_mm * firstMat.slab_width_mm) / 1_000_000;
        const totalPieceArea = pieceGeometries.reduce(
          (sum: number, g: { totalAreaSqm: number }) => sum + g.totalAreaSqm, 0
        );
        if (slabAreaM2 > 0) {
          slabCount = Math.ceil(totalPieceArea / slabAreaM2);
        }
      }
    }
  }

  // Calculate material costs with pricing basis, waste factor, and margin
  // Pass shape-aware area overrides so L/U pieces use correct area
  const pieceAreaValues = pieceGeometries.map((g: { totalAreaSqm: number }, i: number) => {
    const piece = allPieces[i];
    if (isCurvedShape((piece as any).shape_type) && (piece as any).shape_config) {
      const trueArea = getCurvedTrueAreaM2((piece as any).shape_type!, (piece as any).shape_config);
      if (trueArea !== null) return trueArea;
    }
    return g.totalAreaSqm;
  });
  const piecesWithOverride = allPieces.map((piece: any) => ({
    ...piece,
    overrideMaterialCost: piece.override_material_cost,
  }));

  // Resolve quote-level and tier-level margin data for the hierarchy
  const quoteAnyForMargin = quote as any;
  const resolvedMarginOverride = {
    quoteMarginOverride: quoteAnyForMargin.material_margin_percent != null
      ? Number(quoteAnyForMargin.material_margin_percent)
      : null,
    tierMarginPercent: (quote.customers?.client_tiers as any)?.material_margin_percent != null
      ? Number((quote.customers?.client_tiers as any).material_margin_percent)
      : null,
    tierName: (quote.customers?.client_tiers as any)?.name ?? null,
  };

  const materialBreakdown = calculateMaterialCost(
    piecesWithOverride,
    pricingContext.materialPricingBasis,
    slabCount,
    pricingContext.wasteFactorPercent,
    slabCountFromOptimiser,
    options?.materialMarginAdjustPercent ?? 0,
    pieceAreaValues,
    resolvedMarginOverride,
  );

  // Determine primary fabrication category for the quote
  const primaryFabricationCategory: string =
    (allPieces[0]?.materials as unknown as { fabrication_category?: string } | null)
      ?.fabrication_category ?? 'ENGINEERED';

  // ─── Build engine input and calculate via pricing rules engine ──────────────

  // Convert DB service rates to engine format
  const engineServiceRates: EngineServiceRate[] = serviceRates.map(r => ({
    serviceType: r.serviceType as string,
    fabricationCategory: r.fabricationCategory as string,
    rate20mm: r.rate20mm.toNumber(),
    rate40mm: r.rate40mm.toNumber(),
  }));

  // Build edge type ID mapping (DB uses string IDs, engine uses numbers)
  const edgeTypeIdMap = new Map<string, number>();
  const edgeTypeReverseMap = new Map<number, typeof edgeTypes[number]>();
  let nextEdgeNumericId = 1;
  for (const et of edgeTypes) {
    const numId = nextEdgeNumericId++;
    edgeTypeIdMap.set(et.id, numId);
    edgeTypeReverseMap.set(numId, et);
  }

  // Convert edge category rates to engine format
  const engineEdgeCategoryRates: EngineEdgeCategoryRate[] = edgeCategoryRates.map(r => ({
    edgeTypeId: edgeTypeIdMap.get(r.edgeTypeId) ?? 0,
    fabricationCategory: r.fabricationCategory as string,
    rate20mm: typeof r.rate20mm === 'number' ? r.rate20mm : (r.rate20mm as { toNumber: () => number }).toNumber(),
    rate40mm: typeof r.rate40mm === 'number' ? r.rate40mm : (r.rate40mm as { toNumber: () => number }).toNumber(),
  }));

  // Convert cutout category rates to engine format
  const cutoutTypeNameMap = new Map<string, string>();
  for (const ct of cutoutTypes) {
    cutoutTypeNameMap.set(ct.id, ct.name);
  }
  const engineCutoutRates: EngineCutoutRate[] = cutoutCategoryRates.map(r => ({
    cutoutType: cutoutTypeNameMap.get(r.cutoutTypeId) ?? r.cutoutTypeId,
    fabricationCategory: r.fabricationCategory as string,
    rate: typeof r.rate === 'number' ? r.rate : (r.rate as { toNumber: () => number }).toNumber(),
  }));

  // Build engine pieces with oversize detection via cut plan
  const enginePieces: EnginePiece[] = [];
  const cutPlans: ReturnType<typeof calculateCutPlan>[] = [];
  for (let pi = 0; pi < allPieces.length; pi++) {
    const piece = allPieces[pi];
    const geometry = pieceGeometries[pi];
    const pieceFabCategory: string =
      (piece.materials as unknown as { fabrication_category?: string } | null)
        ?.fabrication_category ?? 'ENGINEERED';
    const materialName: string =
      (piece.materials as unknown as { name?: string } | null)?.name ?? 'caesarstone';
    const pieceSlabLengthMm =
      (piece.materials as unknown as { slab_length_mm?: number | null } | null)?.slab_length_mm ?? null;
    const pieceSlabWidthMm =
      (piece.materials as unknown as { slab_width_mm?: number | null } | null)?.slab_width_mm ?? null;

    // Get JOIN rate for cut plan cost estimation
    const { rate: joinRateForCutPlan } = getServiceRateSafe(
      serviceRates, 'JOIN', piece.thickness_mm, pieceFabCategory,
      missingRates, piece.id, piece.name || piece.description || '',
    );

    // For L/U shapes, decompose into individual legs and calculate cut plan per leg.
    // This prevents the bounding box from triggering false oversize splits.
    const pieceShapeType = (piece.shape_type ?? 'RECTANGLE') as string;
    const isLOrUShape = pieceShapeType === 'L_SHAPE' || pieceShapeType === 'U_SHAPE';

    let cutPlan: ReturnType<typeof calculateCutPlan>;
    if (isLOrUShape) {
      const rects = decomposeShapeIntoRects({
        id: String(piece.id),
        lengthMm: piece.length_mm,
        widthMm: piece.width_mm,
        shapeType: piece.shape_type,
        shapeConfig: piece.shape_config as unknown,
      });
      // Calculate cut plan per leg and pick the worst case for oversize detection
      const legPlans = rects.map(rect =>
        calculateCutPlan(
          { lengthMm: rect.width, widthMm: rect.height },
          materialName,
          20,
          pieceSlabLengthMm,
          pieceSlabWidthMm,
          joinRateForCutPlan
        )
      );
      // Aggregate: if any leg is oversize, the piece is oversize.
      // Use the leg with the most joins as the representative plan.
      const worstLeg = legPlans.reduce((worst, plan) =>
        plan.joins.length > worst.joins.length ? plan : worst
      , legPlans[0]);
      cutPlan = {
        ...worstLeg,
        fitsOnSingleSlab: legPlans.every(p => p.fitsOnSingleSlab),
        totalSlabsRequired: legPlans.reduce((sum, p) => sum + p.totalSlabsRequired, 0),
        joinLengthMm: legPlans.reduce((sum, p) => sum + p.joinLengthMm, 0),
        joinCost: legPlans.reduce((sum, p) => sum + p.joinCost, 0),
      };
    } else {
      cutPlan = calculateCutPlan(
        { lengthMm: piece.length_mm, widthMm: piece.width_mm },
        materialName,
        20,
        pieceSlabLengthMm,
        pieceSlabWidthMm,
        joinRateForCutPlan
      );
    }
    cutPlans.push(cutPlan);

    const isOversize = !cutPlan.fitsOnSingleSlab;
    const joinLengthLm = isOversize ? roundToTwo(cutPlan.joinLengthMm / 1000) : undefined;

    // Parse cutouts from JSON
    const cutoutsArray = Array.isArray(piece.cutouts)
      ? piece.cutouts
      : (typeof piece.cutouts === 'string' ? JSON.parse(piece.cutouts as string) : []);
    const engineCutouts: EngineCutout[] = cutoutsArray.map((c: any) => {
      const ct = cutoutTypes.find((t: any) => t.id === c.cutoutTypeId || t.id === c.typeId || t.name === c.type || t.name === c.name);
      if (!ct && (c.cutoutTypeId || c.typeId || c.type)) {
        missingRates.push({
          code: 'CUTOUT',
          pieceId: String(piece.id),
          pieceName: piece.name || piece.description || `Piece ${piece.id}`,
          description: `Cutout type "${c.cutoutTypeId || c.typeId || c.type}" is deactivated or missing — cutout rate will be $0`,
        });
      }
      return { cutoutType: ct?.name ?? c.type ?? c.typeId ?? 'Cutout', quantity: c.quantity || 1 };
    });

    // For L/U shapes, pass shape geometry overrides to the engine
    const isShapedPiece = geometry.cornerJoins > 0;

    // Compute shape-aware edge lengths per position (L/U shapes use actual
    // segment lengths instead of bounding-box dimensions)
    const shapeType = (piece.shape_type ?? 'RECTANGLE') as ShapeType;
    const shapeConfig = piece.shape_config as unknown as ShapeConfig;
    const edgeLengths = getShapeEdgeLengths(shapeType, shapeConfig, piece.length_mm, piece.width_mm);

    // Detect deactivated edge types — piece has edge assigned but type not in active list
    const edgeAssignments: Array<{ position: string; edgeTypeId: string | null }> = [
      { position: 'TOP', edgeTypeId: piece.edge_top },
      { position: 'BOTTOM', edgeTypeId: piece.edge_bottom },
      { position: 'LEFT', edgeTypeId: piece.edge_left },
      { position: 'RIGHT', edgeTypeId: piece.edge_right },
    ];
    for (const ea of edgeAssignments) {
      if (ea.edgeTypeId && !edgeTypeIdMap.has(ea.edgeTypeId)) {
        missingRates.push({
          code: 'EDGE_PROFILE',
          pieceId: String(piece.id),
          pieceName: piece.name || piece.description || `Piece ${piece.id}`,
          description: `Edge type "${ea.edgeTypeId}" on ${ea.position} edge is deactivated or missing — edge profile rate will be $0`,
        });
      }
    }

    const edges: EnginePiece['edges'] = [
      { position: 'TOP' as const, isFinished: !!piece.edge_top, edgeTypeId: piece.edge_top ? (edgeTypeIdMap.get(piece.edge_top) ?? null) : null, length_mm: edgeLengths.top_mm },
      { position: 'BOTTOM' as const, isFinished: !!piece.edge_bottom, edgeTypeId: piece.edge_bottom ? (edgeTypeIdMap.get(piece.edge_bottom) ?? null) : null, length_mm: edgeLengths.bottom_mm },
      { position: 'LEFT' as const, isFinished: !!piece.edge_left, edgeTypeId: piece.edge_left ? (edgeTypeIdMap.get(piece.edge_left) ?? null) : null, length_mm: edgeLengths.left_mm },
      { position: 'RIGHT' as const, isFinished: !!piece.edge_right, edgeTypeId: piece.edge_right ? (edgeTypeIdMap.get(piece.edge_right) ?? null) : null, length_mm: edgeLengths.right_mm },
    ];

    // Get no_strip_edges for this piece (wall edges + promoted edges that don't need lamination strips)
    const storedNoStrip = (piece.no_strip_edges as unknown as string[]) ?? [];
    const promotedEdges = promotedEdgesByParent.get(piece.id) ?? [];
    // Merge and deduplicate: wall edges + promoted edges
    const noStripEdges = Array.from(new Set([...storedNoStrip, ...promotedEdges]));

    // Compute finished edge length in Lm for polishing (edges with profiles assigned).
    // Compute strip length in Lm for lamination (ALL edges minus wall edges).
    let finishedEdgesLm: number | undefined;
    let stripLm: number | undefined;
    if (isShapedPiece) {
      const savedEdges = (piece.shape_config as unknown as {
        edges?: Record<string, string | null>
      })?.edges ?? {};

      const finishableLengths = getFinishableEdgeLengthsMm(
        shapeType,
        piece.shape_config as unknown as ShapeConfig,
        piece.length_mm ?? 0,
        piece.width_mm ?? 0
      );

      // Sum lengths of edges that have a profile assigned (non-null) — for polishing
      // ONLY keys present in finishableLengths are valid — join faces are not in this map
      finishedEdgesLm = 0;
      for (const [key, lengthMm] of Object.entries(finishableLengths)) {
        if (savedEdges[key]) {
          finishedEdgesLm += lengthMm / 1000;
        }
      }

      // Strip all edges MINUS wall edges — for lamination
      stripLm = Object.entries(finishableLengths)
        .filter(([key]) => !noStripEdges.includes(key))
        .reduce((sum, [, mm]) => sum + (mm / 1000), 0);
    } else {
      // Rectangle: all 4 edges minus wall edges — for lamination
      const rectEdgeLengths: Record<string, number> = {
        top: piece.length_mm,
        bottom: piece.length_mm,
        left: piece.width_mm,
        right: piece.width_mm,
      };
      stripLm = Object.entries(rectEdgeLengths)
        .filter(([key]) => !noStripEdges.includes(key))
        .reduce((sum, [, mm]) => sum + (mm / 1000), 0);
    }

    // Promoted apron strip: only one cut along its length (not full perimeter)
    const isPromotedStrip = !!(piece as any).promoted_from_piece_id;

    enginePieces.push({
      id: String(piece.id),
      name: piece.name || piece.description || `Piece ${piece.id}`,
      length_mm: piece.length_mm,
      width_mm: piece.width_mm,
      thickness_mm: piece.thickness_mm,
      isOversize,
      joinLength_Lm: joinLengthLm,
      requiresGrainMatch: isOversize,
      // Lamination method is an explicit user choice — never inferred from thickness.
      laminationMethod: piece.lamination_method === 'MITRED'
        ? 'MITRED'
        : piece.lamination_method === 'LAMINATED'
        ? 'LAMINATED'
        : null,
      edges,
      cutouts: engineCutouts,
      // Shape geometry overrides for L/U pieces — RECTANGLE returns identical values
      cuttingPerimeterLm: isPromotedStrip
        ? (piece.length_mm ?? 0) / 1000
        : isShapedPiece
        ? getCuttingPerimeterLm(
            (piece.shape_type ?? 'RECTANGLE') as ShapeType,
            piece.shape_config as unknown as ShapeConfig,
            piece.length_mm ?? 0,
            piece.width_mm ?? 0,
          )
        : undefined,
      areaSqm: isShapedPiece ? geometry.totalAreaSqm : undefined,
      finishedEdgesLm,
      stripLm,
      shapeType: (piece as any).shape_type ?? 'RECTANGLE',
      shapeConfig: (piece as any).shape_config as unknown,
      arcLengthLm: isCurvedShape((piece as any).shape_type)
        ? calcArcLengthM((piece as any).shape_type!, (piece as any).shape_config)
        : undefined,
      arcEdgeConfig: (piece.edge_arc_config as unknown as ArcEdgeConfig) ?? null,
    });
  }

  // Assemble engine input and call the pricing rules engine
  const engineInput: PricingEngineInput = {
    settings: {
      cuttingUnit: pricingContext.cuttingUnit as EngineSettings['cuttingUnit'],
      polishingUnit: pricingContext.polishingUnit as EngineSettings['polishingUnit'],
      installationUnit: pricingContext.installationUnit as EngineSettings['installationUnit'],
      gstRate: pricingContext.gstRate,
      materialPricingBasis: pricingContext.materialPricingBasis as EngineSettings['materialPricingBasis'],
      deliveryCost: 0,
      templatingCost: 0,
      laminatedMultiplier: pricingContext.laminatedMultiplier,
      mitredMultiplier: pricingContext.mitredMultiplier,
      curvedCuttingMode: pricingContext.curvedCuttingMode,
      curvedPolishingMode: pricingContext.curvedPolishingMode,
    },
    serviceRates: engineServiceRates,
    edgeCategoryRates: engineEdgeCategoryRates,
    cutoutRates: engineCutoutRates,
    material: { fabricationCategory: primaryFabricationCategory, pricePerSlab: 0 },
    slabCount: 0,
    pieces: enginePieces,
  };

  let engineResult: ReturnType<typeof calculateEngineQuote>;
  try {
    engineResult = calculateEngineQuote(engineInput);
  } catch (engineError) {
    // Engine threw on a missing service rate for the fabrication category.
    // Record the error and build a zeroed-out result so the calculator continues.
    const errMsg = engineError instanceof Error ? engineError.message : String(engineError);
    missingRates.push({
      code: 'ENGINE_RATE',
      pieceId: 'all',
      pieceName: 'All pieces',
      description: errMsg,
    });
    // Build zeroed-out engine result so downstream code can continue
    engineResult = {
      pieces: enginePieces.map(ep => ({
        id: ep.id,
        name: ep.name,
        cutting: { lm: 0, ratePerLm: 0, cost: 0 },
        polishing: { lm: 0, ratePerLm: 0, cost: 0 },
        edgeProfiles: { lm: 0, cost: 0, items: [] },
        lamination: null,
        curvedCutting: null,
        curvedPolishing: null,
        cutouts: { cost: 0, items: [] },
        join: null,
        grainSurcharge: null,
        installation: { area_sqm: 0, ratePerSqm: 0, cost: 0 },
        subtotal: 0,
      })),
      material: { slabCount: 0, pricePerSlab: 0, cost: 0 },
      fabricationSubtotal: 0,
      installationSubtotal: 0,
      deliveryCost: 0,
      templatingCost: 0,
      subtotalExGst: 0,
      gstRate: pricingContext.gstRate,
      gstAmount: 0,
      totalIncGst: 0,
    };
  }

  // ─── Detect post-engine silent $0 rates for edges and cutouts ──────────────

  for (let i = 0; i < engineResult.pieces.length; i++) {
    const ep = engineResult.pieces[i];
    const piece = allPieces[i];
    if (!piece) continue;
    const pieceName = piece.name || piece.description || `Piece ${piece.id}`;
    const pieceFab: string =
      (piece.materials as unknown as { fabrication_category?: string } | null)
        ?.fabrication_category ?? 'ENGINEERED';

    // Detect edge profiles with $0 rate where an edge category rate should exist
    for (const item of ep.edgeProfiles.items) {
      if (item.rate === 0 && item.lm > 0) {
        const dbEdgeType = edgeTypeReverseMap.get(item.edgeTypeId);
        // Only flag if the edge type is active (deactivated types are caught above)
        if (dbEdgeType) {
          missingRates.push({
            code: 'EDGE_CATEGORY_RATE',
            pieceId: String(piece.id),
            pieceName,
            description: `No edge category rate for "${dbEdgeType.name}" on ${pieceFab} — edge profile surcharge is $0`,
          });
        }
      }
    }

    // Detect cutouts with $0 rate
    for (const item of ep.cutouts.items) {
      if (item.rate === 0 && item.qty > 0) {
        missingRates.push({
          code: 'CUTOUT_CATEGORY_RATE',
          pieceId: String(piece.id),
          pieceName,
          description: `No cutout category rate for "${item.type}" on ${pieceFab} — cutout charge is $0`,
        });
      }
    }
  }

  // ─── Map engine results to existing result shapes ──────────────────────────

  // Build aggregate service breakdown from engine results
  const serviceData: { items: ServiceBreakdown[]; subtotal: number } = { items: [], subtotal: 0 };

  const totalCuttingCost = engineResult.pieces.reduce((s, p) => s + p.cutting.cost, 0);
  const totalCuttingLm = engineResult.pieces.reduce((s, p) => s + p.cutting.lm, 0);
  if (totalCuttingCost > 0 || engineResult.pieces.length > 0) {
    serviceData.items.push({
      serviceType: 'CUTTING', name: 'Cutting',
      quantity: roundToTwo(totalCuttingLm), unit: 'LINEAR_METRE',
      rate: totalCuttingLm > 0 ? roundToTwo(totalCuttingCost / totalCuttingLm) : 0,
      subtotal: roundToTwo(totalCuttingCost),
    });
    serviceData.subtotal += totalCuttingCost;
  }

  const totalPolishingCost = engineResult.pieces.reduce((s, p) => s + p.polishing.cost, 0);
  const totalPolishingLm = engineResult.pieces.reduce((s, p) => s + p.polishing.lm, 0);
  if (totalPolishingLm > 0) {
    serviceData.items.push({
      serviceType: 'POLISHING', name: 'Polishing',
      quantity: roundToTwo(totalPolishingLm), unit: pricingContext.polishingUnit,
      rate: totalPolishingLm > 0 ? roundToTwo(totalPolishingCost / totalPolishingLm) : 0,
      subtotal: roundToTwo(totalPolishingCost),
    });
    serviceData.subtotal += totalPolishingCost;
  }

  const totalInstallCost = engineResult.installationSubtotal;
  const totalInstallArea = engineResult.pieces.reduce((s, p) => s + p.installation.area_sqm, 0);
  if (totalInstallCost > 0) {
    serviceData.items.push({
      serviceType: 'INSTALLATION', name: 'Installation',
      quantity: roundToTwo(totalInstallArea), unit: pricingContext.installationUnit,
      rate: totalInstallArea > 0 ? roundToTwo(totalInstallCost / totalInstallArea) : 0,
      subtotal: roundToTwo(totalInstallCost),
    });
    serviceData.subtotal += totalInstallCost;
  }

  const totalLaminationCost = engineResult.pieces.reduce((s, p) => s + (p.lamination?.cost ?? 0), 0);
  const totalLaminationLm = engineResult.pieces.reduce((s, p) => s + (p.lamination?.lm ?? 0), 0);
  if (totalLaminationCost > 0) {
    serviceData.items.push({
      serviceType: 'LAMINATION', name: 'Lamination (edge build-up)',
      quantity: roundToTwo(totalLaminationLm), unit: 'LINEAR_METRE',
      rate: totalLaminationLm > 0 ? roundToTwo(totalLaminationCost / totalLaminationLm) : 0,
      subtotal: roundToTwo(totalLaminationCost),
    });
    serviceData.subtotal += totalLaminationCost;
  }

  // Waterfall ends: supports FIXED_PER_END and PER_LINEAR_METRE methods
  const waterfallPieces = allPieces.filter((p: any) => {
    // Primary: detect by piece_type (real Prisma field added in WF-1a)
    if (p.piece_type === 'WATERFALL') return true;
    // Legacy fallback: waterfall_height_mm for pieces created before WF-1b
    if (p.waterfall_height_mm && p.waterfall_height_mm > 0) return true;
    return false;
  });
  if (waterfallPieces.length > 0) {
    const avgThickness = allPieces.length > 0
      ? allPieces.reduce((sum: number, p: any) => sum + p.thickness_mm, 0) / allPieces.length
      : 20;
    const waterfallRateRecord = serviceRates.find(r =>
      r.serviceType === 'WATERFALL_END' && r.fabricationCategory === primaryFabricationCategory
    ) ?? serviceRates.find(r => r.serviceType === 'WATERFALL_END');
    if (!waterfallRateRecord) {
      // Waterfall pieces exist but no rate configured — record missing rate
      for (const wfPiece of waterfallPieces) {
        missingRates.push({
          code: 'WATERFALL_END',
          pieceId: String((wfPiece as any).id),
          pieceName: (wfPiece as any).name || (wfPiece as any).description || `Piece ${(wfPiece as any).id}`,
          description: `No WATERFALL_END rate found for ${primaryFabricationCategory} category`,
        });
      }
    }
    if (waterfallRateRecord) {
      const waterfallMethod = pricingContext.waterfallPricingMethod ?? 'FIXED_PER_END';
      const waterfallRateVal = avgThickness > 20
        ? waterfallRateRecord.rate40mm.toNumber()
        : waterfallRateRecord.rate20mm.toNumber();
      if (waterfallMethod === 'FIXED_PER_END') {
        const waterfallCount = waterfallPieces.length;
        const cost = applyMinimumCharge(waterfallCount * waterfallRateVal, waterfallRateRecord);
        serviceData.items.push({
          serviceType: 'WATERFALL_END', name: waterfallRateRecord.name,
          quantity: waterfallCount, unit: 'EACH',
          rate: waterfallRateVal, subtotal: roundToTwo(cost),
        });
        serviceData.subtotal += cost;
      } else if (waterfallMethod === 'PER_LINEAR_METRE') {
        let totalWaterfallCost = 0;
        let totalHeightLm = 0;
        for (const wf of waterfallPieces) {
          const heightMm = (wf as any).waterfall_height_mm ?? 900;
          const heightLm = heightMm / 1000;
          totalWaterfallCost += heightLm * waterfallRateVal;
          totalHeightLm += heightLm;
        }
        totalWaterfallCost = applyMinimumCharge(totalWaterfallCost, waterfallRateRecord);
        serviceData.items.push({
          serviceType: 'WATERFALL_END', name: waterfallRateRecord.name,
          quantity: roundToTwo(totalHeightLm), unit: 'LINEAR_METRE',
          rate: waterfallRateVal, subtotal: roundToTwo(totalWaterfallCost),
        });
        serviceData.subtotal += totalWaterfallCost;
      }
    }
  }

  // Map join and grain surcharge from engine to service items
  for (let i = 0; i < engineResult.pieces.length; i++) {
    const ep = engineResult.pieces[i];
    const pieceFabCategory: string =
      (allPieces[i].materials as unknown as { fabrication_category?: string } | null)
        ?.fabrication_category ?? 'ENGINEERED';
    if (ep.join) {
      serviceData.items.push({
        serviceType: 'JOIN',
        name: `Join - ${cutPlans[i].strategy} (${ep.name})`,
        quantity: roundToTwo(ep.join.lm), unit: 'LINEAR_METRE',
        rate: ep.join.rate, subtotal: roundToTwo(ep.join.cost),
        fabricationCategory: pieceFabCategory,
      });
      serviceData.subtotal += ep.join.cost;
    }
    if (ep.grainSurcharge && ep.grainSurcharge.cost > 0) {
      serviceData.items.push({
        serviceType: 'JOIN',
        name: `Grain Matching Surcharge (${ep.name})`,
        quantity: 1, unit: 'FIXED',
        rate: ep.grainSurcharge.cost, subtotal: roundToTwo(ep.grainSurcharge.cost),
        fabricationCategory: pieceFabCategory,
      });
      serviceData.subtotal += ep.grainSurcharge.cost;
    }
  }

  // Corner join pricing for L/U shaped pieces
  for (let i = 0; i < allPieces.length; i++) {
    const piece = allPieces[i];
    const geometry = pieceGeometries[i];
    if (geometry.cornerJoins <= 0) continue;

    const shapeType = ((piece as any).shape_type ?? 'RECTANGLE') as ShapeType;
    const shapeConfig = (piece as any).shape_config as unknown as ShapeConfig;
    if (!shapeConfig) continue;

    const pieceFabCategory: string =
      (piece.materials as unknown as { fabrication_category?: string } | null)
        ?.fabrication_category ?? 'ENGINEERED';

    // Look up JOIN rate (same rate used for oversize joins)
    const { rate: joinRate } = getServiceRateSafe(
      serviceRates, 'JOIN', piece.thickness_mm, pieceFabCategory,
      missingRates, piece.id, piece.name || piece.description || `Piece ${piece.id}`,
    );
    if (joinRate === 0) continue; // No JOIN rate — skip corner join pricing

    // Calculate total corner join length in metres
    let totalJoinLengthLm = 0;
    if (shapeType === 'L_SHAPE' && shapeConfig.shape === 'L_SHAPE') {
      totalJoinLengthLm = Math.min(
        shapeConfig.leg1.width_mm,
        shapeConfig.leg2.width_mm
      ) / 1000;
    }
    if (shapeType === 'U_SHAPE' && shapeConfig.shape === 'U_SHAPE') {
      totalJoinLengthLm = (shapeConfig.back.width_mm * 2) / 1000;
    }

    if (totalJoinLengthLm > 0) {
      const joinCost = totalJoinLengthLm * joinRate;
      const pieceName = piece.name || piece.description || `Piece ${piece.id}`;

      serviceData.items.push({
        serviceType: 'JOIN',
        name: `Corner Join - ${shapeType === 'L_SHAPE' ? 'L-Shape' : 'U-Shape'} (${pieceName})`,
        quantity: roundToTwo(totalJoinLengthLm), unit: 'LINEAR_METRE',
        rate: joinRate, subtotal: roundToTwo(joinCost),
        fabricationCategory: pieceFabCategory,
      });
      serviceData.subtotal += joinCost;

      // Grain matching surcharge only applied when explicitly opted-in
      if (piece.requiresGrainMatch === true) {
        const grainSurchargeRate = pricingContext.grainMatchingSurchargePercent / 100;
        const grainSurcharge = joinCost * grainSurchargeRate;
        if (grainSurcharge > 0) {
          serviceData.items.push({
            serviceType: 'JOIN',
            name: `Grain Matching Surcharge - Corner Join (${pieceName})`,
            quantity: 1, unit: 'FIXED',
            rate: roundToTwo(grainSurcharge), subtotal: roundToTwo(grainSurcharge),
            fabricationCategory: pieceFabCategory,
          });
          serviceData.subtotal += grainSurcharge;
        }
      }
    }
  }

  // Build aggregate edge breakdown from engine results
  const edgeData = mapEdgeBreakdownFromEngine(engineResult, edgeTypeReverseMap);

  // Build aggregate cutout breakdown from engine results
  const cutoutData = mapCutoutBreakdownFromEngine(engineResult);

  // Build per-piece breakdowns from engine results
  const pieceBreakdowns: PiecePricingBreakdown[] = [];

  // Proportional allocation of material and installation across pieces
  // Use shape geometry for area (L/U shapes have different area than length×width)
  const totalAreaSqm = pieceGeometries.reduce(
    (sum: number, g: { totalAreaSqm: number }) => sum + g.totalAreaSqm, 0
  );
  const totalMaterialCost = materialBreakdown.subtotal;
  const totalInstallationCost = engineResult.installationSubtotal;
  let allocatedMaterial = 0;
  let allocatedInstallation = 0;
  // Find last piece with materials for rounding correction
  let lastMaterialPieceIdx = -1;
  for (let j = allPieces.length - 1; j >= 0; j--) {
    if (allPieces[j].materials) { lastMaterialPieceIdx = j; break; }
  }

  // Build materialId → group lookup for per-piece display fields and per-group allocation
  const materialGroupMap = new Map<number, { materialName: string; slabCount: number | undefined; slabRate: number | undefined; totalCost: number; totalAreaM2: number }>();
  if (materialBreakdown.byMaterial) {
    for (const g of materialBreakdown.byMaterial) {
      materialGroupMap.set(g.materialId, {
        materialName: g.materialName,
        slabCount: g.slabCount,
        slabRate: g.slabRate,
        totalCost: g.totalCost,
        totalAreaM2: g.totalAreaM2,
      });
    }
  }

  // For multi-material quotes, track per-group allocation to avoid cross-material contamination.
  // Each piece's material share comes from its OWN material group's totalCost, not the overall total.
  const isMultiMaterial = materialGroupMap.size > 1;
  const groupAllocation = new Map<number, { allocated: number; lastPieceIdx: number }>();
  if (isMultiMaterial) {
    // Find last piece index per material group for rounding correction
    for (let j = allPieces.length - 1; j >= 0; j--) {
      const matId = (allPieces[j].materials as unknown as { id?: number } | null)?.id ?? 0;
      if (matId && allPieces[j].materials && !groupAllocation.has(matId)) {
        groupAllocation.set(matId, { allocated: 0, lastPieceIdx: j });
      }
    }
  }

  for (let i = 0; i < allPieces.length; i++) {
    const piece = allPieces[i];
    const ep = engineResult.pieces[i];
    if (!ep) {
      pieceBreakdowns.push(zeroedPieceBreakdown(piece, pricingContext));
      continue;
    }
    const pieceFabCategory: string =
      (piece.materials as unknown as { fabrication_category?: string } | null)
        ?.fabrication_category ?? 'ENGINEERED';

    const edgeBreakdowns: PiecePricingBreakdown['fabrication']['edges'] = ep.edgeProfiles.items.map(item => {
      const dbEdgeType = edgeTypeReverseMap.get(item.edgeTypeId);
      return {
        side: 'top' as const,
        edgeTypeId: dbEdgeType?.id ?? String(item.edgeTypeId),
        edgeTypeName: dbEdgeType?.name ?? `Edge ${item.edgeTypeId}`,
        lengthMm: roundToTwo(item.lm * 1000),
        linearMeters: roundToTwo(item.lm),
        rate: item.rate,
        baseAmount: roundToTwo(item.cost),
        discount: 0,
        total: roundToTwo(item.cost),
        discountPercentage: 0,
      };
    });

    const cutoutBreakdowns: PiecePricingBreakdown['fabrication']['cutouts'] = ep.cutouts.items.map(item => ({
      cutoutTypeId: item.type,
      cutoutTypeName: item.type,
      quantity: item.qty,
      rate: item.rate,
      baseAmount: roundToTwo(item.cost),
      discount: 0,
      total: roundToTwo(item.cost),
    }));

    let laminationBreakdown: PiecePricingBreakdown['fabrication']['lamination'];
    if (ep.lamination) {
      laminationBreakdown = {
        method: piece.lamination_method,
        finishedEdgeLm: roundToTwo(ep.lamination.lm),
        baseRate: ep.lamination.rate,
        multiplier: piece.lamination_method === 'MITRED' ? pricingContext.mitredMultiplier : pricingContext.laminatedMultiplier,
        total: roundToTwo(ep.lamination.cost),
      };
    }

    let installationBreakdown: PiecePricingBreakdown['fabrication']['installation'];
    if (totalInstallationCost > 0) {
      const pieceAreaForInstall = pieceGeometries[i].totalAreaSqm;
      let installationShare: number;
      if (i === allPieces.length - 1) {
        // Last piece gets remainder to avoid rounding drift
        installationShare = roundToTwo(totalInstallationCost - allocatedInstallation);
      } else {
        installationShare = totalAreaSqm > 0
          ? roundToTwo((pieceAreaForInstall / totalAreaSqm) * totalInstallationCost)
          : 0;
        allocatedInstallation += installationShare;
      }
      if (installationShare > 0) {
        installationBreakdown = {
          quantity: roundToTwo(pieceAreaForInstall),
          unit: pricingContext.installationUnit,
          rate: ep.installation.ratePerSqm,
          baseAmount: installationShare,
          discount: 0,
          total: installationShare,
        };
      }
    }

    // Apply minimum charges to curved cutting/polishing (Admin Pricing → Service Rates)
    let curvedCuttingCostFinal = ep.curvedCutting?.cost ?? 0;
    if (ep.curvedCutting && ep.curvedCutting.cost > 0) {
      const ccRate = serviceRates.find(
        (r: ServiceRateRecord) => r.serviceType === 'CURVED_CUTTING' && r.fabricationCategory === pieceFabCategory
      );
      if (ccRate) {
        curvedCuttingCostFinal = applyMinimumCharge(ep.curvedCutting.cost, ccRate);
      }
    }

    let curvedPolishingCostFinal = ep.curvedPolishing?.cost ?? 0;
    if (ep.curvedPolishing && ep.curvedPolishing.cost > 0) {
      const cpRate = serviceRates.find(
        (r: ServiceRateRecord) => r.serviceType === 'CURVED_POLISHING' && r.fabricationCategory === pieceFabCategory
      );
      if (cpRate) {
        curvedPolishingCostFinal = applyMinimumCharge(ep.curvedPolishing.cost, cpRate);
      }
    }

    const fabricationSubtotal = roundToTwo(
      ep.cutting.cost + curvedCuttingCostFinal +
      ep.polishing.cost + curvedPolishingCostFinal +
      ep.edgeProfiles.cost + (ep.lamination?.cost ?? 0) + ep.cutouts.cost +
      (installationBreakdown?.total ?? 0)
    );

    const pbd: PiecePricingBreakdown = {
      pieceId: piece.id,
      pieceName: piece.name || piece.description || `Piece ${piece.id}`,
      fabricationCategory: pieceFabCategory,
      dimensions: { lengthMm: piece.length_mm, widthMm: piece.width_mm, thicknessMm: piece.thickness_mm },
      fabrication: {
        cutting: {
          quantity: roundToTwo(ep.cutting.lm), unit: pricingContext.cuttingUnit,
          rate: ep.cutting.ratePerLm, baseAmount: roundToTwo(ep.cutting.cost),
          discount: 0, total: roundToTwo(ep.cutting.cost), discountPercentage: 0,
        },
        polishing: {
          quantity: roundToTwo(ep.polishing.lm), unit: pricingContext.polishingUnit,
          rate: ep.polishing.ratePerLm, baseAmount: roundToTwo(ep.polishing.cost),
          discount: 0, total: roundToTwo(ep.polishing.cost), discountPercentage: 0,
        },
        installation: installationBreakdown,
        lamination: laminationBreakdown,
        edges: edgeBreakdowns,
        cutouts: cutoutBreakdowns,
        subtotal: fabricationSubtotal,
        ...(ep.curvedCutting ? { curvedCutting: { arcLengthLm: roundToTwo(ep.curvedCutting.lm), rate: ep.curvedCutting.ratePerLm, cost: roundToTwo(curvedCuttingCostFinal) } } : {}),
        ...(ep.curvedPolishing ? { curvedPolishing: { arcLengthLm: roundToTwo(ep.curvedPolishing.lm), rate: ep.curvedPolishing.ratePerLm, cost: roundToTwo(curvedPolishingCostFinal) } } : {}),
      },
      pieceTotal: fabricationSubtotal,
    };

    // Add oversize data from engine results
    if (ep.join) {
      pbd.oversize = {
        isOversize: true,
        joinCount: cutPlans[i].joins.length,
        joinLengthLm: roundToTwo(ep.join.lm),
        joinRate: ep.join.rate,
        joinCost: roundToTwo(ep.join.cost),
        grainMatchingSurchargeRate: ep.grainSurcharge ? ep.grainSurcharge.rate : 0,
        fabricationSubtotalBeforeSurcharge: fabricationSubtotal,
        grainMatchingSurcharge: roundToTwo(ep.grainSurcharge?.cost ?? 0),
        strategy: cutPlans[i].strategy,
        warnings: cutPlans[i].warnings,
      };
      pbd.pieceTotal = roundToTwo(pbd.pieceTotal + ep.join.cost + (ep.grainSurcharge?.cost ?? 0));
    }

    // Add corner join data for L/U shaped pieces
    const pieceGeometry = pieceGeometries[i];
    if (pieceGeometry.cornerJoins > 0) {
      const shapeType = ((piece as any).shape_type ?? 'RECTANGLE') as ShapeType;
      const shapeConfig = (piece as any).shape_config as unknown as ShapeConfig;

      if (shapeConfig) {
        let cornerJoinLengthLm = 0;
        if (shapeType === 'L_SHAPE' && shapeConfig.shape === 'L_SHAPE') {
          cornerJoinLengthLm = Math.min(shapeConfig.leg1.width_mm, shapeConfig.leg2.width_mm) / 1000;
        }
        if (shapeType === 'U_SHAPE' && shapeConfig.shape === 'U_SHAPE') {
          cornerJoinLengthLm = (shapeConfig.back.width_mm * 2) / 1000;
        }

        if (cornerJoinLengthLm > 0) {
          const { rate: cornerJoinRate } = getServiceRateSafe(
            serviceRates, 'JOIN', piece.thickness_mm, pieceFabCategory,
            missingRates, piece.id, piece.name || piece.description || `Piece ${piece.id}`,
          );

          const cornerJoinCost = cornerJoinLengthLm * cornerJoinRate;
          // Grain matching surcharge only applied when explicitly opted-in
          const grainSurchargeRate = piece.requiresGrainMatch === true
            ? pricingContext.grainMatchingSurchargePercent / 100
            : 0;
          const cornerGrainSurcharge = cornerJoinCost * grainSurchargeRate;

          pbd.cornerJoin = {
            shapeType,
            cornerJoins: pieceGeometry.cornerJoins,
            joinLengthLm: roundToTwo(cornerJoinLengthLm),
            joinRate: cornerJoinRate,
            joinCost: roundToTwo(cornerJoinCost),
            grainMatchingSurchargeRate: grainSurchargeRate,
            grainMatchingSurcharge: roundToTwo(cornerGrainSurcharge),
          };
          pbd.pieceTotal = roundToTwo(pbd.pieceTotal + cornerJoinCost + cornerGrainSurcharge);
        }
      }
    }

    // Grain match feasibility check — warn if grain-matched piece may not fit on a single slab
    if (piece.requiresGrainMatch === true && piece.materials) {
      const matForCheck = piece.materials as unknown as {
        slab_length_mm?: number | null;
        slab_width_mm?: number | null;
      };
      const slabLenCheck = matForCheck.slab_length_mm ?? 3000;
      const slabWdCheck = matForCheck.slab_width_mm ?? 1400;
      const shapeTypeCheck = ((piece as any).shape_type ?? 'RECTANGLE') as string;
      const shapeConfigCheck = (piece as any).shape_config as unknown;

      const grainCheck = checkGrainMatchFeasibility(
        {
          shapeType: shapeTypeCheck,
          shapeConfig: shapeConfigCheck,
          lengthMm: piece.length_mm,
          widthMm: piece.width_mm,
        },
        { slabLength_mm: slabLenCheck, slabWidth_mm: slabWdCheck },
        pieceGeometries[i].totalAreaSqm
      );
      if (!grainCheck.feasible) {
        pbd.grainMatchWarning = grainCheck;
      }
    }

    // Add per-piece proportional material cost
    // Each piece gets its area share of the total material cost (from optimizer/aggregate)
    if (piece.materials) {
      const mat = piece.materials as unknown as {
        price_per_sqm: { toNumber: () => number };
        price_per_slab?: { toNumber: () => number } | null;
        slab_length_mm?: number | null;
        slab_width_mm?: number | null;
      };
      const pieceAreaM2 = roundToTwo(pieceGeometries[i].totalAreaSqm);
      const pricePerSlab = mat.price_per_slab?.toNumber();
      const pricePerSqm = mat.price_per_sqm.toNumber();

      // Proportional area share of material cost.
      // For multi-material quotes, allocate within each material group so a piece's
      // cost comes exclusively from its own material, not from the cross-material total.
      let materialShare: number;
      const matId = (piece.materials as unknown as { id?: number }).id ?? 0;
      const matGroup = materialGroupMap.get(matId);
      if (isMultiMaterial && matGroup) {
        const ga = groupAllocation.get(matId);
        if (ga && i === ga.lastPieceIdx) {
          // Last piece in this material group gets remainder to avoid rounding drift
          materialShare = roundToTwo(matGroup.totalCost - ga.allocated);
        } else {
          materialShare = matGroup.totalAreaM2 > 0
            ? roundToTwo((pieceAreaM2 / matGroup.totalAreaM2) * matGroup.totalCost)
            : 0;
          if (ga) ga.allocated += materialShare;
        }
        allocatedMaterial += materialShare;
      } else if (i === lastMaterialPieceIdx) {
        // Single material: last piece gets remainder to avoid rounding drift
        materialShare = roundToTwo(totalMaterialCost - allocatedMaterial);
      } else {
        materialShare = totalAreaSqm > 0
          ? roundToTwo((pieceAreaM2 / totalAreaSqm) * totalMaterialCost)
          : 0;
        allocatedMaterial += materialShare;
      }

      // Per-piece PER_SQUARE_METRE display data: ratePerSqm and waste factor
      const isPieceSqm = pricingContext.materialPricingBasis === 'PER_SQUARE_METRE';
      const pieceWastePercent = isPieceSqm ? (pricingContext.wasteFactorPercent ?? 0) : undefined;
      const slabLenMm = mat.slab_length_mm ?? 3000;
      const slabWdMm = mat.slab_width_mm ?? 1400;
      const slabAreaSqm = (slabLenMm * slabWdMm) / 1_000_000;
      const pieceRatePerSqm = isPieceSqm
        ? (slabAreaSqm > 0 && pricePerSlab ? roundToTwo(pricePerSlab / slabAreaSqm) : pricePerSqm ?? 0)
        : undefined;
      const pieceAdjustedArea = isPieceSqm && pieceWastePercent
        ? roundToTwo(pieceAreaM2 * (1 + pieceWastePercent / 100))
        : undefined;

      // Look up per-material group data for display fields
      // matId and matGroup already resolved above for proportional allocation
      const matName = matGroup?.materialName
        ?? (piece.materials as unknown as { name?: string }).name
        ?? materialBreakdown.materialName;
      const pieceSlabCount = matGroup?.slabCount ?? materialBreakdown.slabCount;
      const pieceTotalSlabCost = pieceSlabCount != null && pricePerSlab != null
        ? roundToTwo(pieceSlabCount * pricePerSlab)
        : undefined;
      const pieceTotalMaterialAreaSqm = matGroup?.totalAreaM2 ?? materialBreakdown.totalAreaM2;
      const pieceSharePercent = pieceTotalMaterialAreaSqm > 0
        ? roundToTwo((pieceAreaM2 / pieceTotalMaterialAreaSqm) * 100)
        : 100;

      pbd.materials = {
        areaM2: pieceAreaM2,
        baseRate: pricePerSqm ?? pricePerSlab ?? 0,
        thicknessMultiplier: 1,
        baseAmount: materialShare,
        discount: 0,
        total: materialShare,
        discountPercentage: 0,
        pricingBasis: pricingContext.materialPricingBasis === 'PER_SLAB' ? 'PER_SLAB' : 'PER_SQUARE_METRE',
        slabCount: pieceSlabCount,
        pricePerSlab,
        pricePerSqm,
        ratePerSqm: pieceRatePerSqm,
        wasteFactorPercent: pieceWastePercent,
        adjustedAreaM2: pieceAdjustedArea,
        materialName: matName,
        totalSlabCost: pieceTotalSlabCost,
        totalMaterialAreaSqm: pieceTotalMaterialAreaSqm,
        sharePercent: pieceSharePercent,
      };
      pbd.pieceTotal = roundToTwo(pbd.pieceTotal + materialShare);
    }

    pieceBreakdowns.push(pbd);
  }

  // Calculate delivery cost
  // Delivery/templating fields are in schema but use `as any` for safety with Prisma types
  const quoteAny = quote as any;
  const deliveryAddress = quoteAny.deliveryAddress || quote.project_address || null;
  let deliveryDistanceKm = quoteAny.deliveryDistanceKm ? Number(quoteAny.deliveryDistanceKm) : null;
  let calculatedDeliveryCost = quoteAny.deliveryCost ? Number(quoteAny.deliveryCost) : null;
  let calculatedTemplatingCost = quoteAny.templatingCost ? Number(quoteAny.templatingCost) : null;
  let deliveryZoneName: string | null = null;

  // Auto-calculate delivery/templating when address exists but costs haven't been saved
  if (deliveryAddress && calculatedDeliveryCost === null) {
    try {
      const distResult = await calculateDistance(COMPANY_ADDRESS, deliveryAddress);
      deliveryDistanceKm = distResult.distanceKm;

      const zone = getDeliveryZone(distResult.distanceKm, DELIVERY_ZONES);
      if (zone) {
        deliveryZoneName = zone.name;
        calculatedDeliveryCost = roundToTwo(calculateDeliveryCostFn(distResult.distanceKm, zone));
      }

      calculatedTemplatingCost = roundToTwo(calculateTemplatingCostFn(distResult.distanceKm, TEMPLATING_RATE));
    } catch (error) {
      console.error('Auto-delivery calculation failed:', error);
    }
  }

  const deliveryBreakdown = {
    address: deliveryAddress,
    distanceKm: deliveryDistanceKm,
    zone: deliveryZoneName || quoteAny.deliveryZone?.name || null,
    calculatedCost: calculatedDeliveryCost,
    overrideCost: quoteAny.overrideDeliveryCost ? Number(quoteAny.overrideDeliveryCost) : null,
    finalCost: quoteAny.overrideDeliveryCost
      ? Number(quoteAny.overrideDeliveryCost)
      : (calculatedDeliveryCost ?? 0),
  };

  // Calculate templating cost — guard: if templatingRequired is false, cost is always $0
  const templatingRequired = quoteAny.templatingRequired === true;
  const templatingBreakdown = {
    required: templatingRequired,
    distanceKm: quoteAny.templatingDistanceKm ? Number(quoteAny.templatingDistanceKm) : deliveryDistanceKm,
    calculatedCost: calculatedTemplatingCost,
    overrideCost: quoteAny.overrideTemplatingCost ? Number(quoteAny.overrideTemplatingCost) : null,
    finalCost: templatingRequired
      ? (quoteAny.overrideTemplatingCost
          ? Number(quoteAny.overrideTemplatingCost)
          : (calculatedTemplatingCost ?? 0))
      : 0,
  };

  // Calculate initial subtotal from aggregate values.
  // Material and installation are NOT double-counted — these aggregates are computed
  // independently of the per-piece proportional values (which are display-only in the
  // piece breakdown). The informational Material and Installation summary lines in the
  // UI are derived from these aggregates and do not add to the subtotal again.
  const piecesSubtotal =
    materialBreakdown.subtotal +
    edgeData.subtotal +
    cutoutData.subtotal +
    serviceData.subtotal;

  const baseSubtotal =
    piecesSubtotal +
    deliveryBreakdown.finalCost +
    templatingBreakdown.finalCost;

  // Load custom charges for this quote
  const customCharges = await prisma.quote_custom_charges.findMany({
    where: { quote_id: quoteIdNum },
    orderBy: { sort_order: 'asc' },
  });
  const customChargesTotal = customCharges.reduce(
    (sum, charge) => sum + Number(charge.amount), 0
  );

  // Load quote discount settings
  const discountRecord = await prisma.quotes.findUnique({
    where: { id: quoteIdNum },
    select: { discount_type: true, discount_value: true, discount_applies_to: true },
  });

  const discountType = discountRecord?.discount_type as DiscountType | null;
  const discountValue = discountRecord?.discount_value ? Number(discountRecord.discount_value) : 0;
  const discountAppliesTo = (discountRecord?.discount_applies_to as DiscountAppliesTo) || 'ALL';

  // Apply the formula based on discount_applies_to
  let discountAmount: number;
  let discountedSubtotal: number;

  if (discountAppliesTo === 'ALL') {
    // Discount covers everything including custom charges
    const preDiscountTotal = baseSubtotal + customChargesTotal;
    discountAmount = discountType === 'PERCENTAGE'
      ? preDiscountTotal * (discountValue / 100)
      : discountType === 'ABSOLUTE'
      ? discountValue
      : 0;
    discountedSubtotal = preDiscountTotal - discountAmount;
  } else {
    // FABRICATION_ONLY: Discount on base subtotal only, custom charges added after
    discountAmount = discountType === 'PERCENTAGE'
      ? baseSubtotal * (discountValue / 100)
      : discountType === 'ABSOLUTE'
      ? discountValue
      : 0;
    discountedSubtotal = (baseSubtotal - discountAmount) + customChargesTotal;
  }

  // Ensure discount doesn't make total negative
  discountAmount = roundToTwo(discountAmount);
  discountedSubtotal = Math.max(0, roundToTwo(discountedSubtotal));

  // For backwards compatibility, keep `subtotal` variable name pointing to the effective subtotal
  const subtotal = discountedSubtotal;

  // Get applicable pricing rules
  const priceBookId = options?.priceBookId || quote.price_book_id;
  const rules = await getApplicableRules(
    quote.customers?.client_type_id || null,
    quote.customers?.client_tier_id || null,
    quote.customers?.id || null,
    priceBookId,
    piecesSubtotal
  );

  // Apply rules (simplified - focusing on the new structure)
  const materialCostTotal = materialBreakdown.subtotal;
  const edgeProfileCostTotal = edgeData.subtotal;

  const appliedRules: AppliedRule[] = rules.map(rule => {
    const pct = Math.abs(Number(rule.adjustmentValue)) / 100;
    let discountAmount = 0;

    if (rule.isActive && rule.adjustmentType === 'percentage') {
      switch (rule.appliesTo) {
        case 'materials':
          discountAmount = roundToTwo(materialCostTotal * pct);
          break;
        case 'edges':
          discountAmount = roundToTwo(edgeProfileCostTotal * pct);
          break;
        case 'all':
          discountAmount = roundToTwo(subtotal * pct);
          break;
      }
    }

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      priority: rule.priority,
      effect: `${rule.adjustmentType} ${rule.adjustmentValue}% on ${rule.appliesTo}`,
      discountAmount: roundToTwo(discountAmount),
      appliesTo: rule.appliesTo,
      adjustmentValue: Number(rule.adjustmentValue),
    };
  });

  // Apply pricing rule adjustments to subtotal
  let rulesDiscountTotal = 0;

  for (const rule of rules) {
    if (!rule.isActive) continue;
    if (rule.adjustmentType !== 'percentage') continue;

    const pct = Math.abs(Number(rule.adjustmentValue)) / 100;
    let ruleDiscount = 0;

    switch (rule.appliesTo) {
      case 'materials':
        ruleDiscount = roundToTwo(materialCostTotal * pct);
        break;
      case 'edges':
        ruleDiscount = roundToTwo(edgeProfileCostTotal * pct);
        break;
      case 'all':
        ruleDiscount = roundToTwo(subtotal * pct);
        break;
      default:
        break;
    }

    rulesDiscountTotal += ruleDiscount;
  }

  rulesDiscountTotal = roundToTwo(rulesDiscountTotal);

  // Check for quote-level overrides (planned fields, not yet in schema)
  const rulesAdjustedSubtotal = Math.max(0, roundToTwo(subtotal - rulesDiscountTotal));
  const finalSubtotal = quoteAny.overrideSubtotal
    ? Number(quoteAny.overrideSubtotal)
    : rulesAdjustedSubtotal;

  const finalTotal = quoteAny.overrideTotal
    ? Number(quoteAny.overrideTotal)
    : finalSubtotal;

  // Apply GST
  const gstRate = pricingContext.gstRate;
  const gstAmount = roundToTwo(finalTotal * gstRate);
  const totalIncGst = roundToTwo(finalTotal + gstAmount);

  // Fetch price book info
  let priceBookInfo: { id: string; name: string } | null = null;
  if (priceBookId) {
    const priceBook = await prisma.price_books.findUnique({
      where: { id: priceBookId },
      select: { id: true, name: true },
    });
    if (priceBook) {
      priceBookInfo = priceBook;
    }
  }

  return {
    quoteId,
    fabricationCategory: primaryFabricationCategory,
    subtotal: roundToTwo(subtotal),
    baseSubtotal: roundToTwo(baseSubtotal),
    totalDiscount: roundToTwo(discountAmount),
    rulesDiscount: rulesDiscountTotal,
    rulesAdjustedSubtotal,
    total: roundToTwo(finalTotal),
    gstRate,
    gstAmount,
    totalIncGst,
    // Custom charges and discount details
    customCharges: customCharges.map(c => ({
      id: c.id,
      description: c.description,
      amount: Number(c.amount),
    })),
    customChargesTotal: roundToTwo(customChargesTotal),
    discountType,
    discountValue,
    discountAppliesTo,
    discountAmount: roundToTwo(discountAmount),
    breakdown: {
      materials: materialBreakdown,
      edges: {
        totalLinearMeters: roundToTwo(edgeData.totalLinearMeters),
        byType: edgeData.byType,
        subtotal: roundToTwo(edgeData.subtotal),
        discount: 0,
        total: roundToTwo(edgeData.subtotal),
      },
      cutouts: {
        items: cutoutData.items,
        subtotal: roundToTwo(cutoutData.subtotal),
        discount: 0,
        total: roundToTwo(cutoutData.subtotal),
      },
      services: {
        items: serviceData.items,
        subtotal: roundToTwo(serviceData.subtotal),
        total: roundToTwo(serviceData.subtotal),
      },
      delivery: deliveryBreakdown,
      templating: templatingBreakdown,
      pieces: pieceBreakdowns,
    },
    appliedRules,
    discounts: [],
    price_books: priceBookInfo,
    calculated_at: new Date(),
    pricingContext,
    marginInfo: materialBreakdown.marginResolution,
    missingRates: missingRates.length > 0 ? missingRates : undefined,
  };
}

/**
 * Look up a service rate by type (and optionally fabrication category)
 * and return the thickness-appropriate value.
 * Throws if the rate is not found — prevents silent $0 calculations.
 */
function getServiceRate(
  rates: ServiceRateRecord[],
  serviceType: string,
  thickness: number,
  fabricationCategory?: string
): { rate: number; rateRecord: ServiceRateRecord } {
  // 1. Try exact match: serviceType + fabricationCategory
  let rateRecord = fabricationCategory
    ? rates.find(r => r.serviceType === serviceType && r.fabricationCategory === fabricationCategory)
    : rates.find(r => r.serviceType === serviceType && !r.fabricationCategory);

  // 2. Fallback: uncategorised rate for this service type
  if (!rateRecord) {
    rateRecord = rates.find(r => r.serviceType === serviceType && !r.fabricationCategory);
  }

  // 3. Fallback: any rate for this service type (first match)
  if (!rateRecord) {
    rateRecord = rates.find(r => r.serviceType === serviceType);
  }

  if (!rateRecord) {
    throw new Error(
      `No ${serviceType} rate found` +
      (fabricationCategory ? ` for fabrication category ${fabricationCategory}` : '') +
      `. Configure in Pricing Admin → Service Rates.`
    );
  }
  const rate = thickness > 20
    ? rateRecord.rate40mm.toNumber()
    : rateRecord.rate20mm.toNumber();
  return { rate, rateRecord };
}

/**
 * Safe wrapper around getServiceRate that catches missing rates
 * instead of throwing. Records the missing rate and returns 0.
 */
function getServiceRateSafe(
  rates: ServiceRateRecord[],
  serviceType: string,
  thickness: number,
  fabricationCategory: string | undefined,
  missingRates: MissingRate[],
  pieceId: string | number,
  pieceName: string,
): { rate: number; rateRecord: ServiceRateRecord | null } {
  try {
    return getServiceRate(rates, serviceType, thickness, fabricationCategory);
  } catch {
    missingRates.push({
      code: serviceType,
      pieceId: String(pieceId),
      pieceName: pieceName || `Piece ${pieceId}`,
      description: `No ${serviceType} rate found for ${fabricationCategory ?? 'default'} category at ${thickness}mm thickness`,
    });
    return {
      rate: 0,
      rateRecord: null,
    };
  }
}

/**
 * Apply minimum charge: returns the greater of calculatedCost or the rate's minimumCharge.
 */
function applyMinimumCharge(
  calculatedCost: number,
  rateRecord: { minimumCharge: { toNumber: () => number } | null }
): number {
  if (rateRecord.minimumCharge) {
    const minimum = rateRecord.minimumCharge.toNumber();
    if (minimum > 0) {
      return Math.max(calculatedCost, minimum);
    }
  }
  return calculatedCost;
}

/**
 * Get applicable rules (simplified version)
 */
async function getApplicableRules(
  clientTypeId: string | null,
  clientTierId: string | null,
  customerId: number | null,
  price_book_id: string | null,
  quoteTotal: number
): Promise<PricingRuleWithOverrides[]> {
  const conditions: Array<Record<string, unknown>> = [
    { clientTypeId: null, clientTierId: null, customerId: null },
  ];

  if (customerId) conditions.push({ customerId });
  if (clientTypeId) conditions.push({ clientTypeId });
  if (clientTierId) conditions.push({ clientTierId });

  const rules = await prisma.pricing_rules_engine.findMany({
    where: {
      isActive: true,
      OR: conditions,
    },
    include: {
      client_tiers: true,
      pricing_rule_edges: true,
      pricing_rule_cutouts: true,
      pricing_rule_materials: true,
    },
    orderBy: { priority: 'desc' },
  });

  return rules.filter(rule => {
    if (rule.minQuoteValue && quoteTotal < rule.minQuoteValue.toNumber()) return false;
    if (rule.maxQuoteValue && quoteTotal > rule.maxQuoteValue.toNumber()) return false;
    return true;
  }) as unknown as PricingRuleWithOverrides[];
}

// ─── Engine result mapping helpers ────────────────────────────────────────────

/**
 * Map engine edge profile results to aggregate EdgeBreakdown[] for backwards compatibility.
 */
function mapEdgeBreakdownFromEngine(
  engineResult: ReturnType<typeof calculateEngineQuote>,
  edgeTypeReverseMap: Map<number, { id: string; name: string }>
): { totalLinearMeters: number; byType: EdgeBreakdown[]; subtotal: number } {
  const edgeTotals = new Map<number, { lm: number; cost: number }>();
  for (const piece of engineResult.pieces) {
    for (const item of piece.edgeProfiles.items) {
      const existing = edgeTotals.get(item.edgeTypeId) || { lm: 0, cost: 0 };
      existing.lm += item.lm;
      existing.cost += item.cost;
      edgeTotals.set(item.edgeTypeId, existing);
    }
  }
  const byType: EdgeBreakdown[] = [];
  let totalLinearMeters = 0;
  let subtotal = 0;
  for (const [edgeTypeId, data] of Array.from(edgeTotals.entries())) {
    const dbEdgeType = edgeTypeReverseMap.get(edgeTypeId);
    const displayRate = data.lm > 0 ? roundToTwo(data.cost / data.lm) : 0;
    byType.push({
      edgeTypeId: dbEdgeType?.id ?? String(edgeTypeId),
      edgeTypeName: dbEdgeType?.name ?? `Edge ${edgeTypeId}`,
      linearMeters: roundToTwo(data.lm),
      baseRate: displayRate,
      appliedRate: displayRate,
      subtotal: roundToTwo(data.cost),
    });
    totalLinearMeters += data.lm;
    subtotal += data.cost;
  }
  return { totalLinearMeters, byType, subtotal };
}

/**
 * Map engine cutout results to aggregate CutoutBreakdown[] for backwards compatibility.
 */
function mapCutoutBreakdownFromEngine(
  engineResult: ReturnType<typeof calculateEngineQuote>,
): { items: CutoutBreakdown[]; subtotal: number } {
  const cutoutTotals = new Map<string, { quantity: number; cost: number; unitCost: number }>();
  for (const piece of engineResult.pieces) {
    for (const item of piece.cutouts.items) {
      const existing = cutoutTotals.get(item.type) || { quantity: 0, cost: 0, unitCost: item.rate };
      existing.quantity += item.qty;
      existing.cost += item.cost;
      cutoutTotals.set(item.type, existing);
    }
  }
  const items: CutoutBreakdown[] = [];
  let subtotal = 0;
  for (const [typeName, data] of Array.from(cutoutTotals.entries())) {
    items.push({
      cutoutTypeId: typeName,
      cutoutTypeName: typeName,
      quantity: data.quantity,
      basePrice: data.unitCost,
      appliedPrice: data.unitCost,
      subtotal: roundToTwo(data.cost),
    });
    subtotal += data.cost;
  }
  return { items, subtotal };
}

/**
 * Return a zeroed-out piece breakdown for pieces that fail engine pricing.
 */
function zeroedPieceBreakdown(
  piece: { id: number; name: string; description?: string | null; length_mm: number; width_mm: number; thickness_mm: number; materials?: unknown },
  pricingContext: PricingContext
): PiecePricingBreakdown {
  const pieceFabCategory: string =
    (piece.materials as unknown as { fabrication_category?: string } | null)
      ?.fabrication_category ?? 'ENGINEERED';
  return {
    pieceId: piece.id,
    pieceName: piece.name || piece.description || `Piece ${piece.id}`,
    fabricationCategory: pieceFabCategory,
    dimensions: { lengthMm: piece.length_mm, widthMm: piece.width_mm, thicknessMm: piece.thickness_mm },
    fabrication: {
      cutting: { quantity: 0, unit: pricingContext.cuttingUnit, rate: 0, baseAmount: 0, discount: 0, total: 0, discountPercentage: 0 },
      polishing: { quantity: 0, unit: pricingContext.polishingUnit, rate: 0, baseAmount: 0, discount: 0, total: 0, discountPercentage: 0 },
      edges: [],
      cutouts: [],
      subtotal: 0,
    },
    pieceTotal: 0,
  };
}

/**
 * Check whether a grain-matched piece can feasibly fit on a single slab.
 * Returns a warning if the bounding box exceeds slab dimensions or area is >90% of slab.
 */
function checkGrainMatchFeasibility(
  piece: { shapeType?: string | null; shapeConfig?: unknown; lengthMm: number; widthMm: number },
  material: { slabLength_mm: number; slabWidth_mm: number },
  pieceAreaSqm: number
): GrainMatchResult {
  const boundingBox = getBoundingBox({
    lengthMm: piece.lengthMm,
    widthMm: piece.widthMm,
    shapeType: piece.shapeType,
    shapeConfig: piece.shapeConfig,
  });
  const slabL = material.slabLength_mm;
  const slabW = material.slabWidth_mm;

  // Check if bounding box fits in either orientation
  const fitsPortrait = boundingBox.length <= slabL && boundingBox.width <= slabW;
  const fitsLandscape = boundingBox.width <= slabL && boundingBox.length <= slabW;

  if (!fitsPortrait && !fitsLandscape) {
    return {
      feasible: false,
      reason: 'BOUNDING_BOX_EXCEEDS_SLAB',
      message: `This piece (${boundingBox.length} × ${boundingBox.width}mm bounding box) is larger than a single slab (${slabL} × ${slabW}mm) in both orientations. Grain matching across a join cannot be guaranteed. Options: remove grain match, or order a matched slab pair from the supplier.`,
    };
  }

  // Check if actual area uses >90% of slab (high risk of not fitting after kerf/edge waste)
  const slabAreaSqm = (slabL / 1000) * (slabW / 1000);
  if (pieceAreaSqm > slabAreaSqm * 0.90) {
    return {
      feasible: false,
      reason: 'AREA_NEAR_LIMIT',
      message: `This piece (${pieceAreaSqm.toFixed(2)} m\u00B2) uses over 90% of a single slab (${slabAreaSqm.toFixed(2)} m\u00B2). After kerf and edge allowances, it may not fit. Confirm with your cutter before proceeding.`,
    };
  }

  return { feasible: true };
}

function roundToTwo(num: number): number {
  return Math.round(num * 100) / 100;
}
