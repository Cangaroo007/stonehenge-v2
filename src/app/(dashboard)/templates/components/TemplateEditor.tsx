'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import type {
  TemplateData,
  TemplateRoom,
  TemplatePiece,
  TemplateEdge,
  TemplateCutout,
  MaterialRole,
} from '@/lib/types/unit-templates';

const MATERIAL_ROLES: { value: MaterialRole; label: string }[] = [
  { value: 'PRIMARY_BENCHTOP', label: 'Primary Benchtop' },
  { value: 'SECONDARY_BENCHTOP', label: 'Secondary Benchtop' },
  { value: 'SPLASHBACK', label: 'Splashback' },
  { value: 'VANITY', label: 'Vanity' },
  { value: 'LAUNDRY', label: 'Laundry' },
  { value: 'SHOWER_SHELF', label: 'Shower Shelf' },
  { value: 'FEATURE_PANEL', label: 'Feature Panel' },
  { value: 'WINDOW_SILL', label: 'Window Sill' },
  { value: 'CUSTOM', label: 'Custom' },
];

const ROOM_TYPES = ['KITCHEN', 'BATHROOM', 'ENSUITE', 'LAUNDRY', 'OTHER'];

const EDGE_FINISHES: TemplateEdge['finish'][] = ['ARRIS', 'RAW', 'POLISHED', 'LAMINATED', 'MITRED'];

const CUTOUT_TYPES = [
  'UNDERMOUNT_SINK',
  'DROP_IN_SINK',
  'COOKTOP',
  'TAP_HOLE',
  'GPO',
  'BASIN',
  'DRAINER',
];

function createEmptyEdge(): TemplateEdge {
  return { finish: 'ARRIS' };
}

function createEmptyPiece(): TemplatePiece {
  return {
    label: '',
    length_mm: 0,
    width_mm: 0,
    thickness_mm: 20,
    edges: {
      top: createEmptyEdge(),
      bottom: createEmptyEdge(),
      left: createEmptyEdge(),
      right: createEmptyEdge(),
    },
    cutouts: [],
    materialRole: 'PRIMARY_BENCHTOP',
  };
}

function createEmptyRoom(): TemplateRoom {
  return {
    name: '',
    roomType: 'KITCHEN',
    pieces: [createEmptyPiece()],
  };
}

function computeTemplateData(rooms: TemplateRoom[]): TemplateData {
  let totalPieces = 0;
  let totalArea = 0;
  for (const room of rooms) {
    totalPieces += room.pieces.length;
    for (const piece of room.pieces) {
      totalArea += (piece.length_mm * piece.width_mm) / 1_000_000;
    }
  }
  return {
    rooms,
    totalPieces,
    estimatedArea_sqm: Math.round(totalArea * 10000) / 10000,
  };
}

interface TemplateEditorProps {
  templateId?: number;
  initialData?: {
    name: string;
    unitTypeCode: string;
    description: string;
    templateData: TemplateData;
  };
}

