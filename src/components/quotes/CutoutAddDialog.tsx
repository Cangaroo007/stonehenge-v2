'use client';

import { useState, useEffect, useRef } from 'react';
import { formatCurrency } from '@/lib/utils';

// ── Interfaces ──────────────────────────────────────────────────────────────

interface CutoutTypeOption {
  id: string;
  name: string;
  baseRate: number;
}

interface CutoutAddDialogProps {
  isOpen: boolean;
  cutoutTypes: CutoutTypeOption[];
  onAdd: (cutoutTypeId: string) => void;
  onClose: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function CutoutAddDialog({
  isOpen,
  cutoutTypes,
  onAdd,
  onClose,
}: CutoutAddDialogProps) {
  const [search, setSearch] = useState('');
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

  // Reset search when opening
  useEffect(() => {
    if (isOpen) setSearch('');
  }, [isOpen]);

  if (!isOpen) return null;

  const filtered = cutoutTypes.filter(
    (ct) => ct.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      ref={ref}
      className="bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-[220px]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 border-b border-gray-100">
        Add Cutout
      </div>

      {/* Search */}
      <div className="px-3 py-1.5 border-b border-gray-100">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search cutout types\u2026"
          className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
          autoFocus
        />
      </div>

      {/* Options */}
      <div className="max-h-[200px] overflow-y-auto">
        {filtered.length === 0 && (
          <div className="px-3 py-2 text-xs text-gray-400 italic">
            No cutout types found
          </div>
        )}
        {filtered.map((ct) => (
          <button
            key={ct.id}
            onClick={() => { onAdd(ct.id); onClose(); }}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-between gap-2"
          >
            <span>{ct.name}</span>
            <span className="text-gray-400 flex-shrink-0">
              {formatCurrency(Number(ct.baseRate))}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
