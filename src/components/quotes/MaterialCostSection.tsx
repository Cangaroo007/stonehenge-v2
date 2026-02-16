'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import type { MaterialBreakdown, MaterialGroupBreakdown } from '@/lib/types/pricing';

// ── Interfaces ──────────────────────────────────────────────────────────────

interface MaterialCostSectionProps {
  materials: MaterialBreakdown;
  /** Total number of pieces in the quote */
  pieceCount: number;
  /** Current mode — margin details are hidden in view mode */
  mode?: 'view' | 'edit';
  /** Current per-quote-option material margin adjustment */
  materialMarginAdjustPercent?: number;
  /** Called when margin adjustment changes (edit mode only) */
  onMarginAdjustChange?: (percent: number) => void;
}

// ── Chevron Icon ────────────────────────────────────────────────────────────

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-3.5 w-3.5 transform transition-transform ${expanded ? 'rotate-90' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

// ── Detail Row ──────────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-700 text-right">{value}</span>
    </div>
  );
}

// ── Margin Detail (edit mode only) ──────────────────────────────────────────

function MarginDetail({ margin }: { margin: NonNullable<MaterialBreakdown['margin']> }) {
  return (
    <div className="space-y-1 pt-1 border-t border-dashed border-gray-200 mt-2">
      <DetailRow
        label="Cost subtotal"
        value={formatCurrency(margin.costSubtotal)}
      />
      <DetailRow
        label={`Margin (${margin.effectiveMarginPercent.toFixed(1)}%)`}
        value={`+${formatCurrency(margin.marginAmount)}`}
      />
      {margin.adjustmentPercent !== 0 && (
        <div className="text-xs text-gray-400">
          Base: {margin.baseMarginPercent}% + Adjustment: {margin.adjustmentPercent > 0 ? '+' : ''}{margin.adjustmentPercent}%
        </div>
      )}
    </div>
  );
}

// ── Per-Slab Detail ─────────────────────────────────────────────────────────

function PerSlabDetail({ data, showMargin }: { data: MaterialBreakdown | MaterialGroupBreakdown; showMargin?: boolean }) {
  const count = data.slabCount ?? 0;
  const rate = 'slabRate' in data ? (data.slabRate ?? 0) : 0;
  const total = 'totalCost' in data ? data.totalCost : data.total;
  const isEstimate = !data.slabCountFromOptimiser;
  const totalArea = data.totalAreaM2 ?? 0;
  const margin = data.margin;

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-start text-sm">
        <span className="text-gray-600">
          {isEstimate && <span className="text-amber-600 font-medium">Estimated: </span>}
          {count} slab{count !== 1 ? 's' : ''} &times; {formatCurrency(rate)}/slab
        </span>
        <span className="font-medium tabular-nums">{formatCurrency(total)}</span>
      </div>
      {data.slabLengthMm && data.slabWidthMm && (
        <DetailRow
          label="Slab size"
          value={`${data.slabLengthMm}mm \u00D7 ${data.slabWidthMm}mm`}
        />
      )}
      <DetailRow
        label="Total piece area"
        value={`${totalArea.toFixed(2)} m\u00B2`}
      />
      {isEstimate && (
        <p className="text-xs text-amber-600 italic">
          Estimated — exact count updates automatically when pieces are saved
        </p>
      )}
      {showMargin && margin && margin.effectiveMarginPercent !== 0 && (
        <MarginDetail margin={margin} />
      )}
    </div>
  );
}

// ── Per m² Detail ───────────────────────────────────────────────────────────

function PerSqmDetail({ data, showMargin }: { data: MaterialBreakdown | MaterialGroupBreakdown; showMargin?: boolean }) {
  const wastePct = data.wasteFactorPercent ?? 0;
  const wasteFactor = 1 + wastePct / 100;
  const ratePerSqm = 'ratePerSqm' in data ? (data.ratePerSqm ?? 0) : ('appliedRate' in data ? data.appliedRate : 0);
  const total = 'totalCost' in data ? data.totalCost : data.total;
  const totalArea = data.totalAreaM2 ?? 0;
  const adjustedArea = data.adjustedAreaM2 ?? 0;
  const margin = data.margin;

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-start text-sm">
        <span className="text-gray-600">
          {totalArea.toFixed(2)} m&sup2; &times; waste factor {wasteFactor.toFixed(2)} &times; {formatCurrency(ratePerSqm)}/m&sup2;
        </span>
        <span className="font-medium tabular-nums">{formatCurrency(total)}</span>
      </div>
      <DetailRow
        label="Net piece area"
        value={`${totalArea.toFixed(2)} m\u00B2`}
      />
      <DetailRow
        label="Waste factor"
        value={`${wastePct.toFixed(0)}%`}
      />
      {adjustedArea > 0 && (
        <DetailRow
          label="Effective area"
          value={`${adjustedArea.toFixed(2)} m\u00B2`}
        />
      )}
      {showMargin && margin && margin.effectiveMarginPercent !== 0 && (
        <MarginDetail margin={margin} />
      )}
    </div>
  );
}

