'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { formatCurrency } from '@/lib/utils';
import { useUnits } from '@/lib/contexts/UnitContext';
import { formatAreaFromSqm } from '@/lib/utils/units';
import { debounce } from '@/lib/utils/debounce';
import type { CalculationResult, PiecePricingBreakdown } from '@/lib/types/pricing';

// GST rate (configurable, default 10% for Australia)
const GST_RATE = 0.10;

type DiscountDisplayMode = 'ITEMIZED' | 'TOTAL_ONLY';
type AdditionalDiscountType = 'percentage' | 'fixed';

interface PricingSummaryProps {
  quoteId: string;
  refreshTrigger: number;
  customerName?: string | null;
  customerTier?: string | null;
  customerType?: string | null;
  priceBookName?: string | null;
  onCalculationComplete?: (result: CalculationResult | null) => void;
  discountDisplayMode?: DiscountDisplayMode;
  onDiscountDisplayModeChange?: (mode: DiscountDisplayMode) => void;
}

export default function PricingSummary({
  quoteId,
  refreshTrigger,
  customerName,
  customerTier,
  customerType,
  priceBookName,
  onCalculationComplete,
  discountDisplayMode: externalDisplayMode,
  onDiscountDisplayModeChange,
}: PricingSummaryProps) {
  const { unitSystem } = useUnits();
  const [calculation, setCalculation] = useState<CalculationResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  // Discount Display Mode toggle - use external if provided, else local
  const [localDiscountDisplayMode, setLocalDiscountDisplayMode] = useState<DiscountDisplayMode>('ITEMIZED');
  const discountDisplayMode = externalDisplayMode ?? localDiscountDisplayMode;
  const setDiscountDisplayMode = (mode: DiscountDisplayMode) => {
    setLocalDiscountDisplayMode(mode);
    if (onDiscountDisplayModeChange) onDiscountDisplayModeChange(mode);
  };

  // Additional Discount state
  const [additionalDiscountType, setAdditionalDiscountType] = useState<AdditionalDiscountType>('percentage');
  const [additionalDiscountValue, setAdditionalDiscountValue] = useState<string>('');

  // Debounced calculation function
  const performCalculation = useCallback(async () => {
    setIsCalculating(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to calculate');
      }

      const data = await res.json();
      setCalculation(data);
      // Notify parent of calculation result
      if (onCalculationComplete) {
        onCalculationComplete(data);
      }
    } catch (err) {
      console.error('Calculation failed:', err);
      setError(err instanceof Error ? err.message : 'Calculation failed');
      // Notify parent of null calculation on error
      if (onCalculationComplete) {
        onCalculationComplete(null);
      }
    } finally {
      setIsCalculating(false);
    }
  }, [quoteId, onCalculationComplete]);

  // Create debounced version with useMemo
  const debouncedCalculate = useMemo(
    () => debounce(performCalculation, 500),
    [performCalculation]
  );

  // Trigger calculation when refreshTrigger changes
  useEffect(() => {
    debouncedCalculate();
  }, [refreshTrigger, debouncedCalculate]);

  // Compute tier discounts per category
  const tierDiscounts = useMemo(() => {
    if (!calculation?.discounts) return { slabs: 0, cutting: 0, polishing: 0, total: 0 };

    let slabs = 0;
    let cutting = 0;
    let polishing = 0;
    let total = 0;

    for (const d of calculation.discounts) {
      if (d.appliedTo === 'materials') slabs += d.savings;
      else if (d.appliedTo === 'edges') polishing += d.savings;
      else if (d.appliedTo === 'cutouts') cutting += d.savings;
      else if (d.appliedTo === 'total') total += d.savings;
    }

    return { slabs, cutting, polishing, total };
  }, [calculation]);

  // Calculate subtotal from calculation
  const calculatedSubtotal = calculation?.total ?? 0;

  // Calculate additional discount amount
  const additionalDiscountAmount = useMemo(() => {
    const val = parseFloat(additionalDiscountValue);
    if (!val || val <= 0) return 0;
    if (additionalDiscountType === 'percentage') {
      return (calculatedSubtotal * val) / 100;
    }
    return val;
  }, [additionalDiscountValue, additionalDiscountType, calculatedSubtotal]);

  // Adjusted subtotal after additional discount
  const adjustedSubtotal = calculatedSubtotal - additionalDiscountAmount;

  // Calculate GST on adjusted subtotal
  const gst = adjustedSubtotal * GST_RATE;
  const grandTotal = adjustedSubtotal + gst;

  // Calculate total tier savings
  const totalTierSavings = calculation?.discounts.reduce((sum, d) => sum + d.savings, 0) ?? 0;

  // Total all-in discount (tier + additional)
  const totalAllSavings = totalTierSavings + additionalDiscountAmount;

  // Retry handler
  const handleRetry = () => {
    performCalculation();
  };

  return (
    <div className="card">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-lg font-semibold hover:text-primary-600 transition-colors"
        >
          <svg
            className={`h-5 w-5 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Pricing
        </button>
        <div className="flex items-center gap-2">
          {/* Discount Display Mode Toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setDiscountDisplayMode('ITEMIZED')}
              className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                discountDisplayMode === 'ITEMIZED'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              title="Show discounts per line item"
            >
              Itemized
            </button>
            <button
              onClick={() => setDiscountDisplayMode('TOTAL_ONLY')}
              className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                discountDisplayMode === 'TOTAL_ONLY'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              title="Show discount only in footer"
            >
              Total Only
            </button>
          </div>
          <button
            onClick={handleRetry}
            disabled={isCalculating}
            className="text-sm text-primary-600 hover:text-primary-700 disabled:opacity-50 flex items-center gap-1"
          >
            {isCalculating ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Calculating...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Recalculate
              </>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className={`p-4 space-y-4 ${isCalculating ? 'opacity-60' : ''}`}>
          {/* Error State */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              <p className="font-medium">Calculation Error</p>
              <p>{error}</p>
              <button
                onClick={handleRetry}
                className="mt-2 text-red-800 underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          )}

          {/* Warning when no customer selected */}
          {!customerName && (
            <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-start gap-2">
                <svg className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-gray-600 text-sm">
                    No customer selected
                  </p>
                  <p className="text-gray-500 text-xs mt-1">
                    Using standard base prices. Select a customer to apply their pricing tier.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Customer Info with Tier Badge */}
          {customerName && (
            <div className="pb-3 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">
                    <span className="text-gray-600">Customer:</span>{' '}
                    <span className="font-medium">{customerName}</span>
                  </p>
                  {customerType && (
                    <p className="text-xs text-gray-500 mt-0.5">{customerType}</p>
                  )}
                </div>
                {customerTier && (
                  <span className={`
                    inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                    ${customerTier === 'Tier 1' ? 'bg-green-100 text-green-800' :
                      customerTier === 'Tier 2' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'}
                  `}>
                    {customerTier}
                  </span>
                )}
              </div>
              {priceBookName && (
                <p className="text-sm mt-1">
                  <span className="text-gray-600">Price Book:</span>{' '}
                  <span className="font-medium">{priceBookName}</span>
                </p>
              )}
            </div>
          )}

          {/* Warning when customer has no pricing tier assigned */}
          {customerName && !customerTier && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <svg className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="text-amber-800 font-medium text-sm">
                    No pricing tier assigned
                  </p>
                  <p className="text-amber-700 text-xs mt-1">
                    Using base prices. Assign a tier in the
                    <a href="/customers" className="underline ml-1 hover:text-amber-900">
                      customer profile
                    </a>
                    {' '}to apply discounts.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ====== SLABS (Materials) Section ====== */}
          {calculation?.breakdown.materials && (
            <div className="pb-3 border-b border-gray-200">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">SLABS</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Total Area:</span>
                  <span>{formatAreaFromSqm(Number(calculation.breakdown.materials.totalAreaM2) || 0, unitSystem)}</span>
                </div>
                {/* Waste factor line — only for per-sqm pricing */}
                {calculation.breakdown.materials.wasteFactorPercent != null && calculation.breakdown.materials.wasteFactorPercent > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Waste Factor ({calculation.breakdown.materials.wasteFactorPercent}%):</span>
                    <span>
                      {formatAreaFromSqm(Number(calculation.breakdown.materials.adjustedAreaM2) || 0, unitSystem)} incl. waste
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600">
                  <span>Base Rate:</span>
                  <span>
                    {formatCurrency(calculation.breakdown.materials.baseRate)}/{unitSystem === 'IMPERIAL' ? 'ft\u00B2' : 'm\u00B2'}
                    {calculation.breakdown.materials.thicknessMultiplier !== 1 && (
                      <span className="ml-1">
                        \u00D7 {(Number(calculation.breakdown.materials.thicknessMultiplier) || 1).toFixed(1)}
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Base Price:</span>
                  <span>{formatCurrency(calculation.breakdown.materials.subtotal)}</span>
                </div>
                {discountDisplayMode === 'ITEMIZED' && tierDiscounts.slabs > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Tier Discount:</span>
                    <span>-{formatCurrency(tierDiscounts.slabs)}</span>
                  </div>
                )}
                <div className="flex justify-between font-medium">
                  <span>Total:</span>
                  <span>{formatCurrency(calculation.breakdown.materials.total)}</span>
                </div>
              </div>
            </div>
          )}

          {/* ====== CUTTING (Cutouts) Section ====== */}
          {calculation?.breakdown.cutouts && calculation.breakdown.cutouts.items.length > 0 && (
            <div className="pb-3 border-b border-gray-200">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">CUTTING</h4>
              <div className="space-y-1 text-sm">
                {calculation.breakdown.cutouts.items.map((cutout) => (
                  <div key={cutout.cutoutTypeId} className="flex justify-between text-gray-600">
                    <span>{cutout.cutoutTypeName} \u00D7 {cutout.quantity}:</span>
                    <span>
                      {formatCurrency(cutout.basePrice)} ea = {formatCurrency(cutout.subtotal)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between text-gray-600 pt-1">
                  <span>Base Price:</span>
                  <span>{formatCurrency(calculation.breakdown.cutouts.subtotal)}</span>
                </div>
                {discountDisplayMode === 'ITEMIZED' && tierDiscounts.cutting > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Tier Discount:</span>
                    <span>-{formatCurrency(tierDiscounts.cutting)}</span>
                  </div>
                )}
                <div className="flex justify-between font-medium pt-1">
                  <span>Total:</span>
                  <span>{formatCurrency(calculation.breakdown.cutouts.total)}</span>
                </div>
              </div>
            </div>
          )}

          {/* ====== POLISHING (Edges) Section ====== */}
          {calculation?.breakdown.edges && calculation.breakdown.edges.byType.length > 0 && (
            <div className="pb-3 border-b border-gray-200">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">POLISHING</h4>
              <div className="space-y-1 text-sm">
                {calculation.breakdown.edges.byType.map((edge) => (
                  <div key={edge.edgeTypeId} className="flex justify-between text-gray-600">
                    <span>{edge.edgeTypeName}:</span>
                    <span>
                      {(Number(edge.linearMeters) || 0).toFixed(1)} lm \u00D7 {formatCurrency(edge.appliedRate)} = {formatCurrency(edge.subtotal)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between text-gray-600 pt-1">
                  <span>Base Price:</span>
                  <span>{formatCurrency(calculation.breakdown.edges.subtotal)}</span>
                </div>
                {discountDisplayMode === 'ITEMIZED' && tierDiscounts.polishing > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Tier Discount:</span>
                    <span>-{formatCurrency(tierDiscounts.polishing)}</span>
                  </div>
                )}
                <div className="flex justify-between font-medium pt-1">
                  <span>Total:</span>
                  <span>{formatCurrency(calculation.breakdown.edges.total)}</span>
                </div>
              </div>
            </div>
          )}

          {/* ====== PER-PIECE BREAKDOWN Section ====== */}
          {discountDisplayMode === 'ITEMIZED' && calculation?.breakdown.pieces && calculation.breakdown.pieces.length > 0 && (
            <div className="pb-3 border-b border-gray-200">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">PER-PIECE BREAKDOWN</h4>
              <div className="space-y-3">
                {calculation.breakdown.pieces.map((piece: PiecePricingBreakdown, idx: number) => (
                  <PieceBreakdownRow key={`piece-${piece.pieceId || idx}`} piece={piece} />
                ))}
              </div>
            </div>
          )}

          {/* Delivery Section */}
          {calculation?.breakdown.delivery && calculation.breakdown.delivery.finalCost > 0 && (
            <div className="pb-3 border-b border-gray-200">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">DELIVERY</h4>
              <div className="space-y-1 text-sm">
                {calculation.breakdown.delivery.address && (
                  <div className="flex justify-between text-gray-600">
                    <span>Address:</span>
                    <span className="text-right text-xs max-w-[200px] truncate">
                      {calculation.breakdown.delivery.address}
                    </span>
                  </div>
                )}
                {calculation.breakdown.delivery.distanceKm && (
                  <div className="flex justify-between text-gray-600">
                    <span>Distance:</span>
                    <span>{(Number(calculation.breakdown.delivery.distanceKm) || 0).toFixed(1)} km</span>
                  </div>
                )}
                {calculation.breakdown.delivery.zone && (
                  <div className="flex justify-between text-gray-600">
                    <span>Zone:</span>
                    <span>{calculation.breakdown.delivery.zone}</span>
                  </div>
                )}
                {calculation.breakdown.delivery.overrideCost !== null && (
                  <div className="flex justify-between text-amber-600">
                    <span>Override Applied:</span>
                    <span>{formatCurrency(calculation.breakdown.delivery.overrideCost)}</span>
                  </div>
                )}
                <div className="flex justify-between font-medium pt-1">
                  <span>Delivery Cost:</span>
                  <span>{formatCurrency(calculation.breakdown.delivery.finalCost)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Templating Section */}
          {calculation?.breakdown.templating && calculation.breakdown.templating.required && calculation.breakdown.templating.finalCost > 0 && (
            <div className="pb-3 border-b border-gray-200">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">TEMPLATING</h4>
              <div className="space-y-1 text-sm">
                {calculation.breakdown.templating.distanceKm && (
                  <div className="flex justify-between text-gray-600">
                    <span>Distance:</span>
                    <span>{(Number(calculation.breakdown.templating.distanceKm) || 0).toFixed(1)} km</span>
                  </div>
                )}
                {calculation.breakdown.templating.overrideCost !== null && (
                  <div className="flex justify-between text-amber-600">
                    <span>Override Applied:</span>
                    <span>{formatCurrency(calculation.breakdown.templating.overrideCost)}</span>
                  </div>
                )}
                <div className="flex justify-between font-medium pt-1">
                  <span>Templating Cost:</span>
                  <span>{formatCurrency(calculation.breakdown.templating.finalCost)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Applied Tier Discounts (in TOTAL_ONLY mode, or always as summary) */}
          {calculation?.discounts && calculation.discounts.length > 0 && (
            <div className="pb-3 border-b border-gray-200">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">TIER DISCOUNTS</h4>
              <div className="space-y-1 text-sm">
                {calculation.discounts.map((discount) => (
                  <div key={discount.ruleId} className="flex items-center justify-between text-green-700">
                    <span className="flex items-center gap-1">
                      <svg className="h-3.5 w-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      {discount.ruleName}
                      {discount.type === 'percentage' && ` (${discount.value}%)`}
                      <span className="text-green-500 text-xs">
                        [{discount.appliedTo}]
                      </span>
                    </span>
                    <span>-{formatCurrency(discount.savings)}</span>
                  </div>
                ))}
                {discountDisplayMode === 'TOTAL_ONLY' && totalTierSavings > 0 && (
                  <div className="flex justify-between font-medium text-green-700 pt-1 border-t border-green-100">
                    <span>Total Tier Savings:</span>
                    <span>-{formatCurrency(totalTierSavings)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Additional Discount (manual $ or %) */}
          <div className="pb-3 border-b border-gray-200">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">ADDITIONAL DISCOUNT</h4>
            <div className="flex items-center gap-2">
              <select
                value={additionalDiscountType}
                onChange={(e) => setAdditionalDiscountType(e.target.value as AdditionalDiscountType)}
                className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="percentage">%</option>
                <option value="fixed">$</option>
              </select>
              <input
                type="number"
                value={additionalDiscountValue}
                onChange={(e) => setAdditionalDiscountValue(e.target.value)}
                placeholder={additionalDiscountType === 'percentage' ? 'e.g. 5' : 'e.g. 100'}
                min="0"
                step="0.01"
                className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            {additionalDiscountAmount > 0 && (
              <div className="flex justify-between text-green-600 text-sm mt-2">
                <span>
                  Discount{additionalDiscountType === 'percentage' ? ` (${additionalDiscountValue}%)` : ''}:
                </span>
                <span>-{formatCurrency(additionalDiscountAmount)}</span>
              </div>
            )}
          </div>

          {/* Totals */}
          <div className="space-y-2 pt-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal:</span>
              <span className="font-medium">{formatCurrency(calculatedSubtotal)}</span>
            </div>
            {totalAllSavings > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Total Savings:</span>
                <span>-{formatCurrency(totalAllSavings)}</span>
              </div>
            )}
            {additionalDiscountAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Adjusted Subtotal:</span>
                <span className="font-medium">{formatCurrency(adjustedSubtotal)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">GST ({(Number(GST_RATE) * 100 || 0).toFixed(0)}%):</span>
              <span className="font-medium">{formatCurrency(gst)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-gray-300">
              <span className="text-lg font-bold">TOTAL:</span>
              <span className="text-lg font-bold text-primary-600">
                {formatCurrency(grandTotal)}
              </span>
            </div>
          </div>

          {/* Calculated At Timestamp */}
          {calculation?.calculated_at && (
            <p className="text-xs text-gray-400 text-right pt-2">
              Last calculated: {new Date(calculation.calculated_at).toLocaleTimeString()}
            </p>
          )}

          {/* Loading Overlay */}
          {isCalculating && !calculation && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          )}

          {/* No Data State */}
          {!calculation && !isCalculating && !error && (
            <div className="text-center py-8 text-gray-500">
              <p>No pricing data available.</p>
              <button
                onClick={handleRetry}
                className="mt-2 text-primary-600 hover:text-primary-700 underline"
              >
                Calculate Now
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Collapsible per-piece pricing breakdown row
 */
function PieceBreakdownRow({ piece }: { piece: PiecePricingBreakdown }) {
  const [expanded, setExpanded] = useState(false);
  const isOversize = piece.oversize?.isOversize ?? false;

  return (
    <div className={`rounded-lg p-2 ${isOversize ? 'bg-amber-50 ring-1 ring-amber-200' : 'bg-gray-50'}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-sm hover:text-primary-600 transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <svg
            className={`h-3.5 w-3.5 transform transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-medium text-gray-800">{piece.pieceName}</span>
          <span className="text-xs text-gray-500">
            {piece.dimensions.lengthMm} × {piece.dimensions.widthMm} mm
          </span>
          {isOversize && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
              OVERSIZE
            </span>
          )}
        </div>
        <span className="font-medium text-gray-900">{formatCurrency(piece.pieceTotal)}</span>
      </button>

      {expanded && (
        <div className="mt-2 ml-5 space-y-1 text-xs">
          {/* Cutting */}
          {piece.fabrication.cutting && piece.fabrication.cutting.baseAmount > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Cutting ({piece.fabrication.cutting.quantity.toFixed(1)} {piece.fabrication.cutting.unit === 'SQUARE_METRE' ? 'm\u00B2' : 'lm'} × {formatCurrency(piece.fabrication.cutting.rate)}):</span>
              <span>
                {piece.fabrication.cutting.discount > 0 ? (
                  <span>
                    <span className="line-through text-gray-400 mr-1">{formatCurrency(piece.fabrication.cutting.baseAmount)}</span>
                    {formatCurrency(piece.fabrication.cutting.total)}
                  </span>
                ) : (
                  formatCurrency(piece.fabrication.cutting.total)
                )}
              </span>
            </div>
          )}

          {/* Polishing */}
          {piece.fabrication.polishing && piece.fabrication.polishing.baseAmount > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Polishing ({piece.fabrication.polishing.quantity.toFixed(1)} {piece.fabrication.polishing.unit === 'SQUARE_METRE' ? 'm\u00B2' : 'lm'} × {formatCurrency(piece.fabrication.polishing.rate)}):</span>
              <span>
                {piece.fabrication.polishing.discount > 0 ? (
                  <span>
                    <span className="line-through text-gray-400 mr-1">{formatCurrency(piece.fabrication.polishing.baseAmount)}</span>
                    {formatCurrency(piece.fabrication.polishing.total)}
                  </span>
                ) : (
                  formatCurrency(piece.fabrication.polishing.total)
                )}
              </span>
            </div>
          )}

          {/* Edges */}
          {piece.fabrication.edges.length > 0 && piece.fabrication.edges.map((edge, idx) => (
            <div key={`${edge.side}-${idx}`} className="flex justify-between text-gray-600">
              <span>{edge.edgeTypeName} ({edge.side}, {edge.linearMeters.toFixed(1)} lm):</span>
              <span>
                {edge.discount > 0 ? (
                  <span>
                    <span className="line-through text-gray-400 mr-1">{formatCurrency(edge.baseAmount)}</span>
                    {formatCurrency(edge.total)}
                  </span>
                ) : (
                  formatCurrency(edge.total)
                )}
              </span>
            </div>
          ))}

          {/* Cutouts */}
          {piece.fabrication.cutouts.length > 0 && piece.fabrication.cutouts.map((cutout, idx) => (
            <div key={`${cutout.cutoutTypeId}-${idx}`} className="flex justify-between text-gray-600">
              <span>{cutout.cutoutTypeName} × {cutout.quantity}:</span>
              <span>{formatCurrency(cutout.total)}</span>
            </div>
          ))}

          {/* Oversize / Join Details */}
          {piece.oversize?.isOversize && (
            <div className="pt-1 mt-1 border-t border-amber-200 space-y-1">
              <div className="flex justify-between text-amber-700">
                <span>
                  Join ({piece.oversize.joinCount} join{piece.oversize.joinCount !== 1 ? 's' : ''}) — {piece.oversize.joinLengthLm.toFixed(1)} lm × {formatCurrency(piece.oversize.joinRate)}/lm:
                </span>
                <span>{formatCurrency(piece.oversize.joinCost)}</span>
              </div>
              <div className="flex justify-between text-amber-700">
                <span>
                  + {(piece.oversize.grainMatchingSurchargeRate * 100).toFixed(0)}% Grain Matching Surcharge:
                </span>
                <span>{formatCurrency(piece.oversize.grainMatchingSurcharge)}</span>
              </div>
              {piece.oversize.warnings.length > 0 && (
                <div className="text-amber-600 text-[10px] italic">
                  {piece.oversize.warnings.map((w, idx) => (
                    <p key={idx}>{w}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Piece subtotal */}
          <div className="flex justify-between font-medium text-gray-800 pt-1 border-t border-gray-200">
            <span>Piece Total:</span>
            <span>{formatCurrency(piece.pieceTotal)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
