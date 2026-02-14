'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import type { MaterialBreakdown, MaterialGroupBreakdown } from '@/lib/types/pricing';

// ── Interfaces ──────────────────────────────────────────────────────────────

interface MaterialCostSectionProps {
  materials: MaterialBreakdown;
  /** Total number of pieces in the quote */
  pieceCount: number;
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

// ── Per-Slab Detail ─────────────────────────────────────────────────────────

function PerSlabDetail({ data }: { data: MaterialBreakdown | MaterialGroupBreakdown }) {
  const count = data.slabCount ?? 0;
  const rate = 'slabRate' in data ? (data.slabRate ?? 0) : 0;
  const total = 'totalCost' in data ? data.totalCost : data.total;
  const isEstimate = !data.slabCountFromOptimiser;

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
        value={`${data.totalAreaM2.toFixed(2)} m\u00B2`}
      />
      {isEstimate && (
        <p className="text-xs text-amber-600 italic">
          Run optimiser for exact slab count
        </p>
      )}
    </div>
  );
}

// ── Per m² Detail ───────────────────────────────────────────────────────────

function PerSqmDetail({ data }: { data: MaterialBreakdown | MaterialGroupBreakdown }) {
  const wastePct = data.wasteFactorPercent ?? 0;
  const wasteFactor = 1 + wastePct / 100;
  const ratePerSqm = 'ratePerSqm' in data ? (data.ratePerSqm ?? 0) : ('appliedRate' in data ? data.appliedRate : 0);
  const total = 'totalCost' in data ? data.totalCost : data.total;

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-start text-sm">
        <span className="text-gray-600">
          {data.totalAreaM2.toFixed(2)} m&sup2; &times; waste factor {wasteFactor.toFixed(2)} &times; {formatCurrency(ratePerSqm)}/m&sup2;
        </span>
        <span className="font-medium tabular-nums">{formatCurrency(total)}</span>
      </div>
      <DetailRow
        label="Net piece area"
        value={`${data.totalAreaM2.toFixed(2)} m\u00B2`}
      />
      <DetailRow
        label="Waste factor"
        value={`${wastePct.toFixed(0)}%`}
      />
      {data.adjustedAreaM2 && (
        <DetailRow
          label="Effective area"
          value={`${data.adjustedAreaM2.toFixed(2)} m\u00B2`}
        />
      )}
    </div>
  );
}

// ── Single Material Sub-Section ─────────────────────────────────────────────

function MaterialSubSection({ group }: { group: MaterialGroupBreakdown }) {
  const [expanded, setExpanded] = useState(false);
  const isSlab = group.pricingBasis === 'PER_SLAB';
  const summaryText = isSlab
    ? `${group.slabCount ?? 0} slab${(group.slabCount ?? 0) !== 1 ? 's' : ''}`
    : `${group.totalAreaM2.toFixed(2)} m\u00B2`;

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
          {isSlab ? <PerSlabDetail data={group} /> : <PerSqmDetail data={group} />}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function MaterialCostSection({ materials, pieceCount }: MaterialCostSectionProps) {
  const [expanded, setExpanded] = useState(false);

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
    : `${materialName} \u2014 ${materials.totalAreaM2.toFixed(2)} m\u00B2`;

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
                <MaterialSubSection key={group.materialId} group={group} />
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
              {isSlab ? <PerSlabDetail data={materials} /> : <PerSqmDetail data={materials} />}
              <div className="flex justify-between items-center pt-2 mt-2 border-t border-gray-200 text-sm font-bold text-gray-800">
                <span>Total Material Cost</span>
                <span className="tabular-nums">{formatCurrency(total)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
