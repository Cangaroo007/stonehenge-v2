/**
 * Quote Calculator - Main Facade
 * 
 * This is the main entry point for quote calculations.
 * It orchestrates all individual calculators to produce a complete quote calculation.
 * 
 * Usage:
 *   const calculator = await QuoteCalculator.create(quoteId);
 *   const result = await calculator.calculate();
 */

import prisma from '@/lib/db';
import { Decimal } from '@prisma/client/runtime/library';
import {
  QuoteId,
  QuoteCalculation,
  PricingContext,
  CalculationOptions,
  AppliedPricingRule,
  JoinCalculation,
} from './types';
import { MaterialCalculator, createMaterialCalculator } from './material-calculator';
import { EdgeCalculator, createEdgeCalculator } from './edge-calculator';
import { CalculationCache } from './cache/calculation-cache';

// ============================================================================
// Main Calculator Class
// ============================================================================

export class QuoteCalculator {
  private quoteId: QuoteId;
  private options: CalculationOptions;
  private cache: CalculationCache;
  
  // Loaded data
  private quoteData: QuoteData | null = null;
  private pricingContext: PricingContext | null = null;
  private edgeTypes: EdgeTypeData[] = [];
  private cutoutTypes: CutoutTypeData[] = [];
  private service_rates: ServiceRateData[] = [];

  private constructor(
    quoteId: QuoteId,
    options: CalculationOptions = {}
  ) {
    this.quoteId = quoteId;
    this.options = {
      includeBreakdown: true,
      cacheResults: true,
      ...options,
    };
    this.cache = new CalculationCache();
  }

  /**
   * Factory method to create a calculator instance
   */
  static async create(
    quoteId: string,
    options?: CalculationOptions
  ): Promise<QuoteCalculator> {
    const calculator = new QuoteCalculator(quoteId as QuoteId, options);
    await calculator.loadData();
    return calculator;
  }

  /**
   * Main calculation method
   */
  async calculate(): Promise<QuoteCalculation> {
    // Check cache first
    if (!this.options.forceRecalculate && this.options.cacheResults) {
      const cached = await this.cache.get(this.quoteId);
      if (cached) return cached;
    }

    if (!this.quoteData || !this.pricingContext) {
      throw new Error('Quote data not loaded');
    }

    // Run calculations in parallel where possible
    const [
      materials,
      edges,
      cutouts,
      services,
      delivery,
      templating,
    ] = await Promise.all([
      this.calculateMaterials(),
      this.calculateEdges(),
      this.calculateCutouts(),
      this.calculateServices(),
      this.calculateDelivery(),
      this.calculateTemplating(),
    ]);

    // Calculate joins (depends on pieces)
    const joins = this.calculateJoins();

    // Apply pricing rules
    const appliedRules = await this.getApplicableRules();

    // Calculate totals
    const subtotal = this.calculateSubtotal([
      materials.total,
      edges.total,
      cutouts.total,
      services.total,
      joins.reduce((sum, j) => sum.plus(j.total), new Decimal(0)),
      delivery.finalCost,
      templating.finalCost,
    ]);

    const discount = this.calculateDiscount(subtotal, appliedRules);
    const taxRate = new Decimal(this.quoteData.tax_rate);
    const taxAmount = subtotal.minus(discount).times(taxRate).dividedBy(100);
    const total = subtotal.minus(discount).plus(taxAmount);

    const result: QuoteCalculation = {
      quoteId: this.quoteId,
      version: this.quoteData.currentVersion,
      materials,
      edges,
      cutouts,
      services,
      delivery,
      templating,
      joins,
      appliedRules,
      subtotal: this.round(subtotal),
      discount: this.round(discount),
      tax_rate: taxRate,
      tax_amount: this.round(taxAmount),
      total: this.round(total),
      currency: this.pricingContext.currency,
      calculated_at: new Date(),
      pricingContext: this.pricingContext,
    };

    // Cache result
    if (this.options.cacheResults) {
      await this.cache.set(this.quoteId, result);
    }

    return result;
  }

  // ============================================================================
  // Data Loading
  // ============================================================================

