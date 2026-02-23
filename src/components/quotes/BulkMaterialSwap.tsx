'use client';

import { useState, useMemo, useCallback } from 'react';

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
  // ── Assign mode state (primary) ──
  const [checkedPieceIds, setCheckedPieceIds] = useState<Set<number>>(() => {
    // Default: check all pieces with no material
    return new Set(pieces.filter(p => p.materialId === null).map(p => p.id));
  });
  const [quickFilter, setQuickFilter] = useState<string>('noMaterial');
  const [assignMaterialId, setAssignMaterialId] = useState<string>('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  // ── Swap mode state (secondary) ──
  const [showSwapSection, setShowSwapSection] = useState(false);
  const [fromMaterialId, setFromMaterialId] = useState<string>('');
  const [swapToMaterialId, setSwapToMaterialId] = useState<string>('');

  // Unique rooms derived from pieces
  const rooms = useMemo(() => {
    const roomNames = Array.from(new Set(
      pieces.map(p => p.roomName).filter((r): r is string => r !== null)
    ));
    return roomNames.sort();
  }, [pieces]);

  // Materials currently used in this quote's pieces (for swap FROM dropdown)
  const usedMaterials = useMemo(() => {
    const ids = Array.from(new Set(
      pieces.map(p => p.materialId).filter((id): id is number => id !== null)
    ));
    return materials.filter(m => ids.includes(m.id));
  }, [pieces, materials]);

  const noMaterialCount = pieces.filter(p => p.materialId === null).length;

  // ── Pieces visible based on quick filter ──
  const visiblePieces = useMemo(() => {
    if (quickFilter === 'all') return pieces;
    if (quickFilter === 'noMaterial') return pieces.filter(p => p.materialId === null);
    // Room filter
    return pieces.filter(p => p.roomName === quickFilter);
  }, [pieces, quickFilter]);

  // ── Checked pieces (for assign mode) ──
  const checkedPieces = useMemo(() => {
    return pieces.filter(p => checkedPieceIds.has(p.id));
  }, [pieces, checkedPieceIds]);

  // ── Swap affected pieces ──
  const swapAffectedPieces = useMemo(() => {
    if (!fromMaterialId) return pieces.filter(p => p.materialId !== null);
    return pieces.filter(p => p.materialId?.toString() === fromMaterialId);
  }, [pieces, fromMaterialId]);

  // Toggle a single piece checkbox
  const togglePiece = useCallback((pieceId: number) => {
    setCheckedPieceIds(prev => {
      const next = new Set(prev);
      if (next.has(pieceId)) {
        next.delete(pieceId);
      } else {
        next.add(pieceId);
      }
      return next;
    });
  }, []);

  // Select all visible pieces
  const selectAllVisible = useCallback(() => {
    setCheckedPieceIds(prev => {
      const next = new Set(prev);
      for (const p of visiblePieces) {
        next.add(p.id);
      }
      return next;
    });
  }, [visiblePieces]);

  // Deselect all visible pieces
  const deselectAllVisible = useCallback(() => {
    setCheckedPieceIds(prev => {
      const next = new Set(prev);
      for (const p of visiblePieces) {
        next.delete(p.id);
      }
      return next;
    });
  }, [visiblePieces]);

  // ── Price preview for assign mode ──
  const assignPreview = useMemo(() => {
    if (!assignMaterialId || checkedPieces.length === 0) return null;
    const toMaterial = materials.find(m => m.id.toString() === assignMaterialId);
    if (!toMaterial) return null;

    let oldMaterialTotal = 0;
    let newMaterialTotal = 0;
    const piecesWithExistingMaterial: string[] = [];

    const pieceChanges = checkedPieces.map(piece => {
      const areaSqm = (piece.lengthMm * piece.widthMm) / 1_000_000;
      const oldCost = piece.materialCost || 0;
      const newCost = areaSqm * toMaterial.pricePerSqm;
      oldMaterialTotal += oldCost;
      newMaterialTotal += newCost;

      if (piece.materialId !== null) {
        piecesWithExistingMaterial.push(piece.name || 'Unnamed');
      }

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
      piecesWithExistingMaterial,
    };
  }, [checkedPieces, assignMaterialId, materials, quoteTotal]);

  // ── Price preview for swap mode ──
  const swapPreview = useMemo(() => {
    if (!swapToMaterialId || swapAffectedPieces.length === 0) return null;
    const toMaterial = materials.find(m => m.id.toString() === swapToMaterialId);
    if (!toMaterial) return null;

    let oldMaterialTotal = 0;
    let newMaterialTotal = 0;

    const pieceChanges = swapAffectedPieces.map(piece => {
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
    return { pieceChanges, oldMaterialTotal, newMaterialTotal, difference,
      newQuoteTotal: quoteTotal != null ? quoteTotal + difference : null };
  }, [swapAffectedPieces, swapToMaterialId, materials, quoteTotal]);

  // ── Handle assign apply ──
  const handleAssignApply = async () => {
    if (!assignMaterialId || checkedPieces.length === 0) return;
    setIsApplying(true);
    try {
      const changes = checkedPieces.map(piece => ({
        pieceId: piece.id,
        toMaterialId: parseInt(assignMaterialId),
      }));
      await onApply(changes);
      onClose();
    } catch (error) {
      console.error('Bulk material assign failed:', error);
    } finally {
      setIsApplying(false);
      setShowConfirm(false);
    }
  };

  // ── Handle swap apply ──
  const handleSwapApply = async () => {
    if (!swapToMaterialId || swapAffectedPieces.length === 0) return;
    setIsApplying(true);
    try {
      const changes = swapAffectedPieces.map(piece => ({
        pieceId: piece.id,
        toMaterialId: parseInt(swapToMaterialId),
      }));
      await onApply(changes);
      onClose();
    } catch (error) {
      console.error('Bulk material swap failed:', error);
    } finally {
      setIsApplying(false);
    }
  };

  const formatCost = (n: number) => `$${n.toFixed(2)}`;
  const formatDiff = (n: number) => `${n >= 0 ? '+' : ''}$${n.toFixed(2)}`;

  const allVisibleChecked = visiblePieces.length > 0 && visiblePieces.every(p => checkedPieceIds.has(p.id));

  const assignMaterialName = assignMaterialId
    ? materials.find(m => m.id.toString() === assignMaterialId)?.name ?? ''
    : '';

  return (
    <div className="border border-orange-200 bg-orange-50 rounded-lg p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-900">Bulk Material Assign</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
      </div>

      {/* ═══ ASSIGN MODE (Primary) ═══ */}

      {/* Quick filter buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-gray-500">Select pieces:</span>
        <button
          onClick={() => setQuickFilter('all')}
          className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
            quickFilter === 'all'
              ? 'bg-orange-500 text-white border-orange-500'
              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
          }`}
        >
          All Pieces ({pieces.length})
        </button>
        {noMaterialCount > 0 && (
          <button
            onClick={() => setQuickFilter('noMaterial')}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
              quickFilter === 'noMaterial'
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'
            }`}
          >
            No Material ({noMaterialCount})
          </button>
        )}
        {rooms.map(room => {
          const count = pieces.filter(p => p.roomName === room).length;
          return (
            <button
              key={room}
              onClick={() => setQuickFilter(room)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                quickFilter === room
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {room} ({count})
            </button>
          );
        })}
      </div>

      {/* Piece checkboxes */}
      <div className="bg-white border border-gray-200 rounded-md">
        {/* Select all / deselect header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50 rounded-t-md">
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={allVisibleChecked}
              onChange={() => allVisibleChecked ? deselectAllVisible() : selectAllVisible()}
              className="rounded border-gray-300"
            />
            {allVisibleChecked ? 'Deselect all' : 'Select all'} ({visiblePieces.length})
          </label>
          <span className="text-xs text-orange-600 font-medium">
            {checkedPieceIds.size} selected
          </span>
        </div>

        {/* Piece list */}
        <div className="max-h-48 overflow-y-auto divide-y divide-gray-50">
          {visiblePieces.map((piece, idx) => (
            <label
              key={piece.id}
              className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-orange-25 ${
                checkedPieceIds.has(piece.id) ? 'bg-orange-50' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={checkedPieceIds.has(piece.id)}
                onChange={() => togglePiece(piece.id)}
                className="rounded border-gray-300"
              />
              <span className="text-gray-500 text-xs w-5">{idx + 1}.</span>
              <span className="flex-1 text-gray-800">
                {piece.name || 'Piece'}
                {piece.roomName && (
                  <span className="text-gray-400 ml-1">({piece.roomName})</span>
                )}
              </span>
              <span className="text-xs text-gray-400">
                {piece.lengthMm}&times;{piece.widthMm}
              </span>
              <span className={`text-xs font-medium ${piece.materialId ? 'text-gray-600' : 'text-amber-600'}`}>
                {piece.materialName || 'No material'}
              </span>
            </label>
          ))}
          {visiblePieces.length === 0 && (
            <div className="px-3 py-4 text-sm text-gray-400 text-center">No pieces match this filter</div>
          )}
        </div>
      </div>

      {/* Assign material selector + action */}
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">Material</label>
          <select
            value={assignMaterialId}
            onChange={(e) => setAssignMaterialId(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="">Select material...</option>
            {materials.map(m => (
              <option key={m.id} value={m.id}>
                {m.name}{m.collection ? ` (${m.collection})` : ''} — ${m.pricePerSqm}/m²
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setShowConfirm(true)}
          disabled={!assignMaterialId || checkedPieces.length === 0 || isApplying}
          className="px-4 py-2 text-sm text-white bg-orange-500 rounded-md hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          Apply to {checkedPieces.length} piece{checkedPieces.length !== 1 ? 's' : ''}
        </button>
      </div>

      {/* Assign preview */}
      {assignPreview && assignPreview.pieceChanges.length > 0 && !showConfirm && (
        <PreviewTable
          preview={assignPreview}
          formatCost={formatCost}
          formatDiff={formatDiff}
        />
      )}

      {/* ═══ CONFIRMATION DIALOG ═══ */}
      {showConfirm && assignPreview && (
        <div className="bg-white border-2 border-orange-300 rounded-lg p-4 space-y-3">
          <div className="text-sm font-medium text-gray-900">
            Assign {assignMaterialName} to {checkedPieces.length} piece{checkedPieces.length !== 1 ? 's' : ''}?
          </div>

          {assignPreview.piecesWithExistingMaterial.length > 0 && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs text-amber-800">
              <span className="font-bold mt-0.5">!</span>
              <span>
                {assignPreview.piecesWithExistingMaterial.length} piece{assignPreview.piecesWithExistingMaterial.length !== 1 ? 's' : ''} will
                have {assignPreview.piecesWithExistingMaterial.length !== 1 ? 'their' : 'its'} material changed:
                {' '}{assignPreview.piecesWithExistingMaterial.slice(0, 5).join(', ')}
                {assignPreview.piecesWithExistingMaterial.length > 5 && ` and ${assignPreview.piecesWithExistingMaterial.length - 5} more`}
              </span>
            </div>
          )}

          <PreviewTable
            preview={assignPreview}
            formatCost={formatCost}
            formatDiff={formatDiff}
          />

          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowConfirm(false)}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAssignApply}
              disabled={isApplying}
              className="px-4 py-2 text-sm text-white bg-orange-500 rounded-md hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isApplying ? 'Applying...' : 'Confirm'}
            </button>
          </div>
        </div>
      )}

      {/* ═══ SWAP MODE (Secondary — collapsible) ═══ */}
      <div className="border-t border-orange-200 pt-3">
        <button
          onClick={() => setShowSwapSection(!showSwapSection)}
          className="text-xs font-medium text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          <span className={`transition-transform ${showSwapSection ? 'rotate-90' : ''}`}>&#9654;</span>
          Swap existing material
        </button>

        {showSwapSection && (
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-3">
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
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Change TO</label>
                <select
                  value={swapToMaterialId}
                  onChange={(e) => setSwapToMaterialId(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Select material...</option>
                  {materials.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name}{m.collection ? ` (${m.collection})` : ''} — ${m.pricePerSqm}/m²
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="text-xs text-gray-500">
              Affects: {swapAffectedPieces.length} piece{swapAffectedPieces.length !== 1 ? 's' : ''}
            </div>

            {/* Swap preview */}
            {swapPreview && swapPreview.pieceChanges.length > 0 && (
              <PreviewTable
                preview={swapPreview}
                formatCost={formatCost}
                formatDiff={formatDiff}
              />
            )}

            <div className="flex justify-end">
              <button
                onClick={handleSwapApply}
                disabled={!swapToMaterialId || swapAffectedPieces.length === 0 || isApplying}
                className="px-4 py-2 text-sm text-white bg-gray-600 rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isApplying ? 'Swapping...' : `Swap ${swapAffectedPieces.length} piece${swapAffectedPieces.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Reusable preview table ──
function PreviewTable({
  preview,
  formatCost,
  formatDiff,
}: {
  preview: {
    pieceChanges: Array<{
      pieceId: number;
      pieceName: string;
      dimensions: string;
      oldCost: number;
      newCost: number;
      difference: number;
    }>;
    oldMaterialTotal: number;
    newMaterialTotal: number;
    difference: number;
    newQuoteTotal?: number | null;
  };
  formatCost: (n: number) => string;
  formatDiff: (n: number) => string;
}) {
  return (
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
  );
}
