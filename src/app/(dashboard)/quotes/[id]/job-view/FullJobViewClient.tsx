'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { groupPiecesForJobView } from '@/lib/services/piece-grouping';
import type { PieceGroup, QuotePieceInput, RoomInput } from '@/lib/types/piece-groups';
import { formatCurrency } from '@/lib/utils';
import MiniSpatialDiagram from '@/components/quotes/MiniSpatialDiagram';
import type { MaterialBreakdown } from '@/lib/types/pricing';

// ─── Data shape from server component ────────────────────────────────────────

interface PieceData {
  id: number;
  name: string;
  roomId: number;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  areaSqm: number;
  materialCost: number;
  featuresCost: number;
  totalCost: number;
  edgeTop: string | null;
  edgeBottom: string | null;
  edgeLeft: string | null;
  edgeRight: string | null;
  materialId: number | null;
  materialName: string | null;
  laminationMethod: string;
  waterfallHeightMm: number | null;
  sortOrder: number;
  sourceRelationships: Array<{
    id: number;
    sourcePieceId: number;
    targetPieceId: number;
    relationType: string;
    side: string | null;
  }>;
  targetRelationships: Array<{
    id: number;
    sourcePieceId: number;
    targetPieceId: number;
    relationType: string;
    side: string | null;
  }>;
}

interface RoomData {
  id: number;
  name: string;
  sortOrder: number;
}

