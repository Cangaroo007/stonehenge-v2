'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface SlabEdgeAllowancePromptProps {
  quoteId: string;
  onApply: (allowanceMm: number) => void;
  isApplying?: boolean;
}

const PRESETS = [
  { label: 'None', value: 0 },
  { label: '10mm', value: 10 },
  { label: '15mm', value: 15 },
  { label: '20mm', value: 20 },
];

export function SlabEdgeAllowancePrompt({
  quoteId,
  onApply,
  isApplying = false,
}: SlabEdgeAllowancePromptProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [customValue, setCustomValue] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [showConfirmDefault, setShowConfirmDefault] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);

  const effectiveValue = isCustom
    ? parseInt(customValue, 10) || 0
    : selected;

  const isValid = effectiveValue !== null && effectiveValue >= 0 && effectiveValue <= 50;

  const handleApply = async () => {
    if (!isValid || effectiveValue === null) return;

    if (dontAskAgain) {
      setShowConfirmDefault(true);
      return;
    }

    // Save to quote and trigger re-optimisation
    await saveToQuote(effectiveValue);
    onApply(effectiveValue);
  };

  const saveToQuote = async (value: number) => {
    await fetch(`/api/quotes/${quoteId}/edge-allowance`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slabEdgeAllowanceMm: value }),
    });
  };

  const handleConfirmDefault = async () => {
    if (effectiveValue === null) return;
    setSavingDefault(true);

    try {
      // Save to quote
      await saveToQuote(effectiveValue);

      // Save as tenant default
      await fetch('/api/admin/pricing/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slabEdgeAllowanceMm: effectiveValue }),
      });

      onApply(effectiveValue);
    } finally {
      setSavingDefault(false);
      setShowConfirmDefault(false);
    }
  };

  // Confirmation dialog for "Set as default"
  if (showConfirmDefault) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm font-medium text-gray-900">
          Set {effectiveValue}mm as your default edge allowance?
        </p>
        <p className="text-xs text-gray-600 mt-1">
          This will apply to all future quotes unless overridden per-quote.
        </p>
        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            onClick={() => setShowConfirmDefault(false)}
            disabled={savingDefault}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmDefault}
            disabled={savingDefault}
            className={cn(
              'px-3 py-1.5 text-sm rounded-lg text-white',
              savingDefault
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-primary-600 hover:bg-primary-700'
            )}
          >
            {savingDefault ? 'Saving...' : 'Set as Default'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <div className="flex items-start gap-2 mb-3">
        <svg className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
        <div>
          <h4 className="text-sm font-medium text-gray-900">Slab Edge Allowance</h4>
          <p className="text-xs text-gray-600 mt-0.5">
            How much unusable edge per slab side?
          </p>
        </div>
      </div>

      {/* Presets */}
      <div className="flex flex-wrap gap-2 mb-3">
        {PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => {
              setSelected(preset.value);
              setIsCustom(false);
            }}
            className={cn(
              'px-3 py-1.5 text-sm rounded-lg border transition-colors',
              !isCustom && selected === preset.value
                ? 'bg-primary-50 border-primary-500 text-primary-700 font-medium'
                : 'border-gray-300 text-gray-700 hover:bg-white'
            )}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setIsCustom(true)}
          className={cn(
            'px-3 py-1.5 text-sm rounded-lg border transition-colors',
            isCustom
              ? 'bg-primary-50 border-primary-500 text-primary-700 font-medium'
              : 'border-gray-300 text-gray-700 hover:bg-white'
          )}
        >
          Custom
        </button>
      </div>

      {/* Custom input */}
      {isCustom && (
        <div className="flex items-center gap-2 mb-3">
          <input
            type="number"
            min={0}
            max={50}
            step={1}
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            placeholder="0"
            className="w-20 rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
            autoFocus
          />
          <span className="text-sm text-gray-500">mm</span>
        </div>
      )}

      {/* Don't ask again + Apply */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={dontAskAgain}
            onChange={(e) => setDontAskAgain(e.target.checked)}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-xs text-gray-600">Don&apos;t ask me again (set as default)</span>
        </label>

        <button
          type="button"
          onClick={handleApply}
          disabled={!isValid || isApplying}
          className={cn(
            'px-4 py-1.5 text-sm rounded-lg text-white',
            !isValid || isApplying
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-primary-600 hover:bg-primary-700'
          )}
        >
          {isApplying ? 'Applying...' : 'Apply'}
        </button>
      </div>
    </div>
  );
}
