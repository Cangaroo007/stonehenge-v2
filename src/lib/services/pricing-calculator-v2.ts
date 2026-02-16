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
  calculateDistance,
  getDeliveryZone,
  calculateDeliveryCost as calculateDeliveryCostFn,
  calculateTemplatingCost as calculateTemplatingCostFn,
} from './distance-service';
import type { MaterialPricingBasis } from '@prisma/client';
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
} from '@/lib/types/pricing';

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

/**
 * Enhanced pricing calculation result
 */
export interface EnhancedCalculationResult extends CalculationResult {
  fabricationCategory?: string;
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
  materialMarginAdjustPercent: number = 0
): MaterialBreakdown {
  let totalAreaM2 = 0;
  let overriddenCost = 0;
  let calculatedCost = 0;

  for (const piece of pieces) {
    const areaSqm = (piece.length_mm * piece.width_mm) / 1_000_000;
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
        const totalPieceArea = (piece.length_mm * piece.width_mm) / 1_000_000;
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
        calculatedCost = slabCount * slabPrice;
      }
    }
  }

  // Resolve margin from material hierarchy:
  // material.margin_override_percent → supplier.default_margin_percent → 0
  const firstMat = pieces.find(p => p.materials)?.materials;
  const baseMarginPercent =
    firstMat?.margin_override_percent?.toNumber()
    ?? firstMat?.supplier?.default_margin_percent?.toNumber()
    ?? 0;
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
  const byMaterial = buildMaterialGroupings(pieces, pricingBasis, slabCount, wasteFactorPercent, slabCountFromOptimiser, slabLengthMm, slabWidthMm, materialMarginAdjustPercent);

  return {
    totalAreaM2: roundToTwo(totalAreaM2),
    baseRate: effectiveRate,
    thicknessMultiplier: 1,
    appliedRate: effectiveRate,
    subtotal: roundToTwo(finalSubtotalWithWaste),
    discount: 0,
    total: roundToTwo(finalSubtotalWithWaste),
    pricingBasis,
    slabCount: pricingBasis === 'PER_SLAB' ? slabCount : undefined,
    slabRate: pricingBasis === 'PER_SLAB' && slabCount
      ? roundToTwo(subtotal / slabCount)
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

  for (const piece of pieces) {
    const mat = piece.materials;
    if (!mat) continue;
    const matId = (mat as unknown as { id?: number }).id ?? 0;
    const matName = (mat as unknown as { name?: string }).name ?? 'Unknown';
    const slabLenMm = (mat as unknown as { slab_length_mm?: number | null }).slab_length_mm ?? undefined;
    const slabWMm = (mat as unknown as { slab_width_mm?: number | null }).slab_width_mm ?? undefined;
    const slabPrice = mat.price_per_slab?.toNumber() ?? 0;
    const ratePerSqm = mat.price_per_square_metre?.toNumber() ?? mat.price_per_sqm.toNumber() ?? 0;
    const areaSqm = (piece.length_mm * piece.width_mm) / 1_000_000;

    // Resolve per-material margin: override → supplier default → 0
    const matBaseMargin =
      mat.margin_override_percent?.toNumber()
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
      // If we only have one material group and optimiser gave us a count, use that
      if (groups.size === 1 && slabCount !== undefined) {
        groupSlabCount = slabCount;
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
 * Calculate service cost using configured units.
 * Supports LINEAR_METRE, SQUARE_METRE, FIXED, PER_SLAB, PER_KILOMETRE.
 */
export function calculateServiceCostForUnit(
  quantity: number,
  rate20mm: number,
  rate40mm: number,
  thickness: number,
  minimumCharge?: number
): number {
  const rate = thickness <= 20 ? rate20mm : rate40mm;
  let cost = quantity * rate;

  if (minimumCharge && minimumCharge > 0 && cost < minimumCharge) {
    cost = minimumCharge;
  }

  return roundToTwo(cost);
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

  // Load pricing context (org-level settings)
  // Use company ID "1" as default org for now (single-tenant)
  const pricingContext = await loadPricingContext('1');

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
        const totalPieceArea = allPieces.reduce(
          (sum: number, p: { length_mm: number; width_mm: number }) => sum + (p.length_mm * p.width_mm) / 1_000_000, 0
        );
        if (slabAreaM2 > 0) {
          slabCount = Math.ceil(totalPieceArea / slabAreaM2);
        }
      }
    }
  }

  // Calculate material costs with pricing basis, waste factor, and margin
  const materialBreakdown = calculateMaterialCost(
    allPieces,
    pricingContext.materialPricingBasis,
    slabCount,
    pricingContext.wasteFactorPercent,
    slabCountFromOptimiser,
    options?.materialMarginAdjustPercent ?? 0
  );

  // Calculate edge costs with thickness variants
  const edgeData = calculateEdgeCostV2(allPieces, edgeTypes);

  // Calculate cutout costs with category-aware rates and thickness multiplier
  const cutoutData = calculateCutoutCostV2(
    allPieces,
    cutoutTypes as any,
    cutoutCategoryRates,
    pricingContext
  );

  // Calculate service costs (cutting, polishing, installation, waterfall)
  const serviceData = calculateServiceCosts(allPieces, edgeData.totalLinearMeters, serviceRates, pricingContext);

  // Calculate per-piece breakdowns
  const edgeTypeMap = new Map<string, typeof edgeTypes[number]>();
  for (const et of edgeTypes) {
    edgeTypeMap.set(et.id, et);
  }
  const cutoutTypeMap = new Map<string, any>();
  for (const ct of cutoutTypes) {
    cutoutTypeMap.set(ct.id, ct);
  }
  const fabricationDiscountPct = extractFabricationDiscount(quote.customers?.client_tiers);

  // Determine primary fabrication category for the quote
  const primaryFabricationCategory: string =
    (allPieces[0]?.materials as unknown as { fabrication_category?: string } | null)
      ?.fabrication_category ?? 'ENGINEERED';

  const pieceBreakdowns: PiecePricingBreakdown[] = [];
  for (const piece of allPieces) {
    const pieceFabCategory: string =
      (piece.materials as unknown as { fabrication_category?: string } | null)
        ?.fabrication_category ?? 'ENGINEERED';
    pieceBreakdowns.push(
      calculatePiecePricing(
        piece,
        serviceRates,
        edgeTypeMap,
        cutoutTypeMap,
        fabricationDiscountPct,
        pricingContext,
        pieceFabCategory,
        cutoutCategoryRates,
        edgeCategoryRates
      )
    );
  }

  // Calculate oversize/join costs per piece using DB-driven rates + grain matching surcharge
  let totalJoinCost = 0;
  let totalGrainMatchingSurcharge = 0;

  for (let i = 0; i < allPieces.length; i++) {
    const piece = allPieces[i];
    const pieceFabCategory: string =
      (piece.materials as unknown as { fabrication_category?: string } | null)
        ?.fabrication_category ?? 'ENGINEERED';
    const materialName: string =
      (piece.materials as unknown as { name?: string } | null)?.name ?? 'caesarstone';
    const cutPlan = calculateCutPlan(
      { lengthMm: piece.length_mm, widthMm: piece.width_mm },
      materialName
    );

    if (!cutPlan.fitsOnSingleSlab) {
      // Look up JOIN rate from DB for this fabrication category
      const { rate: joinRate } = getServiceRate(serviceRates, 'JOIN', piece.thickness_mm, pieceFabCategory);
      const joinLengthLm = roundToTwo(cutPlan.joinLengthMm / 1000);
      const joinCost = roundToTwo(joinLengthLm * joinRate);

      // Grain matching surcharge on the piece's fabrication subtotal (tenant-configurable)
      const grainMatchingSurchargeRate = pricingContext.grainMatchingSurchargePercent / 100;
      const pieceFabSubtotal = pieceBreakdowns[i]?.fabrication.subtotal ?? 0;
      const grainSurcharge = roundToTwo(pieceFabSubtotal * grainMatchingSurchargeRate);

      totalJoinCost += joinCost;
      totalGrainMatchingSurcharge += grainSurcharge;

      // Add oversize data to the piece breakdown
      if (pieceBreakdowns[i]) {
        pieceBreakdowns[i].oversize = {
          isOversize: true,
          joinCount: cutPlan.joins.length,
          joinLengthLm,
          joinRate,
          joinCost,
          grainMatchingSurchargeRate: grainMatchingSurchargeRate,
          fabricationSubtotalBeforeSurcharge: pieceFabSubtotal,
          grainMatchingSurcharge: grainSurcharge,
          strategy: cutPlan.strategy,
          warnings: cutPlan.warnings,
        };
        pieceBreakdowns[i].pieceTotal = roundToTwo(
          pieceBreakdowns[i].pieceTotal + joinCost + grainSurcharge
        );
      }

      // Add to service-level items for aggregate display
      serviceData.items.push({
        serviceType: 'JOIN',
        name: `Join - ${cutPlan.strategy} (${piece.name || 'Piece ' + piece.id})`,
        quantity: joinLengthLm,
        unit: 'LINEAR_METRE',
        rate: joinRate,
        subtotal: joinCost,
        fabricationCategory: pieceFabCategory,
      });
      serviceData.subtotal += joinCost;

      // Add grain matching surcharge as a separate line item
      if (grainSurcharge > 0) {
        serviceData.items.push({
          serviceType: 'JOIN',
          name: `Grain Matching Surcharge (${piece.name || 'Piece ' + piece.id})`,
          quantity: 1,
          unit: 'FIXED',
          rate: grainSurcharge,
          subtotal: grainSurcharge,
          fabricationCategory: pieceFabCategory,
        });
        serviceData.subtotal += grainSurcharge;
      }
    }
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

  // Calculate templating cost
  const templatingBreakdown = {
    required: quoteAny.templatingRequired,
    distanceKm: quoteAny.templatingDistanceKm ? Number(quoteAny.templatingDistanceKm) : deliveryDistanceKm,
    calculatedCost: calculatedTemplatingCost,
    overrideCost: quoteAny.overrideTemplatingCost ? Number(quoteAny.overrideTemplatingCost) : null,
    finalCost: quoteAny.overrideTemplatingCost
      ? Number(quoteAny.overrideTemplatingCost)
      : (calculatedTemplatingCost ?? 0),
  };

  // Calculate initial subtotal
  const piecesSubtotal =
    materialBreakdown.subtotal +
    edgeData.subtotal +
    cutoutData.subtotal +
    serviceData.subtotal;

  const subtotal =
    piecesSubtotal +
    deliveryBreakdown.finalCost +
    templatingBreakdown.finalCost;

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
  const appliedRules: AppliedRule[] = rules.map(rule => ({
    ruleId: rule.id,
    ruleName: rule.name,
    priority: rule.priority,
    effect: `${rule.adjustmentType} ${rule.adjustmentValue}% on ${rule.appliesTo}`,
  }));

  // Check for quote-level overrides (planned fields, not yet in schema)
  const finalSubtotal = quoteAny.overrideSubtotal
    ? Number(quoteAny.overrideSubtotal)
    : subtotal;

  const finalTotal = quoteAny.overrideTotal
    ? Number(quoteAny.overrideTotal)
    : finalSubtotal;

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
    totalDiscount: 0, // Calculated from rules
    total: roundToTwo(finalTotal),
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
  };
}

