/**
 * RoomLinearView
 *
 * Print-optimised linear layout for a room's pieces.
 * Pieces are arranged horizontally left-to-right with relationship lines,
 * designed for clean A4 landscape printing.
 */

import { calculateLinearLayout } from '@/lib/services/linear-layout-engine';
import type { LinearPiecePosition } from '@/lib/services/linear-layout-engine';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface QuotePiece {
  id: number;
  description: string | null;
  name: string | null;
  length_mm: number;
  width_mm: number;
  thickness_mm: number;
  piece_type?: string | null;
  area_sqm: number;
  total_cost: number;
  edge_top: string | null;
  edge_bottom: string | null;
  edge_left: string | null;
  edge_right: string | null;
  piece_features?: Array<{ id: number; name: string; quantity: number }>;
}

interface Relationship {
  id: string;
  parentPieceId: string;
  childPieceId: string;
  relationshipType: string;
  joinPosition: string | null;
}

interface RoomLinearViewProps {
  roomName: string;
  pieces: QuotePiece[];
  relationships: Relationship[];
  roomTotal?: number;
  roomNotes?: string | null;
}

// ─── Edge profile abbreviations ──────────────────────────────────────────────

function abbreviateEdge(profile: string | null): string {
  if (!profile) return 'RAW';
  const lower = profile.toLowerCase();
  if (lower.includes('pencil')) return 'PR';
  if (lower.includes('bullnose')) return 'BN';
  if (lower.includes('ogee')) return 'OG';
  if (lower.includes('mitr')) return 'MT';
  if (lower.includes('bevel')) return 'BV';
  if (lower.includes('raw') || lower === 'none') return 'RAW';
  return profile.slice(0, 3).toUpperCase();
}

function hasEdgeProfile(profile: string | null): boolean {
  if (!profile) return false;
  const lower = profile.toLowerCase();
  return lower !== 'raw' && lower !== 'none' && lower !== '';
}

// ─── Relationship display ────────────────────────────────────────────────────

const RELATIONSHIP_COLOURS: Record<string, string> = {
  WATERFALL: '#3B82F6',
  SPLASHBACK: '#10B981',
  RETURN: '#F59E0B',
  WINDOW_SILL: '#8B5CF6',
  MITRE_JOIN: '#EF4444',
  BUTT_JOIN: '#6B7280',
};

const RELATIONSHIP_LABELS: Record<string, string> = {
  WATERFALL: 'Waterfall',
  SPLASHBACK: 'Splashback',
  RETURN: 'Return',
  WINDOW_SILL: 'Window Sill',
  MITRE_JOIN: 'Mitre',
  BUTT_JOIN: 'Butt Join',
};

// ─── Cutout abbreviations ────────────────────────────────────────────────────

function abbreviateCutout(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('undermount') || lower.includes('ums')) return 'UMS';
  if (lower.includes('top mount') || lower.includes('tms')) return 'TMS';
  if (lower.includes('tap hole') || lower.includes('taphole')) return 'TH';
  if (lower.includes('cooktop') || lower.includes('cook top')) return 'CT';
  if (lower.includes('powerpoint') || lower.includes('power point')) return 'PP';
  if (lower.includes('soap')) return 'SD';
  if (lower.includes('drain')) return 'DG';
  return name.slice(0, 3).toUpperCase();
}

// ─── Piece type inference ────────────────────────────────────────────────────

