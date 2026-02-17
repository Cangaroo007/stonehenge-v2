'use client';

import { useState } from 'react';

interface RoomOption {
  id: number;
  name: string;
}

interface MaterialOption {
  id: number;
  name: string;
  collection?: string | null;
}

interface EdgeProfileOption {
  id: string;
  name: string;
}

interface ThicknessOption {
  id: string;
  name: string;
  value: number;
}

export interface MultiSelectToolbarProps {
  selectedCount: number;
  rooms: RoomOption[];
  materials: MaterialOption[];
  edgeProfiles: EdgeProfileOption[];
  thicknessOptions: ThicknessOption[];
  onBatchMaterial: (materialId: number) => void;
  onBatchThickness: (thicknessMm: number) => void;
  onBatchEdges: (edges: { top?: string | null; bottom?: string | null; left?: string | null; right?: string | null }) => void;
  onBatchMove: (targetRoomId: number | null, newRoomName?: string) => void;
  onBatchDelete: () => void;
  onClearSelection: () => void;
}

export default function MultiSelectToolbar({
  selectedCount,
  rooms,
  materials,
  edgeProfiles,
  thicknessOptions,
  onBatchMaterial,
  onBatchThickness,
  onBatchEdges,
  onBatchMove,
  onBatchDelete,
  onClearSelection,
}: MultiSelectToolbarProps) {
  const [showEdgeDropdown, setShowEdgeDropdown] = useState(false);
  const [edgeSide, setEdgeSide] = useState<'all' | 'top' | 'bottom' | 'left' | 'right'>('all');
  const [showMoveDropdown, setShowMoveDropdown] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [newRoomInput, setNewRoomInput] = useState('');
  const [showNewRoomInput, setShowNewRoomInput] = useState(false);

  if (selectedCount < 2) return null;

  const handleEdgeSelect = (profileId: string | null) => {
    if (edgeSide === 'all') {
      onBatchEdges({ top: profileId, bottom: profileId, left: profileId, right: profileId });
    } else {
      onBatchEdges({ [edgeSide]: profileId });
    }
    setShowEdgeDropdown(false);
  };

  const handleMoveToRoom = (roomId: number) => {
    onBatchMove(roomId);
    setShowMoveDropdown(false);
  };

  const handleNewRoom = () => {
    if (newRoomInput.trim()) {
      onBatchMove(null, newRoomInput.trim());
      setNewRoomInput('');
      setShowNewRoomInput(false);
      setShowMoveDropdown(false);
    }
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-white border border-gray-200 rounded-xl shadow-xl px-4 py-2.5 flex items-center gap-3 text-sm">
      {/* Selection count */}
      <span className="font-semibold text-blue-700 whitespace-nowrap">
        {selectedCount} selected
      </span>

      <div className="w-px h-6 bg-gray-200" />

      {/* Material */}
      <div className="relative">
        <select
          value=""
          onChange={e => {
            if (e.target.value) onBatchMaterial(parseInt(e.target.value));
          }}
          className="px-2 py-1 text-xs border border-gray-200 rounded-md bg-white text-gray-700 hover:border-gray-300 cursor-pointer"
        >
          <option value="">Material</option>
          {materials.map(m => (
            <option key={m.id} value={m.id}>
              {m.name}{m.collection ? ` (${m.collection})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Thickness */}
      <div className="relative">
        <select
          value=""
          onChange={e => {
            if (e.target.value) onBatchThickness(parseInt(e.target.value));
          }}
          className="px-2 py-1 text-xs border border-gray-200 rounded-md bg-white text-gray-700 hover:border-gray-300 cursor-pointer"
        >
          <option value="">Thickness</option>
          {thicknessOptions.map(t => (
            <option key={t.id} value={t.value}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Edges */}
      <div className="relative">
        <button
          onClick={() => setShowEdgeDropdown(!showEdgeDropdown)}
          className="px-2 py-1 text-xs border border-gray-200 rounded-md bg-white text-gray-700 hover:border-gray-300"
        >
          Edges
        </button>
        {showEdgeDropdown && (
          <div className="absolute bottom-full mb-1 left-0 bg-white border border-gray-200 rounded-lg shadow-lg p-2 w-48 space-y-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Apply to</label>
              <select
                value={edgeSide}
                onChange={e => setEdgeSide(e.target.value as typeof edgeSide)}
                className="w-full px-2 py-1 text-xs border border-gray-200 rounded"
              >
                <option value="all">All edges</option>
                <option value="top">Top only</option>
                <option value="bottom">Bottom only</option>
                <option value="left">Left only</option>
                <option value="right">Right only</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Profile</label>
              <div className="space-y-0.5 max-h-32 overflow-y-auto">
                <button
                  onClick={() => handleEdgeSelect(null)}
                  className="w-full text-left px-2 py-1 text-xs text-gray-500 hover:bg-gray-50 rounded"
                >
                  Raw (no finish)
                </button>
                {edgeProfiles.map(ep => (
                  <button
                    key={ep.id}
                    onClick={() => handleEdgeSelect(ep.id)}
                    className="w-full text-left px-2 py-1 text-xs text-gray-700 hover:bg-blue-50 rounded"
                  >
                    {ep.name}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => setShowEdgeDropdown(false)}
              className="w-full text-[10px] text-gray-400 hover:text-gray-600 pt-1"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Move room */}
      <div className="relative">
        <button
          onClick={() => setShowMoveDropdown(!showMoveDropdown)}
          className="px-2 py-1 text-xs border border-gray-200 rounded-md bg-white text-gray-700 hover:border-gray-300"
        >
          Move
        </button>
        {showMoveDropdown && (
          <div className="absolute bottom-full mb-1 left-0 bg-white border border-gray-200 rounded-lg shadow-lg p-2 w-48 space-y-0.5">
            <div className="text-[10px] font-medium text-gray-500 px-2 pb-1">Move to room</div>
            {rooms.map(r => (
              <button
                key={r.id}
                onClick={() => handleMoveToRoom(r.id)}
                className="w-full text-left px-2 py-1 text-xs text-gray-700 hover:bg-blue-50 rounded"
              >
                {r.name}
              </button>
            ))}
            <div className="border-t border-gray-100 pt-1 mt-1">
              {!showNewRoomInput ? (
                <button
                  onClick={() => setShowNewRoomInput(true)}
                  className="w-full text-left px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
                >
                  + New room...
                </button>
              ) : (
                <div className="flex items-center gap-1 px-1">
                  <input
                    type="text"
                    value={newRoomInput}
                    onChange={e => setNewRoomInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleNewRoom();
                      if (e.key === 'Escape') { setShowNewRoomInput(false); setNewRoomInput(''); }
                    }}
                    placeholder="Room name"
                    className="flex-1 px-1.5 py-0.5 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-blue-500"
                    autoFocus
                  />
                  <button
                    onClick={handleNewRoom}
                    className="px-1.5 py-0.5 text-xs text-white bg-blue-600 rounded hover:bg-blue-700"
                  >
                    Go
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => { setShowMoveDropdown(false); setShowNewRoomInput(false); setNewRoomInput(''); }}
              className="w-full text-[10px] text-gray-400 hover:text-gray-600 pt-1"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Delete */}
      <div className="relative">
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-2 py-1 text-xs border border-red-200 rounded-md bg-white text-red-600 hover:border-red-300 hover:bg-red-50"
          >
            Delete
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <span className="text-xs text-red-600">Delete {selectedCount} pieces?</span>
            <button
              onClick={() => { onBatchDelete(); setShowDeleteConfirm(false); }}
              className="px-2 py-1 text-xs text-white bg-red-600 rounded hover:bg-red-700"
            >
              Confirm
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-2 py-1 text-xs text-gray-500 border border-gray-200 rounded hover:bg-gray-50"
            >
              No
            </button>
          </div>
        )}
      </div>

      <div className="w-px h-6 bg-gray-200" />

      {/* Clear selection */}
      <button
        onClick={onClearSelection}
        className="text-gray-400 hover:text-gray-600 p-1"
        title="Clear selection"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
