'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatCurrency } from '@/lib/utils';

type PricingOverride = {
  id: number;
  quoteId: number;
  pieceId: number | null;
  category: string;
  overrideType: string;
  value: number;
  reason: string | null;
  source: string | null;
  isActive: boolean;
};

type OverridePiece = {
  id: number;
  name: string;
  roomName?: string | null;
};

interface PricingOverridesPanelProps {
  quoteId: number;
  pieces: OverridePiece[];
  mode?: 'view' | 'edit';
  appliedOverrides?: Array<{
    id: number;
    pieceId?: number | null;
    category: string;
    overrideType: string;
    value: number;
    reason?: string | null;
    amountDelta?: number;
  }>;
  onChanged?: () => void;
}

const CATEGORY_OPTIONS = [
  ['NORMAL_CUT', 'Normal cutting LM'],
  ['MITRE_CUT', 'Build-up cutting LM'],
  ['NORMAL_POLISH', 'Visible edge finish LM'],
  ['MITRE_POLISH', 'Build-up edge finish LM'],
  ['CUTOUT', 'Cutouts'],
  ['INSTALLATION', 'Installation'],
  ['FABRICATION', 'All fabrication labour'],
  ['ALL', 'All labour categories'],
] as const;

const LM_CATEGORY_KEYS = new Set(['NORMAL_CUT', 'MITRE_CUT', 'NORMAL_POLISH', 'MITRE_POLISH']);

const TYPE_OPTIONS = [
  ['LM', 'Chargeable LM override'],
  ['MULTIPLIER', 'Multiplier'],
  ['FIXED_DELTA', 'Signed manual adjustment'],
] as const;

const PRESET_OPTIONS = [
  {
    label: '+20% build-up edge finish',
    category: 'MITRE_POLISH',
    overrideType: 'MULTIPLIER',
    value: '1.2',
    reason: 'NCS-style build-up edge finish uplift',
  },
  {
    label: 'Set build-up edge LM',
    category: 'MITRE_POLISH',
    overrideType: 'LM',
    value: '',
    reason: 'Manual chargeable build-up edge finish LM',
  },
  {
    label: 'Set build-up cutting LM',
    category: 'MITRE_CUT',
    overrideType: 'LM',
    value: '',
    reason: 'Manual chargeable build-up cutting LM',
  },
  {
    label: '+20% cutouts',
    category: 'CUTOUT',
    overrideType: 'MULTIPLIER',
    value: '1.2',
    reason: 'Manual cutout complexity allowance',
  },
  {
    label: 'Manual +/- dollars',
    category: 'ALL',
    overrideType: 'FIXED_DELTA',
    value: '',
    reason: 'Manual commercial adjustment',
  },
] as const;

function labelFor(options: readonly (readonly [string, string])[], value: string): string {
  return options.find(([key]) => key === value)?.[1] ?? value.replace(/_/g, ' ');
}

function formatOverrideValue(override: PricingOverride | { overrideType: string; value: number }): string {
  if (override.overrideType === 'MULTIPLIER') return `${override.value}x`;
  if (override.overrideType === 'LM') return `${override.value} LM`;
  return formatCurrency(override.value);
}

function helperTextFor(overrideType: string): string {
  if (overrideType === 'LM') {
    return 'Replaces the chargeable length for the selected category. Pick a piece for a local correction, or leave it on whole quote for a quote-level correction.';
  }
  if (overrideType === 'MULTIPLIER') {
    return 'Multiplies the selected category. Example: 1.2 adds 20 percent to build-up edge finish, 0.9 discounts 10 percent.';
  }
  return 'Adds or subtracts dollars from the quote subtotal with an audit reason. Example: 250 or -250.';
}

