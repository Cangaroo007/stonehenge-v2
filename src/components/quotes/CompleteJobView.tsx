'use client';

import { useState, useMemo } from 'react';
import { groupPiecesForJobView } from '@/lib/services/piece-grouping';
import type { PieceGroup, QuotePieceInput, RoomInput } from '@/lib/types/piece-groups';
import { formatCurrency } from '@/lib/utils';
import MiniSpatialDiagram from './MiniSpatialDiagram';

// ─── Props ──────────────────────────────────────────────────────────────────

interface CompleteJobViewProps {
  pieces: QuotePieceInput[];
  rooms: RoomInput[];
  selectedPieceId?: number;
  onPieceSelect: (pieceId: number) => void;
  mode: 'view' | 'edit';
  quoteId: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Generate a readable group label. */
function groupLabel(group: PieceGroup): string {
  const relatedCount = group.relatedPieces.length;
  if (relatedCount === 0) {
    return `${group.label} — Standalone`;
  }

  // Count by relationship type
  const counts = new Map<string, number>();
  for (const rp of group.relatedPieces) {
    const type = rp.relationship;
    counts.set(type, (counts.get(type) || 0) + 1);
  }

  const parts: string[] = [];
  const labels: Record<string, string> = {
    WATERFALL: 'Waterfall',
    SPLASHBACK: 'Splashback',
    RETURN_END: 'Return End',
    WINDOW_SILL: 'Window Sill',
    MITRE_JOIN: 'Mitre Join',
    BUTT_JOIN: 'Butt Join',
    LAMINATION: 'Lamination',
  };

  for (const [type, count] of Array.from(counts.entries())) {
    const name = labels[type] || type;
    parts.push(count > 1 ? `${count} ${name}s` : name);
  }

  return `${group.label} + ${parts.join(' + ')}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function CompleteJobView({
  pieces,
  rooms,
  selectedPieceId,
  onPieceSelect,
  mode,
  quoteId,
}: CompleteJobViewProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const groups = useMemo(
    () => groupPiecesForJobView(pieces, rooms),
    [pieces, rooms]
  );

  const totalPieces = pieces.length;
  const totalGroups = groups.length;

  // Group by room for section headings
  const groupsByRoom = useMemo(() => {
    const map = new Map<string, PieceGroup[]>();
    for (const group of groups) {
      const room = group.room;
      const existing = map.get(room) || [];
      existing.push(group);
      map.set(room, existing);
    }
    return Array.from(map.entries());
  }, [groups]);

  const handlePieceExpand = (pieceId: number) => {
    window.open(`/quotes/${quoteId}/pieces/${pieceId}`, '_blank');
  };

  // Empty state
  if (totalPieces === 0) {
    return (
      <div className="card overflow-hidden">
        <button
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
          disabled
        >
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-primary-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <span className="font-medium text-gray-900">Complete Job View</span>
            <span className="text-xs text-zinc-400">No pieces yet</span>
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      {/* Accordion Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className="h-5 w-5 text-primary-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <span className="font-medium text-gray-900">Complete Job View</span>
          <span className="text-xs font-medium text-primary-700 bg-primary-50 px-2 py-0.5 rounded-full">
            {totalPieces} piece{totalPieces !== 1 ? 's' : ''}
          </span>
          <span className="text-xs font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">
            {totalGroups} group{totalGroups !== 1 ? 's' : ''}
          </span>
        </div>
        <svg
          className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Accordion Content */}
      <div
        className={`transition-all duration-200 ease-in-out overflow-hidden ${
          isExpanded ? 'max-h-[3000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-4 pb-4 space-y-5">
          {groupsByRoom.map(([room, roomGroups]) => (
            <div key={room} className="space-y-3">
              {/* Room heading */}
              <h3 className="font-bold text-xs uppercase tracking-wide text-zinc-500 pt-1">
                {room}
              </h3>

              {/* Group cards */}
              {roomGroups.map((group) => {
                const pieceCount = 1 + group.relatedPieces.length;
                return (
                  <div
                    key={group.id}
                    className="border border-zinc-200 rounded-lg overflow-hidden bg-white"
                  >
                    {/* Group label */}
                    <div className="px-3 py-2 bg-zinc-50 border-b border-zinc-100">
                      <span className="font-semibold text-sm text-zinc-800">
                        {groupLabel(group)}
                      </span>
                    </div>

                    {/* Mini diagram */}
                    <div className="px-3 py-2">
                      <MiniSpatialDiagram
                        group={group}
                        selectedPieceId={selectedPieceId}
                        onPieceClick={onPieceSelect}
                        onPieceExpand={handlePieceExpand}
                        mode={mode}
                      />
                    </div>

                    {/* Summary line */}
                    <div className="px-3 py-2 border-t border-zinc-100 flex items-center gap-3">
                      <span className="text-xs text-zinc-500">
                        {pieceCount} piece{pieceCount !== 1 ? 's' : ''}
                      </span>
                      <span className="text-xs text-zinc-300">|</span>
                      <span className="text-xs text-zinc-500">
                        {formatCurrency(group.totalCost)}
                      </span>
                      <span className="text-xs text-zinc-300">|</span>
                      <span className="text-xs text-zinc-500">
                        {group.totalArea.toFixed(2)}m&sup2;
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
