'use client';

import { useState, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import type { PieceRelationshipData } from '@/lib/types/piece-relationship';
import {
  RELATIONSHIP_DISPLAY,
  JOIN_POSITIONS,
} from '@/lib/types/piece-relationship';
import type { RelationshipType } from '@prisma/client';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface RelationshipEditorProps {
  quoteId: string;
  selectedPieceId: string;
  allPieces: Array<{
    id: string;
    description: string;
    piece_type: string | null;
    room_name: string | null;
  }>;
  existingRelationships: PieceRelationshipData[];
  onRelationshipChange: () => void;
}

// Types that use join position
const POSITION_TYPES: RelationshipType[] = ['WATERFALL', 'SPLASHBACK', 'RETURN'];

const ALL_RELATIONSHIP_TYPES = Object.keys(RELATIONSHIP_DISPLAY) as RelationshipType[];

// ─── Component ──────────────────────────────────────────────────────────────

export default function RelationshipEditor({
  quoteId,
  selectedPieceId,
  allPieces,
  existingRelationships,
  onRelationshipChange,
}: RelationshipEditorProps) {
  // ── State ───────────────────────────────────────────────────────────────
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRelId, setEditingRelId] = useState<string | null>(null);
  const [showAllRooms, setShowAllRooms] = useState(false);
  const [saving, setSaving] = useState(false);

  // Add form state
  const [newChildPieceId, setNewChildPieceId] = useState<string>('');
  const [newType, setNewType] = useState<RelationshipType>('WATERFALL');
  const [newPosition, setNewPosition] = useState<string>('');
  const [newNotes, setNewNotes] = useState('');

  // Edit form state
  const [editType, setEditType] = useState<RelationshipType>('WATERFALL');
  const [editPosition, setEditPosition] = useState<string>('');
  const [editNotes, setEditNotes] = useState('');

  // ── Derived ──────────────────────────────────────────────────────────────

  const selectedPiece = useMemo(
    () => allPieces.find(p => p.id === selectedPieceId),
    [allPieces, selectedPieceId]
  );

  const selectedPieceRoomName = selectedPiece?.room_name ?? null;

  // Relationships involving the selected piece (as parent or child)
  const pieceRelationships = useMemo(
    () => existingRelationships.filter(
      r => r.parentPieceId === selectedPieceId || r.childPieceId === selectedPieceId
    ),
    [existingRelationships, selectedPieceId]
  );

  // Filter pieces for the dropdown
  const availablePieces = useMemo(() => {
    let filtered = allPieces.filter(p => p.id !== selectedPieceId);
    if (!showAllRooms && selectedPieceRoomName) {
      filtered = filtered.filter(p => p.room_name === selectedPieceRoomName);
    }
    return filtered;
  }, [allPieces, selectedPieceId, showAllRooms, selectedPieceRoomName]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const getPieceName = useCallback(
    (pieceId: string) => {
      const piece = allPieces.find(p => p.id === pieceId);
      return piece?.description ?? 'Unknown Piece';
    },
    [allPieces]
  );

  const getPieceRoom = useCallback(
    (pieceId: string) => {
      const piece = allPieces.find(p => p.id === pieceId);
      return piece?.room_name ?? null;
    },
    [allPieces]
  );

  const isDuplicate = useCallback(
    (parentId: string, childId: string, excludeRelId?: string) => {
      return existingRelationships.some(
        r => r.id !== excludeRelId
          && r.parentPieceId === parentId
          && r.childPieceId === childId
      );
    },
    [existingRelationships]
  );

  // ── API Calls ────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!selectedPieceId || !newChildPieceId || !newType) return;

    // Validation
    if (newChildPieceId === selectedPieceId) {
      toast.error('Cannot relate a piece to itself');
      return;
    }

    if (isDuplicate(selectedPieceId, newChildPieceId)) {
      toast.error('This relationship already exists');
      return;
    }

    const childRoom = getPieceRoom(newChildPieceId);
    const isCrossRoom = childRoom && selectedPieceRoomName && childRoom !== selectedPieceRoomName;

    setSaving(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/relationships`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentPieceId: selectedPieceId,
          childPieceId: newChildPieceId,
          relationshipType: newType,
          joinPosition: POSITION_TYPES.includes(newType) ? newPosition || null : null,
          notes: newNotes || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create relationship');
      }

      const msg = isCrossRoom
        ? 'Relationship created (cross-room)'
        : 'Relationship created';
      toast.success(msg);
      onRelationshipChange();
      resetAddForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create relationship');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (relId: string) => {
    if (!relId) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/relationships/${relId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          relationshipType: editType,
          joinPosition: POSITION_TYPES.includes(editType) ? editPosition || null : null,
          notes: editNotes || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update relationship');
      }

      toast.success('Relationship updated');
      onRelationshipChange();
      setEditingRelId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update relationship');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (relId: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/relationships/${relId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to delete relationship');
      }

      toast.success('Relationship deleted');
      onRelationshipChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete relationship');
    } finally {
      setSaving(false);
    }
  };

  // ── Form Helpers ─────────────────────────────────────────────────────────

  const resetAddForm = () => {
    setShowAddForm(false);
    setNewChildPieceId('');
    setNewType('WATERFALL');
    setNewPosition('');
    setNewNotes('');
  };

  const startEdit = (rel: PieceRelationshipData) => {
    setEditingRelId(rel.id);
    setEditType(rel.relationshipType);
    setEditPosition(rel.joinPosition ?? '');
    setEditNotes(rel.notes ?? '');
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const pieceName = selectedPiece?.description ?? 'Selected Piece';

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
          Relationships for &ldquo;{pieceName.length > 30 ? pieceName.slice(0, 27) + '\u2026' : pieceName}&rdquo;
        </h4>
        <span className="text-xs text-gray-400">
          {pieceRelationships.length} connection{pieceRelationships.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Existing Relationships */}
      {pieceRelationships.length > 0 && (
        <div className="space-y-2">
          {pieceRelationships.map(rel => {
            const display = RELATIONSHIP_DISPLAY[rel.relationshipType];
            const isParent = rel.parentPieceId === selectedPieceId;
            const otherPieceId = isParent ? rel.childPieceId : rel.parentPieceId;
            const otherPieceName = getPieceName(otherPieceId);
            const otherRoom = getPieceRoom(otherPieceId);
            const isCrossRoom = otherRoom && selectedPieceRoomName && otherRoom !== selectedPieceRoomName;
            const isEditing = editingRelId === rel.id;

            return (
              <div
                key={rel.id}
                className="border border-gray-200 rounded-lg bg-white"
              >
                {/* Relationship card header */}
                <div className="flex items-start justify-between px-3 py-2">
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => isEditing ? setEditingRelId(null) : startEdit(rel)}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold text-white"
                        style={{ backgroundColor: display?.colour ?? '#6B7280' }}
                      >
                        {display?.icon ?? '?'}
                      </span>
                      <span className="text-sm font-medium text-gray-800">
                        {display?.label ?? rel.relationshipType}
                      </span>
                      <span className="text-xs text-gray-400">
                        {isParent ? '\u2192' : '\u2190'}
                      </span>
                      <span className="text-sm text-gray-600 truncate">
                        {otherPieceName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 ml-7">
                      {rel.joinPosition && (
                        <span className="text-xs text-gray-500">
                          Position: {rel.joinPosition}
                        </span>
                      )}
                      {isCrossRoom && (
                        <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                          Cross-room ({otherRoom})
                        </span>
                      )}
                      {rel.notes && (
                        <span className="text-xs text-gray-400 italic truncate">
                          {rel.notes}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(rel.id)}
                    disabled={saving}
                    className="flex-shrink-0 p-1 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    title="Delete relationship"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Inline Edit Form */}
                {isEditing && (
                  <div className="px-3 pb-3 pt-1 border-t border-gray-100 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Type</label>
                        <select
                          value={editType}
                          onChange={e => setEditType(e.target.value as RelationshipType)}
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        >
                          {ALL_RELATIONSHIP_TYPES.map(t => (
                            <option key={t} value={t}>{RELATIONSHIP_DISPLAY[t].label}</option>
                          ))}
                        </select>
                      </div>
                      {POSITION_TYPES.includes(editType) && (
                        <div>
                          <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Position</label>
                          <select
                            value={editPosition}
                            onChange={e => setEditPosition(e.target.value)}
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="">None</option>
                            {JOIN_POSITIONS.map(pos => (
                              <option key={pos} value={pos}>{pos}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Notes</label>
                      <input
                        type="text"
                        value={editNotes}
                        onChange={e => setEditNotes(e.target.value)}
                        placeholder="Optional notes"
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => setEditingRelId(null)}
                        className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleUpdate(rel.id)}
                        disabled={saving}
                        className="px-2.5 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {saving ? 'Saving\u2026' : 'Save'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {pieceRelationships.length === 0 && !showAddForm && (
        <p className="text-xs text-gray-400 italic">No relationships yet</p>
      )}

      {/* Add Relationship Button / Form */}
      {!showAddForm ? (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full py-1.5 text-xs font-medium text-gray-500 hover:text-blue-600 hover:bg-blue-50 border border-dashed border-gray-300 hover:border-blue-300 rounded-lg transition-colors"
        >
          + Add Relationship
        </button>
      ) : (
        <div className="border border-blue-200 rounded-lg bg-blue-50/30 p-3 space-y-2">
          <h5 className="text-xs font-semibold text-gray-700">Add Relationship</h5>

          {/* Related piece dropdown */}
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Related Piece</label>
            <select
              value={newChildPieceId}
              onChange={e => setNewChildPieceId(e.target.value)}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="">Select a piece</option>
              {availablePieces.map(p => (
                <option key={p.id} value={p.id}>
                  {p.description}{p.room_name ? ` (${p.room_name})` : ''}
                </option>
              ))}
            </select>
            <div className="mt-1 flex items-center gap-2">
              <label className="flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAllRooms}
                  onChange={e => setShowAllRooms(e.target.checked)}
                  className="rounded text-blue-600 h-3 w-3"
                />
                Show all rooms
              </label>
              {newChildPieceId && getPieceRoom(newChildPieceId) !== selectedPieceRoomName && (
                <span className="text-[10px] text-amber-600">
                  Cross-room relationship
                </span>
              )}
            </div>
          </div>

          {/* Type + Position */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Type</label>
              <select
                value={newType}
                onChange={e => setNewType(e.target.value as RelationshipType)}
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                {ALL_RELATIONSHIP_TYPES.map(t => (
                  <option key={t} value={t}>{RELATIONSHIP_DISPLAY[t].label}</option>
                ))}
              </select>
            </div>
            {POSITION_TYPES.includes(newType) && (
              <div>
                <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Position</label>
                <select
                  value={newPosition}
                  onChange={e => setNewPosition(e.target.value)}
                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="">None</option>
                  {JOIN_POSITIONS.map(pos => (
                    <option key={pos} value={pos}>{pos}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Notes (optional)</label>
            <input
              type="text"
              value={newNotes}
              onChange={e => setNewNotes(e.target.value)}
              placeholder="e.g. Mitre join at island corner"
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 justify-end pt-1">
            <button
              onClick={resetAddForm}
              className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={saving || !newChildPieceId}
              className="px-2.5 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving\u2026' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