export default function TemplateEditor({ templateId, initialData }: TemplateEditorProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(initialData?.name || '');
  const [unitTypeCode, setUnitTypeCode] = useState(initialData?.unitTypeCode || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [rooms, setRooms] = useState<TemplateRoom[]>(
    initialData?.templateData.rooms || [createEmptyRoom()]
  );

  const isEditing = !!templateId;

  function updateRoom(roomIdx: number, updates: Partial<TemplateRoom>) {
    setRooms((prev) => prev.map((r, i) => (i === roomIdx ? { ...r, ...updates } : r)));
  }

  function removeRoom(roomIdx: number) {
    setRooms((prev) => prev.filter((_, i) => i !== roomIdx));
  }

  function addRoom() {
    setRooms((prev) => [...prev, createEmptyRoom()]);
  }

  function updatePiece(roomIdx: number, pieceIdx: number, updates: Partial<TemplatePiece>) {
    setRooms((prev) =>
      prev.map((room, ri) =>
        ri === roomIdx
          ? {
              ...room,
              pieces: room.pieces.map((p, pi) =>
                pi === pieceIdx ? { ...p, ...updates } : p
              ),
            }
          : room
      )
    );
  }

  function removePiece(roomIdx: number, pieceIdx: number) {
    setRooms((prev) =>
      prev.map((room, ri) =>
        ri === roomIdx
          ? { ...room, pieces: room.pieces.filter((_, pi) => pi !== pieceIdx) }
          : room
      )
    );
  }

  function addPiece(roomIdx: number) {
    setRooms((prev) =>
      prev.map((room, ri) =>
        ri === roomIdx ? { ...room, pieces: [...room.pieces, createEmptyPiece()] } : room
      )
    );
  }

  function updateEdge(
    roomIdx: number,
    pieceIdx: number,
    side: 'top' | 'bottom' | 'left' | 'right',
    finish: TemplateEdge['finish']
  ) {
    setRooms((prev) =>
      prev.map((room, ri) =>
        ri === roomIdx
          ? {
              ...room,
              pieces: room.pieces.map((p, pi) =>
                pi === pieceIdx
                  ? {
                      ...p,
                      edges: {
                        ...p.edges,
                        [side]: { finish, profileType: finish === 'RAW' ? undefined : 'PENCIL_ROUND' },
                      },
                    }
                  : p
              ),
            }
          : room
      )
    );
  }

  function addCutout(roomIdx: number, pieceIdx: number) {
    setRooms((prev) =>
      prev.map((room, ri) =>
        ri === roomIdx
          ? {
              ...room,
              pieces: room.pieces.map((p, pi) =>
                pi === pieceIdx
                  ? { ...p, cutouts: [...p.cutouts, { type: 'UNDERMOUNT_SINK', quantity: 1 }] }
                  : p
              ),
            }
          : room
      )
    );
  }

  function updateCutout(
    roomIdx: number,
    pieceIdx: number,
    cutoutIdx: number,
    updates: Partial<TemplateCutout>
  ) {
    setRooms((prev) =>
      prev.map((room, ri) =>
        ri === roomIdx
          ? {
              ...room,
              pieces: room.pieces.map((p, pi) =>
                pi === pieceIdx
                  ? {
                      ...p,
                      cutouts: p.cutouts.map((c, ci) =>
                        ci === cutoutIdx ? { ...c, ...updates } : c
                      ),
                    }
                  : p
              ),
            }
          : room
      )
    );
  }

  function removeCutout(roomIdx: number, pieceIdx: number, cutoutIdx: number) {
    setRooms((prev) =>
      prev.map((room, ri) =>
        ri === roomIdx
          ? {
              ...room,
              pieces: room.pieces.map((p, pi) =>
                pi === pieceIdx
                  ? { ...p, cutouts: p.cutouts.filter((_, ci) => ci !== cutoutIdx) }
                  : p
              ),
            }
          : room
      )
    );
  }

  async function handleSave() {
    // Validate
    if (!name.trim()) {
      toast.error('Template name is required');
      return;
    }
    if (!unitTypeCode.trim()) {
      toast.error('Unit type code is required');
      return;
    }
    if (rooms.length === 0) {
      toast.error('At least one room is required');
      return;
    }

    for (let ri = 0; ri < rooms.length; ri++) {
      const room = rooms[ri];
      if (!room.name.trim()) {
        toast.error(`Room ${ri + 1} needs a name`);
        return;
      }
      if (room.pieces.length === 0) {
        toast.error(`Room "${room.name}" needs at least one piece`);
        return;
      }
      for (let pi = 0; pi < room.pieces.length; pi++) {
        const piece = room.pieces[pi];
        if (!piece.label.trim()) {
          toast.error(`Piece ${pi + 1} in "${room.name}" needs a name`);
          return;
        }
        if (piece.length_mm <= 0 || piece.width_mm <= 0) {
          toast.error(`Piece "${piece.label}" in "${room.name}" needs valid dimensions`);
          return;
        }
      }
    }

    const templateData = computeTemplateData(rooms);

    setSaving(true);
    try {
      const url = isEditing ? `/api/templates/${templateId}` : '/api/templates';
      const method = isEditing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          unitTypeCode: unitTypeCode.trim(),
          description: description.trim() || null,
          templateData,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save template');
      }

      toast.success(isEditing ? 'Template updated' : 'Template created');
      router.push('/templates');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!templateId) return;
    if (!confirm('Are you sure you want to delete this template?')) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/templates/${templateId}`, { method: 'DELETE' });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete template');
      }
      toast.success('Template deleted');
      router.push('/templates');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete template');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Template metadata */}
      <div className="card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Template Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Name *</label>
            <input
              type="text"
              className="input"
              placeholder="Type A Kitchen & Wet Areas"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Unit Type Code *</label>
            <input
              type="text"
              className="input"
              placeholder="A"
              value={unitTypeCode}
              onChange={(e) => setUnitTypeCode(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Description</label>
            <input
              type="text"
              className="input"
              placeholder="Optional description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Rooms */}
      {rooms.map((room, roomIdx) => (
        <div key={roomIdx} className="card">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-md flex items-center justify-between">
            <div className="flex items-center gap-4">
              <input
                type="text"
                className="input max-w-xs"
                placeholder="Room name (e.g. Kitchen)"
                value={room.name}
                onChange={(e) => updateRoom(roomIdx, { name: e.target.value })}
              />
              <select
                className="input max-w-xs"
                value={room.roomType}
                onChange={(e) => updateRoom(roomIdx, { roomType: e.target.value })}
              >
                {ROOM_TYPES.map((rt) => (
                  <option key={rt} value={rt}>
                    {rt}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => removeRoom(roomIdx)}
              className="text-red-600 hover:text-red-700 text-sm"
              disabled={rooms.length <= 1}
            >
              Remove Room
            </button>
          </div>

          <div className="p-6 space-y-4">
            {room.pieces.map((piece, pieceIdx) => (
              <div key={pieceIdx} className="border border-gray-200 rounded-md p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    Piece {pieceIdx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removePiece(roomIdx, pieceIdx)}
                    className="text-red-600 hover:text-red-700 text-xs"
                    disabled={room.pieces.length <= 1}
                  >
                    Remove
                  </button>
                </div>

                {/* Piece basics */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="col-span-2 md:col-span-1">
                    <label className="label">Name *</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Benchtop"
                      value={piece.label}
                      onChange={(e) =>
                        updatePiece(roomIdx, pieceIdx, { label: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="label">Length (mm) *</label>
                    <input
                      type="number"
                      className="input"
                      placeholder="3000"
                      value={piece.length_mm || ''}
                      onChange={(e) =>
                        updatePiece(roomIdx, pieceIdx, {
                          length_mm: parseInt(e.target.value, 10) || 0,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="label">Width (mm) *</label>
                    <input
                      type="number"
                      className="input"
                      placeholder="600"
                      value={piece.width_mm || ''}
                      onChange={(e) =>
                        updatePiece(roomIdx, pieceIdx, {
                          width_mm: parseInt(e.target.value, 10) || 0,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="label">Thickness</label>
                    <select
                      className="input"
                      value={piece.thickness_mm}
                      onChange={(e) =>
                        updatePiece(roomIdx, pieceIdx, {
                          thickness_mm: parseInt(e.target.value, 10),
                        })
                      }
                    >
                      <option value={20}>20mm</option>
                      <option value={40}>40mm</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Material Role</label>
                    <select
                      className="input"
                      value={piece.materialRole}
                      onChange={(e) =>
                        updatePiece(roomIdx, pieceIdx, {
                          materialRole: e.target.value as MaterialRole,
                        })
                      }
                    >
                      {MATERIAL_ROLES.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Edges */}
                <div>
                  <label className="label">Edges</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {(['top', 'bottom', 'left', 'right'] as const).map((side) => (
                      <div key={side}>
                        <span className="text-xs text-gray-500 capitalize">{side}</span>
                        <select
                          className="input"
                          value={piece.edges[side].finish}
                          onChange={(e) =>
                            updateEdge(
                              roomIdx,
                              pieceIdx,
                              side,
                              e.target.value as TemplateEdge['finish']
                            )
                          }
                        >
                          {EDGE_FINISHES.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cutouts */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="label mb-0">Cutouts</label>
                    <button
                      type="button"
                      onClick={() => addCutout(roomIdx, pieceIdx)}
                      className="text-primary-600 hover:text-primary-700 text-xs"
                    >
                      + Add Cutout
                    </button>
                  </div>
                  {piece.cutouts.length === 0 ? (
                    <p className="text-xs text-gray-400">No cutouts</p>
                  ) : (
                    <div className="space-y-2">
                      {piece.cutouts.map((cutout, cutoutIdx) => (
                        <div key={cutoutIdx} className="flex items-center gap-2">
                          <select
                            className="input flex-1"
                            value={cutout.type}
                            onChange={(e) =>
                              updateCutout(roomIdx, pieceIdx, cutoutIdx, {
                                type: e.target.value,
                              })
                            }
                          >
                            {CUTOUT_TYPES.map((ct) => (
                              <option key={ct} value={ct}>
                                {ct.replace(/_/g, ' ')}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            className="input w-20"
                            min={1}
                            value={cutout.quantity}
                            onChange={(e) =>
                              updateCutout(roomIdx, pieceIdx, cutoutIdx, {
                                quantity: parseInt(e.target.value, 10) || 1,
                              })
                            }
                          />
                          <button
                            type="button"
                            onClick={() => removeCutout(roomIdx, pieceIdx, cutoutIdx)}
                            className="text-red-600 hover:text-red-700 text-xs"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => addPiece(roomIdx)}
              className="btn-secondary text-sm"
            >
              + Add Piece
            </button>
          </div>
        </div>
      ))}

      <button type="button" onClick={addRoom} className="btn-secondary">
        + Add Room
      </button>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="btn-secondary"
          disabled={saving}
        >
          Cancel
        </button>
        <button type="button" onClick={handleSave} className="btn-primary" disabled={saving}>
          {saving ? 'Saving...' : isEditing ? 'Update Template' : 'Create Template'}
        </button>
        {isEditing && (
          <button
            type="button"
            onClick={handleDelete}
            className="btn-danger ml-auto"
            disabled={saving}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
