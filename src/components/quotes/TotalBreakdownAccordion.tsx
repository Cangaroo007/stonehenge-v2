'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import type { CalculationResult, PiecePricingBreakdown } from '@/lib/types/pricing';

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
      acc.polishing += p.fabrication.polishing.total;
      acc.edgeProfiles += p.fabrication.edges.reduce((sum, e) => sum + e.total, 0);
      acc.join += p.oversize?.joinCost ?? 0;
      acc.grainMatching += p.oversize?.grainMatchingSurcharge ?? 0;
      acc.cutouts += p.fabrication.cutouts.reduce((sum, c) => sum + c.total, 0);
      acc.lamination += p.fabrication.lamination?.total ?? 0;
      return acc;
    },
    { cutting: 0, polishing: 0, edgeProfiles: 0, join: 0, grainMatching: 0, cutouts: 0, lamination: 0 }
  );

  const fabricationSubtotal =
    fabricationTotals.cutting +
    fabricationTotals.polishing +
    fabricationTotals.edgeProfiles +
    fabricationTotals.join +
    fabricationTotals.grainMatching +
    fabricationTotals.cutouts +
    fabricationTotals.lamination;

  const materialsTotal = calculation?.breakdown?.materials?.total ?? 0;

  // Installation: sum from per-piece breakdowns
  const installationTotal = pieces.reduce(
    (sum, p) => sum + (p.fabrication.installation?.total ?? 0),
    0
  );

  // Delivery
  const deliveryTotal = calculation?.breakdown?.delivery?.finalCost ?? 0;

  // Additional costs (services minus installation which is already counted)
  const servicesTotal = calculation?.breakdown?.services?.total ?? 0;
  // The services section may include installation already — use the services total directly
  // as "additional costs" if there are non-installation service items
  const additionalCosts = (calculation?.breakdown?.services?.items ?? [])
    .filter(s => s.serviceType !== 'installation')
    .reduce((sum, s) => sum + s.subtotal, 0);

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
                {fabricationTotals.cutting > 0 && (
                  <div className="flex items-center justify-between text-xs text-gray-600 pt-2">
                    <span className="flex items-center gap-1.5">
                      <span className="text-gray-300">&#9500;&#9472;</span>Cutting
                    </span>
                    <span className="tabular-nums">{formatCurrency(fabricationTotals.cutting)}</span>
                  </div>
                )}
                {fabricationTotals.polishing > 0 && (
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span className="flex items-center gap-1.5">
                      <span className="text-gray-300">&#9500;&#9472;</span>Polishing
                    </span>
                    <span className="tabular-nums">{formatCurrency(fabricationTotals.polishing)}</span>
                  </div>
                )}
                {fabricationTotals.edgeProfiles > 0 && (
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span className="flex items-center gap-1.5">
                      <span className="text-gray-300">&#9500;&#9472;</span>Edge Profiles
                    </span>
                    <span className="tabular-nums">{formatCurrency(fabricationTotals.edgeProfiles)}</span>
                  </div>
                )}
                {fabricationTotals.join > 0 && (
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span className="flex items-center gap-1.5">
                      <span className="text-gray-300">&#9500;&#9472;</span>Join
                    </span>
                    <span className="tabular-nums">{formatCurrency(fabricationTotals.join)}</span>
                  </div>
                )}
                {fabricationTotals.grainMatching > 0 && (
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span className="flex items-center gap-1.5">
                      <span className="text-gray-300">&#9500;&#9472;</span>Grain Matching
                    </span>
                    <span className="tabular-nums">{formatCurrency(fabricationTotals.grainMatching)}</span>
                  </div>
                )}
                {fabricationTotals.cutouts > 0 && (
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span className="flex items-center gap-1.5">
                      <span className="text-gray-300">&#9500;&#9472;</span>Cutouts
                    </span>
                    <span className="tabular-nums">{formatCurrency(fabricationTotals.cutouts)}</span>
                  </div>
                )}
                {fabricationTotals.lamination > 0 && (
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span className="flex items-center gap-1.5">
                      <span className="text-gray-300">&#9492;&#9472;</span>Lamination
                    </span>
                    <span className="tabular-nums">{formatCurrency(fabricationTotals.lamination)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Materials */}
          <div className="flex items-center justify-between text-sm text-gray-700 px-1">
            <span>Materials</span>
            <span className="font-medium tabular-nums">{formatCurrency(materialsTotal)}</span>
          </div>

          {/* Installation */}
          <div className="flex items-center justify-between text-sm text-gray-700 px-1">
            <span>Installation</span>
            <span className="font-medium tabular-nums">{formatCurrency(installationTotal)}</span>
          </div>

          {/* Delivery */}
          <div className="flex items-center justify-between text-sm text-gray-700 px-1">
            <span>Delivery</span>
            <span className="font-medium tabular-nums">{formatCurrency(deliveryTotal)}</span>
          </div>

          {/* Additional Costs */}
          <div className="flex items-center justify-between text-sm text-gray-700 px-1">
            <span>Additional Costs</span>
            <span className="font-medium tabular-nums">{formatCurrency(additionalCosts)}</span>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-300 my-1" />

          {/* Subtotal */}
          <div className="flex items-center justify-between text-sm text-gray-800 px-1">
            <span className="font-medium">Subtotal (excl. GST)</span>
            <span className="font-semibold tabular-nums">{formatCurrency(subtotal)}</span>
          </div>

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
