'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';

// ── Types (mirrors parent's interfaces — kept local to avoid coupling) ──

interface DialogPiece {
  id: number;
  name: string;
  lengthMm: number;
  widthMm: number;
  materialId: number | null;
  materialName: string | null;
  materialCost: number;
  roomName: string | null;
}

interface DialogMaterial {
  id: number;
  name: string;
  collection: string | null;
  pricePerSqm: number;
}

interface BulkMaterialDialogProps {
  isOpen: boolean;
  onClose: () => void;
  pieces: DialogPiece[];
  materials: DialogMaterial[];
  onApply: (changes: { pieceId: number; toMaterialId: number }[]) => Promise<void>;
  quoteTotal: number | null;
}

type ActiveFilter = 'ALL' | 'NO_MATERIAL' | string; // string = room name

export default function BulkMaterialDialog({
  isOpen,
  onClose,
  pieces,
  materials,
  onApply,
  quoteTotal,
}: BulkMaterialDialogProps) {
  // ── Internal state (all owned by the dialog, NOT the parent) ──
  const [selectedPieceIds, setSelectedPieceIds] = useState<Set<number>>(new Set());
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('ALL');
  const [isApplying, setIsApplying] = useState(false);
  const [showOverwriteWarning, setShowOverwriteWarning] = useState(false);

  // ── Reset state when dialog opens ──
  useEffect(() => {
    if (isOpen) {
      setSelectedPieceIds(new Set());
      setSelectedMaterialId('');
      setActiveFilter('ALL');
      setShowOverwriteWarning(false);
      setIsApplying(false);
    }
  }, [isOpen]);

  // ── Unique room names for filter buttons ──
  const roomNames = useMemo(() => {
    return Array.from(new Set(pieces.map(p => p.roomName || 'Unassigned'))).sort();
  }, [pieces]);

  // ── Filtered pieces based on active filter ──
  const filteredPieces = useMemo(() => {
    if (activeFilter === 'ALL') return pieces;
    if (activeFilter === 'NO_MATERIAL') return pieces.filter(p => !p.materialId);
    return pieces.filter(p => (p.roomName || 'Unassigned') === activeFilter);
  }, [pieces, activeFilter]);

  // ── Group filtered pieces by room — mandatory, pieces ALWAYS grouped ──
  const piecesByRoom = useMemo(() => {
    const groups = new Map<string, DialogPiece[]>();
    filteredPieces.forEach(piece => {
      const room = piece.roomName || 'Unassigned';
      const existing = groups.get(room) || [];
      existing.push(piece);
      groups.set(room, existing);
    });
    return groups;
  }, [filteredPieces]);

  const noMaterialCount = pieces.filter(p => !p.materialId).length;

  // ── Selection helpers ──
  const togglePiece = useCallback((pieceId: number) => {
    setSelectedPieceIds(prev => {
      const next = new Set(prev);
      if (next.has(pieceId)) {
        next.delete(pieceId);
      } else {
        next.add(pieceId);
      }
      return next;
    });
    setShowOverwriteWarning(false);
  }, []);

  const toggleRoom = useCallback((roomPieces: DialogPiece[]) => {
    setSelectedPieceIds(prev => {
      const next = new Set(prev);
      const allSelected = roomPieces.every(p => next.has(p.id));
      if (allSelected) {
        roomPieces.forEach(p => next.delete(p.id));
      } else {
        roomPieces.forEach(p => next.add(p.id));
      }
      return next;
    });
    setShowOverwriteWarning(false);
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedPieceIds(prev => {
      const allVisible = filteredPieces.every(p => prev.has(p.id));
      if (allVisible) {
        // Deselect all visible
        const next = new Set(prev);
        filteredPieces.forEach(p => next.delete(p.id));
        return next;
      } else {
        // Select all visible
        const next = new Set(prev);
        filteredPieces.forEach(p => next.add(p.id));
        return next;
      }
    });
    setShowOverwriteWarning(false);
  }, [filteredPieces]);

  const allVisibleSelected = filteredPieces.length > 0 && filteredPieces.every(p => selectedPieceIds.has(p.id));

  // ── Pieces that will be overwritten ──
  const piecesWithOverwrite = useMemo(() => {
    if (!selectedMaterialId) return [];
    const matId = parseInt(selectedMaterialId);
    return pieces.filter(
      p => selectedPieceIds.has(p.id) && p.materialId !== null && p.materialId !== matId
    );
  }, [pieces, selectedPieceIds, selectedMaterialId]);

  // ── Price preview ──
  const assignPreview = useMemo(() => {
    if (!selectedMaterialId || selectedPieceIds.size === 0) return null;
    const toMaterial = materials.find(m => m.id.toString() === selectedMaterialId);
    if (!toMaterial) return null;

    let oldMaterialTotal = 0;
    let newMaterialTotal = 0;

    const selectedPieceList = pieces.filter(p => selectedPieceIds.has(p.id));
    const pieceChanges = selectedPieceList.map(piece => {
      const areaSqm = (piece.lengthMm * piece.widthMm) / 1_000_000;
      const oldCost = piece.materialCost || 0;
      const newCost = areaSqm * toMaterial.pricePerSqm;
      oldMaterialTotal += oldCost;
      newMaterialTotal += newCost;
      return {
        pieceId: piece.id,
        pieceName: piece.name || 'Unnamed',
        oldMaterialName: piece.materialName,
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
  }, [pieces, selectedPieceIds, selectedMaterialId, materials, quoteTotal]);

  // ── Apply flow ──
  const handleApply = useCallback(async () => {
    if (!selectedMaterialId || selectedPieceIds.size === 0) return;

    // Check for overwrites — show warning first
    if (piecesWithOverwrite.length > 0 && !showOverwriteWarning) {
      setShowOverwriteWarning(true);
      return;
    }

    setIsApplying(true);
    try {
      const matId = parseInt(selectedMaterialId);
      const changes = Array.from(selectedPieceIds).map(pieceId => ({
        pieceId,
        toMaterialId: matId,
      }));
      await onApply(changes);
      onClose();
    } catch (err) {
      console.error('Failed to assign material:', err);
    } finally {
      setIsApplying(false);
      setShowOverwriteWarning(false);
    }
  }, [selectedMaterialId, selectedPieceIds, piecesWithOverwrite, showOverwriteWarning, onApply, onClose]);

  const selectedMaterialName = selectedMaterialId
    ? materials.find(m => m.id.toString() === selectedMaterialId)?.name ?? ''
    : '';

  const formatCost = (n: number) => `$${n.toFixed(2)}`;
  const formatDiff = (n: number) => `${n >= 0 ? '+' : ''}$${n.toFixed(2)}`;

  if (!isOpen) return null;

  return (
    <div className="border border-orange-200 bg-orange-50 rounded-lg p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-900">Bulk Material Assign</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none"
        >
          &times;
        </button>
      </div>

      {/* Material dropdown — at the top per target UX */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Material</label>
        <select
          value={selectedMaterialId}
          onChange={(e) => {
            setSelectedMaterialId(e.target.value);
            setShowOverwriteWarning(false);
          }}
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

      {/* Filter buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setActiveFilter('ALL')}
          className={`px-2.5 py-1 text-xs rounded-full border transition-colours ${
            activeFilter === 'ALL'
              ? 'bg-orange-500 text-white border-orange-500'
              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
          }`}
        >
          All Pieces ({pieces.length})
        </button>
        {noMaterialCount > 0 && (
          <button
            onClick={() => setActiveFilter('NO_MATERIAL')}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colours ${
              activeFilter === 'NO_MATERIAL'
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'
            }`}
          >
            No Material ({noMaterialCount})
          </button>
        )}
        {roomNames.map(room => {
          const count = pieces.filter(p => (p.roomName || 'Unassigned') === room).length;
          return (
            <button
              key={room}
              onClick={() => setActiveFilter(room)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colours ${
                activeFilter === room
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {room} ({count})
            </button>
          );
        })}
      </div>

      {/* Global Select All */}
      <div className="bg-white border border-gray-200 rounded-md">
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50 rounded-t-md">
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAll}
              className="rounded border-gray-300"
            />
            Select All ({filteredPieces.length} pieces)
          </label>
          <span className="text-xs text-orange-600 font-medium">
            {selectedPieceIds.size} selected
          </span>
        </div>

        {/* Room-grouped piece list */}
        <div className="max-h-64 overflow-y-auto">
          {Array.from(piecesByRoom.entries()).map(([roomName, roomPieces]) => {
            const allRoomSelected = roomPieces.every(p => selectedPieceIds.has(p.id));
            const someRoomSelected = roomPieces.some(p => selectedPieceIds.has(p.id));
            return (
              <div key={roomName}>
                {/* Room header with select all for room */}
                <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-100 sticky top-0">
                  <input
                    type="checkbox"
                    checked={allRoomSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someRoomSelected && !allRoomSelected;
                    }}
                    onChange={() => toggleRoom(roomPieces)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-xs font-semibold text-gray-700">
                    {roomName}
                  </span>
                  <span className="text-xs text-gray-400">
                    ({roomPieces.length} piece{roomPieces.length !== 1 ? 's' : ''})
                  </span>
                </div>

                {/* Piece rows */}
                {roomPieces.map(piece => {
                  const hasMaterial = piece.materialId !== null;
                  return (
                    <label
                      key={piece.id}
                      className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-orange-50 border-b border-gray-50 ${
                        selectedPieceIds.has(piece.id) ? 'bg-orange-50' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedPieceIds.has(piece.id)}
                        onChange={() => togglePiece(piece.id)}
                        className="rounded border-gray-300 ml-4"
                      />
                      <span className={`flex-1 ${hasMaterial ? 'text-gray-400' : 'text-gray-800'}`}>
                        {piece.name || 'Piece'}
                      </span>
                      <span className={`text-xs ${hasMaterial ? 'text-gray-300' : 'text-gray-400'}`}>
                        {piece.lengthMm}&times;{piece.widthMm}mm
                      </span>
                      <span className={`text-xs font-medium min-w-[80px] text-right ${
                        hasMaterial ? 'text-gray-400' : 'text-amber-600'
                      }`}>
                        {piece.materialName || '\u2014'}
                      </span>
                    </label>
                  );
                })}
              </div>
            );
          })}
          {filteredPieces.length === 0 && (
            <div className="px-3 py-4 text-sm text-gray-400 text-center">
              No pieces match this filter
            </div>
          )}
        </div>
      </div>

      {/* ── Overwrite warning (amber) ── */}
      {showOverwriteWarning && piecesWithOverwrite.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-2 text-sm text-amber-800">
            <span className="font-bold text-amber-600 mt-0.5">⚠</span>
            <span>
              {piecesWithOverwrite.length} piece{piecesWithOverwrite.length !== 1 ? 's' : ''} will
              have {piecesWithOverwrite.length !== 1 ? 'their' : 'its'} material changed:
            </span>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto text-xs text-amber-700">
            {piecesWithOverwrite.map(p => (
              <div key={p.id} className="flex justify-between">
                <span>{p.name || 'Unnamed'}</span>
                <span>{p.materialName} → {selectedMaterialName}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowOverwriteWarning(false)}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={isApplying}
              className="px-4 py-2 text-sm text-white bg-amber-500 rounded-md hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isApplying ? 'Applying...' : 'Confirm & Apply'}
            </button>
          </div>
        </div>
      )}

      {/* ── Preview + Apply button (bottom bar) ── */}
      {!showOverwriteWarning && (
        <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-3">
          {assignPreview && assignPreview.pieceChanges.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-500">
                Preview: {assignPreview.pieceChanges.length} piece{assignPreview.pieceChanges.length !== 1 ? 's' : ''}
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {assignPreview.pieceChanges.map((pc) => (
                  <div key={pc.pieceId} className="flex justify-between text-xs text-gray-600">
                    <span>{pc.pieceName}</span>
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
                  {formatCost(assignPreview.oldMaterialTotal)} &rarr;{' '}
                  {formatCost(assignPreview.newMaterialTotal)}{' '}
                  <span className={assignPreview.difference >= 0 ? 'text-red-600' : 'text-green-600'}>
                    ({formatDiff(assignPreview.difference)})
                  </span>
                </span>
              </div>
              {assignPreview.newQuoteTotal != null && (
                <div className="flex justify-between text-sm font-medium">
                  <span>Est. Quote Total</span>
                  <span className="text-orange-600">{formatCost(assignPreview.newQuoteTotal)}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {selectedPieceIds.size > 0
                ? `${selectedPieceIds.size} piece${selectedPieceIds.size !== 1 ? 's' : ''} selected`
                : 'Select pieces to assign material'}
            </span>
            <button
              onClick={handleApply}
              disabled={!selectedMaterialId || selectedPieceIds.size === 0 || isApplying}
              className="px-4 py-2 text-sm text-white bg-orange-500 rounded-md hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isApplying
                ? 'Applying...'
                : `Apply to ${selectedPieceIds.size} piece${selectedPieceIds.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