// ── Single Material Sub-Section ─────────────────────────────────────────────

function MaterialSubSection({ group, showMargin }: { group: MaterialGroupBreakdown; showMargin?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isSlab = group.pricingBasis === 'PER_SLAB';
  const summaryText = isSlab
    ? `${group.slabCount ?? 0} slab${(group.slabCount ?? 0) !== 1 ? 's' : ''}`
    : `${(group.totalAreaM2 ?? 0).toFixed(2)} m\u00B2`;

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors"
      >
        <ChevronIcon expanded={expanded} />
        <span className="font-medium text-gray-800">{group.materialName}</span>
        <span className="text-xs text-gray-500">{summaryText}</span>
        <span className="ml-auto font-medium tabular-nums text-gray-900">
          {formatCurrency(group.totalCost)}
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-gray-100 text-xs text-gray-600">
          {isSlab ? <PerSlabDetail data={group} showMargin={showMargin} /> : <PerSqmDetail data={group} showMargin={showMargin} />}
        </div>
      )}
    </div>
  );
}

// ── Margin Adjustment Input ────────────────────────────────────────────────

function MarginAdjustmentInput({
  value,
  onChange,
  margin,
}: {
  value: number;
  onChange: (percent: number) => void;
  margin?: MaterialBreakdown['margin'];
}) {
  return (
    <div className="pt-2 border-t border-gray-200">
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500">Margin adjustment:</label>
        <input
          type="number"
          step="0.5"
          className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        />
        <span className="text-xs text-gray-500">%</span>
      </div>
      {margin && (
        <p className="text-xs text-gray-400 mt-1">
          Effective: {margin.effectiveMarginPercent.toFixed(1)}% = {margin.baseMarginPercent}% base {value >= 0 ? '+' : ''} {value}% adjustment
        </p>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function MaterialCostSection({
  materials,
  pieceCount,
  mode = 'view',
  materialMarginAdjustPercent,
  onMarginAdjustChange,
}: MaterialCostSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const isEditMode = mode === 'edit';

  // Empty state: no pieces
  if (pieceCount === 0) {
    return (
      <div className="rounded-lg border border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-3 px-4 py-3 text-sm">
          <span className="w-3.5" />
          <span className="text-gray-400 font-medium">Material</span>
          <span className="ml-auto text-gray-400 italic text-xs">
            Add pieces to calculate material cost
          </span>
        </div>
      </div>
    );
  }

  const isSlab = materials.pricingBasis === 'PER_SLAB';
  const hasMultipleMaterials = materials.byMaterial && materials.byMaterial.length > 1;
  const materialName = materials.materialName ?? 'Material';
  const total = materials.total;

  // Collapsed summary
  const collapsedSummary = isSlab
    ? `${materialName} \u2014 ${materials.slabCount ?? 0} slab${(materials.slabCount ?? 0) !== 1 ? 's' : ''}`
    : `${materialName} \u2014 ${(materials.totalAreaM2 ?? 0).toFixed(2)} m\u00B2`;

  return (
    <div className={`rounded-lg border ${total > 0 ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50/50'}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-gray-50/50 transition-colors"
      >
        <ChevronIcon expanded={expanded} />
        <span className={`font-medium ${total > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
          Material: {hasMultipleMaterials ? 'Multiple' : collapsedSummary}
        </span>
        <span className={`ml-auto font-medium tabular-nums ${total > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
          {formatCurrency(total)}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-3 pt-1 border-t border-gray-100 space-y-3">
          {hasMultipleMaterials ? (
            // Multiple materials: show sub-sections
            <div className="space-y-2">
              {materials.byMaterial!.map((group) => (
                <MaterialSubSection key={group.materialId} group={group} showMargin={isEditMode} />
              ))}
              <div className="flex justify-between items-center pt-2 border-t border-gray-200 text-sm font-bold text-gray-800">
                <span>Total Material Cost</span>
                <span className="tabular-nums">{formatCurrency(total)}</span>
              </div>
            </div>
          ) : (
            // Single material: show detail directly
            <div className="text-xs text-gray-600">
              <h4 className="text-sm font-medium text-gray-700 mb-2">
                {materialName}
              </h4>
              {isSlab
                ? <PerSlabDetail data={materials} showMargin={isEditMode} />
                : <PerSqmDetail data={materials} showMargin={isEditMode} />}
              <div className="flex justify-between items-center pt-2 mt-2 border-t border-gray-200 text-sm font-bold text-gray-800">
                <span>Total Material Cost</span>
                <span className="tabular-nums">{formatCurrency(total)}</span>
              </div>
            </div>
          )}

          {/* Margin adjustment input — edit mode only */}
          {isEditMode && onMarginAdjustChange && (
            <MarginAdjustmentInput
              value={materialMarginAdjustPercent ?? 0}
              onChange={onMarginAdjustChange}
              margin={materials.margin}
            />
          )}
        </div>
      )}
    </div>
  );
}