  private async loadData(): Promise<void> {
    const quoteIdNum = parseInt(this.quoteId, 10);
    if (isNaN(quoteIdNum)) {
      throw new Error('Invalid quote ID');
    }

    // Load quote with all related data
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
                piece_features: true,
              },
            },
          },
        },
      },
    });

    if (!quote) {
      throw new Error('Quote not found');
    }

    this.quoteData = quote as unknown as QuoteData;

    // Load pricing context using the quote's company
    const organisationId = `company-${(quote as any).company_id}`;
    this.pricingContext = await this.loadPricingContext(organisationId);

    // Load pricing configuration
    const [edgeTypes, cutoutTypes, serviceRates] = await Promise.all([
      prisma.edge_types.findMany({ where: { isActive: true } }),
      prisma.cutout_types.findMany({ where: { isActive: true } }),
      prisma.service_rates.findMany({ where: { isActive: true } }),
    ]);

    this.edgeTypes = edgeTypes as EdgeTypeData[];
    this.cutoutTypes = cutoutTypes as unknown as CutoutTypeData[];
    this.service_rates = serviceRates as ServiceRateData[];
  }

  private async loadPricingContext(organisationId: string): Promise<PricingContext> {
    const settings = await prisma.pricing_settings.findUnique({
      where: { organisation_id: organisationId },
    });

    const customer = this.quoteData?.customers;

    return {
      organisationId,
      materialPricingBasis: (settings?.material_pricing_basis as any) || 'PER_SLAB',
      currency: settings?.currency || 'AUD',
      tax_rate: new Decimal(settings?.gst_rate || 0.10),
      clientTypeId: customer?.client_type_id || undefined,
      clientTierId: customer?.client_tier_id || undefined,
      customerId: customer?.id?.toString(),
      priceBookId: this.quoteData?.price_book_id || undefined,
    };
  }

  // ============================================================================
  // Individual Calculations
  // ============================================================================

  private async calculateMaterials() {
    if (!this.quoteData || !this.pricingContext) {
      throw new Error('Data not loaded');
    }

    const pieces = this.quoteData.quote_rooms.flatMap(room =>
      room.quote_pieces.map(piece => ({
        pieceId: piece.id.toString() as any,
        lengthMm: piece.length_mm,
        widthMm: piece.width_mm,
        materials: piece.materials ? {
          id: piece.materials.id,
          pricePerSqm: piece.materials.price_per_sqm,
          pricePerSlab: piece.materials.price_per_slab,
          pricePerSquareMetre: piece.materials.price_per_square_metre,
        } : null,
        overrideMaterialCost: piece.overrideMaterialCost,
      }))
    );

    // Get slab count from optimization
    let slabCount: number | undefined;
    if (this.pricingContext.materialPricingBasis === 'PER_SLAB') {
      const optimization = await prisma.slab_optimizations.findFirst({
        where: { quoteId: parseInt(this.quoteId, 10) },
        orderBy: { createdAt: 'desc' },
      });
      slabCount = optimization?.totalSlabs;
    }

    const calculator = createMaterialCalculator(this.pricingContext, { slabCount });
    return calculator.calculate(pieces);
  }

  private calculateEdges() {
    if (!this.quoteData) {
      throw new Error('Data not loaded');
    }

    const pieces = this.quoteData.quote_rooms.flatMap(room =>
      room.quote_pieces.map(piece => ({
        pieceId: piece.id.toString() as any,
        thicknessMm: piece.thickness_mm,
        dimensions: {
          lengthMm: piece.length_mm,
          widthMm: piece.width_mm,
          thicknessMm: piece.thickness_mm,
        },
        edges: {
          top: piece.edge_top,
          bottom: piece.edge_bottom,
          left: piece.edge_left,
          right: piece.edge_right,
        },
      }))
    );

    const fabricationDiscount = this.extractFabricationDiscount();
    const calculator = createEdgeCalculator(this.edgeTypes, {
      fabricationDiscountPercent: fabricationDiscount,
    });

    return calculator.calculate(pieces);
  }

  private calculateCutouts() {
    // Implementation would go here
    return {
      items: [],
      subtotal: new Decimal(0),
      discount: new Decimal(0),
      total: new Decimal(0),
    };
  }

  private calculateServices() {
    // Implementation would go here
    return {
      items: [],
      subtotal: new Decimal(0),
      discount: new Decimal(0),
      total: new Decimal(0),
    };
  }

  private calculateDelivery() {
    if (!this.quoteData) {
      throw new Error('Data not loaded');
    }

    return {
      address: this.quoteData.deliveryAddress,
      distanceKm: this.quoteData.deliveryDistanceKm,
      zoneId: this.quoteData.deliveryZoneId?.toString() || null,
      zoneName: this.quoteData.deliveryZone?.name || null,
      baseCharge: new Decimal(0),
      ratePerKm: new Decimal(0),
      calculatedCost: this.quoteData.deliveryCost || new Decimal(0),
      overrideCost: this.quoteData.overrideDeliveryCost,
      finalCost: this.quoteData.overrideDeliveryCost 
        || this.quoteData.deliveryCost 
        || new Decimal(0),
    };
  }

  private calculateTemplating() {
    if (!this.quoteData) {
      throw new Error('Data not loaded');
    }

    return {
      required: this.quoteData.templatingRequired,
      distanceKm: this.quoteData.templatingDistanceKm,
      baseCharge: new Decimal(0),
      ratePerKm: new Decimal(0),
      calculatedCost: this.quoteData.templatingCost || new Decimal(0),
      overrideCost: this.quoteData.overrideTemplatingCost,
      finalCost: this.quoteData.overrideTemplatingCost 
        || this.quoteData.templatingCost 
        || new Decimal(0),
    };
  }

  private calculateJoins(): JoinCalculation[] {
    // Implementation would go here
    return [];
  }

  // ============================================================================
  // Pricing Rules
  // ============================================================================

  private async getApplicableRules(): Promise<AppliedPricingRule[]> {
    if (!this.pricingContext) {
      return [];
    }

    // Load rules from database
    const rules = await prisma.pricing_rules_engine.findMany({
      where: {
        isActive: true,
        OR: [
          { clientTypeId: this.pricingContext.clientTypeId || null },
          { clientTierId: this.pricingContext.clientTierId || null },
          { customerId: this.pricingContext.customerId ? parseInt(this.pricingContext.customerId) : null },
        ],
      },
      orderBy: { priority: 'desc' },
    });

    return rules.map(rule => ({
      ruleId: rule.id,
      ruleName: rule.name,
      priority: rule.priority,
      discountType: rule.adjustmentType as any,
      discountValue: new Decimal(rule.adjustmentValue.toString()),
      appliesTo: rule.appliesTo,
    }));
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private extractFabricationDiscount(): number {
    const tier = this.quoteData?.customers?.client_tiers;
    if (!tier?.discount_matrix) return 0;

    const matrix = tier.discount_matrix as Record<string, unknown>;
    const discount = matrix.fabricationDiscount ?? matrix.fabrication_discount ?? 0;
    return typeof discount === 'number' ? discount : 0;
  }

  private calculateSubtotal(amounts: Decimal[]): Decimal {
    return amounts.reduce((sum, amt) => sum.plus(amt), new Decimal(0));
  }

  private calculateDiscount(subtotal: Decimal, rules: AppliedPricingRule[]): Decimal {
    let totalDiscount = new Decimal(0);

    for (const rule of rules) {
      if (rule.discountType === 'percentage') {
        const discount = subtotal.times(rule.discountValue).dividedBy(100);
        totalDiscount = totalDiscount.plus(discount);
      } else {
        totalDiscount = totalDiscount.plus(rule.discountValue);
      }
    }

    // Cap discount at subtotal
    return Decimal.min(totalDiscount, subtotal);
  }

  private round(value: Decimal): Decimal {
    return new Decimal(value.toFixed(2));
  }
}

