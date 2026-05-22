'use client';

import type { CanonicalPolygonShapeConfig } from '@/lib/types/shapes';
import SpatialPieceEditorPanel, { type SpatialEditablePiece, type SpatialCutoutPatch } from './SpatialPieceEditorPanel';
export type { SpatialCutoutPatch } from '@/lib/services/spatial-cutout-mapper';

interface SpatialPieceEditModalProps {
  piece: SpatialEditablePiece;
  onClose: () => void;
  onSave: (
    shapeConfig: CanonicalPolygonShapeConfig,
    lengthMm: number,
    widthMm: number,
    cutouts: SpatialCutoutPatch[],
  ) => void | Promise<void>;
}

export default function SpatialPieceEditModal({
  piece,
  onClose,
  onSave,
}: SpatialPieceEditModalProps) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[94vh] w-[min(1280px,96vw)] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900">Spatial edit — {piece.name}</h3>
            <p className="text-sm text-zinc-600">
              Edit the true polygon footprint. Saving updates this quote piece, pricing, optimiser geometry, and visual renders.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-lg border border-zinc-200 text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-800"
            aria-label="Close spatial editor"
          >
            ×
          </button>
        </div>
        <div className="overflow-auto bg-zinc-50 p-5">
          <SpatialPieceEditorPanel
            piece={piece}
            onCancel={onClose}
            onSave={async (shapeConfig, lengthMm, widthMm, cutouts) => {
              await onSave(shapeConfig, lengthMm, widthMm, cutouts);
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}
