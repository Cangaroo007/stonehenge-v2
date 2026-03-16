'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ── Internal types ──────────────────────────────────────────────────────────

interface LocalPiece {
  id: string;
  description: string;
  lengthMm: string;
  widthMm: string;
  thicknessMm: number;
  edgeTop: string | null;
  edgeBottom: string | null;
  edgeLeft: string | null;
  edgeRight: string | null;
}

interface LocalRoom {
  id: string;
  name: string;
  pieces: LocalPiece[];
}

interface BlankQuoteBuilderProps {
  customerId?: number;
}

// ── Component ───────────────────────────────────────────────────────────────

export function BlankQuoteBuilder({ customerId }: BlankQuoteBuilderProps) {
  const router = useRouter();

  const [projectName, setProjectName] = useState('Untitled Quote');
  const [rooms, setRooms] = useState<LocalRoom[]>([]);
  const [edgeTypes, setEdgeTypes] = useState<{ id: string; name: string }[]>([]);
  const [hasSaved, setHasSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fetch edge types on mount
  useEffect(() => {
    fetch('/api/admin/pricing/edge-types')
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        if (Array.isArray(data)) {
          setEdgeTypes(data.map((et: { id: string; name: string }) => ({ id: et.id, name: et.name })));
        }
      })
      .catch(() => {});
  }, []);

  // Default edge: Raw edge type ID, or null
  const rawEdgeId = edgeTypes.find(et => et.name.toLowerCase().includes('raw'))?.id ?? null;

  // ── Room/piece helpers ──────────────────────────────────────────────────

  const addRoom = useCallback(() => {
    setRooms(prev => [...prev, {
      id: Date.now().toString(),
      name: `Room ${prev.length + 1}`,
      pieces: [],
    }]);
  }, []);

  const removeRoom = useCallback((roomId: string) => {
    setRooms(prev => prev.filter(r => r.id !== roomId));
  }, []);

  const addPiece = useCallback((roomId: string) => {
    setRooms(prev => prev.map(r => {
      if (r.id !== roomId) return r;
      return {
        ...r,
        pieces: [...r.pieces, {
          id: Date.now().toString(),
          description: 'Piece',
          lengthMm: '',
          widthMm: '',
          thicknessMm: 20,
          edgeTop: rawEdgeId,
          edgeBottom: rawEdgeId,
          edgeLeft: rawEdgeId,
          edgeRight: rawEdgeId,
        }],
      };
    }));
  }, [rawEdgeId]);

  const removePiece = useCallback((roomId: string, pieceId: string) => {
    setRooms(prev => prev.map(r => {
      if (r.id !== roomId) return r;
      return { ...r, pieces: r.pieces.filter(p => p.id !== pieceId) };
    }));
  }, []);

  const updatePiece = useCallback((roomId: string, pieceId: string, field: string, value: unknown) => {
    setRooms(prev => prev.map(r => {
      if (r.id !== roomId) return r;
      return {
        ...r,
        pieces: r.pieces.map(p => p.id === pieceId ? { ...p, [field]: value } : p),
      };
    }));
  }, []);

  const updateRoom = useCallback((roomId: string, field: string, value: unknown) => {
    setRooms(prev => prev.map(r => r.id === roomId ? { ...r, [field]: value } : r));
  }, []);

  // ── Deferred save ──────────────────────────────────────────────────────

  const triggerSave = useCallback(async () => {
    setSaving(true);
    setHasSaved(true);
    try {
      const url = customerId
        ? `/api/quotes/create-draft?customerId=${customerId}`
        : '/api/quotes/create-draft';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: projectName || 'Untitled Quote',
          rooms: rooms.map((room, ri) => ({
            name: room.name,
            sortOrder: ri,
            pieces: room.pieces.map((piece, pi) => ({
              description: piece.description || 'Piece',
              lengthMm: parseFloat(piece.lengthMm) || 0,
              widthMm: parseFloat(piece.widthMm) || 0,
              thicknessMm: piece.thicknessMm,
              sortOrder: pi,
              edgeTop: piece.edgeTop,
              edgeBottom: piece.edgeBottom,
              edgeLeft: piece.edgeLeft,
              edgeRight: piece.edgeRight,
            })),
          })),
        }),
      });
      if (!res.ok) throw new Error('Failed to save draft');
      const data = await res.json();
      router.replace(`/quotes/${data.id}?mode=edit`);
    } catch (err) {
      console.error('Failed to save blank quote draft:', err);
      setHasSaved(false);
      setSaving(false);
    }
  }, [projectName, rooms, customerId, router]);

  // Threshold check
  useEffect(() => {
    if (hasSaved || saving) return;

    const thresholdMet = rooms.some(room =>
      room.pieces.some(piece => {
        const hasFullDimensions =
          parseFloat(piece.lengthMm) > 0 && parseFloat(piece.widthMm) > 0;
        const hasEdgeApplied = [
          piece.edgeTop, piece.edgeBottom, piece.edgeLeft, piece.edgeRight,
        ].some(edgeId => {
          if (!edgeId) return false;
          const edgeType = edgeTypes.find(et => et.id === edgeId);
          return edgeType && !edgeType.name.toLowerCase().includes('raw');
        });
        return hasFullDimensions || hasEdgeApplied;
      })
    );

    if (thresholdMet) triggerSave();
  }, [rooms, edgeTypes, hasSaved, saving, triggerSave]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-6">
      {/* Project name + saving indicator */}
      <div className="flex items-center gap-4">
        <input
          type="text"
          value={projectName}
          onChange={e => setProjectName(e.target.value)}
          className="text-2xl font-bold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-primary-500 focus:outline-none px-1 py-0.5 flex-1"
          placeholder="Project name"
        />
        {saving && (
          <span className="text-sm text-gray-400 flex items-center gap-1 flex-shrink-0">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            Saving...
          </span>
        )}
      </div>

      {/* Add Room button */}
      <button
        onClick={addRoom}
        className="px-4 py-2 text-sm font-medium text-primary-600 border border-primary-300 rounded-lg hover:bg-primary-50 transition-colors"
      >
        + Add Room
      </button>

      {/* Rooms */}
      {rooms.map(room => (
        <div key={room.id} className="card overflow-hidden">
          {/* Room header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
            <input
              type="text"
              value={room.name}
              onChange={e => updateRoom(room.id, 'name', e.target.value)}
              className="text-sm font-semibold text-gray-800 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-primary-500 focus:outline-none px-1"
            />
            <button
              onClick={() => removeRoom(room.id)}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Remove room
            </button>
          </div>

          {/* Pieces */}
          <div className="p-4 space-y-4">
            {room.pieces.map(piece => (
              <div key={piece.id} className="border border-gray-200 rounded-lg p-3 space-y-3">
                {/* Piece name + dimensions row */}
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Piece name</label>
                    <input
                      type="text"
                      value={piece.description}
                      onChange={e => updatePiece(room.id, piece.id, 'description', e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Length (mm)</label>
                    <input
                      type="number"
                      value={piece.lengthMm}
                      onChange={e => updatePiece(room.id, piece.id, 'lengthMm', e.target.value)}
                      placeholder="e.g. 2400"
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Width (mm)</label>
                    <input
                      type="number"
                      value={piece.widthMm}
                      onChange={e => updatePiece(room.id, piece.id, 'widthMm', e.target.value)}
                      placeholder="e.g. 600"
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Thickness</label>
                    <select
                      value={piece.thicknessMm}
                      onChange={e => updatePiece(room.id, piece.id, 'thicknessMm', parseInt(e.target.value))}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                    >
                      <option value={20}>20mm</option>
                      <option value={30}>30mm</option>
                      <option value={40}>40mm</option>
                    </select>
                  </div>
                </div>

                {/* Edge profiles row */}
                <div className="grid grid-cols-4 gap-2">
                  {(['edgeTop', 'edgeBottom', 'edgeLeft', 'edgeRight'] as const).map(edgeKey => {
                    const label = edgeKey.replace('edge', '');
                    return (
                      <div key={edgeKey}>
                        <label className="block text-xs text-gray-500 mb-1">{label}</label>
                        <select
                          value={piece[edgeKey] ?? ''}
                          onChange={e => updatePiece(room.id, piece.id, edgeKey, e.target.value || null)}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                        >
                          <option value="">None</option>
                          {edgeTypes.map(et => (
                            <option key={et.id} value={et.id}>{et.name}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>

                {/* Remove piece */}
                <div className="flex justify-end">
                  <button
                    onClick={() => removePiece(room.id, piece.id)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove piece
                  </button>
                </div>
              </div>
            ))}

            {/* Add piece button */}
            <button
              onClick={() => addPiece(room.id)}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              + Add Piece
            </button>
          </div>
        </div>
      ))}

      {rooms.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg mb-2">Start by adding a room</p>
          <p className="text-sm">Click &quot;+ Add Room&quot; above to begin building your quote</p>
        </div>
      )}
    </div>
  );
}
