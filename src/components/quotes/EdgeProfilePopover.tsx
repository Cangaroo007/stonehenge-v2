'use client';

import { useEffect, useRef, useState } from 'react';

// ── Edge Scope Type ─────────────────────────────────────────────────────────

export type EdgeScope =
  | { type: 'edge' }
  | { type: 'piece-side'; side: string }
  | { type: 'piece-all' }
  | { type: 'room-side'; side: string; roomId: string }
  | { type: 'room-all'; roomId: string }
  | { type: 'quote-side'; side: string }
  | { type: 'quote-all' };

// ── Interfaces ──────────────────────────────────────────────────────────────

interface EdgeTypeOption {
  id: string;
  name: string;
  code?: string;
}

interface EdgeProfilePopoverProps {
  isOpen: boolean;
  position: { x: number; y: number };
  currentProfileId: string | null;
  profiles: EdgeTypeOption[];
  isMitred?: boolean;
  onSelect: (profileId: string | null) => void;
  onClose: () => void;
  /** Enable scope selector — when provided, selecting a profile shows scope options */
  side?: string;
  roomName?: string;
  roomId?: string;
  onApplyWithScope?: (profileId: string | null, scope: EdgeScope) => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function EdgeProfilePopover({
  isOpen,
  position,
  currentProfileId,
  profiles,
  isMitred = false,
  onSelect,
  onClose,
  side,
  roomName,
  roomId,
  onApplyWithScope,
}: EdgeProfilePopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [selectedProfile, setSelectedProfile] = useState<{ id: string | null; name: string } | null>(null);
  const [selectedScope, setSelectedScope] = useState<string>('edge');
  const hasScopeSelector = !!onApplyWithScope && !!side;

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
        setSelectedProfile(null);
        setSelectedScope('edge');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose]);

  // Reset state when popover opens/closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedProfile(null);
      setSelectedScope('edge');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleProfileClick = (profileId: string | null, profileName: string) => {
    if (hasScopeSelector) {
      // Show scope selector instead of immediately applying
      setSelectedProfile({ id: profileId, name: profileName });
      setSelectedScope('edge');
    } else {
      // No scope selector — apply immediately (backwards compatible)
      onSelect(profileId);
      onClose();
    }
  };

  const handleApplyWithScope = () => {
    if (!selectedProfile || !onApplyWithScope || !side) return;

    const scope = buildScope(selectedScope, side, roomId);
    onApplyWithScope(selectedProfile.id, scope);
    setSelectedProfile(null);
    setSelectedScope('edge');
    onClose();
  };

  const sideLabel = side ? side.charAt(0).toUpperCase() + side.slice(1).toLowerCase() : '';
  const roomLabel = roomName || 'Room';

  return (
    <div
      ref={ref}
      className="absolute bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-[180px]"
      style={{ left: position.x, top: position.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* ── Profile Selection ──────────────────────────────────── */}
      {!selectedProfile && (
        <>
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 border-b border-gray-100">
            Edge Profile
          </div>

          {isMitred && (
            <div className="px-3 py-1.5 text-xs text-amber-600 bg-amber-50 border-b border-gray-100">
              Mitred edges use Pencil Round profile only.
            </div>
          )}

          {/* Raw / No finish option */}
          <button
            onClick={() => handleProfileClick(null, 'Raw')}
            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors flex items-center gap-2 ${
              currentProfileId === null ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
            Raw (no finish)
          </button>

          {profiles.map((profile) => {
            const disabled = isMitred && !profile.name.toLowerCase().includes('pencil');
            return (
              <button
                key={profile.id}
                onClick={() => {
                  if (disabled) return;
                  handleProfileClick(profile.id, profile.name);
                }}
                disabled={disabled}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${
                  disabled
                    ? 'text-gray-300 cursor-not-allowed'
                    : currentProfileId === profile.id
                      ? 'bg-blue-50 text-blue-700 font-medium hover:bg-blue-100'
                      : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    getProfileColour(profile.name)
                  }`}
                />
                {profile.name}
              </button>
            );
          })}
        </>
      )}

      {/* ── Scope Selector (shown after profile selection) ───── */}
      {selectedProfile && hasScopeSelector && (
        <div className="min-w-[260px]">
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 border-b border-gray-100 flex items-center justify-between">
            <span>Profile: {selectedProfile.name}</span>
            <button
              onClick={() => setSelectedProfile(null)}
              className="text-[10px] text-blue-600 hover:text-blue-800"
            >
              Change
            </button>
          </div>

          <div className="px-3 pt-2 pb-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            Apply to:
          </div>

          <div className="px-2 py-1 space-y-0.5">
            <ScopeRadio
              value="edge"
              label="This edge only"
              selected={selectedScope}
              onSelect={setSelectedScope}
            />
            <ScopeRadio
              value="piece-side"
              label={`All ${sideLabel.toLowerCase()} edges on this piece`}
              selected={selectedScope}
              onSelect={setSelectedScope}
            />
            <ScopeRadio
              value="piece-all"
              label="All edges on this piece"
              selected={selectedScope}
              onSelect={setSelectedScope}
            />
            {roomId && (
              <>
                <ScopeRadio
                  value="room-side"
                  label={`All ${sideLabel.toLowerCase()} edges in ${roomLabel}`}
                  selected={selectedScope}
                  onSelect={setSelectedScope}
                />
                <ScopeRadio
                  value="room-all"
                  label={`All edges in ${roomLabel}`}
                  selected={selectedScope}
                  onSelect={setSelectedScope}
                />
              </>
            )}
            <ScopeRadio
              value="quote-side"
              label={`All ${sideLabel.toLowerCase()} edges in quote`}
              selected={selectedScope}
              onSelect={setSelectedScope}
            />
            <ScopeRadio
              value="quote-all"
              label="All edges in quote"
              selected={selectedScope}
              onSelect={setSelectedScope}
            />
          </div>

          <div className="px-3 py-2 border-t border-gray-100 mt-1">
            <button
              onClick={handleApplyWithScope}
              className="w-full px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Scope Radio Button ──────────────────────────────────────────────────────

function ScopeRadio({
  value,
  label,
  selected,
  onSelect,
}: {
  value: string;
  label: string;
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 px-1 py-1 rounded hover:bg-gray-50 cursor-pointer transition-colors">
      <input
        type="radio"
        name="edge-scope"
        value={value}
        checked={selected === value}
        onChange={() => onSelect(value)}
        className="w-3 h-3 text-blue-600 border-gray-300 focus:ring-blue-500"
      />
      <span className="text-xs text-gray-700">{label}</span>
    </label>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildScope(scopeKey: string, side: string, roomId?: string): EdgeScope {
  switch (scopeKey) {
    case 'edge':
      return { type: 'edge' };
    case 'piece-side':
      return { type: 'piece-side', side };
    case 'piece-all':
      return { type: 'piece-all' };
    case 'room-side':
      return { type: 'room-side', side, roomId: roomId || '' };
    case 'room-all':
      return { type: 'room-all', roomId: roomId || '' };
    case 'quote-side':
      return { type: 'quote-side', side };
    case 'quote-all':
      return { type: 'quote-all' };
    default:
      return { type: 'edge' };
  }
}

function getProfileColour(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('pencil')) return 'bg-blue-500';
  if (lower.includes('bullnose')) return 'bg-green-500';
  if (lower.includes('ogee')) return 'bg-purple-500';
  if (lower.includes('mitr')) return 'bg-orange-500';
  if (lower.includes('bevel')) return 'bg-teal-500';
  return 'bg-gray-400';
}
