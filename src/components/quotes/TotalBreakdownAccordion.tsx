'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import type { CalculationResult, PiecePricingBreakdown } from '@/lib/types/pricing';

// ── Unit + detail-string helpers ─────────────────────────────────────────────

function unitShort(unit: string): string {
  switch (unit) {
    case 'LINEAR_METRE': return 'Lm';
    case 'SQUARE_METRE': return 'm²';
    case 'FIXED': return '';
    case 'PER_SLAB': return 'slab';
    default: return unit;
  }
}

function unitLabel(unit: string): string {
  switch (unit) {
    case 'LINEAR_METRE': return 'per Lm';
    case 'SQUARE_METRE': return 'per m²';
    case 'FIXED': return 'fixed';
    case 'PER_SLAB': return 'per slab';
    default: return unit;
  }
}

function buildMaterialsDetail(
  m: NonNullable<CalculationResult['breakdown']['materials']> | undefined,
): string | null {
  if (!m) return null;
  const parts: string[] = [];
  if (m.pricingBasis === 'PER_SLAB' && m.slabCount != null && m.slabRate != null) {
    const label = `${m.slabCount} slab${m.slabCount === 1 ? '' : 's'}${m.materialName ? ' ' + m.materialName : ''}`;
    parts.push(`${label} × ${formatCurrency(m.slabRate)}`);
  } else if (m.adjustedAreaM2 != null && m.appliedRate != null) {
    parts.push(`${m.adjustedAreaM2.toFixed(2)} m² × ${formatCurrency(m.appliedRate)}/m²`);
  } else if (m.totalAreaM2 != null && m.appliedRate != null) {
    parts.push(`${m.totalAreaM2.toFixed(2)} m² × ${formatCurrency(m.appliedRate)}/m²`);
  }
  if (m.margin && m.margin.marginAmount > 0) {
    parts.push(`+ ${m.margin.effectiveMarginPercent.toFixed(0)}% margin (${formatCurrency(m.margin.marginAmount)})`);
  }
  return parts.length ? parts.join(' ') : null;
}

function buildInstallationDetail(pieces: PiecePricingBreakdown[]): string | null {
  const sample = pieces.find(p => p.fabrication.installation);
  if (!sample?.fabrication.installation) return null;
  const { rate, unit } = sample.fabrication.installation;
  const totalQuantity = pieces.reduce(
    (sum, p) => sum + (p.fabrication.installation?.quantity ?? 0),
    0,
  );
  if (totalQuantity <= 0) return null;
  return `${totalQuantity.toFixed(2)} ${unitShort(unit)} × ${formatCurrency(rate)} ${unitLabel(unit)}`;
}

function buildDeliveryDetail(
  d: NonNullable<CalculationResult['breakdown']['delivery']> | undefined,
): string | null {
  if (!d) return null;
  const parts: string[] = [];
  if (d.zone) parts.push(`${d.zone} zone`);
  if (d.distanceKm != null) parts.push(`${d.distanceKm.toFixed(1)} km`);
  // baseCharge + ratePerKm are exposed by the calculator (CALC-EXPOSE-RATE-DETAIL).
  // Legacy stored breakdowns may lack these fields — guard both before appending.
  if (d.baseCharge != null && d.ratePerKm != null) {
    parts.push(`${formatCurrency(d.baseCharge)} base + ${formatCurrency(d.ratePerKm)}/km`);
  }
  return parts.length ? parts.join(' · ') : null;
}

function buildTemplatingDetail(
  t: NonNullable<CalculationResult['breakdown']['templating']> | undefined,
): string | null {
  if (!t) return null;
  // Full formula when calculator exposed both rates AND the distance is known.
  if (t.baseCharge != null && t.ratePerKm != null && t.distanceKm != null) {
    return `${formatCurrency(t.baseCharge)} base + ${t.distanceKm.toFixed(1)} km × ${formatCurrency(t.ratePerKm)}/km`;
  }
  // Fallback: distance-only when rates unknown (legacy stored breakdown).
  if (t.distanceKm != null) return `${t.distanceKm.toFixed(1)} km`;
  return null;
}

interface TotalBreakdownAccordionProps {
  /** The quote total (inc. GST) for the collapsed display */
  totalIncGst: number;
  /** The calculation result for the breakdown details */
  calculation: CalculationResult | null;
  /** Quote-level subtotal (excl. GST) */
  subtotal: number;
  /** GST amount */
  gstAmount: number;
  /** Discount amount (if any) */
  discount?: number;
}

