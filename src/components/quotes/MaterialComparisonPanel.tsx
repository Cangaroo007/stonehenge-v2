'use client';

/**
 * MaterialComparisonPanel
 *
 * Shows up to 3 material comparison slots alongside the current material.
 * Each slot uses MaterialPickerV2 to select an alternative, then POSTs to
 * /api/quotes/[id]/estimate-material to get a recalculated total.
 * Results persist in quotes.comparison_slots JSONB.
 */

import { useState, useCallback } from 'react';
import MaterialPickerV2, { type MaterialPickerMaterial } from './MaterialPickerV2';

const MAX_SLOTS = 3;

export interface ComparisonSlot {
  slotIndex: number;
  materialId: number;
  materialName: string;
  collectionId?: string | null;
  useCollectionAvg: boolean;
  subtotal: number;
  gstAmount: number;
  totalIncGst: number;
  materialCost: number;
  fabricationCost: number;
  slabCount: number;
  calculatedAt: string;
}

interface MaterialComparisonPanelProps {
  quoteId: number | string;
  materials: MaterialPickerMaterial[];
  currentMaterialName: string | null;
  currentTotal: number | null;        // current quote totalIncGst
  currentMaterialCost: number | null;
  currentFabCost: number | null;
  savedSlots: (ComparisonSlot | null)[];  // from quote.comparison_slots
  onSwitchMaterial: (changes: { pieceId: number; toMaterialId: number }[]) => Promise<void>;
  onSwitchComplete?: (slotIndex: number) => void;
  piecesForSwitch: { id: number; materialId: number | null }[];
  onClose: () => void;
}

