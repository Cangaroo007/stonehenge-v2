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

function computeFabricationTotal(pieces: PiecePricingBreakdown[]): number {
  return pieces.reduce((sum, p) => {
    const fabWithoutInstall =
      p.fabrication.subtotal - (p.fabrication.installation?.total ?? 0);
    const oversizeCost = p.oversize
      ? p.oversize.joinCost + p.oversize.grainMatchingSurcharge
      : 0;
    return sum + fabWithoutInstall + oversizeCost;
  }, 0);
}

function computeInstallationTotal(pieces: PiecePricingBreakdown[]): number {
  return pieces.reduce((sum, p) => {
    return sum + (p.fabrication.installation?.total ?? 0);
  }, 0);
}

// ── Clickable Label ──────────────────────────────────────────────────────────

function CostItem({
  label,
  amount,
  onClick,
  highlight,
}: {
  label: string;
  amount: number;
  onClick?: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between gap-2 min-w-0 ${
        onClick ? 'cursor-pointer hover:text-orange-300 transition-colours' : 'cursor-default'
      }`}
    >
      <span className="text-gray-400 text-xs truncate">{label}</span>
      <span
        className={`tabular-nums font-medium whitespace-nowrap ${
          highlight ? 'text-xl font-bold text-orange-500' : 'text-white text-sm'
        }`}
      >
        {formatCurrency(amount)}
      </span>
    </button>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function QuoteCostSummaryBar({
  calculation,
  onSectionClick,
}: QuoteCostSummaryBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // ── Derive values from calculation ──────────────────────────────────────

  const pieces = (calculation.breakdown.pieces ?? []) as PiecePricingBreakdown[];

  // Fabrication: per-piece fabrication subtotals minus installation, plus oversize
  // Fallback to edges + cutouts if no per-piece data
  const fabricationTotal =
    pieces.length > 0
      ? computeFabricationTotal(pieces)
      : calculation.breakdown.edges.total + calculation.breakdown.cutouts.total;

  const materialTotal = calculation.breakdown.materials.total;
  const deliveryTotal = calculation.breakdown.delivery?.finalCost ?? 0;
  const templatingTotal = calculation.breakdown.templating?.finalCost ?? 0;
  const installationTotal =
    pieces.length > 0 ? computeInstallationTotal(pieces) : 0;

  const subtotal = calculation.subtotal;
  const discountAmount = calculation.totalDiscount;
  const discountPercent =
    subtotal > 0 ? Math.round((discountAmount / subtotal) * 100) : 0;
  const adjustedSubtotal = calculation.total;
  const gstAmount = calculation.total * 0.1;
  const grandTotal = calculation.total * 1.1;

  // ── Scroll handler ─────────────────────────────────────────────────────

  const handleClick = (sectionId: string) => {
    if (onSectionClick) {
      onSectionClick(sectionId);
    } else {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  // ── Mobile collapsed view ──────────────────────────────────────────────

  const mobileCollapsed = (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <span className="text-gray-400 text-sm font-medium">TOTAL</span>
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-orange-500 tabular-nums">
            {formatCurrency(grandTotal)}
          </span>
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 15l7-7 7 7"
            />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-3 space-y-3 border-t border-gray-700">
          {/* Row 1: Cost categories */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-3">
            <CostItem
              label="Fabrication"
              amount={fabricationTotal}
              onClick={() => handleClick('pieces-section')}
            />
            <CostItem
              label="Material"
              amount={materialTotal}
              onClick={() => handleClick('material-section')}
            />
            <CostItem
              label="Delivery"
              amount={deliveryTotal}
              onClick={() => handleClick('quote-level-charges')}
            />
            <CostItem
              label="Templating"
              amount={templatingTotal}
              onClick={() => handleClick('quote-level-charges')}
            />
            <CostItem
              label="Installation"
              amount={installationTotal}
              onClick={() => handleClick('quote-level-charges')}
            />
          </div>

          {/* Row 2: Totals */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2 border-t border-gray-700">
            <CostItem label="Subtotal" amount={adjustedSubtotal} />
            <CostItem
              label={`Discount (${discountPercent}%)`}
              amount={-discountAmount}
            />
            <CostItem label="GST (10%)" amount={gstAmount} />
          </div>
        </div>
      )}
    </div>
  );

  // ── Desktop full view ──────────────────────────────────────────────────

  const desktopFull = (
    <div className="hidden md:block px-6 py-3">
      {/* Row 1: Cost categories */}
      <div className="grid grid-cols-5 gap-4 mb-2">
        <CostItem
          label="Fabrication"
          amount={fabricationTotal}
          onClick={() => handleClick('pieces-section')}
        />
        <CostItem
          label="Material"
          amount={materialTotal}
          onClick={() => handleClick('material-section')}
        />
        <CostItem
          label="Delivery"
          amount={deliveryTotal}
          onClick={() => handleClick('quote-level-charges')}
        />
        <CostItem
          label="Templating"
          amount={templatingTotal}
          onClick={() => handleClick('quote-level-charges')}
        />
        <CostItem
          label="Installation"
          amount={installationTotal}
          onClick={() => handleClick('quote-level-charges')}
        />
      </div>

      {/* Row 2: Totals */}
      <div className="grid grid-cols-4 gap-4 pt-2 border-t border-gray-700">
        <CostItem label="Subtotal" amount={adjustedSubtotal} />
        <CostItem
          label={`Discount (${discountPercent}%)`}
          amount={-discountAmount}
        />
        <CostItem label="GST (10%)" amount={gstAmount} />
        <CostItem label="TOTAL" amount={grandTotal} highlight />
      </div>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed bottom-0 left-0 right-0 bg-gray-900 text-white border-t border-gray-700 z-40"
      role="complementary"
      aria-label="Quote cost summary"
    >
      {mobileCollapsed}
      {desktopFull}
    </div>
  );
}
