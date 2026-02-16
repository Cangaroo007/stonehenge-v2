'use client';

import type { QuoteOptionOverride } from '@/hooks/useQuoteOptions';

interface PieceOverrideIndicatorProps {
  override: QuoteOptionOverride | undefined;
  onResetToBase?: () => void;
  mode: 'view' | 'edit';
}

/**
 * Shows an indicator on a piece when it has overrides in the active option.
 * Displays which fields are overridden.
 */
export default function PieceOverrideIndicator({
  override,
  onResetToBase,
  mode,
}: PieceOverrideIndicatorProps) {
  if (!override) return null;

  // Determine which fields are overridden
  const changes: string[] = [];
  if (override.materialId !== null) changes.push('Material');
  if (override.thicknessMm !== null) changes.push('Thickness');
  if (override.edgeTop !== null || override.edgeBottom !== null ||
      override.edgeLeft !== null || override.edgeRight !== null) {
    changes.push('Edges');
  }
  if (override.cutouts !== null) changes.push('Cutouts');
  if (override.lengthMm !== null || override.widthMm !== null) changes.push('Dimensions');

  if (changes.length === 0) return null;

  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" />
        <span className="text-xs text-orange-600 font-medium">
          Override: {changes.join(', ')}
        </span>
      </div>
      {mode === 'edit' && onResetToBase && (
        <button
          type="button"
          onClick={onResetToBase}
          className="text-xs text-gray-500 hover:text-red-500 transition-colors underline"
        >
          Reset to base
        </button>
      )}
    </div>
  );
}