export default function TotalBreakdownAccordion({
  totalIncGst,
  calculation,
  subtotal,
  gstAmount,
  discount = 0,
}: TotalBreakdownAccordionProps) {
  const [expanded, setExpanded] = useState(false);
  const [fabExpanded, setFabExpanded] = useState(false);

  // Aggregate fabrication costs from per-piece breakdowns
  const pieces = (calculation?.breakdown?.pieces ?? []) as PiecePricingBreakdown[];

  const fabricationTotals = pieces.reduce(
    (acc, p) => {
      acc.cutting += p.fabrication.cutting.total;
      acc.edgeProfiles += p.fabrication.edges.reduce((sum, e) => sum + e.total, 0);
      acc.join += p.oversize?.joinCost ?? 0;
      acc.grainMatching += p.oversize?.grainMatchingSurcharge ?? 0;
      acc.cutouts += p.fabrication.cutouts.reduce((sum, c) => sum + c.total, 0);
      return acc;
    },
    { cutting: 0, edgeProfiles: 0, join: 0, grainMatching: 0, cutouts: 0 }
  );

  // Corner joins for L/U shapes are emitted as JOIN service items by the
  // calculator; oversize.joinCost only covers multi-slab rectangle joins.
  fabricationTotals.join += (calculation?.breakdown?.services?.items ?? [])
    .filter((s) => s.serviceType === 'JOIN')
    .reduce((sum, s) => sum + (s.subtotal ?? 0), 0);

  const fabricationSubtotal =
    fabricationTotals.cutting +
    fabricationTotals.edgeProfiles +
    fabricationTotals.join +
    fabricationTotals.grainMatching +
    fabricationTotals.cutouts;

  const materialsBreakdown = calculation?.breakdown?.materials ?? undefined;
  const materialsTotal = materialsBreakdown?.total ?? 0;
  const materialsDetail = buildMaterialsDetail(materialsBreakdown);
  const installationDetail = buildInstallationDetail(pieces);
  const deliveryDetail = buildDeliveryDetail(calculation?.breakdown?.delivery ?? undefined);
  const templatingDetail = buildTemplatingDetail(calculation?.breakdown?.templating ?? undefined);

  // Installation: sum from per-piece breakdowns
  const installationTotal = pieces.reduce(
    (sum, p) => sum + (p.fabrication.installation?.total ?? 0),
    0
  );

  const deliveryTotal = calculation?.breakdown?.delivery?.finalCost ?? 0;
  const templatingTotal = calculation?.breakdown?.templating?.finalCost ?? 0;
  const customChargesTotal = (calculation as any)?.customChargesTotal ?? 0;

  return (
    <div className="card overflow-hidden">
      {/* Collapsed summary — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-gray-50 transition-colors"
      >
        <svg
          className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <div className="flex items-center justify-between flex-1 min-w-0">
          <span className="font-semibold text-gray-900">Quote Total</span>
          <span className="font-bold text-primary-600 tabular-nums">
            {formatCurrency(totalIncGst)} <span className="text-xs font-normal text-gray-500">(inc. GST)</span>
          </span>
        </div>
      </button>

      {/* Expanded breakdown */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-200 space-y-2">

          {/* Piece Fabrication — nested accordion */}
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setFabExpanded(!fabExpanded)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
            >
              <svg
                className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-200 ${fabExpanded ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-gray-700 font-medium">Piece Fabrication</span>
              <span className="ml-auto font-medium tabular-nums text-gray-900">
                {formatCurrency(fabricationSubtotal)}
              </span>
            </button>

            {fabExpanded && (
              <div className="px-3 pb-3 space-y-1 border-t border-gray-100">
                <div className="flex items-center justify-between text-xs text-gray-600 pt-2">
                  <span className="flex items-center gap-1.5">
                    <span className="text-gray-300">&#9500;&#9472;</span>Cutting
                  </span>
                  <span className="tabular-nums">{formatCurrency(fabricationTotals.cutting)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span className="flex items-center gap-1.5">
                    <span className="text-gray-300">&#9500;&#9472;</span>Edge Profiles
                  </span>
                  <span className="tabular-nums">{formatCurrency(fabricationTotals.edgeProfiles)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span className="flex items-center gap-1.5">
                    <span className="text-gray-300">&#9500;&#9472;</span>Join
                  </span>
                  <span className="tabular-nums">{formatCurrency(fabricationTotals.join)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span className="flex items-center gap-1.5">
                    <span className="text-gray-300">&#9500;&#9472;</span>Grain Matching
                  </span>
                  <span className="tabular-nums">{formatCurrency(fabricationTotals.grainMatching)}</span>
                </div>
                {fabricationTotals.cutouts > 0 && (
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span className="flex items-center gap-1.5">
                      <span className="text-gray-300">&#9500;&#9472;</span>Cutouts
                    </span>
                    <span className="tabular-nums">{formatCurrency(fabricationTotals.cutouts)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Materials */}
          <div className="flex items-center justify-between text-sm text-gray-700 px-1">
            <span>Materials</span>
            <div className="flex items-center gap-2">
              {materialsDetail && (
                <span className="text-[11px] text-gray-400">{materialsDetail}</span>
              )}
              <span className="font-medium tabular-nums">{formatCurrency(materialsTotal)}</span>
            </div>
          </div>

          {/* Installation */}
          <div className="flex items-center justify-between text-sm text-gray-700 px-1">
            <span>Installation</span>
            <div className="flex items-center gap-2">
              {installationDetail && (
                <span className="text-[11px] text-gray-400">{installationDetail}</span>
              )}
              <span className="font-medium tabular-nums">{formatCurrency(installationTotal)}</span>
            </div>
          </div>

          {/* Delivery — hidden when zero */}
          {deliveryTotal > 0 && (
            <div className="flex items-center justify-between text-sm text-gray-700 px-1">
              <span>Delivery</span>
              <div className="flex items-center gap-2">
                {deliveryDetail && (
                  <span className="text-[11px] text-gray-400">{deliveryDetail}</span>
                )}
                <span className="font-medium tabular-nums">{formatCurrency(deliveryTotal)}</span>
              </div>
            </div>
          )}

          {/* Templating — hidden when zero */}
          {templatingTotal > 0 && (
            <div className="flex items-center justify-between text-sm text-gray-700 px-1">
              <span>Templating</span>
              <div className="flex items-center gap-2">
                {templatingDetail && (
                  <span className="text-[11px] text-gray-400">{templatingDetail}</span>
                )}
                <span className="font-medium tabular-nums">{formatCurrency(templatingTotal)}</span>
              </div>
            </div>
          )}

          {/* Custom Charges — hidden when zero */}
          {customChargesTotal > 0 && (
            <div className="flex items-center justify-between text-sm text-gray-700 px-1">
              <span>Custom Charges</span>
              <span className="font-medium tabular-nums">{formatCurrency(customChargesTotal)}</span>
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-gray-300 my-1" />

          {/* Subtotal */}
          <div className="flex items-center justify-between text-sm text-gray-800 px-1">
            <span className="font-medium">Subtotal (excl. GST)</span>
            <span className="font-semibold tabular-nums">{formatCurrency(subtotal)}</span>
          </div>

          {/* Pricing Adjustment — rules-engine discount applied to subtotal */}
          {calculation?.rulesDiscount != null && calculation.rulesDiscount > 0 && (
            <div className="flex items-center justify-between text-sm text-green-600 px-1">
              <span>Pricing Adjustment</span>
              <span className="font-medium tabular-nums">-{formatCurrency(calculation.rulesDiscount)}</span>
            </div>
          )}

          {/* Discount */}
          {discount > 0 && (
            <div className="flex items-center justify-between text-sm text-green-600 px-1">
              <span>Discount</span>
              <span className="font-medium tabular-nums">-{formatCurrency(discount)}</span>
            </div>
          )}
          {discount === 0 && (
            <div className="flex items-center justify-between text-sm text-gray-500 px-1">
              <span>Discount</span>
              <span className="font-medium tabular-nums">{formatCurrency(0)}</span>
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-gray-300 my-1" />

          {/* GST */}
          <div className="flex items-center justify-between text-sm text-gray-700 px-1">
            <span>GST (10%)</span>
            <span className="font-medium tabular-nums">{formatCurrency(gstAmount)}</span>
          </div>

          {/* Total */}
          <div className="flex items-center justify-between text-base font-bold text-gray-900 px-1 pt-1">
            <span>Total (incl. GST)</span>
            <span className="tabular-nums text-primary-600">{formatCurrency(totalIncGst)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
