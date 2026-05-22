'use client';

import V2PrototypeSpatialEditor from '@/proto-editor/V2PrototypeSpatialEditor';
import type { CanonicalPolygonShapeConfig } from '@/lib/types/shapes';

export interface SpatialCutoutPatch {
  type: string;
  name: string;
  quantity: number;
  positionXMm?: number;
  positionYMm?: number;
}

interface SpatialEditablePiece {
  id: number | string;
  name: string;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  materialId?: number | null;
  materialName?: string | null;
  shapeType?: string | null;
  shapeConfig?: Record<string, unknown> | null;
  edgeTop?: string | null;
  edgeBottom?: string | null;
  edgeLeft?: string | null;
  edgeRight?: string | null;
}

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

function featureToCutout(feature: unknown): SpatialCutoutPatch | null {
  if (!feature || typeof feature !== 'object') return null;
  const candidate = feature as {
    kind?: string;
    position?: { x?: number; y?: number };
  };

  const labelByKind: Record<string, string> = {
    'undermount-sink': 'Undermount Sink',
    'overmount-sink': 'Drop-in Sink',
    'cooktop-cutout': 'Cooktop / Hotplate',
    'tap-hole': 'Tap Hole',
    'custom-cutout': 'Custom Cutout',
  };
  const label = candidate.kind ? labelByKind[candidate.kind] : null;
  if (!label) return null;

  return {
    type: label,
    name: label,
    quantity: 1,
    ...(Number.isFinite(candidate.position?.x) ? { positionXMm: Number(candidate.position?.x) } : {}),
    ...(Number.isFinite(candidate.position?.y) ? { positionYMm: Number(candidate.position?.y) } : {}),
  };
}

function cutoutsFromShapeConfig(shapeConfig: CanonicalPolygonShapeConfig): SpatialCutoutPatch[] {
  return shapeConfig.features
    .map(featureToCutout)
    .filter((cutout): cutout is SpatialCutoutPatch => Boolean(cutout));
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
          <V2PrototypeSpatialEditor
            piece={{
              id: String(piece.id),
              name: piece.name,
              length: piece.lengthMm,
              width: piece.widthMm,
              thickness: piece.thicknessMm,
              materialId: piece.materialId ?? null,
              materialName: piece.materialName ?? null,
              shape: piece.shapeType ?? 'RECTANGLE',
              shapeConfig: piece.shapeConfig ?? null,
              edgeSelections: {
                edgeTop: piece.edgeTop ?? null,
                edgeBottom: piece.edgeBottom ?? null,
                edgeLeft: piece.edgeLeft ?? null,
                edgeRight: piece.edgeRight ?? null,
              },
            }}
            onCancel={onClose}
            onSave={async (_pieceId, shapeConfig, lengthMm, widthMm) => {
              await onSave(shapeConfig, lengthMm, widthMm, cutoutsFromShapeConfig(shapeConfig));
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}
