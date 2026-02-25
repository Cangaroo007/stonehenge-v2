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
  baseSubtotal?: number;
  customCharges?: Array<{ id: number; description: string; amount: number }>;
  customChargesTotal?: number;
  discountType?: string | null;
  discountValue?: number;
  discountAppliesTo?: string;
  discountAmount?: number;
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
  for (const piece of allPieces) {
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
    let joinRateForCutPlan = 0;
    try {
      const { rate: jr } = getServiceRate(serviceRates, 'JOIN', piece.thickness_mm, pieceFabCategory);
      joinRateForCutPlan = jr;
    } catch { /* JOIN rate not configured — use 0 for estimation */ }

    const cutPlan = calculateCutPlan(
      { lengthMm: piece.length_mm, widthMm: piece.width_mm },
      materialName,
      20,
      pieceSlabLengthMm,
      pieceSlabWidthMm,
      joinRateForCutPlan
    );
    cutPlans.push(cutPlan);

    const isOversize = !cutPlan.fitsOnSingleSlab;
    const joinLengthLm = isOversize ? roundToTwo(cutPlan.joinLengthMm / 1000) : undefined;

    // Parse cutouts from JSON
    const cutoutsArray = Array.isArray(piece.cutouts)
      ? piece.cutouts
      : (typeof piece.cutouts === 'string' ? JSON.parse(piece.cutouts as string) : []);
    const engineCutouts: EngineCutout[] = cutoutsArray.map((c: any) => {
      const ct = cutoutTypes.find((t: any) => t.id === c.typeId || t.name === c.type);
      return { cutoutType: ct?.name ?? c.type ?? c.typeId ?? 'UNKNOWN', quantity: c.quantity || 1 };
    });

    enginePieces.push({
      id: String(piece.id),
      name: piece.name || piece.description || `Piece ${piece.id}`,
      length_mm: piece.length_mm,
      width_mm: piece.width_mm,
      thickness_mm: piece.thickness_mm,
      isOversize,
      joinLength_Lm: joinLengthLm,
      requiresGrainMatch: isOversize,
      laminationMethod: piece.lamination_method === 'LAMINATED' ? 'LAMINATED'
        : piece.lamination_method === 'MITRED' ? 'MITRED' : null,
      edges: [
        { position: 'TOP' as const, isFinished: !!piece.edge_top, edgeTypeId: piece.edge_top ? (edgeTypeIdMap.get(piece.edge_top) ?? null) : null, length_mm: piece.length_mm },
        { position: 'BOTTOM' as const, isFinished: !!piece.edge_bottom, edgeTypeId: piece.edge_bottom ? (edgeTypeIdMap.get(piece.edge_bottom) ?? null) : null, length_mm: piece.length_mm },
        { position: 'LEFT' as const, isFinished: !!piece.edge_left, edgeTypeId: piece.edge_left ? (edgeTypeIdMap.get(piece.edge_left) ?? null) : null, length_mm: piece.width_mm },
        { position: 'RIGHT' as const, isFinished: !!piece.edge_right, edgeTypeId: piece.edge_right ? (edgeTypeIdMap.get(piece.edge_right) ?? null) : null, length_mm: piece.width_mm },
      ],
      cutouts: engineCutouts,
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
    },
    serviceRates: engineServiceRates,
    edgeCategoryRates: engineEdgeCategoryRates,
    cutoutRates: engineCutoutRates,
    material: { fabricationCategory: primaryFabricationCategory, pricePerSlab: 0 },
    slabCount: 0,
    pieces: enginePieces,
  };

  const engineResult = calculateEngineQuote(engineInput);

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
    if (p.waterfall_height_mm && p.waterfall_height_mm > 0) return true;
    const edges = [p.edge_top, p.edge_bottom, p.edge_left, p.edge_right];
    return edges.some((e: string | null) => e && (e.includes('WATERFALL') || e.includes('waterfall')));
  });
  if (waterfallPieces.length > 0) {
    const avgThickness = allPieces.length > 0
      ? allPieces.reduce((sum: number, p: any) => sum + p.thickness_mm, 0) / allPieces.length
      : 20;
    const waterfallRateRecord = serviceRates.find(r =>
      r.serviceType === 'WATERFALL_END' && r.fabricationCategory === primaryFabricationCategory
    ) ?? serviceRates.find(r => r.serviceType === 'WATERFALL_END');
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

  // Build aggregate edge breakdown from engine results
  const edgeData = mapEdgeBreakdownFromEngine(engineResult, edgeTypeReverseMap);

  // Build aggregate cutout breakdown from engine results
  const cutoutData = mapCutoutBreakdownFromEngine(engineResult);

  // Build per-piece breakdowns from engine results
  const pieceBreakdowns: PiecePricingBreakdown[] = [];

  // Proportional allocation of material and installation across pieces
  const totalAreaSqm = allPieces.reduce(
    (sum: number, p: { length_mm: number; width_mm: number }) =>
      sum + (p.length_mm * p.width_mm) / 1_000_000, 0
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
      const pieceAreaForInstall = (piece.length_mm * piece.width_mm) / 1_000_000;
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

    const fabricationSubtotal = roundToTwo(
      ep.cutting.cost + ep.polishing.cost + ep.edgeProfiles.cost +
      (ep.lamination?.cost ?? 0) + ep.cutouts.cost +
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

    // Add per-piece proportional material cost
    // Each piece gets its area share of the total material cost (from optimizer/aggregate)
    if (piece.materials) {
      const mat = piece.materials as unknown as {
        price_per_sqm: { toNumber: () => number };
        price_per_slab?: { toNumber: () => number } | null;
        slab_length_mm?: number | null;
        slab_width_mm?: number | null;
      };
      const pieceAreaM2 = roundToTwo((piece.length_mm * piece.width_mm) / 1_000_000);
      const pricePerSlab = mat.price_per_slab?.toNumber();
      const pricePerSqm = mat.price_per_sqm.toNumber();

      // Proportional area share of total material cost
      let materialShare: number;
      if (i === lastMaterialPieceIdx) {
        // Last piece with material gets remainder to avoid rounding drift
        materialShare = roundToTwo(totalMaterialCost - allocatedMaterial);
      } else {
        materialShare = totalAreaSqm > 0
          ? roundToTwo((pieceAreaM2 / totalAreaSqm) * totalMaterialCost)
          : 0;
        allocatedMaterial += materialShare;
      }

      // Proportional slab count for display
      const proportionalSlabCount = (pricingContext.materialPricingBasis === 'PER_SLAB' && materialBreakdown.slabCount)
        ? roundToTwo((pieceAreaM2 / (totalAreaSqm || 1)) * materialBreakdown.slabCount)
        : undefined;

      pbd.materials = {
        areaM2: pieceAreaM2,
        baseRate: pricePerSqm ?? pricePerSlab ?? 0,
        thicknessMultiplier: 1,
        baseAmount: materialShare,
        discount: 0,
        total: materialShare,
        discountPercentage: 0,
        pricingBasis: pricingContext.materialPricingBasis === 'PER_SLAB' ? 'PER_SLAB' : 'PER_SQUARE_METRE',
        slabCount: proportionalSlabCount,
        pricePerSlab,
        pricePerSqm,
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
