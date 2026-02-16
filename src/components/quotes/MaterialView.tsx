'use client';

import { useMemo } from 'react';

interface MaterialViewPiece {
  id: number;
  name: string;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  materialId: number | null;
  materialName: string | null;
  materialCost: number;
  roomName: string | null;
}

interface MaterialViewMaterial {
  id: number;
  name: string;
  collection: string | null;
  pricePerSqm: number;
}

interface MaterialViewProps {
  pieces: MaterialViewPiece[];
  materials: MaterialViewMaterial[];
  onMaterialChange: (pieceId: number, materialId: number | null) => void;
  isEditMode: boolean;
  selectedPieceIds: Set<string>;
  onSelectionChange: (pieceIds: Set<string>) => void;
}

export default function MaterialView({
  pieces,
  materials,
  onMaterialChange,
  isEditMode,
  selectedPieceIds,
  onSelectionChange,
}: MaterialViewProps) {
  const usedMaterials = useMemo(() => {
    const ids = Array.from(new Set(
      pieces.map(p => p.materialId).filter((id): id is number => id !== null)
    ));
    return materials.filter(m => ids.includes(m.id));
  }, [pieces, materials]);

  const piecesWithoutMaterial = useMemo(
    () => pieces.filter(p => p.materialId === null),
    [pieces]
  );

  const handleSelectAll = (checked: boolean) => {
    onSelectionChange(checked ? new Set(pieces.map(p => String(p.id))) : new Set());
  };

  const handleSelectPiece = (pieceId: string, checked: boolean) => {
    const next = new Set(selectedPieceIds);
    if (checked) next.add(pieceId);
    else next.delete(pieceId);
    onSelectionChange(next);
  };

  const handleSelectByMaterial = (materialId: number) => {
    const matching = pieces
      .filter(p => p.materialId === materialId)
      .map(p => String(p.id));
    onSelectionChange(new Set(matching));
  };

  const allSelected = pieces.length > 0 && selectedPieceIds.size === pieces.length;
  const materialTotal = pieces.reduce((sum, p) => sum + (p.materialCost || 0), 0);

  return (
    <div className="space-y-3">
      {/* Header row with select helpers */}
      {isEditMode && (
        <div className="flex items-center gap-4 text-sm text-gray-600 px-2 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => handleSelectAll(e.target.checked)}
              className="rounded"
            />
            Select all ({pieces.length})
          </label>
          {usedMaterials.length > 0 && (
            <span className="text-gray-400">|</span>
          )}
          {usedMaterials.map(m => (
            <button
              key={m.id}
              onClick={() => handleSelectByMaterial(m.id)}
              className="text-orange-600 hover:text-orange-800 hover:underline"
            >
              Select all {m.name} ({pieces.filter(p => p.materialId === m.id).length})
            </button>
          ))}
          {piecesWithoutMaterial.length > 0 && (
            <>
              <span className="text-gray-400">|</span>
              <button
                onClick={() => {
                  const ids = piecesWithoutMaterial.map(p => String(p.id));
                  onSelectionChange(new Set(ids));
                }}
                className="text-amber-600 hover:text-amber-800 hover:underline"
              >
                No material ({piecesWithoutMaterial.length})
              </button>
            </>
          )}
        </div>
      )}

      {/* Compact table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {isEditMode && <th className="w-10 px-3 py-2"></th>}
              <th className="text-left px-3 py-2 font-medium text-gray-700">Piece</th>
              <th className="text-left px-3 py-2 font-medium text-gray-700">Dimensions</th>
              <th className="text-left px-3 py-2 font-medium text-gray-700 w-16">Thick.</th>
              <th className="text-left px-3 py-2 font-medium text-gray-700">Material</th>
              <th className="text-right px-3 py-2 font-medium text-gray-700 w-24">Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pieces.map((piece) => {
              const pieceIdStr = String(piece.id);
              const hasMaterial = piece.materialId !== null;

              return (
                <tr
                  key={piece.id}
                  className={`${!hasMaterial ? 'bg-amber-50' : 'hover:bg-gray-50'} ${
                    selectedPieceIds.has(pieceIdStr) ? 'bg-orange-50' : ''
                  }`}
                >
                  {isEditMode && (
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedPieceIds.has(pieceIdStr)}
                        onChange={(e) => handleSelectPiece(pieceIdStr, e.target.checked)}
                        className="rounded"
                      />
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">
                      {piece.name || 'Unnamed Piece'}
                    </div>
                    {piece.roomName && (
                      <div className="text-xs text-gray-500">{piece.roomName}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                    {piece.lengthMm}&times;{piece.widthMm}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-block px-1.5 py-0.5 text-xs font-medium bg-gray-100 rounded">
                      {piece.thicknessMm}mm
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {isEditMode ? (
                      <select
                        value={piece.materialId ?? ''}
                        onChange={(e) => onMaterialChange(
                          piece.id,
                          e.target.value ? parseInt(e.target.value) : null
                        )}
                        className={`w-full border rounded px-2 py-1 text-sm ${
                          !hasMaterial ? 'border-amber-400 bg-amber-50' : 'border-gray-300'
                        }`}
                      >
                        <option value="">— No material —</option>
                        {materials.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}{m.collection ? ` (${m.collection})` : ''} — ${m.pricePerSqm}/m²
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={!hasMaterial ? 'text-amber-600 font-medium' : 'text-gray-700'}>
                        {hasMaterial
                          ? (piece.materialName || materials.find(m => m.id === piece.materialId)?.name || 'Unknown')
                          : 'No material'
                        }
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                    {!hasMaterial ? (
                      <span className="text-amber-500 text-xs">—</span>
                    ) : (
                      <span className="text-gray-900">${Number(piece.materialCost).toFixed(2)}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {pieces.length === 0 && (
              <tr>
                <td colSpan={isEditMode ? 6 : 5} className="px-3 py-8 text-center text-gray-500">
                  No pieces in this quote
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Summary footer */}
      <div className="flex justify-between items-center px-3 py-2 bg-gray-50 rounded-lg text-sm">
        <span className="text-gray-600">
          {pieces.length} piece{pieces.length !== 1 ? 's' : ''}
          {piecesWithoutMaterial.length > 0 && (
            <span className="text-amber-600 ml-2">
              ({piecesWithoutMaterial.length} without material)
            </span>
          )}
        </span>
        <span className="font-medium">
          Material Total: ${materialTotal.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
