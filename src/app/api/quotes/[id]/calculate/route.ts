import { NextRequest, NextResponse } from 'next/server';
import { calculateQuotePrice } from '@/lib/services/pricing-calculator-v2';
import type { PricingOptions } from '@/lib/types/pricing';

/**
 * POST /api/quotes/[id]/calculate
 *
 * Calculate the price for a quote (Enhanced V2), applying:
 * - Customer's client type and tier
 * - Assigned price book (or override via request body)
 * - Volume thresholds
 * - ServiceRate (cutting, polishing, installation, waterfall)
 * - EdgeType thickness variants (20mm vs 40mm+)
 * - CutoutType categories with minimum charges
 * - Delivery costs (calculated + manual overrides)
 * - Templating costs (calculated + manual overrides)
 * - Quote-level pricing overrides
 *
 * Request body (optional):
 * {
 *   priceBookId?: string;     // Override the quote's assigned price book
 *   customerId?: string;      // Override customer for pricing rules
 *   forceRecalculate?: boolean; // Force recalculation even if cached
 * }
 *
 * Response:
 * {
 *   quoteId: string;
 *   subtotal: number;
 *   totalDiscount: number;
 *   total: number;
 *   breakdown: {
 *     materials: { ... },
 *     edges: { ... },
 *     cutouts: { ... },
 *     services: { items: [...], subtotal, total },
 *     delivery: { address, distanceKm, zone, calculatedCost, overrideCost, finalCost },
 *     templating: { required, distanceKm, calculatedCost, overrideCost, finalCost }
 *   },
 *   appliedRules: [...],
 *   discounts: [...],
 *   price_books: { id, name } | null,
 *   calculatedAt: Date
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Validate quote ID
    const quoteIdNum = parseInt(id, 10);
    if (isNaN(quoteIdNum)) {
      return NextResponse.json(
        { error: 'Invalid quote ID. Must be a number.' },
        { status: 400 }
      );
    }

    // Parse request body for options
    let options: PricingOptions = {};
    try {
      const body = await request.json();
      if (body) {
        options = {
          priceBookId: body.price_book_id,
          customerId: body.customerId,
          forceRecalculate: body.forceRecalculate,
        };
      }
    } catch {
      // No body or invalid JSON - use default options
    }

    // Validate options if provided
    if (options.price_book_id && typeof options.price_book_id !== 'string') {
      return NextResponse.json(
        { error: 'Invalid priceBookId. Must be a string.' },
        { status: 400 }
      );
    }

    // Calculate the quote price
    const result = await calculateQuotePrice(id, options);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error calculating quote price:', error);

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message === 'Quote not found') {
        return NextResponse.json(
          { error: 'Quote not found' },
          { status: 404 }
        );
      }

      if (error.message === 'Invalid quote ID') {
        return NextResponse.json(
          { error: 'Invalid quote ID' },
          { status: 400 }
        );
      }

      // Return detailed error for debugging
      return NextResponse.json(
        {
          error: 'Failed to calculate quote price',
          details: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to calculate quote price' },
      { status: 500 }
    );
  }
}
