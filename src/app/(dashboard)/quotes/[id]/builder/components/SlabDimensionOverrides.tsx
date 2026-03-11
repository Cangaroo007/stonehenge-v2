'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface MaterialWithDims {
  id: number;
  name: string;
  slabLengthMm: number | null;
  slabWidthMm: number | null;
}

interface SlabOverride {
  slabLengthMm: number;
  slabWidthMm: number;
}

interface SlabDimensionOverridesProps {
  quoteId: string;
  /** Material IDs actually used in this quote's pieces */
  usedMaterialIds: number[];
  /** Existing overrides from the quote record */
  overrides: Record<string, SlabOverride> | null;
  /** Called after a successful save — triggers re-optimisation */
  onSaved: () => void;
}

export function SlabDimensionOverrides({
  quoteId,
  usedMaterialIds,
  overrides,
  onSaved,
}: SlabDimensionOverridesProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [materials, setMaterials] = useState<MaterialWithDims[]>([]);
  const [localOverrides, setLocalOverrides] = useState<Record<string, SlabOverride>>(overrides ?? {});
  const [savedIndicator, setSavedIndicator] = useState<string | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync when prop changes (e.g. after quote re-fetch)
  useEffect(() => {
    setLocalOverrides(overrides ?? {});
  }, [overrides]);

  // Fetch material catalogue data for slab dimensions
  useEffect(() => {
    if (usedMaterialIds.length === 0) return;
    const fetchMaterials = async () => {
      try {
        const res = await fetch('/api/materials');
        if (!res.ok) return;
        const all: MaterialWithDims[] = await res.json();
        const uniqueIds = Array.from(new Set(usedMaterialIds));
        const filtered = uniqueIds
          .map((id) => all.find((m) => m.id === id))
          .filter((m): m is MaterialWithDims => m != null);
        setMaterials(filtered);
      } catch {
        // Non-critical — catalogue dims just won't show
      }
    };
    fetchMaterials();
  }, [usedMaterialIds]);

  const saveOverrides = useCallback(
    async (newOverrides: Record<string, SlabOverride>, materialId: string) => {
      try {
        const res = await fetch(`/api/quotes/${quoteId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slabDimensionOverrides: newOverrides }),
        });
        if (!res.ok) throw new Error('Save failed');

        // Show saved indicator
        setSavedIndicator(materialId);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSavedIndicator(null), 2000);

        onSaved();
      } catch (err) {
        console.error('Failed to save slab dimension overrides:', err);
      }
    },
    [quoteId, onSaved]
  );

  const handleBlur = useCallback(
    (materialId: string, field: 'slabLengthMm' | 'slabWidthMm', value: string) => {
      const parsed = parseInt(value, 10);
      if (!value || isNaN(parsed) || parsed <= 0) {
        // If both fields are empty, remove the override entirely
        const existing = localOverrides[materialId];
        if (!existing) return;

        const otherField = field === 'slabLengthMm' ? 'slabWidthMm' : 'slabLengthMm';
        const otherValue = existing[otherField];

        if (!value && !otherValue) {
          // Both empty — remove override
          const updated = { ...localOverrides };
          delete updated[materialId];
          setLocalOverrides(updated);
          saveOverrides(updated, materialId);
          return;
        }
        return; // Invalid input, don't save
      }

      const existing = localOverrides[materialId];
      const newOverride: SlabOverride = {
        slabLengthMm: existing?.slabLengthMm ?? 0,
        slabWidthMm: existing?.slabWidthMm ?? 0,
        [field]: parsed,
      };

      // Only save if both dimensions are set
      if (newOverride.slabLengthMm > 0 && newOverride.slabWidthMm > 0) {
        const updated = { ...localOverrides, [materialId]: newOverride };
        setLocalOverrides(updated);
        saveOverrides(updated, materialId);
      } else {
        // Update local state but don't save yet (waiting for the other field)
        setLocalOverrides({ ...localOverrides, [materialId]: newOverride });
      }
    },
    [localOverrides, saveOverrides]
  );

  const handleReset = useCallback(
    (materialId: string) => {
      const updated = { ...localOverrides };
      delete updated[materialId];
      setLocalOverrides(updated);
      saveOverrides(updated, materialId);
    },
    [localOverrides, saveOverrides]
  );

  if (materials.length === 0) return null;

  return (
    <div className="border-t border-gray-200">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center gap-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <svg
          className={`h-4 w-4 text-gray-500 transition-transform ${isOpen ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Slab Size Overrides
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-3">
          {materials.map((mat) => {
            const matId = String(mat.id);
            const override = localOverrides[matId];
            const isSaved = savedIndicator === matId;

            return (
              <div
                key={mat.id}
                className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {mat.name}
                  </div>
                  <div className="text-xs text-gray-400">
                    Catalogue: {mat.slabLengthMm ?? '—'} &times; {mat.slabWidthMm ?? '—'}mm
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500">Length (mm)</label>
                  <input
                    type="number"
                    className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                    placeholder={String(mat.slabLengthMm ?? '')}
                    defaultValue={override?.slabLengthMm || ''}
                    key={`${matId}-length-${override?.slabLengthMm ?? 'empty'}`}
                    onBlur={(e) => handleBlur(matId, 'slabLengthMm', e.target.value)}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500">Width (mm)</label>
                  <input
                    type="number"
                    className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                    placeholder={String(mat.slabWidthMm ?? '')}
                    defaultValue={override?.slabWidthMm || ''}
                    key={`${matId}-width-${override?.slabWidthMm ?? 'empty'}`}
                    onBlur={(e) => handleBlur(matId, 'slabWidthMm', e.target.value)}
                  />
                </div>

                {override && (
                  <button
                    onClick={() => handleReset(matId)}
                    className="text-xs text-primary-600 hover:text-primary-800 whitespace-nowrap"
                  >
                    Reset
                  </button>
                )}

                {isSaved && (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Saved
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