// ============================================================================
// Data Types
// ============================================================================

interface QuoteData {
  id: number;
  quote_number: string;
  currentVersion: number;
  tax_rate: Decimal;
  deliveryAddress: string | null;
  deliveryDistanceKm: Decimal | null;
  deliveryZoneId: number | null;
  deliveryZone: { name: string } | null;
  deliveryCost: Decimal | null;
  overrideDeliveryCost: Decimal | null;
  templatingRequired: boolean;
  templatingDistanceKm: Decimal | null;
  templatingCost: Decimal | null;
  overrideTemplatingCost: Decimal | null;
  price_book_id: string | null;
  price_books: { id: string; name: string } | null;
  customers: {
    id: number;
    company_id?: number;
    client_type_id: string | null;
    client_tier_id: string | null;
    client_tiers: {
      discount_matrix: unknown;
    } | null;
  } | null;
  quote_rooms: Array<{
    quote_pieces: Array<{
      id: number;
      length_mm: number;
      width_mm: number;
      thickness_mm: number;
      edge_top: string | null;
      edge_bottom: string | null;
      edge_left: string | null;
      edge_right: string | null;
      materials: {
        id: number;
        price_per_sqm: Decimal;
        price_per_slab: Decimal | null;
        price_per_square_metre: Decimal | null;
      } | null;
      overrideMaterialCost: Decimal | null;
      piece_features: unknown[];
    }>;
  }>;
}

interface EdgeTypeData {
  id: string;
  name: string;
  baseRate: Decimal;
  rate20mm: Decimal | null;
  rate40mm: Decimal | null;
  minimumCharge: Decimal | null;
  minimumLength: Decimal | null;
}

interface CutoutTypeData {
  id: string;
  name: string;
  category: string;
  baseRate: Decimal;
  minimumCharge: Decimal | null;
}

interface ServiceRateData {
  serviceType: string;
  name: string;
  rate20mm: Decimal;
  rate40mm: Decimal;
  minimumCharge: Decimal | null;
}

// ============================================================================
// Export
// ============================================================================

export async function calculateQuote(
  quoteId: string,
  options?: CalculationOptions
): Promise<QuoteCalculation> {
  const calculator = await QuoteCalculator.create(quoteId, options);
  return calculator.calculate();
}
