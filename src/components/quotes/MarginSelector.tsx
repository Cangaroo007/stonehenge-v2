'use client';

import { useState } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

interface MarginInfo {
  effectiveMarginPercent: number;
  marginSource: 'quote_override' | 'client_tier' | 'material' | 'supplier' | 'none';
  finalMarginPercent: number;
  materialCostBeforeMargin: number;
  materialCostAfterMargin: number;
  availableMargins: {
    quoteOverride: number | null;
    clientTier: number | null;
    tierName: string | null;
    material: number | null;
    supplier: number | null;
    supplierName: string | null;
  };
  warning: string | null;
}

interface MarginSelectorProps {
  quoteId: number | string;
  marginInfo: MarginInfo;
  onMarginChange: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sourceLabel(source: MarginInfo['marginSource'], info: MarginInfo): string {
  switch (source) {
    case 'quote_override':
      return 'Quote override';
    case 'client_tier':
      return info.availableMargins.tierName
        ? `Tier: ${info.availableMargins.tierName}`
        : 'Client tier';
    case 'supplier':
      return info.availableMargins.supplierName
        ? `Supplier: ${info.availableMargins.supplierName}`
        : 'Supplier';
    case 'material':
      return 'Material default';
    case 'none':
      return 'No margin';
  }
}

type MarginOption = { key: string; label: string; value: number };

function buildOptions(available: MarginInfo['availableMargins']): MarginOption[] {
  const opts: MarginOption[] = [];
  if (available.clientTier != null) {
    const tierLabel = available.tierName ? `Tier (${available.tierName})` : 'Client tier';
    opts.push({ key: 'client_tier', label: `${tierLabel}: ${available.clientTier}%`, value: available.clientTier });
  }
  if (available.supplier != null) {
    const supplierLabel = available.supplierName ? `Supplier (${available.supplierName})` : 'Supplier';
    opts.push({ key: 'supplier', label: `${supplierLabel}: ${available.supplier}%`, value: available.supplier });
  }
  if (available.material != null) {
    opts.push({ key: 'material', label: `Material default: ${available.material}%`, value: available.material });
  }
  return opts;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function MarginSelector({ quoteId, marginInfo, onMarginChange }: MarginSelectorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string>('custom');
  const [customValue, setCustomValue] = useState<string>(
    String(marginInfo.effectiveMarginPercent)
  );

  const options = buildOptions(marginInfo.availableMargins);
  const hasNoMargin = marginInfo.marginSource === 'none';

  const handleEdit = () => {
    // Pre-select the current source if it matches an option
    const currentOption = options.find(o => o.key === marginInfo.marginSource);
    if (currentOption) {
      setSelectedKey(currentOption.key);
      setCustomValue(String(currentOption.value));
    } else if (marginInfo.marginSource === 'quote_override' && marginInfo.effectiveMarginPercent > 0) {
      setSelectedKey('custom');
      setCustomValue(String(marginInfo.effectiveMarginPercent));
    } else {
      setSelectedKey(options.length > 0 ? options[0].key : 'custom');
      setCustomValue(String(marginInfo.effectiveMarginPercent || ''));
    }
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleApply = async () => {
    const selectedPercent = selectedKey === 'custom'
      ? parseFloat(customValue) || 0
      : options.find(o => o.key === selectedKey)?.value ?? 0;

    setIsSaving(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          material_margin_percent: selectedPercent,
          material_margin_source: 'quote_override',
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        console.error('Failed to save margin:', errBody);
        return;
      }

      setIsEditing(false);
      onMarginChange();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      {/* Warning banner — only when no margin */}
      {hasNoMargin && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <svg className="h-5 w-5 flex-shrink-0 text-amber-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            <strong>No material margin set</strong> — client is being billed at cost price.
          </span>
        </div>
      )}

      {/* Current margin display */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-700">
          <span className="font-medium">Material Margin: </span>
          {hasNoMargin ? (
            <span className="text-amber-600 font-medium">0%</span>
          ) : (
            <span>
              <span className="font-semibold">{marginInfo.effectiveMarginPercent}%</span>
              <span className="text-gray-500 ml-1">
                (from {sourceLabel(marginInfo.marginSource, marginInfo)})
              </span>
            </span>
          )}
        </div>
        {!isEditing && (
          <button
            type="button"
            onClick={handleEdit}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            Edit
          </button>
        )}
      </div>

      {/* Edit panel */}
      {isEditing && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3 space-y-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Choose margin source
          </p>

          <div className="space-y-1.5">
            {options.map((opt) => (
              <label key={opt.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="margin-source"
                  checked={selectedKey === opt.key}
                  onChange={() => {
                    setSelectedKey(opt.key);
                    setCustomValue(String(opt.value));
                  }}
                  className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500"
                />
                {opt.label}
              </label>
            ))}

            {/* Custom option */}
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="radio"
                name="margin-source"
                checked={selectedKey === 'custom'}
                onChange={() => setSelectedKey('custom')}
                className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500"
              />
              <span>Custom:</span>
              <input
                type="number"
                min={0}
                max={200}
                step={0.5}
                value={customValue}
                onChange={(e) => {
                  setCustomValue(e.target.value);
                  setSelectedKey('custom');
                }}
                onFocus={() => setSelectedKey('custom')}
                onWheel={(e) => e.currentTarget.blur()}
                className="w-16 border border-gray-300 rounded px-2 py-0.5 text-sm text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
              <span className="text-gray-500">%</span>
            </label>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleApply}
              disabled={isSaving}
              className="px-3 py-1 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isSaving ? 'Saving\u2026' : 'Apply'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSaving}
              className="px-3 py-1 text-xs font-medium rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
