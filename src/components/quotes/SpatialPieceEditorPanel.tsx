'use client';

import V2PrototypeSpatialEditor from '@/proto-editor/V2PrototypeSpatialEditor';
import type { CanonicalPolygonShapeConfig } from '@/lib/types/shapes';
import { spatialCutoutsFromShapeConfig, type SpatialCutoutPatch } from '@/lib/services/spatial-cutout-mapper';

export type { SpatialCutoutPatch } from '@/lib/services/spatial-cutout-mapper';

export interface SpatialEditablePiece {
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

interface SpatialPieceEditorPanelProps {
  piece: SpatialEditablePiece;
  onCancel?: () => void;
  onSave: (
    shapeConfig: CanonicalPolygonShapeConfig,
    lengthMm: number,
    widthMm: number,
    cutouts: SpatialCutoutPatch[],
  ) => void | Promise<void>;
}

export default function SpatialPieceEditorPanel({
  piece,
  onCancel,
  onSave,
}: SpatialPieceEditorPanelProps) {
  return (
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
      onCancel={onCancel ?? (() => undefined)}
      onSave={async (_pieceId, shapeConfig, lengthMm, widthMm) => {
        await onSave(shapeConfig, lengthMm, widthMm, spatialCutoutsFromShapeConfig(shapeConfig));
      }}
    />
  );
}
