'use client';

import { useEffect, useRef } from 'react';

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
}: EdgeProfilePopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={ref}
      className="absolute bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-[180px]"
      style={{ left: position.x, top: position.y }}
      onClick={(e) => e.stopPropagation()}
    >
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
        onClick={() => { onSelect(null); onClose(); }}
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
              onSelect(profile.id);
              onClose();
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
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getProfileColour(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('pencil')) return 'bg-blue-500';
  if (lower.includes('bullnose')) return 'bg-green-500';
  if (lower.includes('ogee')) return 'bg-purple-500';
  if (lower.includes('mitr')) return 'bg-orange-500';
  if (lower.includes('bevel')) return 'bg-teal-500';
  return 'bg-gray-400';
}