interface FullJobViewData {
  id: number;
  quoteNumber: string;
  projectName: string | null;
  status: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  customer: { name: string; company: string | null } | null;
  materialBreakdown: MaterialBreakdown | null;
  pieces: PieceData[];
  rooms: RoomData[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a readable group label. */
function groupLabel(group: PieceGroup): string {
  const relatedCount = group.relatedPieces.length;
  if (relatedCount === 0) {
    return `${group.label} — Standalone`;
  }

  const counts = new Map<string, number>();
  for (const rp of group.relatedPieces) {
    const type = rp.relationship;
    counts.set(type, (counts.get(type) || 0) + 1);
  }

  const labels: Record<string, string> = {
    WATERFALL: 'Waterfall',
    SPLASHBACK: 'Splashback',
    RETURN_END: 'Return End',
    WINDOW_SILL: 'Window Sill',
    MITRE_JOIN: 'Mitre Join',
    BUTT_JOIN: 'Butt Join',
    LAMINATION: 'Lamination',
  };

  const parts: string[] = [];
  for (const [type, count] of Array.from(counts.entries())) {
    const name = labels[type] || type;
    parts.push(count > 1 ? `${count} ${name}s` : name);
  }

  return `${group.label} + ${parts.join(' + ')}`;
}

/** Format an edge type ID to a short readable label. */
function formatEdge(edge: string | null): string {
  if (!edge) return 'Raw';
  const lower = edge.toLowerCase();
  if (lower.includes('pencil')) return 'P.Round';
  if (lower.includes('bullnose')) return 'Bullnose';
  if (lower.includes('ogee')) return 'Ogee';
  if (lower.includes('bevel')) return 'Bevel';
  if (lower.includes('mitr')) return 'Mitre';
  if (lower.includes('raw') || lower === 'none') return 'Raw';
  return edge.charAt(0).toUpperCase() + edge.slice(1);
}

// ─── GroupCard ───────────────────────────────────────────────────────────────

function GroupCard({
  group,
  quoteId,
  selectedPieceId,
  onPieceSelect,
  onPieceExpand,
}: {
  group: PieceGroup;
  quoteId: number;
  selectedPieceId?: number;
  onPieceSelect: (pieceId: number) => void;
  onPieceExpand: (pieceId: number) => void;
}) {
  const allPieces = [group.primaryPiece, ...group.relatedPieces];
  const pieceCount = allPieces.length;

  const materialNames = Array.from(
    new Set(allPieces.map((p) => p.material.name).filter(Boolean))
  );

  return (
    <div className="piece-group-card card overflow-hidden">
      {/* Group header */}
      <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-100">
        <h4 className="font-semibold text-zinc-800">{groupLabel(group)}</h4>
      </div>

      {/* Large spatial diagram */}
      <div className="px-4 py-4 flex justify-center">
        <MiniSpatialDiagram
          group={group}
          selectedPieceId={selectedPieceId}
          onPieceClick={onPieceSelect}
          onPieceExpand={onPieceExpand}
          mode="view"
          large
        />
      </div>

      {/* Piece detail table */}
      <div className="px-4 pb-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-zinc-400 uppercase tracking-wide">
              <th className="pb-1.5 pr-2 font-semibold">#</th>
              <th className="pb-1.5 pr-2 font-semibold">Piece</th>
              <th className="pb-1.5 pr-2 font-semibold">Dimensions</th>
              <th className="pb-1.5 pr-2 font-semibold">Material</th>
              <th className="pb-1.5 pr-2 font-semibold">Edges (T | B | L | R)</th>
              <th className="pb-1.5 text-right font-semibold">Cost</th>
            </tr>
          </thead>
          <tbody>
            {allPieces.map((piece, i) => (
              <tr
                key={piece.pieceId}
                className="border-t border-zinc-100 hover:bg-blue-50 cursor-pointer transition-colors"
                onClick={() => onPieceExpand(piece.pieceId)}
                title="Click to open piece detail in new tab"
              >
                <td className="py-1.5 pr-2 font-mono text-zinc-400">{i + 1}</td>
                <td className="py-1.5 pr-2 font-medium text-zinc-800">
                  {piece.pieceName}
                </td>
                <td className="py-1.5 pr-2 text-zinc-600">
                  {piece.dimensions.lengthMm}&times;{piece.dimensions.widthMm}&times;
                  {piece.dimensions.thicknessMm}mm
                </td>
                <td className="py-1.5 pr-2 text-zinc-600">
                  {piece.material.name || '—'}
                </td>
                <td className="py-1.5 pr-2 text-zinc-500 font-mono text-[10px]">
                  {formatEdge(piece.edges.top)} | {formatEdge(piece.edges.bottom)} |{' '}
                  {formatEdge(piece.edges.left)} | {formatEdge(piece.edges.right)}
                </td>
                <td className="py-1.5 text-right text-zinc-800 font-medium">
                  {formatCurrency(piece.cost)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Group summary */}
      <div className="px-4 py-3 border-t border-zinc-100 bg-zinc-50 flex flex-wrap items-center gap-3 text-xs text-zinc-600">
        <span>
          <span className="font-semibold">{pieceCount}</span> piece
          {pieceCount !== 1 ? 's' : ''}
        </span>
        <span className="text-zinc-300">|</span>
        <span>
          <span className="font-semibold">{group.totalArea.toFixed(2)}</span>m&sup2;
        </span>
        <span className="text-zinc-300">|</span>
        <span className="font-semibold">{formatCurrency(group.totalCost)}</span>
        {materialNames.length > 0 && (
          <>
            <span className="text-zinc-300">|</span>
            <span>Material: {materialNames.join(', ')}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function FullJobViewClient({ data }: { data: FullJobViewData }) {
  const [selectedPieceId, setSelectedPieceId] = useState<number | undefined>();

  // Convert to QuotePieceInput[] format for the grouping service
  const quotePieces: QuotePieceInput[] = useMemo(
    () =>
      data.pieces.map((p) => ({
        id: p.id,
        name: p.name,
        room_id: p.roomId,
        length_mm: p.lengthMm,
        width_mm: p.widthMm,
        thickness_mm: p.thicknessMm,
        area_sqm: p.areaSqm,
        material_cost: p.materialCost,
        features_cost: p.featuresCost,
        total_cost: p.totalCost,
        edge_top: p.edgeTop,
        edge_bottom: p.edgeBottom,
        edge_left: p.edgeLeft,
        edge_right: p.edgeRight,
        material_id: p.materialId,
        material_name: p.materialName,
        lamination_method: p.laminationMethod,
        waterfall_height_mm: p.waterfallHeightMm,
        sort_order: p.sortOrder,
        sourceRelationships: p.sourceRelationships ?? [],
        targetRelationships: p.targetRelationships ?? [],
      })),
    [data.pieces]
  );

  const roomInputs: RoomInput[] = useMemo(
    () =>
      data.rooms.map((r) => ({
        id: r.id,
        name: r.name,
        sort_order: r.sortOrder,
      })),
    [data.rooms]
  );

  const groups = useMemo(
    () => groupPiecesForJobView(quotePieces, roomInputs),
    [quotePieces, roomInputs]
  );

  // Group by room for section headings
  const groupsByRoom = useMemo(() => {
    const map = new Map<string, PieceGroup[]>();
    for (const group of groups) {
      const existing = map.get(group.room) || [];
      existing.push(group);
      map.set(group.room, existing);
    }
    return Array.from(map.entries());
  }, [groups]);

  const totalPieces = data.pieces.length;
  const totalArea = data.pieces.reduce((sum, p) => sum + p.areaSqm, 0);
  const totalGroups = groups.length;
  const totalRooms = groupsByRoom.length;

  const handlePieceExpand = (pieceId: number) => {
    window.open(`/quotes/${data.id}/pieces/${pieceId}`, '_blank');
  };

  const handlePrint = () => {
    window.print();
  };

  // Unique materials across all pieces
  const materialSummary = useMemo(() => {
    const materials = new Map<
      string,
      { name: string; area: number; count: number }
    >();
    for (const piece of data.pieces) {
      const name = piece.materialName || 'Unknown';
      const existing = materials.get(name) || { name, area: 0, count: 0 };
      existing.area += piece.areaSqm;
      existing.count += 1;
      materials.set(name, existing);
    }
    return Array.from(materials.values());
  }, [data.pieces]);

  return (
    <div className="min-h-screen bg-zinc-50 job-view-page">
      {/* Header Bar */}
      <div className="no-print sticky top-0 z-10 bg-white border-b border-zinc-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link
            href={`/quotes/${data.id}`}
            className="flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Back to Quote {data.quoteNumber}
          </Link>

          <h1 className="font-semibold text-zinc-900">Complete Job View</h1>

          <button
            onClick={handlePrint}
            className="flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900 px-3 py-1.5 rounded-md hover:bg-zinc-100 transition-colors"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
              />
            </svg>
            Print
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Quote Header */}
        <div className="print-header">
          <h2 className="text-2xl font-bold text-zinc-900">
            QUOTE: {data.quoteNumber}
            {data.projectName ? ` — ${data.projectName}` : ''}
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            {totalPieces} piece{totalPieces !== 1 ? 's' : ''} &middot;{' '}
            {totalGroups} group{totalGroups !== 1 ? 's' : ''} &middot;{' '}
            {totalRooms} room{totalRooms !== 1 ? 's' : ''} &middot;{' '}
            {formatCurrency(data.total)}
          </p>
          {data.customer && (
            <p className="text-xs text-zinc-400 mt-0.5">
              {data.customer.company || data.customer.name}
            </p>
          )}
        </div>

        {/* Room Sections */}
        {groupsByRoom.map(([room, roomGroups]) => (
          <div key={room} className="room-section space-y-4">
            {/* Room heading */}
            <div className="border-b-2 border-zinc-300 pb-1">
              <h3 className="text-lg font-bold uppercase tracking-wide text-zinc-700">
                {room}
              </h3>
            </div>

            {/* Group cards */}
            {roomGroups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                quoteId={data.id}
                selectedPieceId={selectedPieceId}
                onPieceSelect={setSelectedPieceId}
                onPieceExpand={handlePieceExpand}
              />
            ))}
          </div>
        ))}

        {/* Job Summary */}
        <div className="border-t-2 border-zinc-300 pt-6 job-summary">
          <h3 className="text-lg font-bold uppercase tracking-wide text-zinc-700 mb-4">
            Job Summary
          </h3>
          <div className="card p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-sm text-zinc-500">Total Pieces</p>
                <p className="text-xl font-bold text-zinc-900">{totalPieces}</p>
              </div>
              <div>
                <p className="text-sm text-zinc-500">Total Area</p>
                <p className="text-xl font-bold text-zinc-900">
                  {totalArea.toFixed(2)}m&sup2;
                </p>
              </div>
              <div>
                <p className="text-sm text-zinc-500">Materials</p>
                {materialSummary.map((m) => (
                  <p
                    key={m.name}
                    className="text-sm font-medium text-zinc-900"
                  >
                    {m.name} ({m.count} pc, {m.area.toFixed(2)}m&sup2;)
                  </p>
                ))}
              </div>
              <div>
                <p className="text-sm text-zinc-500">Total</p>
                <p className="text-xl font-bold text-zinc-900 cost-summary">
                  {formatCurrency(data.total)}
                </p>
                {data.subtotal !== data.total && (
                  <p className="text-xs text-zinc-400">
                    Subtotal: {formatCurrency(data.subtotal)} + GST:{' '}
                    {formatCurrency(data.taxAmount)}
                  </p>
                )}
              </div>
            </div>

            {/* Per-material breakdown from calculation */}
            {data.materialBreakdown?.byMaterial &&
              data.materialBreakdown.byMaterial.length > 0 && (
                <div className="mt-4 pt-4 border-t border-zinc-100">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                    Material Breakdown
                  </p>
                  <div className="space-y-1">
                    {data.materialBreakdown.byMaterial.map((mat, i) => (
                      <div
                        key={i}
                        className="flex flex-wrap items-center gap-4 text-sm"
                      >
                        <span className="font-medium text-zinc-800">
                          {mat.materialName}
                        </span>
                        <span className="text-zinc-500">
                          {mat.totalAreaM2.toFixed(2)}m&sup2;
                        </span>
                        {mat.slabCount != null && (
                          <span className="text-zinc-500">
                            {mat.slabCount} slab
                            {mat.slabCount !== 1 ? 's' : ''}
                            {mat.slabCountFromOptimiser
                              ? ' (optimised)'
                              : ' (estimated)'}
                          </span>
                        )}
                        <span className="text-zinc-800 font-medium">
                          {formatCurrency(mat.totalCost)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
