'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  ChefHat,
  Bath,
  Droplets,
  WashingMachine,
  Wine,
  Check,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  ROOM_PRESETS,
  countPresetPieces,
  presetToApiPayload,
  type RoomPreset,
} from '@/lib/constants/room-presets';

// ---------------------------------------------------------------------------
// Icon map — maps preset icon string to Lucide component
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, LucideIcon> = {
  ChefHat,
  Bath,
  Droplets,
  WashingMachine,
  Wine,
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RoomTypePickerProps {
  onStartFromScratch: () => void;
  onBack: () => void;
  customerId?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RoomTypePicker({
  onStartFromScratch,
  onBack,
  customerId,
}: RoomTypePickerProps) {
  const router = useRouter();
  const [multiMode, setMultiMode] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [isCreating, setIsCreating] = useState(false);

  // Derive selected presets from indices
  const selectedPresets = Array.from(selectedIndices).map((i) => ROOM_PRESETS[i]);
  const totalPieces = countPresetPieces(selectedPresets);

  // Toggle a card selection
  const handleCardClick = useCallback(
    (index: number) => {
      if (multiMode) {
        setSelectedIndices((prev) => {
          const next = new Set(prev);
          if (next.has(index)) {
            next.delete(index);
          } else {
            next.add(index);
          }
          return next;
        });
      } else {
        // Single-select: immediately create quote with this preset
        setSelectedIndices(new Set([index]));
        createQuoteFromPresets([ROOM_PRESETS[index]]);
      }
    },
    [multiMode], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Toggle multi-room mode
  const handleMultiToggle = useCallback(() => {
    setMultiMode((prev) => {
      if (prev) {
        // Turning off multi-mode — clear selections
        setSelectedIndices(new Set());
      }
      return !prev;
    });
  }, []);

  // Create quote from selected presets
  const createQuoteFromPresets = useCallback(
    async (presets: RoomPreset[]) => {
      if (isCreating || presets.length === 0) return;
      setIsCreating(true);

      try {
        const body = presetToApiPayload(presets, undefined, customerId);

        const res = await fetch('/api/quotes/batch-create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const parsed = errData as { error?: string };
          throw new Error(parsed.error || 'Failed to create quote');
        }

        const data = (await res.json()) as {
          quoteId?: number;
          pricingWarnings?: string[];
        };
        if (!data.quoteId) throw new Error('No quote ID returned');

        if (data.pricingWarnings && data.pricingWarnings.length > 0) {
          toast(data.pricingWarnings[0], { icon: '\u26A0\uFE0F' });
        }

        router.push(`/quotes/${data.quoteId}?mode=edit`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to create quote');
        setIsCreating(false);
      }
    },
    [isCreating, customerId, router],
  );

  // Handle "Create Quote" button in multi-mode
  const handleMultiCreate = useCallback(() => {
    if (selectedPresets.length === 0) return;
    createQuoteFromPresets(selectedPresets);
  }, [selectedPresets, createQuoteFromPresets]);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back button */}
      <button
        onClick={onBack}
        className="mb-4 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
      >
        &larr; Back to options
      </button>

      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Choose a Room Type</h2>
        <p className="mt-1 text-sm text-gray-500">
          Pick a starting point with pre-populated pieces, or start from scratch.
        </p>
      </div>

      {/* Room type grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {ROOM_PRESETS.map((preset, index) => {
          const IconComponent = ICON_MAP[preset.icon];
          const isSelected = selectedIndices.has(index);

          return (
            <button
              key={`${preset.label}-${index}`}
              type="button"
              onClick={() => handleCardClick(index)}
              disabled={isCreating}
              className={`relative card p-5 text-left transition-all group ${
                isSelected
                  ? 'border-amber-500 bg-amber-50 shadow-md ring-2 ring-amber-200'
                  : 'hover:border-amber-300 hover:shadow-md'
              } ${isCreating ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {/* Multi-mode checkbox indicator */}
              {multiMode && (
                <div
                  className={`absolute top-3 right-3 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'border-amber-500 bg-amber-500'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {isSelected && <Check className="h-3 w-3 text-white" />}
                </div>
              )}

              {/* Icon */}
              <div className="mb-3">
                {IconComponent ? (
                  <IconComponent
                    className={`h-8 w-8 transition-colors ${
                      isSelected
                        ? 'text-amber-600'
                        : 'text-gray-400 group-hover:text-amber-500'
                    }`}
                  />
                ) : (
                  <div className="h-8 w-8 rounded bg-gray-100" />
                )}
              </div>

              {/* Label + meta */}
              <h3 className="text-sm font-semibold text-gray-900 mb-1">
                {preset.label}
              </h3>
              <p className="text-xs text-gray-500 mb-2">{preset.description}</p>

              {/* Piece count badge */}
              <span className="inline-block text-xs font-medium text-gray-400">
                {preset.pieces.length} {preset.pieces.length === 1 ? 'piece' : 'pieces'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Bottom actions */}
      <div className="border-t border-gray-200 pt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          {/* Start from scratch link */}
          <button
            type="button"
            onClick={onStartFromScratch}
            disabled={isCreating}
            className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2 disabled:opacity-50"
          >
            Start from scratch
          </button>

          {/* Multi-room toggle */}
          <button
            type="button"
            onClick={handleMultiToggle}
            disabled={isCreating}
            className={`text-sm font-medium transition-colors disabled:opacity-50 ${
              multiMode
                ? 'text-amber-600 hover:text-amber-700'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {multiMode ? 'Single room' : 'Add multiple rooms'}
          </button>
        </div>

        {/* Multi-mode summary + create button */}
        {multiMode && (
          <div className="flex items-center gap-3">
            {selectedIndices.size > 0 && (
              <span className="text-sm text-gray-600">
                {selectedIndices.size} {selectedIndices.size === 1 ? 'room' : 'rooms'} selected
                {' \u2014 '}
                {totalPieces} {totalPieces === 1 ? 'piece' : 'pieces'}
              </span>
            )}
            <button
              type="button"
              onClick={handleMultiCreate}
              disabled={selectedIndices.size === 0 || isCreating}
              className="px-6 py-2.5 rounded-lg bg-amber-500 text-white font-medium text-sm hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isCreating ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4 text-white"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Creating...
                </>
              ) : (
                'Create Quote \u2192'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
