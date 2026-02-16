'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import type { CalculationResult, PiecePricingBreakdown } from '@/lib/types/pricing';

// ── Props ────────────────────────────────────────────────────────────────────

interface QuoteCostSummaryBarProps {
  calculation: CalculationResult;
  /** Click handlers to scroll to sections */
  onSectionClick?: (sectionId: string) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function computeFabricationBreakdown(pieces: PiecePricingBreakdown[]) {
  let cutting = 0;
  let polishing = 0;
  let edgeProfiles = 0;
  let lamination = 0;
  let cutouts = 0;
  let joins = 0;

  for (const p of pieces) {
    if (p.fabrication) {
      cutting += p.fabrication.cutting?.total ?? 0;
      polishing += p.fabrication.polishing?.total ?? 0;
      edgeProfiles += (p.fabrication.edges ?? []).reduce(
        (s: number, e: { total?: number }) => s + (e.total ?? 0),
        0,
      );
      lamination += p.fabrication.lamination?.total ?? 0;
      cutouts += (p.fabrication.cutouts ?? []).reduce(
        (s: number, c: { total?: number }) => s + (c.total ?? 0),
        0,
      );
    }
    if (p.oversize) {
      joins += p.oversize.joinCost ?? 0;
    }
  }

  const subtotal = cutting + polishing + edgeProfiles + lamination + cutouts + joins;
  return { cutting, polishing, edgeProfiles, lamination, cutouts, joins, subtotal };
}

function computeInstallationTotal(pieces: PiecePricingBreakdown[]): number {
  return pieces.reduce((sum, p) => sum + (p.fabrication?.installation?.total ?? 0), 0);
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function QuoteCostSummaryBar({
  calculation,
}: QuoteCostSummaryBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // ── Derive values from calculation ──────────────────────────────────────

  const breakdown = calculation.breakdown;
  if (!breakdown) return null;

  const pieces = (breakdown.pieces ?? []) as PiecePricingBreakdown[];

  const fab =
    pieces.length > 0
      ? computeFabricationBreakdown(pieces)
      : {
          cutting: 0,
          polishing: 0,
          edgeProfiles: breakdown.edges?.total ?? 0,
          lamination: 0,
          cutouts: breakdown.cutouts?.total ?? 0,
          joins: 0,
          subtotal: (breakdown.edges?.total ?? 0) + (breakdown.cutouts?.total ?? 0),
        };

  const materialTotal = breakdown.materials?.total ?? 0;
  const deliveryTotal = breakdown.delivery?.finalCost ?? 0;
  const templatingTotal = breakdown.templating?.finalCost ?? 0;
  const installationTotal = pieces.length > 0 ? computeInstallationTotal(pieces) : 0;

  const discountAmount = calculation.totalDiscount ?? 0;
  const subtotal = calculation.subtotal ?? 0;
  const discountPercent =
    subtotal > 0 ? Math.round((discountAmount / subtotal) * 100) : 0;
  const adjustedSubtotal = calculation.total ?? 0;
  const gstAmount = (calculation.total ?? 0) * 0.1;
  const grandTotal = (calculation.total ?? 0) * 1.1;

  const isEmpty = grandTotal === 0;
  const totalColour = isEmpty ? 'text-orange-500' : 'text-green-600';

  // Style helpers: zero amounts rendered faded
  const amtCls = (v: number) => (v === 0 ? 'text-zinc-300' : 'text-zinc-900');
  const lblCls = (v: number) => (v === 0 ? 'text-zinc-300' : 'text-zinc-600');

  const fabricationItems = [
    { label: 'Cutting', amount: fab.cutting },
    { label: 'Polishing', amount: fab.polishing },
    { label: 'Edge Profiles', amount: fab.edgeProfiles },
    { label: 'Lamination', amount: fab.lamination },
    { label: 'Cutouts', amount: fab.cutouts },
    { label: 'Joins', amount: fab.joins },
  ];

  const topLevelItems = [
    { label: 'Material', amount: materialTotal },
    { label: 'Delivery', amount: deliveryTotal },
    { label: 'Templating', amount: templatingTotal },
    { label: 'Installation', amount: installationTotal },
  ];

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div
      className="bg-white border-t border-zinc-200 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] mb-8 print:shadow-none print:mb-0"
      role="complementary"
      aria-label="Quote cost summary"
    >
      <div className="max-w-lg mx-auto px-4 sm:px-6">
        {/* ── Collapsed bar (click anywhere to expand) ───────────────── */}
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className={`w-full py-4 group print:hidden ${isExpanded ? 'hidden' : ''}`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0">
            <span className="text-sm font-medium text-zinc-500 text-left">
              QUOTE TOTAL (inc GST)
            </span>
            <div className="flex items-center justify-end gap-3">
              <span className={`text-2xl font-bold tabular-nums ${totalColour}`}>
                {formatCurrency(grandTotal)}
              </span>
              <svg
                className="h-5 w-5 text-zinc-400 group-hover:text-zinc-600 transition-colors"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </div>
          </div>
        </button>

        {/* ── Expanded breakdown (animated via CSS grid-rows) ─────── */}
        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-in-out print:grid-rows-[1fr] ${
            isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          }`}
        >
          <div className="overflow-hidden min-h-0">
            <div className="pt-3 pb-5 space-y-4">
              {/* Collapse chevron — screen only */}
              <div className="flex justify-end print:hidden">
                <button
                  type="button"
                  onClick={() => setIsExpanded(false)}
                  className="p-1 rounded hover:bg-zinc-100 transition-colors"
                  aria-label="Collapse cost summary"
                >
                  <svg
                    className="h-5 w-5 text-zinc-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
              </div>

              {isEmpty && (
                <p className="text-sm text-zinc-400 italic">
                  Add pieces to see pricing breakdown
                </p>
              )}

              {/* Fabrication section */}
              <div>
                <span className="text-sm font-semibold text-zinc-700">Fabrication</span>
                <div className="mt-1 space-y-0.5">
                  {fabricationItems.map(({ label, amount }) => (
                    <div key={label} className="flex items-center justify-between pl-4">
                      <span className={`text-sm ${lblCls(amount)}`}>{label}</span>
                      <span className={`text-sm tabular-nums font-medium ${amtCls(amount)}`}>
                        {formatCurrency(amount)}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-end">
                    <div className="w-24 border-t border-zinc-200 mt-1.5 mb-0.5" />
                  </div>
                  <div className="flex items-center justify-between pl-4">
                    <span className={`text-sm font-medium ${lblCls(fab.subtotal)}`}>
                      Fabrication Subtotal
                    </span>
                    <span className={`text-sm tabular-nums font-semibold ${amtCls(fab.subtotal)}`}>
                      {formatCurrency(fab.subtotal)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Top-level cost items */}
              <div className="space-y-0.5">
                {topLevelItems.map(({ label, amount }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className={`text-sm font-semibold ${lblCls(amount)}`}>{label}</span>
                    <span className={`text-sm tabular-nums font-medium ${amtCls(amount)}`}>
                      {formatCurrency(amount)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Subtotal / Discount / GST */}
              <div>
                <div className="border-t-2 border-zinc-300 mb-2" />
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className={`text-sm ${lblCls(adjustedSubtotal)}`}>
                      Subtotal (ex GST)
                    </span>
                    <span className={`text-sm tabular-nums font-medium ${amtCls(adjustedSubtotal)}`}>
                      {formatCurrency(adjustedSubtotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`text-sm ${lblCls(discountAmount)}`}>
                      Discount ({discountPercent}%)
                    </span>
                    <span className={`text-sm tabular-nums font-medium ${amtCls(discountAmount)}`}>
                      {formatCurrency(-discountAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`text-sm ${lblCls(gstAmount)}`}>GST (10%)</span>
                    <span className={`text-sm tabular-nums font-medium ${amtCls(gstAmount)}`}>
                      {formatCurrency(gstAmount)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Grand Total */}
              <div>
                <div className="border-t-2 border-zinc-300 mb-2" />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-zinc-500">
                    QUOTE TOTAL (inc GST)
                  </span>
                  <span className={`text-2xl font-bold tabular-nums ${totalColour}`}>
                    {formatCurrency(grandTotal)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