/**
 * Calculate edge costs with thickness variants
 * Uses rate20mm for pieces ≤ 20mm, rate40mm for thicker pieces
 * Applies minimum charges and minimum lengths
 */
function calculateEdgeCostV2(
  pieces: Array<{
    length_mm: number;
    width_mm: number;
    thickness_mm: number;
    edge_top: string | null;
    edge_bottom: string | null;
    edge_left: string | null;
    edge_right: string | null;
  }>,
  edgeTypes: Array<{
    id: string;
    name: string;
    baseRate: { toNumber: () => number };
    rate20mm: { toNumber: () => number } | null;
    rate40mm: { toNumber: () => number } | null;
    minimumCharge: { toNumber: () => number } | null;
    minimumLength: { toNumber: () => number } | null;
    isCurved: boolean;
  }>
): { totalLinearMeters: number; byType: EdgeBreakdown[]; subtotal: number } {
  const edgeTotals = new Map<string, { linearMeters: number; thickness: number; edgeType: typeof edgeTypes[number] }>();

  for (const piece of pieces) {
    const edges = [
      { id: piece.edge_top, length: piece.length_mm },
      { id: piece.edge_bottom, length: piece.length_mm },
      { id: piece.edge_left, length: piece.width_mm },
      { id: piece.edge_right, length: piece.width_mm },
    ];

    for (const edge of edges) {
      if (!edge.id) continue;

      const edgeType = edgeTypes.find(et => et.id === edge.id);
      if (!edgeType) continue;

      const linearMeters = edge.length / 1000;
      const key = `${edgeType.id}_${piece.thickness_mm}`;

      const existing = edgeTotals.get(key) || { linearMeters: 0, thickness: piece.thickness_mm, edgeType };
      existing.linearMeters += linearMeters;
      edgeTotals.set(key, existing);
    }
  }

  const byType: EdgeBreakdown[] = [];
  let totalLinearMeters = 0;
  let subtotal = 0;

  for (const [, data] of Array.from(edgeTotals.entries())) {
    // Select appropriate rate based on thickness
    let rate: number;
    if (data.thickness <= 20 && data.edgeType.rate20mm) {
      rate = data.edgeType.rate20mm.toNumber();
    } else if (data.thickness > 20 && data.edgeType.rate40mm) {
      rate = data.edgeType.rate40mm.toNumber();
    } else {
      rate = data.edgeType.baseRate.toNumber(); // Fallback
    }

    // Calculate cost
    let itemSubtotal = data.linearMeters * rate;

    // Apply minimum length (pad to minimum if below)
    const minLength = data.edgeType.minimumLength?.toNumber() || 0;
    if (minLength > 0 && data.linearMeters < minLength) {
      itemSubtotal = minLength * rate;
    }

    // Apply minimum charge
    const minCharge = data.edgeType.minimumCharge?.toNumber() || 0;
    if (minCharge > 0 && itemSubtotal < minCharge) {
      itemSubtotal = minCharge;
    }

    byType.push({
      edgeTypeId: data.edgeType.id,
      edgeTypeName: `${data.edgeType.name} (${data.thickness}mm)`,
      linearMeters: roundToTwo(data.linearMeters),
      baseRate: rate,
      appliedRate: rate,
      subtotal: roundToTwo(itemSubtotal),
    });

    totalLinearMeters += data.linearMeters;
    subtotal += itemSubtotal;
  }

  return { totalLinearMeters, byType, subtotal };
}