function inferPieceType(piece: QuotePiece): string | null {
  if (piece.piece_type) return piece.piece_type;
  const name = (piece.name ?? piece.description ?? '').toLowerCase();
  if (name.includes('splashback') || name.includes('splash back')) return 'SPLASHBACK';
  if (name.includes('waterfall')) return 'WATERFALL';
  if (name.includes('island')) return 'ISLAND';
  if (name.includes('return')) return 'RETURN';
  if (name.includes('window') || name.includes('sill')) return 'WINDOW_SILL';
  if (name.includes('benchtop') || name.includes('bench top')) return 'BENCHTOP';
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return '$' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RoomLinearView({
  roomName,
  pieces,
  relationships,
  roomTotal,
  roomNotes,
}: RoomLinearViewProps) {
  if (pieces.length === 0) {
    return null;
  }

  // Calculate linear layout
  const layoutPieces = pieces.map(p => ({
    id: String(p.id),
    description: p.name ?? p.description ?? 'Piece',
    length_mm: p.length_mm,
    width_mm: p.width_mm,
    piece_type: inferPieceType(p),
  }));

  const layout = calculateLinearLayout(layoutPieces);

  // Build piece lookup
  const pieceMap = new Map<string, QuotePiece>();
  for (const p of pieces) {
    pieceMap.set(String(p.id), p);
  }

  // Build position lookup
  const positionMap = new Map<string, LinearPiecePosition>();
  for (const pos of layout.pieces) {
    positionMap.set(pos.pieceId, pos);
  }

  // Space for labels above and below pieces
  const labelSpaceAbove = 20;
  const labelSpaceBelow = 50;
  const edgeLabelSpace = 16;
  const connectorSpace = 40;

  const totalViewHeight =
    layout.viewBox.height + labelSpaceAbove + labelSpaceBelow + edgeLabelSpace + connectorSpace;

  return (
    <div
      className="room-linear-view mb-8"
      style={{ pageBreakInside: 'avoid', background: 'white' }}
    >
      {/* Room header */}
      <div className="flex justify-between items-baseline mb-1 border-b border-gray-300 pb-2">
        <h3 className="text-base font-bold text-gray-900">{roomName}</h3>
        <span className="text-sm text-gray-600">
          {pieces.length} piece{pieces.length !== 1 ? 's' : ''}
          {roomTotal != null && ` — ${formatCurrency(roomTotal)}`}
        </span>
      </div>
      {roomNotes && (
        <p className="text-xs text-gray-500 mb-2">{roomNotes}</p>
      )}

      {/* SVG canvas */}
      <svg
        viewBox={`0 0 ${layout.viewBox.width} ${totalViewHeight}`}
        className="w-full h-auto"
        style={{ maxWidth: '100%', background: 'white' }}
      >
        {/* Relationship connector lines */}
        {relationships.map(rel => {
          const parentPos = positionMap.get(rel.parentPieceId);
          const childPos = positionMap.get(rel.childPieceId);
          if (!parentPos || !childPos) return null;

          const colour = RELATIONSHIP_COLOURS[rel.relationshipType] ?? '#6B7280';
          const label = RELATIONSHIP_LABELS[rel.relationshipType] ?? rel.relationshipType;

          // Draw straight line from parent center-bottom to child center-bottom
          const parentCx = parentPos.x + parentPos.width / 2;
          const parentBottom = parentPos.y + parentPos.height + labelSpaceAbove;
          const childCx = childPos.x + childPos.width / 2;
          const childBottom = childPos.y + childPos.height + labelSpaceAbove;

          // Connector curves below the pieces
          const connectorY = Math.max(parentBottom, childBottom) + labelSpaceBelow + 10;
          const midX = (parentCx + childCx) / 2;

          return (
            <g key={rel.id}>
              {/* Line down from parent */}
              <line
                x1={parentCx}
                y1={parentBottom}
                x2={parentCx}
                y2={connectorY}
                stroke={colour}
                strokeWidth={1.5}
                strokeDasharray="4,2"
              />
              {/* Horizontal connector */}
              <line
                x1={parentCx}
                y1={connectorY}
                x2={childCx}
                y2={connectorY}
                stroke={colour}
                strokeWidth={1.5}
                strokeDasharray="4,2"
              />
              {/* Line up to child */}
              <line
                x1={childCx}
                y1={connectorY}
                x2={childCx}
                y2={childBottom}
                stroke={colour}
                strokeWidth={1.5}
                strokeDasharray="4,2"
              />
              {/* Arrow on child end */}
              <polygon
                points={`${childCx},${childBottom} ${childCx - 4},${childBottom + 6} ${childCx + 4},${childBottom + 6}`}
                fill={colour}
              />
              {/* Relationship type label */}
              <text
                x={midX}
                y={connectorY - 4}
                textAnchor="middle"
                fontSize={9}
                fill={colour}
                fontWeight="600"
              >
                {label}
              </text>
            </g>
          );
        })}

        {/* Piece rectangles with labels */}
        {layout.pieces.map(pos => {
          const piece = pieceMap.get(pos.pieceId);
          if (!piece) return null;

          const pieceName = piece.name ?? piece.description ?? 'Piece';
          const yOffset = labelSpaceAbove;

          // Edge profile labels
          const edges = [
            { label: abbreviateEdge(piece.edge_top), has: hasEdgeProfile(piece.edge_top) },
            { label: abbreviateEdge(piece.edge_bottom), has: hasEdgeProfile(piece.edge_bottom) },
            { label: abbreviateEdge(piece.edge_left), has: hasEdgeProfile(piece.edge_left) },
            { label: abbreviateEdge(piece.edge_right), has: hasEdgeProfile(piece.edge_right) },
          ];

          const activeEdges = edges.filter(e => e.has);
          const edgeSummary = activeEdges.length > 0
            ? activeEdges.map(e => e.label).join(', ')
            : '';

          // Cutout summary
          const cutouts = piece.piece_features ?? [];
          const cutoutSummary = cutouts
            .map(f => `${f.quantity}× ${abbreviateCutout(f.name)}`)
            .join(', ');

          return (
            <g key={pos.pieceId}>
              {/* Piece name above */}
              <text
                x={pos.x + pos.width / 2}
                y={pos.y + yOffset - 6}
                textAnchor="middle"
                fontSize={10}
                fontWeight="600"
                fill="#111827"
              >
                {pieceName.length > 20 ? pieceName.slice(0, 18) + '…' : pieceName}
              </text>

              {/* Piece rectangle */}
              <rect
                x={pos.x}
                y={pos.y + yOffset}
                width={pos.width}
                height={pos.height}
                fill="white"
                stroke="#111827"
                strokeWidth={2}
              />

              {/* Edge profile labels inside piece (if any) */}
              {edgeSummary && (
                <text
                  x={pos.x + pos.width / 2}
                  y={pos.y + yOffset + pos.height / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={8}
                  fill="#6B7280"
                >
                  {edgeSummary}
                </text>
              )}

              {/* Dimension label below piece */}
              <text
                x={pos.x + pos.width / 2}
                y={pos.y + yOffset + pos.height + 14}
                textAnchor="middle"
                fontSize={9}
                fill="#374151"
                fontWeight="500"
              >
                {piece.length_mm} × {piece.width_mm} mm
              </text>

              {/* Cutout summary below dimensions */}
              {cutoutSummary && (
                <g>
                  <title>{cutouts.map(f => `${f.quantity}x ${f.name}`).join(', ')}</title>
                  <text
                    x={pos.x + pos.width / 2}
                    y={pos.y + yOffset + pos.height + 26}
                    textAnchor="middle"
                    fontSize={8}
                    fill="#6B7280"
                  >
                    {cutoutSummary}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Relationship legend */}
      {relationships.length > 0 && (
        <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-600">
          {Array.from(new Set(relationships.map(r => r.relationshipType))).map(type => (
            <span key={type} className="flex items-center gap-1">
              <span
                className="inline-block w-4 h-0.5"
                style={{ backgroundColor: RELATIONSHIP_COLOURS[type] ?? '#6B7280' }}
              />
              {RELATIONSHIP_LABELS[type] ?? type}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
