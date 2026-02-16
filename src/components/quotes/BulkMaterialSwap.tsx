'use client';

import { useState, useMemo } from 'react';

type ApplyScope = 'all' | 'selected' | 'noMaterial';

interface BulkSwapPiece {
  id: number;
  name: string;
  lengthMm: number;
  widthMm: number;
  materialId: number | null;
  materialName: string | null;
  materialCost: number;
  roomName: string | null;
}

interface BulkSwapMaterial {
  id: number;
  name: string;
  collection: string | null;
  pricePerSqm: number;
}

interface BulkMaterialSwapProps {
  pieces: BulkSwapPiece[];
  materials: BulkSwapMaterial[];
  selectedPieceIds: Set<string>;
  onApply: (changes: { pieceId: number; toMaterialId: number }[]) => Promise<void>;
  onClose: () => void;
  quoteTotal: number | null;
}

export default function BulkMaterialSwap({
  pieces,
  materials,
  selectedPieceIds,
  onApply,
  onClose,
  quoteTotal,
}: BulkMaterialSwapProps) {
  const [scope, setScope] = useState<ApplyScope>('all');
  const [fromMaterialId, setFromMaterialId] = useState<string>('');
  const [toMaterialId, setToMaterialId] = useState<string>('');
  const [isApplying, setIsApplying] = useState(false);

  // Materials currently used in this quote's pieces (for FROM dropdown)
  const usedMaterials = useMemo(() => {
    const ids = Array.from(new Set(
      pieces.map(p => p.materialId).filter((id): id is number => id !== null)
    ));
    return materials.filter(m => ids.includes(m.id));
  }, [pieces, materials]);

  // Pieces affected by current scope + FROM selection
  const affectedPieces = useMemo(() => {
    let filtered = [...pieces];

    if (scope === 'selected') {
      filtered = filtered.filter(p => selectedPieceIds.has(String(p.id)));
    } else if (scope === 'noMaterial') {
      filtered = filtered.filter(p => p.materialId === null);
    }

    // Filter by FROM material (not applicable for 'noMaterial' scope)
    if (fromMaterialId && scope !== 'noMaterial') {
      filtered = filtered.filter(p => p.materialId?.toString() === fromMaterialId);
    }

    return filtered;
  }, [pieces, scope, selectedPieceIds, fromMaterialId]);

  // Price preview: estimate cost difference based on pricePerSqm and piece area
  const preview = useMemo(() => {
    if (!toMaterialId || affectedPieces.length === 0) return null;

    const toMaterial = materials.find(m => m.id.toString() === toMaterialId);
    if (!toMaterial) return null;

    let oldMaterialTotal = 0;
    let newMaterialTotal = 0;

    const pieceChanges = affectedPieces.map(piece => {
      const areaSqm = (piece.lengthMm * piece.widthMm) / 1_000_000;
      const oldCost = piece.materialCost || 0;
      const newCost = areaSqm * toMaterial.pricePerSqm;

      oldMaterialTotal += oldCost;
      newMaterialTotal += newCost;

      return {
        pieceId: piece.id,
        pieceName: piece.name || 'Unnamed',
        dimensions: `${piece.lengthMm}\u00d7${piece.widthMm}`,
        oldCost,
        newCost,
        difference: newCost - oldCost,
      };
    });

    const difference = newMaterialTotal - oldMaterialTotal;

    return {
      pieceChanges,
      oldMaterialTotal,
      newMaterialTotal,
      difference,
      newQuoteTotal: quoteTotal != null ? quoteTotal + difference : null,
    };
  }, [affectedPieces, toMaterialId, materials, quoteTotal]);

  const handleApply = async () => {
    if (!toMaterialId || affectedPieces.length === 0) return;
    setIsApplying(true);

    try {
      const changes = affectedPieces.map(piece => ({
        pieceId: piece.id,
        toMaterialId: parseInt(toMaterialId),
      }));
      await onApply(changes);
      onClose();
    } catch (error) {
      console.error('Bulk material swap failed:', error);
    } finally {
      setIsApplying(false);
    }
  };

  const selectedCount = selectedPieceIds.size;
  const noMaterialCount = pieces.filter(p => p.materialId === null).length;

  const formatCost = (n: number) => `$${n.toFixed(2)}`;
  const formatDiff = (n: number) => `${n >= 0 ? '+' : ''}$${n.toFixed(2)}`;

  return (
    <div className="border border-orange-200 bg-orange-50 rounded-lg p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-900">Bulk Material Swap</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
      </div>

      {/* Scope selection */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-gray-600 font-medium">Apply to:</span>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" name="bulkSwapScope" checked={scope === 'all'} onChange={() => setScope('all')} />
          All pieces ({pieces.length})
        </label>
        <label className={`flex items-center gap-1.5 ${selectedCount === 0 ? 'text-gray-400 cursor-not-allowed' : 'cursor-pointer'}`}>
          <input type="radio" name="bulkSwapScope" checked={scope === 'selected'} onChange={() => setScope('selected')} disabled={selectedCount === 0} />
          Selected ({selectedCount})
        </label>
        {noMaterialCount > 0 && (
          <label className="flex items-center gap-1.5 cursor-pointer text-amber-700">
            <input type="radio" name="bulkSwapScope" checked={scope === 'noMaterial'} onChange={() => setScope('noMaterial')} />
            No material ({noMaterialCount})
          </label>
        )}
      </div>

      {/* FROM / TO selectors */}
      <div className="flex items-center gap-3">
        {scope !== 'noMaterial' && (
          <>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Change FROM</label>
              <select
                value={fromMaterialId}
                onChange={(e) => setFromMaterialId(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">Any material</option>
                {usedMaterials.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({pieces.filter(p => p.materialId === m.id).length} pieces)
                  </option>
                ))}
              </select>
            </div>
            <div className="pt-5 text-gray-400 text-lg">&rarr;</div>
          </>
        )}
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {scope === 'noMaterial' ? 'Assign material' : 'Change TO'}
          </label>
          <select
            value={toMaterialId}
            onChange={(e) => setToMaterialId(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="">Select material...</option>
            {materials.map(m => (
              <option key={m.id} value={m.id}>
                {m.name}{m.collection ? ` (${m.collection})` : ''} &mdash; ${m.pricePerSqm}/m&sup2;
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Preview */}
      {preview && preview.pieceChanges.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-md p-3 space-y-2">
          <div className="text-sm font-medium text-gray-700">
            Preview: {preview.pieceChanges.length} piece{preview.pieceChanges.length !== 1 ? 's' : ''} affected
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {preview.pieceChanges.map((pc) => (
              <div key={pc.pieceId} className="flex justify-between text-sm text-gray-600">
                <span>{pc.pieceName} ({pc.dimensions})</span>
                <span>
                  {formatCost(pc.oldCost)} &rarr; {formatCost(pc.newCost)}{' '}
                  <span className={pc.difference >= 0 ? 'text-red-600' : 'text-green-600'}>
                    ({formatDiff(pc.difference)})
                  </span>
                </span>
              </div>
            ))}
          </div>
          <div className="border-t pt-2 flex justify-between text-sm font-medium">
            <span>Material Total</span>
            <span>
              {formatCost(preview.oldMaterialTotal)} &rarr; {formatCost(preview.newMaterialTotal)}{' '}
              <span className={preview.difference >= 0 ? 'text-red-600' : 'text-green-600'}>
                ({formatDiff(preview.difference)})
              </span>
            </span>
          </div>
          {preview.newQuoteTotal != null && (
            <div className="flex justify-between text-sm font-medium">
              <span>Est. Quote Total</span>
              <span className="text-orange-600">{formatCost(preview.newQuoteTotal)}</span>
            </div>
          )}
        </div>
      )}

      {affectedPieces.length === 0 && toMaterialId && (
        <div className="text-sm text-gray-500 italic">No pieces match the current selection criteria.</div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleApply}
          disabled={!toMaterialId || affectedPieces.length === 0 || isApplying}
          className="px-4 py-2 text-sm text-white bg-orange-500 rounded-md hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isApplying ? 'Applying...' : `Apply to ${affectedPieces.length} piece${affectedPieces.length !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}