/**
 * Calculate cutout costs with category-aware rates, thickness multiplier, and minimum charges.
 * Category rate takes priority over base rate; falls back to base rate when no category rate exists.
 */
function calculateCutoutCostV2(
  pieces: Array<{
    cutouts: unknown; // JSON array
    thickness_mm: number;
    materials: unknown;
  }>,
  cutoutTypes: Array<{
    id: string;
    name: string;
    category: string;
    baseRate: { toNumber: () => number };
    minimumCharge: { toNumber: () => number } | null;
  }>,
  cutoutCategoryRates: Array<{
    cutoutTypeId: string;
    fabricationCategory: string;
    rate: { toNumber: () => number } | number;
  }>,
  pricingContext: PricingContext
): { items: CutoutBreakdown[]; subtotal: number } {
  // Group cutouts by cutoutTypeId + fabricationCategory to handle different material categories
  const cutoutTotals = new Map<string, {
    quantity: number;
    cutoutType: typeof cutoutTypes[number];
    fabricationCategory: string;
    maxThickness: number;
  }>();

  for (const piece of pieces) {
    const cutouts = Array.isArray(piece.cutouts) ? piece.cutouts :
                    (typeof piece.cutouts === 'string' ? JSON.parse(piece.cutouts as string) : []);

    const fabCategory: string =
      (piece.materials as unknown as { fabrication_category?: string } | null)
        ?.fabrication_category ?? 'ENGINEERED';

    for (const cutout of cutouts) {
      const cutoutType = cutoutTypes.find(ct => ct.id === cutout.typeId || ct.name === cutout.type);
      if (!cutoutType) continue;

      const key = `${cutoutType.id}__${fabCategory}`;
      const existing = cutoutTotals.get(key) || {
        quantity: 0,
        cutoutType,
        fabricationCategory: fabCategory,
        maxThickness: 0,
      };
      existing.quantity += cutout.quantity || 1;
      existing.maxThickness = Math.max(existing.maxThickness, piece.thickness_mm);
      cutoutTotals.set(key, existing);
    }
  }

  const items: CutoutBreakdown[] = [];
  let subtotal = 0;

  for (const [, data] of Array.from(cutoutTotals.entries())) {
    // Try category-specific rate first
    const categoryCutoutRate = cutoutCategoryRates.find(
      r => r.cutoutTypeId === data.cutoutType.id
        && r.fabricationCategory === data.fabricationCategory
    );

    const basePrice = categoryCutoutRate
      ? (typeof categoryCutoutRate.rate === 'number'
          ? categoryCutoutRate.rate
          : categoryCutoutRate.rate.toNumber())
      : data.cutoutType.baseRate.toNumber(); // fallback to flat rate

    if (!categoryCutoutRate && basePrice === 0) {
      console.warn(
        `No category rate or base rate found for cutout type "${data.cutoutType.name}" ` +
        `(${data.cutoutType.id}) in category ${data.fabricationCategory}. Cost will be $0.`
      );
    }

    // Apply thickness multiplier for pieces > 20mm (from 11.1a)
    const thicknessMultiplier = data.maxThickness > 20
      ? pricingContext.cutoutThicknessMultiplier
      : 1.0;

    const appliedPrice = roundToTwo(basePrice * thicknessMultiplier);
    let itemSubtotal = data.quantity * appliedPrice;

    // Apply minimum charge
    const minCharge = data.cutoutType.minimumCharge?.toNumber() || 0;
    if (minCharge > 0 && itemSubtotal < minCharge) {
      itemSubtotal = minCharge;
    }

    items.push({
      cutoutTypeId: data.cutoutType.id,
      cutoutTypeName: data.cutoutType.name,
      quantity: data.quantity,
      basePrice: roundToTwo(basePrice),
      appliedPrice,
      subtotal: roundToTwo(itemSubtotal),
    });

    subtotal += itemSubtotal;
  }

  return { items, subtotal };
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
  const rateRecord = rates.find(r => {
    if (r.serviceType !== serviceType) return false;
    if (fabricationCategory) {
      // When a category is specified, require exact match
      return r.fabricationCategory === fabricationCategory;
    }
    // When no category specified, prefer rates without a category set
    return !r.fabricationCategory;
  }) ?? (
    // Fallback: if no uncategorised rate exists, pick the first matching serviceType
    !fabricationCategory
      ? rates.find(r => r.serviceType === serviceType)
      : undefined
  );
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
 * Calculate service costs (cutting, polishing, installation, waterfall)
 * Reads configured units from pricingContext to determine quantity basis.
 */
function calculateServiceCosts(
  pieces: Array<{ length_mm: number; width_mm: number; thickness_mm: number; edge_top: string | null; edge_bottom: string | null; edge_left: string | null; edge_right: string | null; lamination_method: string; waterfall_height_mm?: number | null; materials?: { fabrication_category: string } | null }>,
  totalEdgeLinearMeters: number,
  serviceRates: ServiceRateRecord[],
  pricingContext: PricingContext
): { items: ServiceBreakdown[]; subtotal: number } {
  const items: ServiceBreakdown[] = [];
  let subtotal = 0;

  // No pieces → no service costs
  if (pieces.length === 0) {
    return { items, subtotal: 0 };
  }

  // Pre-compute shared aggregates
  const totalAreaM2 = pieces.reduce((sum, p) => sum + (p.length_mm * p.width_mm) / 1_000_000, 0);
  const totalPerimeterLm = pieces.reduce((sum, p) => sum + 2 * (p.length_mm + p.width_mm) / 1000, 0);
  const avgThickness = pieces.length > 0
    ? pieces.reduce((sum, p) => sum + p.thickness_mm, 0) / pieces.length
    : 20;

  // Determine primary fabrication category for aggregate rate lookups
  const primaryCategory = pieces[0]?.materials?.fabrication_category ?? 'ENGINEERED';

  // Cutting: use tenant's configured cutting_unit
  const { rate: cuttingRateVal, rateRecord: cuttingRateRecord } =
    getServiceRate(serviceRates, 'CUTTING', avgThickness, primaryCategory);
  {
    const cuttingUnit = pricingContext.cuttingUnit;
    const cuttingQty = cuttingUnit === 'LINEAR_METRE' ? totalPerimeterLm : totalAreaM2;
    const cost = applyMinimumCharge(cuttingQty * cuttingRateVal, cuttingRateRecord);

    items.push({
      serviceType: 'CUTTING',
      name: cuttingRateRecord.name,
      quantity: roundToTwo(cuttingQty),
      unit: cuttingUnit,
      rate: cuttingRateVal,
      subtotal: roundToTwo(cost),
    });
    subtotal += cost;
  }

  // Polishing: use tenant's configured polishing_unit
  const polishingRateRecord = serviceRates.find(
    sr => sr.serviceType === 'POLISHING' && sr.fabricationCategory === primaryCategory
  );
  if (!polishingRateRecord) {
    throw new Error(
      `No POLISHING rate found for fabrication category ${primaryCategory}. Configure in Pricing Admin → Service Rates.`
    );
  }
  if (totalEdgeLinearMeters > 0) {
    const polishingUnit = pricingContext.polishingUnit;
    let polishingCost = 0;
    let totalPolishingQty = 0;

    for (const piece of pieces) {
      const edgeLengths = [
        piece.edge_top ? piece.length_mm : 0,
        piece.edge_bottom ? piece.length_mm : 0,
        piece.edge_left ? piece.width_mm : 0,
        piece.edge_right ? piece.width_mm : 0,
      ];
      const pieceEdgeLm = edgeLengths.reduce((sum, len) => sum + len, 0) / 1000;
      if (pieceEdgeLm <= 0) continue;

      const piecePolishingQty = polishingUnit === 'SQUARE_METRE'
        ? pieceEdgeLm * (piece.thickness_mm / 1000)
        : pieceEdgeLm;

      const pieceCategory = piece.materials?.fabrication_category ?? primaryCategory;
      const { rate } = getServiceRate(serviceRates, 'POLISHING', piece.thickness_mm, pieceCategory);
      polishingCost += piecePolishingQty * rate;
      totalPolishingQty += piecePolishingQty;
    }

    polishingCost = applyMinimumCharge(polishingCost, polishingRateRecord);

    const displayRate = totalPolishingQty > 0
      ? roundToTwo(polishingCost / totalPolishingQty)
      : polishingRateRecord.rate20mm.toNumber();

    if (totalPolishingQty > 0) {
      items.push({
        serviceType: 'POLISHING',
        name: polishingRateRecord.name,
        quantity: roundToTwo(totalPolishingQty),
        unit: polishingUnit,
        rate: displayRate,
        subtotal: roundToTwo(polishingCost),
      });
      subtotal += polishingCost;
    }
  }

  // Installation: use tenant's configured installation_unit
  const { rate: installRateVal, rateRecord: installRateRecord } =
    getServiceRate(serviceRates, 'INSTALLATION', avgThickness, primaryCategory);
  {
    const installationUnit = pricingContext.installationUnit;
    const installQty =
      installationUnit === 'SQUARE_METRE' ? totalAreaM2 :
      installationUnit === 'LINEAR_METRE' ? totalPerimeterLm :
      1; // FIXED = flat fee

    const cost = applyMinimumCharge(installQty * installRateVal, installRateRecord);

    if (cost > 0) {
      items.push({
        serviceType: 'INSTALLATION',
        name: installRateRecord.name,
        quantity: roundToTwo(installQty),
        unit: installationUnit,
        rate: installRateVal,
        subtotal: roundToTwo(cost),
      });
      subtotal += cost;
    }
  }

  // Lamination: applies to pieces > 20mm with LAMINATED or MITRED method
  let totalLaminationCost = 0;
  let totalLaminationLm = 0;

  for (const piece of pieces) {
    if (piece.thickness_mm <= 20) continue;
    if (piece.lamination_method === 'NONE') continue;

    // Use per-piece category for the polishing base rate
    const pieceCategory = piece.materials?.fabrication_category ?? primaryCategory;
    const { rate: polishRate20mm } = getServiceRate(serviceRates, 'POLISHING', 20, pieceCategory);

    const edgeLengths = [
      piece.edge_top ? piece.length_mm : 0,
      piece.edge_bottom ? piece.length_mm : 0,
      piece.edge_left ? piece.width_mm : 0,
      piece.edge_right ? piece.width_mm : 0,
    ];
    const pieceFinishedEdgeLm = edgeLengths.reduce((sum, len) => sum + len, 0) / 1000;
    if (pieceFinishedEdgeLm <= 0) continue;

    const multiplier = piece.lamination_method === 'MITRED'
      ? pricingContext.mitredMultiplier
      : pricingContext.laminatedMultiplier;

    totalLaminationCost += pieceFinishedEdgeLm * (polishRate20mm * multiplier);
    totalLaminationLm += pieceFinishedEdgeLm;
  }

  if (totalLaminationCost > 0) {
    const displayRate = totalLaminationLm > 0
      ? roundToTwo(totalLaminationCost / totalLaminationLm)
      : 0;

    items.push({
      serviceType: 'LAMINATION',
      name: 'Lamination (edge build-up)',
      quantity: roundToTwo(totalLaminationLm),
      unit: 'LINEAR_METRE',
      rate: displayRate,
      subtotal: roundToTwo(totalLaminationCost),
    });
    subtotal += totalLaminationCost;
  }

  // Waterfall ends: supports FIXED_PER_END and PER_LINEAR_METRE methods
  const waterfallPieces = pieces.filter(p => {
    const edges = [p.edge_top, p.edge_bottom, p.edge_left, p.edge_right];
    return edges.some(e => e && (e.includes('WATERFALL') || e.includes('waterfall')));
  });

  if (waterfallPieces.length > 0) {
    // Look up WATERFALL_END rate — skip silently if not configured (optional service)
    const waterfallRateRecord = serviceRates.find(r => {
      if (r.serviceType !== 'WATERFALL_END') return false;
      return r.fabricationCategory === primaryCategory;
    }) ?? serviceRates.find(r => r.serviceType === 'WATERFALL_END');

    if (waterfallRateRecord) {
      const waterfallMethod = pricingContext.waterfallPricingMethod ?? 'FIXED_PER_END';
      const waterfallRateVal = avgThickness > 20
        ? waterfallRateRecord.rate40mm.toNumber()
        : waterfallRateRecord.rate20mm.toNumber();

      if (waterfallMethod === 'FIXED_PER_END') {
        // Existing behaviour: count × rate per end
        const waterfallCount = waterfallPieces.length;
        const cost = applyMinimumCharge(waterfallCount * waterfallRateVal, waterfallRateRecord);

        items.push({
          serviceType: 'WATERFALL_END',
          name: waterfallRateRecord.name,
          quantity: waterfallCount,
          unit: 'EACH',
          rate: waterfallRateVal,
          subtotal: roundToTwo(cost),
        });
        subtotal += cost;
      } else if (waterfallMethod === 'PER_LINEAR_METRE') {
        // New: rate × height (in linear metres) per waterfall piece
        let totalWaterfallCost = 0;
        let totalHeightLm = 0;

        for (const wf of waterfallPieces) {
          const heightMm = wf.waterfall_height_mm ?? 900; // default 900mm if not specified
          const heightLm = heightMm / 1000;
          totalWaterfallCost += heightLm * waterfallRateVal;
          totalHeightLm += heightLm;
        }

        totalWaterfallCost = applyMinimumCharge(totalWaterfallCost, waterfallRateRecord);

        items.push({
          serviceType: 'WATERFALL_END',
          name: waterfallRateRecord.name,
          quantity: roundToTwo(totalHeightLm),
          unit: 'LINEAR_METRE',
          rate: waterfallRateVal,
          subtotal: roundToTwo(totalWaterfallCost),
        });
        subtotal += totalWaterfallCost;
      }
      // INCLUDED_IN_SLAB: no separate charge — waterfall cost is absorbed into slab price
    }
  }

  return { items, subtotal };
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

/**
 * Calculate pricing breakdown for a single piece.
 * Uses tenant-configured units for cutting and polishing,
 * and applies client tier fabrication discounts.
 */
function calculatePiecePricing(
  piece: {
    id: number;
    name: string;
    description: string | null;
    length_mm: number;
    width_mm: number;
    thickness_mm: number;
    edge_top: string | null;
    edge_bottom: string | null;
    edge_left: string | null;
    edge_right: string | null;
    cutouts: unknown;
    lamination_method: string;
  },
  serviceRates: ServiceRateRecord[],
  edgeTypes: Map<string, {
    id: string;
    name: string;
    baseRate: { toNumber: () => number };
    rate20mm: { toNumber: () => number } | null;
    rate40mm: { toNumber: () => number } | null;
    minimumCharge: { toNumber: () => number } | null;
    minimumLength: { toNumber: () => number } | null;
  }>,
  cutoutTypes: Map<string, {
    id: string;
    name: string;
    category: string;
    baseRate: { toNumber: () => number };
    minimumCharge: { toNumber: () => number } | null;
  }>,
  fabricationDiscountPct: number,
  pricingContext: PricingContext,
  fabricationCategory: string = 'ENGINEERED',
  cutoutCategoryRates: Array<{
    cutoutTypeId: string;
    fabricationCategory: string;
    rate: { toNumber: () => number } | number;
  }> = [],
  edgeCategoryRates: Array<{
    edgeTypeId: string;
    fabricationCategory: string;
    rate20mm: { toNumber: () => number } | number;
    rate40mm: { toNumber: () => number } | number;
  }> = []
): PiecePricingBreakdown {
  const thickness = piece.thickness_mm;
  const isThick = thickness > 20;

  // Get service rates based on thickness + fabrication category — no fallback defaults, rates must exist
  const { rate: cuttingRateVal } = getServiceRate(serviceRates, 'CUTTING', thickness, fabricationCategory);
  const { rate: polishingRateVal } = getServiceRate(serviceRates, 'POLISHING', thickness, fabricationCategory);
  const { rate: installRateVal, rateRecord: installRateRecord } =
    getServiceRate(serviceRates, 'INSTALLATION', thickness, fabricationCategory);

  // Piece dimensions
  const perimeterMm = 2 * (piece.length_mm + piece.width_mm);
  const perimeterLm = perimeterMm / 1000;
  const areaSqm = (piece.length_mm * piece.width_mm) / 1_000_000;

  // Cutting: use tenant's configured cutting_unit
  const cuttingUnit = pricingContext.cuttingUnit;
  const cuttingQty = cuttingUnit === 'LINEAR_METRE' ? perimeterLm : areaSqm;

  const cuttingBase = roundToTwo(cuttingQty * cuttingRateVal);
  const cuttingDiscount = roundToTwo(cuttingBase * (fabricationDiscountPct / 100));
  const cuttingTotal = roundToTwo(cuttingBase - cuttingDiscount);

  // Edge sides mapping: top/bottom use length_mm (horizontal), left/right use width_mm (vertical)
  const edgeSides: Array<{ side: 'top' | 'bottom' | 'left' | 'right'; lengthMm: number; edgeTypeId: string | null }> = [
    { side: 'top', lengthMm: piece.length_mm, edgeTypeId: piece.edge_top },
    { side: 'bottom', lengthMm: piece.length_mm, edgeTypeId: piece.edge_bottom },
    { side: 'left', lengthMm: piece.width_mm, edgeTypeId: piece.edge_left },
    { side: 'right', lengthMm: piece.width_mm, edgeTypeId: piece.edge_right },
  ];

  // Polishing: use tenant's configured polishing_unit
  const polishingUnit = pricingContext.polishingUnit;
  let finishedEdgeLm = 0;
  let finishedEdgeAreaSqm = 0;
  for (const { edgeTypeId, lengthMm } of edgeSides) {
    if (edgeTypeId) {
      const edgeLm = lengthMm / 1000;
      finishedEdgeLm += edgeLm;
      finishedEdgeAreaSqm += edgeLm * (thickness / 1000);
    }
  }
  const polishingQty = polishingUnit === 'SQUARE_METRE' ? finishedEdgeAreaSqm : finishedEdgeLm;

  const polishingBase = roundToTwo(polishingQty * polishingRateVal);
  const polishingDiscount = roundToTwo(polishingBase * (fabricationDiscountPct / 100));
  const polishingTotal = roundToTwo(polishingBase - polishingDiscount);

  // Mitred constraint: mitred edges can only use Pencil Round profile
  if (piece.lamination_method === 'MITRED') {
    for (const { edgeTypeId } of edgeSides) {
      if (!edgeTypeId) continue;
      const edgeType = edgeTypes.get(edgeTypeId);
      if (!edgeType) continue;
      const nameLower = edgeType.name.toLowerCase();
      if (!nameLower.includes('pencil') && !nameLower.includes('raw')) {
        throw new Error(
          `Piece "${piece.name || piece.description || piece.id}": ` +
          `Mitred edges only support Pencil Round profile. ` +
          `Found "${edgeType.name}". Change to Pencil Round or switch to Laminated edge.`
        );
      }
    }
  }

  // Lamination: applies to pieces > 20mm with LAMINATED or MITRED method
  let laminationBreakdown: PiecePricingBreakdown['fabrication']['lamination'];
  if (thickness > 20 && piece.lamination_method !== 'NONE') {
    const polishRate20mm = getServiceRate(serviceRates, 'POLISHING', 20, fabricationCategory).rate;
    const multiplier = piece.lamination_method === 'MITRED'
      ? pricingContext.mitredMultiplier
      : pricingContext.laminatedMultiplier;

    const laminationTotal = roundToTwo(finishedEdgeLm * polishRate20mm * multiplier);
    if (laminationTotal > 0) {
      laminationBreakdown = {
        method: piece.lamination_method,
        finishedEdgeLm: roundToTwo(finishedEdgeLm),
        baseRate: polishRate20mm,
        multiplier,
        total: laminationTotal,
      };
    }
  }

  // Edge profile costs (additional cost per edge type)
  const edgeBreakdowns: PiecePricingBreakdown['fabrication']['edges'] = [];
  for (const { side, lengthMm, edgeTypeId } of edgeSides) {
    if (!edgeTypeId) continue;
    const edgeType = edgeTypes.get(edgeTypeId);
    if (!edgeType) continue;

    // Try category-specific rate first, fall back to flat rate from edge_types
    const categoryEdgeRate = edgeCategoryRates.find(
      r => r.edgeTypeId === edgeTypeId
        && r.fabricationCategory === fabricationCategory
    );

    let rate: number;
    if (categoryEdgeRate) {
      const catRate20 = typeof categoryEdgeRate.rate20mm === 'number'
        ? categoryEdgeRate.rate20mm
        : categoryEdgeRate.rate20mm.toNumber();
      const catRate40 = typeof categoryEdgeRate.rate40mm === 'number'
        ? categoryEdgeRate.rate40mm
        : categoryEdgeRate.rate40mm.toNumber();
      rate = isThick ? catRate40 : catRate20;
    } else if (!isThick && edgeType.rate20mm) {
      rate = edgeType.rate20mm.toNumber();
    } else if (isThick && edgeType.rate40mm) {
      rate = edgeType.rate40mm.toNumber();
    } else {
      rate = edgeType.baseRate.toNumber();
    }

    const linearMeters = lengthMm / 1000;
    let baseAmount = roundToTwo(linearMeters * rate);

    // Apply minimum length
    const minLength = edgeType.minimumLength?.toNumber() || 0;
    if (minLength > 0 && linearMeters < minLength) {
      baseAmount = roundToTwo(minLength * rate);
    }

    // Apply minimum charge
    const minCharge = edgeType.minimumCharge?.toNumber() || 0;
    if (minCharge > 0 && baseAmount < minCharge) {
      baseAmount = minCharge;
    }

    const discount = roundToTwo(baseAmount * (fabricationDiscountPct / 100));

    edgeBreakdowns.push({
      side,
      edgeTypeId,
      edgeTypeName: edgeType.name,
      lengthMm,
      linearMeters: roundToTwo(linearMeters),
      rate,
      baseAmount,
      discount,
      total: roundToTwo(baseAmount - discount),
      discountPercentage: fabricationDiscountPct,
    });
  }

  // Cutout costs — category-aware rates with thickness multiplier
  const cutoutBreakdowns: PiecePricingBreakdown['fabrication']['cutouts'] = [];
  const cutoutsArray = Array.isArray(piece.cutouts)
    ? piece.cutouts
    : (typeof piece.cutouts === 'string' ? JSON.parse(piece.cutouts as string) : []);

  for (const cutout of cutoutsArray) {
    const cutoutType = cutoutTypes.get(cutout.typeId) ?? findCutoutByName(cutoutTypes, cutout.type);
    if (!cutoutType) continue;

    // Try category-specific rate first, fall back to base rate
    const categoryCutoutRate = cutoutCategoryRates.find(
      r => r.cutoutTypeId === cutoutType.id
        && r.fabricationCategory === fabricationCategory
    );

    const baseRate = categoryCutoutRate
      ? (typeof categoryCutoutRate.rate === 'number'
          ? categoryCutoutRate.rate
          : categoryCutoutRate.rate.toNumber())
      : cutoutType.baseRate.toNumber();

    if (!categoryCutoutRate && baseRate === 0) {
      console.warn(
        `No category rate or base rate for cutout "${cutoutType.name}" in category ${fabricationCategory}. Cost will be $0.`
      );
    }

    // Apply thickness multiplier for pieces > 20mm
    const thicknessMultiplier = thickness > 20
      ? pricingContext.cutoutThicknessMultiplier
      : 1.0;

    const rate = roundToTwo(baseRate * thicknessMultiplier);
    const quantity = cutout.quantity || 1;
    let baseAmount = roundToTwo(quantity * rate);

    const minCharge = cutoutType.minimumCharge?.toNumber() || 0;
    if (minCharge > 0 && baseAmount < minCharge) {
      baseAmount = minCharge;
    }

    cutoutBreakdowns.push({
      cutoutTypeId: cutoutType.id,
      cutoutTypeName: cutoutType.name,
      quantity,
      rate,
      baseAmount,
      discount: 0,
      total: baseAmount,
    });
  }

  // Installation: use tenant's configured installation_unit
  let installationBreakdown: PiecePricingBreakdown['fabrication']['installation'];
  {
    const installationUnit = pricingContext.installationUnit;
    const installQty =
      installationUnit === 'SQUARE_METRE' ? areaSqm :
      installationUnit === 'LINEAR_METRE' ? perimeterLm :
      1; // FIXED = flat fee; distributed per-piece as rate × 1

    const installBase = roundToTwo(
      applyMinimumCharge(installQty * installRateVal, installRateRecord)
    );
    if (installBase > 0) {
      installationBreakdown = {
        quantity: roundToTwo(installQty),
        unit: installationUnit,
        rate: installRateVal,
        baseAmount: installBase,
        discount: 0,
        total: installBase,
      };
    }
  }

  // Fabrication subtotal
  const fabricationSubtotal = roundToTwo(
    cuttingTotal +
    polishingTotal +
    (installationBreakdown?.total ?? 0) +
    (laminationBreakdown?.total ?? 0) +
    edgeBreakdowns.reduce((sum, e) => sum + e.total, 0) +
    cutoutBreakdowns.reduce((sum, c) => sum + c.total, 0)
  );

  return {
    pieceId: piece.id,
    pieceName: piece.name || piece.description || `Piece ${piece.id}`,
    fabricationCategory,
    dimensions: {
      lengthMm: piece.length_mm,
      widthMm: piece.width_mm,
      thicknessMm: thickness,
    },
    fabrication: {
      cutting: {
        quantity: roundToTwo(cuttingQty),
        unit: cuttingUnit,
        rate: cuttingRateVal,
        baseAmount: cuttingBase,
        discount: cuttingDiscount,
        total: cuttingTotal,
        discountPercentage: fabricationDiscountPct,
      },
      polishing: {
        quantity: roundToTwo(polishingQty),
        unit: polishingUnit,
        rate: polishingRateVal,
        baseAmount: polishingBase,
        discount: polishingDiscount,
        total: polishingTotal,
        discountPercentage: fabricationDiscountPct,
      },
      installation: installationBreakdown,
      lamination: laminationBreakdown,
      edges: edgeBreakdowns,
      cutouts: cutoutBreakdowns,
      subtotal: fabricationSubtotal,
    },
    pieceTotal: fabricationSubtotal,
  };
}

/**
 * Helper: find a cutout type by name in the map
 */
function findCutoutByName(
  cutoutTypes: Map<string, { id: string; name: string; category: string; baseRate: { toNumber: () => number }; minimumCharge: { toNumber: () => number } | null }>,
  name: string | undefined
): { id: string; name: string; category: string; baseRate: { toNumber: () => number }; minimumCharge: { toNumber: () => number } | null } | undefined {
  if (!name) return undefined;
  const entries = Array.from(cutoutTypes.values());
  return entries.find(ct => ct.name === name);
}

/**
 * Extract fabrication discount percentage from a client tier's discount matrix.
 * The discountMatrix JSON is expected to contain a fabricationDiscount field (as a percentage, e.g. 10 for 10%).
 */
function extractFabricationDiscount(client_tiers: { discount_matrix: unknown } | null | undefined): number {
  if (!client_tiers?.discount_matrix) return 0;
  const matrix = client_tiers.discount_matrix as unknown as Record<string, unknown>;
  const discount = matrix.fabricationDiscount ?? matrix.fabrication_discount ?? matrix.discount ?? 0;
  return typeof discount === 'number' ? discount : 0;
}

function roundToTwo(num: number): number {
  return Math.round(num * 100) / 100;
}
