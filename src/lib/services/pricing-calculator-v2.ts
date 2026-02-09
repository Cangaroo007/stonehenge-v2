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
import { JOIN_RATE_PER_METRE } from '@/lib/constants/slab-sizes';
import type { MaterialPricingBasis } from '@prisma/client';
import type {
  PricingOptions,
  PricingContext,
  CalculationResult,
  AppliedRule,
  EdgeBreakdown,
  CutoutBreakdown,
  MaterialBreakdown,
  PricingRuleWithOverrides,
  PiecePricingBreakdown,
} from '@/lib/types/pricing';

/**
 * Enhanced pricing calculation result
 */
export interface EnhancedCalculationResult extends CalculationResult {
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
  name: string;
  quantity: number;
  unit: string;
  rate: number;
  subtotal: number;
}

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
      organisationId: settings.organisation_id,
      materialPricingBasis: settings.material_pricing_basis,
      cuttingUnit: settings.cutting_unit,
      polishingUnit: settings.polishing_unit,
      installationUnit: settings.installation_unit,
      currency: settings.currency,
      gstRate: Number(settings.gst_rate),
    };
  }

  // Return defaults if no settings configured
  return {
    organisationId,
    materialPricingBasis: 'PER_SLAB',
    cuttingUnit: 'LINEAR_METRE',
    polishingUnit: 'LINEAR_METRE',
    installationUnit: 'SQUARE_METRE',
    currency: 'AUD',
    gstRate: 0.10,
  };
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
    materials: {
      price_per_sqm: { toNumber: () => number };
      price_per_slab?: { toNumber: () => number } | null;
      price_per_square_metre?: { toNumber: () => number } | null;
    } | null;
    overrideMaterialCost?: { toNumber: () => number } | null;
  }>,
  pricingBasis: MaterialPricingBasis = 'PER_SLAB',
  slabCount?: number
): MaterialBreakdown {
  let totalAreaM2 = 0;
  let subtotal = 0;

  for (const piece of pieces) {
    const areaSqm = (piece.length_mm * piece.width_mm) / 1_000_000;
    totalAreaM2 += areaSqm;

    // Check for piece-level override
    if (piece.overrideMaterialCost) {
      subtotal += piece.overrideMaterialCost.toNumber();
      continue;
    }

    if (pricingBasis === 'PER_SLAB' && slabCount !== undefined) {
      // Per-slab pricing: use slab count × price per slab
      const slabPrice = piece.materials?.price_per_slab?.toNumber() ?? 0;
      if (slabPrice > 0 && slabCount > 0) {
        // Distribute slab cost proportionally across pieces by area
        const totalPieceArea = (piece.length_mm * piece.width_mm) / 1_000_000;
        // This will be summed across all pieces, then replaced below
        subtotal += totalPieceArea * (slabPrice / (totalAreaM2 || 1));
      } else {
        // Fallback to per-m² if no slab price set
        const baseRate = piece.materials?.price_per_square_metre?.toNumber()
          ?? piece.materials?.price_per_sqm.toNumber()
          ?? 0;
        subtotal += areaSqm * baseRate;
      }
    } else {
      // Per square metre pricing
      const baseRate = piece.materials?.price_per_square_metre?.toNumber()
        ?? piece.materials?.price_per_sqm.toNumber()
        ?? 0;
      subtotal += areaSqm * baseRate;
    }
  }

  // For PER_SLAB, recalculate subtotal as slabCount × slabPrice if available
  if (pricingBasis === 'PER_SLAB' && slabCount !== undefined && slabCount > 0) {
    // Find the slab price from the first piece with a material
    const materialWithSlabPrice = pieces.find(p => p.materials?.price_per_slab?.toNumber());
    if (materialWithSlabPrice) {
      const slabPrice = materialWithSlabPrice.materials!.price_per_slab!.toNumber();
      // Only override if no piece-level overrides were applied
      const hasOverrides = pieces.some(p => p.overrideMaterialCost);
      if (!hasOverrides) {
        subtotal = slabCount * slabPrice;
      }
    }
  }

  const effectiveRate = totalAreaM2 > 0 ? roundToTwo(subtotal / totalAreaM2) : 0;

  return {
    totalAreaM2: roundToTwo(totalAreaM2),
    baseRate: effectiveRate,
    thicknessMultiplier: 1,
    appliedRate: effectiveRate,
    subtotal: roundToTwo(subtotal),
    discount: 0,
    total: roundToTwo(subtotal),
    pricingBasis,
    slabCount: pricingBasis === 'PER_SLAB' ? slabCount : undefined,
    slabRate: pricingBasis === 'PER_SLAB' && slabCount
      ? roundToTwo(subtotal / slabCount)
      : undefined,
  };
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
              materials: true,
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
  const [edgeTypes, cutoutTypes, serviceRates] = await Promise.all([
    prisma.edge_types.findMany({ where: { isActive: true } }),
    prisma.cutout_types.findMany({ where: { isActive: true } }),
    prisma.service_rates.findMany({ where: { isActive: true } }),
  ]);

  // Flatten all pieces
  const allPieces = quote.quote_rooms.flatMap(room => room.quote_pieces);

  // Get slab count from latest optimization (for PER_SLAB pricing)
  let slabCount: number | undefined;
  if (pricingContext.materialPricingBasis === 'PER_SLAB') {
    const optimization = await prisma.slab_optimizations.findFirst({
      where: { quoteId: quoteIdNum },
      orderBy: { createdAt: 'desc' },
      select: { totalSlabs: true },
    });
    slabCount = optimization?.totalSlabs;
  }

  // Calculate material costs with pricing basis
  const materialBreakdown = calculateMaterialCost(
    allPieces,
    pricingContext.materialPricingBasis,
    slabCount
  );

  // Calculate edge costs with thickness variants
  const edgeData = calculateEdgeCostV2(allPieces, edgeTypes);

  // Calculate cutout costs with categories and minimums
  // NOTE: cutout_types schema may not have `category` yet - cast as any
  const cutoutData = calculateCutoutCostV2(allPieces, cutoutTypes as any);

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

  const pieceBreakdowns: PiecePricingBreakdown[] = [];
  for (const piece of allPieces) {
    pieceBreakdowns.push(
      calculatePiecePricing(
        piece,
        serviceRates,
        edgeTypeMap,
        cutoutTypeMap,
        fabricationDiscountPct,
        pricingContext
      )
    );
  }

  // Calculate join costs for oversized pieces
  for (const piece of allPieces) {
    const material = piece.materials as unknown as { category?: string } | null;
    const materialCategory = material?.category || 'caesarstone';
    const cutPlan = calculateCutPlan(
      { lengthMm: piece.length_mm, widthMm: piece.width_mm },
      materialCategory
    );

    if (!cutPlan.fitsOnSingleSlab) {
      serviceData.items.push({
        serviceType: 'JOIN',
        name: `Join - ${cutPlan.strategy}`,
        quantity: roundToTwo(cutPlan.joinLengthMm / 1000),
        unit: 'LINEAR_METRE',
        rate: JOIN_RATE_PER_METRE,
        subtotal: cutPlan.joinCost,
      });
      serviceData.subtotal += cutPlan.joinCost;
    }
  }

  // Calculate delivery cost
  // NOTE: delivery/templating fields are planned but not yet in schema - use `as any`
  const quoteAny = quote as any;
  const deliveryBreakdown = {
    address: quoteAny.deliveryAddress,
    distanceKm: quoteAny.deliveryDistanceKm ? Number(quoteAny.deliveryDistanceKm) : null,
    zone: quoteAny.deliveryZone?.name || null,
    calculatedCost: quoteAny.deliveryCost ? Number(quoteAny.deliveryCost) : null,
    overrideCost: quoteAny.overrideDeliveryCost ? Number(quoteAny.overrideDeliveryCost) : null,
    finalCost: quoteAny.overrideDeliveryCost
      ? Number(quoteAny.overrideDeliveryCost)
      : (quoteAny.deliveryCost ? Number(quoteAny.deliveryCost) : 0),
  };

  // Calculate templating cost
  const templatingBreakdown = {
    required: quoteAny.templatingRequired,
    distanceKm: quoteAny.templatingDistanceKm ? Number(quoteAny.templatingDistanceKm) : null,
    calculatedCost: quoteAny.templatingCost ? Number(quoteAny.templatingCost) : null,
    overrideCost: quoteAny.overrideTemplatingCost ? Number(quoteAny.overrideTemplatingCost) : null,
    finalCost: quoteAny.overrideTemplatingCost
      ? Number(quoteAny.overrideTemplatingCost)
      : (quoteAny.templatingCost ? Number(quoteAny.templatingCost) : 0),
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
      { id: piece.edge_top, length: piece.width_mm },
      { id: piece.edge_bottom, length: piece.width_mm },
      { id: piece.edge_left, length: piece.length_mm },
      { id: piece.edge_right, length: piece.length_mm },
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
 * Calculate cutout costs with categories and minimum charges
 */
function calculateCutoutCostV2(
  pieces: Array<{
    cutouts: unknown; // JSON array
  }>,
  cutoutTypes: Array<{
    id: string;
    name: string;
    category: string;
    baseRate: { toNumber: () => number };
    minimumCharge: { toNumber: () => number } | null;
  }>
): { items: CutoutBreakdown[]; subtotal: number } {
  const cutoutTotals = new Map<string, { quantity: number; cutoutType: typeof cutoutTypes[number] }>();

  for (const piece of pieces) {
    const cutouts = Array.isArray(piece.cutouts) ? piece.cutouts :
                    (typeof piece.cutouts === 'string' ? JSON.parse(piece.cutouts as string) : []);

    for (const cutout of cutouts) {
      const cutoutType = cutoutTypes.find(ct => ct.id === cutout.typeId || ct.name === cutout.type);
      if (!cutoutType) continue;

      const existing = cutoutTotals.get(cutoutType.id) || { quantity: 0, cutoutType };
      existing.quantity += cutout.quantity || 1;
      cutoutTotals.set(cutoutType.id, existing);
    }
  }

  const items: CutoutBreakdown[] = [];
  let subtotal = 0;

  for (const [, data] of Array.from(cutoutTotals.entries())) {
    const basePrice = data.cutoutType.baseRate.toNumber();
    let itemSubtotal = data.quantity * basePrice;

    // Apply minimum charge
    const minCharge = data.cutoutType.minimumCharge?.toNumber() || 0;
    if (minCharge > 0 && itemSubtotal < minCharge) {
      itemSubtotal = minCharge;
    }

    items.push({
      cutoutTypeId: data.cutoutType.id,
      cutoutTypeName: `${data.cutoutType.name} (${data.cutoutType.category})`,
      quantity: data.quantity,
      basePrice: roundToTwo(basePrice),
      appliedPrice: roundToTwo(basePrice),
      subtotal: roundToTwo(itemSubtotal),
    });

    subtotal += itemSubtotal;
  }

  return { items, subtotal };
}

/**
 * Calculate service costs (cutting, polishing, installation, waterfall)
 * Reads configured units from pricingContext to determine quantity basis.
 */
function calculateServiceCosts(
  pieces: Array<{ length_mm: number; width_mm: number; thickness_mm: number; edge_top: string | null; edge_bottom: string | null; edge_left: string | null; edge_right: string | null }>,
  totalEdgeLinearMeters: number,
  serviceRates: Array<{
    serviceType: string;
    name: string;
    rate20mm: { toNumber: () => number };
    rate40mm: { toNumber: () => number };
    minimumCharge: { toNumber: () => number } | null;
  }>,
  pricingContext: PricingContext
): { items: ServiceBreakdown[]; subtotal: number } {
  const items: ServiceBreakdown[] = [];
  let subtotal = 0;

  // Pre-compute shared aggregates
  const totalAreaM2 = pieces.reduce((sum, p) => sum + (p.length_mm * p.width_mm) / 1_000_000, 0);
  const totalPerimeterLm = pieces.reduce((sum, p) => sum + 2 * (p.length_mm + p.width_mm) / 1000, 0);
  const avgThickness = pieces.length > 0
    ? pieces.reduce((sum, p) => sum + p.thickness_mm, 0) / pieces.length
    : 20;

  // Cutting: use tenant's configured cutting_unit
  const cuttingRate = serviceRates.find(sr => sr.serviceType === 'CUTTING');
  if (cuttingRate) {
    const cuttingUnit = pricingContext.cuttingUnit;
    const cuttingQty = cuttingUnit === 'LINEAR_METRE' ? totalPerimeterLm : totalAreaM2;
    const rate = avgThickness <= 20 ? cuttingRate.rate20mm.toNumber() : cuttingRate.rate40mm.toNumber();

    let cost = cuttingQty * rate;
    const minCharge = cuttingRate.minimumCharge?.toNumber() || 0;
    if (minCharge > 0 && cost < minCharge) cost = minCharge;

    items.push({
      serviceType: 'CUTTING',
      name: cuttingRate.name,
      quantity: roundToTwo(cuttingQty),
      unit: cuttingUnit,
      rate: rate,
      subtotal: roundToTwo(cost),
    });
    subtotal += cost;
  }

  // Polishing: use tenant's configured polishing_unit
  const polishingRate = serviceRates.find(sr => sr.serviceType === 'POLISHING');
  if (polishingRate && totalEdgeLinearMeters > 0) {
    const polishingUnit = pricingContext.polishingUnit;
    let polishingCost = 0;
    let totalPolishingQty = 0;

    for (const piece of pieces) {
      const edgeLengths = [
        piece.edge_top ? piece.width_mm : 0,
        piece.edge_bottom ? piece.width_mm : 0,
        piece.edge_left ? piece.length_mm : 0,
        piece.edge_right ? piece.length_mm : 0,
      ];
      const pieceEdgeLm = edgeLengths.reduce((sum, len) => sum + len, 0) / 1000;
      if (pieceEdgeLm <= 0) continue;

      // SQUARE_METRE: finished edge area = edge_length_m × thickness_m
      const piecePolishingQty = polishingUnit === 'SQUARE_METRE'
        ? pieceEdgeLm * (piece.thickness_mm / 1000)
        : pieceEdgeLm;

      const rate = piece.thickness_mm <= 20
        ? polishingRate.rate20mm.toNumber()
        : polishingRate.rate40mm.toNumber();

      polishingCost += piecePolishingQty * rate;
      totalPolishingQty += piecePolishingQty;
    }

    const minCharge = polishingRate.minimumCharge?.toNumber() || 0;
    if (minCharge > 0 && polishingCost < minCharge) polishingCost = minCharge;

    const displayRate = totalPolishingQty > 0
      ? roundToTwo(polishingCost / totalPolishingQty)
      : polishingRate.rate20mm.toNumber();

    if (totalPolishingQty > 0) {
      items.push({
        serviceType: 'POLISHING',
        name: polishingRate.name,
        quantity: roundToTwo(totalPolishingQty),
        unit: polishingUnit,
        rate: displayRate,
        subtotal: roundToTwo(polishingCost),
      });
      subtotal += polishingCost;
    }
  }

  // Installation: use tenant's configured installation_unit
  const installationRate = serviceRates.find(sr => sr.serviceType === 'INSTALLATION');
  if (installationRate) {
    const installationUnit = pricingContext.installationUnit;
    const installQty =
      installationUnit === 'SQUARE_METRE' ? totalAreaM2 :
      installationUnit === 'LINEAR_METRE' ? totalPerimeterLm :
      1; // FIXED = flat fee

    const rate = avgThickness <= 20
      ? installationRate.rate20mm.toNumber()
      : installationRate.rate40mm.toNumber();

    let cost = installQty * rate;
    const minCharge = installationRate.minimumCharge?.toNumber() || 0;
    if (minCharge > 0 && cost < minCharge) cost = minCharge;

    if (cost > 0) {
      items.push({
        serviceType: 'INSTALLATION',
        name: installationRate.name,
        quantity: roundToTwo(installQty),
        unit: installationUnit,
        rate: rate,
        subtotal: roundToTwo(cost),
      });
      subtotal += cost;
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
  },
  serviceRates: Array<{
    serviceType: string;
    rate20mm: { toNumber: () => number };
    rate40mm: { toNumber: () => number };
    minimumCharge: { toNumber: () => number } | null;
  }>,
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
  pricingContext: PricingContext
): PiecePricingBreakdown {
  const thickness = piece.thickness_mm;
  const isThick = thickness > 20;

  // Get service rates based on thickness
  const cuttingRate = serviceRates.find(r => r.serviceType === 'CUTTING');
  const polishingRate = serviceRates.find(r => r.serviceType === 'POLISHING');
  const installationRate = serviceRates.find(r => r.serviceType === 'INSTALLATION');

  const cuttingRateVal = isThick
    ? (cuttingRate?.rate40mm.toNumber() ?? 45)
    : (cuttingRate?.rate20mm.toNumber() ?? 17.5);

  const polishingRateVal = isThick
    ? (polishingRate?.rate40mm.toNumber() ?? 115)
    : (polishingRate?.rate20mm.toNumber() ?? 45);

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

  // Edge sides mapping: top/bottom use width_mm, left/right use length_mm
  const edgeSides: Array<{ side: 'top' | 'bottom' | 'left' | 'right'; lengthMm: number; edgeTypeId: string | null }> = [
    { side: 'top', lengthMm: piece.width_mm, edgeTypeId: piece.edge_top },
    { side: 'bottom', lengthMm: piece.width_mm, edgeTypeId: piece.edge_bottom },
    { side: 'left', lengthMm: piece.length_mm, edgeTypeId: piece.edge_left },
    { side: 'right', lengthMm: piece.length_mm, edgeTypeId: piece.edge_right },
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

  // Edge profile costs (additional cost per edge type)
  const edgeBreakdowns: PiecePricingBreakdown['fabrication']['edges'] = [];
  for (const { side, lengthMm, edgeTypeId } of edgeSides) {
    if (!edgeTypeId) continue;
    const edgeType = edgeTypes.get(edgeTypeId);
    if (!edgeType) continue;

    let rate: number;
    if (!isThick && edgeType.rate20mm) {
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

  // Cutout costs
  const cutoutBreakdowns: PiecePricingBreakdown['fabrication']['cutouts'] = [];
  const cutoutsArray = Array.isArray(piece.cutouts)
    ? piece.cutouts
    : (typeof piece.cutouts === 'string' ? JSON.parse(piece.cutouts as string) : []);

  for (const cutout of cutoutsArray) {
    const cutoutType = cutoutTypes.get(cutout.typeId) ?? findCutoutByName(cutoutTypes, cutout.type);
    if (!cutoutType) continue;

    const rate = cutoutType.baseRate.toNumber();
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
  if (installationRate) {
    const installationUnit = pricingContext.installationUnit;
    const installRateVal = isThick
      ? installationRate.rate40mm.toNumber()
      : installationRate.rate20mm.toNumber();

    const installQty =
      installationUnit === 'SQUARE_METRE' ? areaSqm :
      installationUnit === 'LINEAR_METRE' ? perimeterLm :
      1; // FIXED = flat fee; distributed per-piece as rate × 1

    const installBase = roundToTwo(installQty * installRateVal);
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
    edgeBreakdowns.reduce((sum, e) => sum + e.total, 0) +
    cutoutBreakdowns.reduce((sum, c) => sum + c.total, 0)
  );

  return {
    pieceId: piece.id,
    pieceName: piece.name || piece.description || `Piece ${piece.id}`,
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