export default function MaterialComparisonPanel({
  quoteId,
  materials,
  currentMaterialName,
  currentTotal,
  currentMaterialCost,
  currentFabCost,
  savedSlots,
  onSwitchMaterial,
  onSwitchComplete,
  piecesForSwitch,
  onClose,
}: MaterialComparisonPanelProps) {
  // Slots: initialise from savedSlots (persisted) or null (empty)
  const [slots, setSlots] = useState<(ComparisonSlot | null)[]>(() => {
    const initial: (ComparisonSlot | null)[] = [null, null, null];
    savedSlots.forEach((s, i) => { if (s && i < MAX_SLOTS) initial[i] = s; });
    return initial;
  });

  const [selectedMaterialIds, setSelectedMaterialIds] = useState<(number | null)[]>(() => {
    const initial: (number | null)[] = [null, null, null];
    savedSlots.forEach((s, i) => { if (s && i < MAX_SLOTS) initial[i] = s.materialId; });
    return initial;
  });
  const [loadingSlots, setLoadingSlots] = useState<boolean[]>([false, false, false]);
  const [switchingSlot, setSwitchingSlot] = useState<number | null>(null);

  // Detect stale saved slots (materialCost: 0 indicates data from a prior bug)
  const hasStaleSlots = slots.some(s => s != null && s.materialCost === 0);

  const runEstimate = useCallback(async (slotIndex: number) => {
    const materialId = selectedMaterialIds[slotIndex];
    if (materialId == null) return;

    setLoadingSlots(prev => { const n = [...prev]; n[slotIndex] = true; return n; });

    try {
      const res = await fetch(`/api/quotes/${quoteId}/estimate-material`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotIndex, materialId: String(materialId) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Estimate failed');
      }
      const result: ComparisonSlot = await res.json();
      setSlots(prev => { const n = [...prev]; n[slotIndex] = result; return n; });
    } catch (err) {
      console.error('Estimate error:', err);
      alert(err instanceof Error ? err.message : 'Estimate failed');
    } finally {
      setLoadingSlots(prev => { const n = [...prev]; n[slotIndex] = false; return n; });
    }
  }, [quoteId, selectedMaterialIds]);

  const clearSlot = useCallback(async (slotIndex: number) => {
    await fetch(`/api/quotes/${quoteId}/estimate-material`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotIndex }),
    });
    setSlots(prev => { const n = [...prev]; n[slotIndex] = null; return n; });
    setSelectedMaterialIds(prev => { const n = [...prev]; n[slotIndex] = null; return n; });
  }, [quoteId]);

  const handleSwitch = useCallback(async (slotIndex: number) => {
    const slot = slots[slotIndex];
    if (!slot) return;
    setSwitchingSlot(slotIndex);
    try {
      const changes = piecesForSwitch.map(p => ({
        pieceId: p.id,
        toMaterialId: slot.materialId,
      }));
      await onSwitchMaterial(changes);
      // Clear the switched slot — that material is now current
      setSlots(prev => { const n = [...prev]; n[slotIndex] = null; return n; });
      setSelectedMaterialIds(prev => { const n = [...prev]; n[slotIndex] = null; return n; });
      onSwitchComplete?.(slotIndex);
    } finally {
      setSwitchingSlot(null);
    }
  }, [slots, piecesForSwitch, onSwitchMaterial, onSwitchComplete]);

  const formatCurrency = (n: number) =>
    n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });

  const calcDelta = (slotTotal: number) => {
    if (currentTotal == null) return null;
    return slotTotal - currentTotal;
  };

  return (
    <div className="mt-3 rounded-lg border border-neutral-700 bg-neutral-900 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">Material Comparison</h3>
        <button
          onClick={onClose}
          className="text-xs text-neutral-400 hover:text-white transition-colors"
        >
          Close
        </button>
      </div>

      {/* Stale data warning */}
      {hasStaleSlots && (
        <div className="mb-3 rounded-md bg-amber-900/40 border border-amber-700 px-3 py-2 text-xs text-amber-300">
          Some estimates may be outdated (showing $0 material cost). Click <strong>Estimate</strong> to recalculate.
        </div>
      )}

      {/* Comparison grid */}
      <div className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${1 + MAX_SLOTS}, minmax(0, 1fr))` }}>

        {/* Current material column */}
        <div className="rounded-lg border border-primary-600 bg-neutral-800 p-3">
          <div className="text-xs text-primary-400 font-medium mb-1">Current</div>
          <div className="text-xs text-neutral-300 font-medium truncate mb-2">
            {currentMaterialName ?? '—'}
          </div>
          {currentTotal != null && (
            <div className="text-lg font-bold text-white">
              {formatCurrency(currentTotal)}
            </div>
          )}
          {currentMaterialCost != null && (
            <div className="text-xs text-neutral-400 mt-1">
              Material: {formatCurrency(currentMaterialCost)}
            </div>
          )}
          {currentFabCost != null && (
            <div className="text-xs text-neutral-400">
              Fabrication: {formatCurrency(currentFabCost)}
            </div>
          )}
        </div>

        {/* Comparison slots */}
        {Array.from({ length: MAX_SLOTS }).map((_, slotIndex) => {
          const slot = slots[slotIndex];
          const loading = loadingSlots[slotIndex];
          const d = slot ? calcDelta(slot.totalIncGst) : null;
          const cheaper = d != null && d < 0;
          const pricier = d != null && d > 0;

          return (
            <div key={slotIndex}
              className="rounded-lg border border-neutral-700 bg-neutral-800 p-3 flex flex-col gap-2">

              {/* Material picker */}
              <MaterialPickerV2
                materials={materials}
                value={selectedMaterialIds[slotIndex]}
                onChange={(id) => {
                  setSelectedMaterialIds(prev => {
                    const n = [...prev]; n[slotIndex] = id; return n;
                  });
                }}
              />

              {/* Estimate button — shown when no result yet, or for re-estimation */}
              {(!slot || (slot.materialCost === 0)) && (
                <button
                  onClick={() => runEstimate(slotIndex)}
                  disabled={selectedMaterialIds[slotIndex] == null || loading}
                  className="w-full py-1.5 text-xs font-medium rounded bg-primary-600
                    hover:bg-primary-700 text-white disabled:opacity-40 disabled:cursor-not-allowed
                    transition-colors"
                >
                  {loading ? 'Estimating…' : slot ? 'Re-estimate' : 'Estimate'}
                </button>
              )}

              {/* Result */}
              {slot && (
                <div className="flex flex-col gap-1">
                  <div className="text-xs text-neutral-300 font-medium truncate">
                    {slot.materialName}
                  </div>
                  <div className="text-lg font-bold text-white">
                    {formatCurrency(slot.totalIncGst)}
                  </div>
                  {d != null && d !== 0 && (
                    <div className={`text-xs font-medium ${cheaper ? 'text-green-400' : pricier ? 'text-red-400' : ''}`}>
                      {cheaper ? '▼' : '▲'} {formatCurrency(Math.abs(d))}
                    </div>
                  )}
                  <div className="text-xs text-neutral-400">
                    Material: {formatCurrency(slot.materialCost)}
                  </div>
                  <div className="text-xs text-neutral-400">
                    Fabrication: {formatCurrency(slot.fabricationCost)}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {slot.slabCount} slab{slot.slabCount !== 1 ? 's' : ''}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1 mt-1">
                    <button
                      onClick={() => handleSwitch(slotIndex)}
                      disabled={switchingSlot !== null}
                      className="flex-1 py-1 text-xs font-medium rounded bg-green-700
                        hover:bg-green-600 text-white disabled:opacity-40 transition-colors"
                    >
                      {switchingSlot === slotIndex ? 'Switching…' : 'Switch'}
                    </button>
                    <button
                      onClick={() => clearSlot(slotIndex)}
                      className="px-2 py-1 text-xs rounded bg-neutral-700
                        hover:bg-neutral-600 text-neutral-300 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-neutral-500 mt-3">
        Estimates use current piece dimensions and edge profiles. Slab count may
        vary if the alternative material uses a different slab size.
      </p>
    </div>
  );
}