export default function PricingOverridesPanel({
  quoteId,
  pieces,
  mode = 'view',
  appliedOverrides = [],
  onChanged,
}: PricingOverridesPanelProps) {
  const [overrides, setOverrides] = useState<PricingOverride[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState('MITRE_POLISH');
  const [overrideType, setOverrideType] = useState('MULTIPLIER');
  const [pieceId, setPieceId] = useState('');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canEdit = mode === 'edit';
  const visibleCategoryOptions = CATEGORY_OPTIONS.filter(([key]) =>
    overrideType === 'LM' ? LM_CATEGORY_KEYS.has(key) : true
  );

  useEffect(() => {
    if (overrideType === 'LM' && !LM_CATEGORY_KEYS.has(category)) {
      setCategory('MITRE_POLISH');
    }
  }, [category, overrideType]);

  const loadOverrides = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/quotes/${quoteId}/pricing-overrides`);
      if (!response.ok) throw new Error('Failed to load pricing overrides');
      setOverrides(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pricing overrides');
    } finally {
      setLoading(false);
    }
  }, [quoteId]);

  useEffect(() => {
    loadOverrides();
  }, [loadOverrides]);

  const pieceNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const piece of pieces) {
      map.set(piece.id, piece.roomName ? `${piece.roomName} - ${piece.name}` : piece.name);
    }
    return map;
  }, [pieces]);

  const saveOverride = async () => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      setError('Enter a valid number for the override value.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/quotes/${quoteId}/pricing-overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          overrideType,
          value: numericValue,
          pieceId: pieceId ? Number(pieceId) : null,
          reason,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save pricing override');
      }
      setValue('');
      setReason('');
      setPieceId('');
      await loadOverrides();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save pricing override');
    } finally {
      setSaving(false);
    }
  };

  const removeOverride = async (id: number) => {
    if (!confirm('Remove this pricing override?')) return;
    setError(null);
    try {
      const response = await fetch(`/api/quotes/${quoteId}/pricing-overrides/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to remove pricing override');
      await loadOverrides();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove pricing override');
    }
  };

  const activeOverrides = overrides.filter(o => o.isActive);

  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/30 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Labour & Price Overrides</h3>
          <p className="text-xs text-gray-500">
            Category multipliers, chargeable LM corrections, and signed audit adjustments.
          </p>
        </div>
        {loading && <span className="text-xs text-gray-400">Loading...</span>}
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {canEdit && (
        <>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {PRESET_OPTIONS.map(preset => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setCategory(preset.category);
                  setOverrideType(preset.overrideType);
                  setValue(preset.value);
                  setReason(preset.reason);
                }}
                className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-1">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="input text-sm md:col-span-1"
              aria-label="Override category"
            >
              {visibleCategoryOptions.map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <select
              value={overrideType}
              onChange={(e) => setOverrideType(e.target.value)}
              className="input text-sm md:col-span-1"
              aria-label="Override type"
            >
              {TYPE_OPTIONS.map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <select
              value={pieceId}
              onChange={(e) => setPieceId(e.target.value)}
              className="input text-sm md:col-span-1"
              aria-label="Override piece"
            >
              <option value="">Whole quote</option>
              {pieces.map(piece => (
                <option key={piece.id} value={piece.id}>
                  {piece.roomName ? `${piece.roomName} - ${piece.name}` : piece.name}
                </option>
              ))}
            </select>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={overrideType === 'MULTIPLIER' ? '1.2' : overrideType === 'LM' ? '12.5' : '-250'}
              className="input text-sm"
              inputMode="decimal"
            />
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason"
              className="input text-sm md:col-span-1"
            />
            <button
              type="button"
              onClick={saveOverride}
              disabled={saving}
              className="btn-secondary text-sm"
            >
              {saving ? 'Saving...' : 'Add pricing override'}
            </button>
          </div>
          <p className="text-[11px] text-gray-500 mb-3">
            {helperTextFor(overrideType)}
          </p>
        </>
      )}

      {activeOverrides.length === 0 ? (
        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
          No active pricing overrides.
        </div>
      ) : (
        <div className="space-y-2">
          {activeOverrides.map(override => (
            <div
              key={override.id}
              className="flex items-start justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-amber-950">
                  {labelFor(CATEGORY_OPTIONS, override.category)} - {formatOverrideValue(override)}
                </div>
                <div className="text-xs text-amber-800">
                  {labelFor(TYPE_OPTIONS, override.overrideType)}
                  {override.pieceId ? ` on ${pieceNameById.get(override.pieceId) ?? `Piece ${override.pieceId}`}` : ' on whole quote'}
                  {override.reason ? ` - ${override.reason}` : ''}
                </div>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => removeOverride(override.id)}
                  className="text-xs font-medium text-amber-900 hover:text-red-700"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {appliedOverrides.length > 0 && (
        <div className="mt-3 rounded-md border border-gray-200 bg-white px-3 py-2">
          <div className="text-xs font-medium text-gray-700 mb-1">
            Applied in current calculation
          </div>
          <div className="space-y-1">
            {appliedOverrides.map((override, index) => (
              <div key={`${override.id}-${index}`} className="flex items-center justify-between gap-3 text-xs text-gray-600">
                <span className="min-w-0 truncate">
                  {labelFor(CATEGORY_OPTIONS, override.category)} - {formatOverrideValue(override)}
                  {override.reason ? ` - ${override.reason}` : ''}
                </span>
                {override.amountDelta != null && (
                  <span className={override.amountDelta >= 0 ? 'text-amber-700 font-medium' : 'text-green-700 font-medium'}>
                    {override.amountDelta >= 0 ? '+' : ''}{formatCurrency(override.amountDelta)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
