'use client';

import { useMemo } from 'react';
import type { PieceRelationshipData } from '@/lib/types/piece-relationship';
import { RELATIONSHIP_DISPLAY } from '@/lib/types/piece-relationship';
import type { PiecePosition } from '@/lib/services/room-layout-engine';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface RelationshipConnectorProps {
  relationship: PieceRelationshipData;
  parentPosition: PiecePosition;
  childPosition: PiecePosition;
  scale: number;
  isHighlighted?: boolean;
  isDimmed?: boolean;
}

// ─── Edge Midpoint Helpers ──────────────────────────────────────────────────

interface EdgeMidpoint {
  x: number;
  y: number;
  side: 'top' | 'bottom' | 'left' | 'right';
}

function getEdgeMidpoints(pos: PiecePosition): EdgeMidpoint[] {
  const w = Math.max(pos.width, 20);
  const h = Math.max(pos.height, 16);
  return [
    { x: pos.x + w / 2, y: pos.y, side: 'top' },
    { x: pos.x + w / 2, y: pos.y + h, side: 'bottom' },
    { x: pos.x, y: pos.y + h / 2, side: 'left' },
    { x: pos.x + w, y: pos.y + h / 2, side: 'right' },
  ];
}

function edgeDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function findNearestEdges(
  parentPos: PiecePosition,
  childPos: PiecePosition,
): { parent: EdgeMidpoint; child: EdgeMidpoint } {
  const parentEdges = getEdgeMidpoints(parentPos);
  const childEdges = getEdgeMidpoints(childPos);

  let best = { parent: parentEdges[0], child: childEdges[0] };
  let bestDist = Infinity;

  for (const pe of parentEdges) {
    for (const ce of childEdges) {
      const d = edgeDistance(pe, ce);
      if (d < bestDist) {
        bestDist = d;
        best = { parent: pe, child: ce };
      }
    }
  }

  return best;
}

// ─── Path Builders ──────────────────────────────────────────────────────────

function buildStraightPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
): string {
  return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
}

function buildLPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  parentSide: string,
): string {
  const radius = 8;

  if (parentSide === 'right' || parentSide === 'left') {
    // Horizontal first, then vertical
    const midX = to.x;
    const dy = to.y - from.y;
    const dirY = dy > 0 ? 1 : -1;
    const dx = midX - from.x;
    const dirX = dx > 0 ? 1 : -1;

    if (Math.abs(dx) > radius && Math.abs(dy) > radius) {
      return `M ${from.x} ${from.y} L ${midX - dirX * radius} ${from.y} Q ${midX} ${from.y} ${midX} ${from.y + dirY * radius} L ${to.x} ${to.y}`;
    }
    return `M ${from.x} ${from.y} L ${midX} ${from.y} L ${to.x} ${to.y}`;
  }

  // Vertical first, then horizontal
  const midY = to.y;
  const dx = to.x - from.x;
  const dirX = dx > 0 ? 1 : -1;
  const dy = midY - from.y;
  const dirY = dy > 0 ? 1 : -1;

  if (Math.abs(dx) > radius && Math.abs(dy) > radius) {
    return `M ${from.x} ${from.y} L ${from.x} ${midY - dirY * radius} Q ${from.x} ${midY} ${from.x + dirX * radius} ${midY} L ${to.x} ${to.y}`;
  }
  return `M ${from.x} ${from.y} L ${from.x} ${midY} L ${to.x} ${to.y}`;
}

// ─── Arrow Head ─────────────────────────────────────────────────────────────

function buildArrowHead(
  to: { x: number; y: number },
  from: { x: number; y: number },
  size: number,
): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return '';

  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;

  const left = {
    x: to.x - ux * size + px * size * 0.5,
    y: to.y - uy * size + py * size * 0.5,
  };
  const right = {
    x: to.x - ux * size - px * size * 0.5,
    y: to.y - uy * size - py * size * 0.5,
  };

  return `${to.x},${to.y} ${left.x},${left.y} ${right.x},${right.y}`;
}

// ─── Line Style Per Type ────────────────────────────────────────────────────

function getLineStyle(type: string): { strokeWidth: number; dashArray: string | undefined } {
  switch (type) {
    case 'WATERFALL':
      return { strokeWidth: 3, dashArray: undefined };
    case 'SPLASHBACK':
      return { strokeWidth: 2, dashArray: '6 3' };
    case 'RETURN':
      return { strokeWidth: 2, dashArray: undefined };
    case 'WINDOW_SILL':
      return { strokeWidth: 2, dashArray: '2 3' };
    case 'MITRE_JOIN':
      return { strokeWidth: 3, dashArray: undefined };
    case 'BUTT_JOIN':
      return { strokeWidth: 2, dashArray: undefined };
    default:
      return { strokeWidth: 2, dashArray: undefined };
  }
}

function hasArrow(type: string): boolean {
  return type === 'WATERFALL' || type === 'WINDOW_SILL';
}

function getLabel(relationship: PieceRelationshipData): string {
  const type = relationship.relationshipType;
  switch (type) {
    case 'WATERFALL': {
      const joinInfo = relationship.joinPosition?.toLowerCase();
      if (joinInfo?.includes('butt')) return 'WATERFALL (butt)';
      return 'WATERFALL (mitre)';
    }
    case 'SPLASHBACK':
      return 'SPLASHBACK';
    case 'RETURN':
      return 'RETURN';
    case 'WINDOW_SILL':
      return 'WINDOW SILL';
    case 'MITRE_JOIN':
      return '\u25FF mitre';
    case 'BUTT_JOIN':
      return '| butt';
    default:
      return type;
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function RelationshipConnector({
  relationship,
  parentPosition,
  childPosition,
  scale: _scale,
  isHighlighted = false,
  isDimmed = false,
}: RelationshipConnectorProps) {
  const type = relationship.relationshipType;
  const display = RELATIONSHIP_DISPLAY[type];
  const colour = display?.colour ?? '#6B7280';
  const { strokeWidth, dashArray } = getLineStyle(type);
  const showArrow = hasArrow(type);
  const label = getLabel(relationship);

  const { pathData, labelPos, arrowPoints, mitreMarker } = useMemo(() => {
    const edges = findNearestEdges(parentPosition, childPosition);
    const from = edges.parent;
    const to = edges.child;

    let path: string;
    if (type === 'RETURN') {
      path = buildLPath(from, to, edges.parent.side);
    } else {
      path = buildStraightPath(from, to);
    }

    // Label position: midpoint offset perpendicular to line
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const offsetX = len > 0 ? (-dy / len) * 12 : 0;
    const offsetY = len > 0 ? (dx / len) * 12 : -12;

    const labelPosition = { x: midX + offsetX, y: midY + offsetY };

    // Arrow head
    let arrow = '';
    if (showArrow) {
      arrow = buildArrowHead(to, from, 8);
    }

    // Mitre join marker (diagonal hatch at midpoint)
    let mitre: { x1: number; y1: number; x2: number; y2: number } | null = null;
    if (type === 'MITRE_JOIN') {
      mitre = {
        x1: midX - 6,
        y1: midY - 6,
        x2: midX + 6,
        y2: midY + 6,
      };
    }

    return {
      pathData: path,
      labelPos: labelPosition,
      arrowPoints: arrow,
      mitreMarker: mitre,
    };
  }, [parentPosition, childPosition, type, showArrow]);

  const opacity = isHighlighted ? 1.0 : isDimmed ? 0.4 : 0.7;
  const effectiveStrokeWidth = isHighlighted ? strokeWidth + 1 : strokeWidth;

  return (
    <g
      className="relationship-connector"
      style={{
        opacity,
        transition: 'opacity 0.08s ease-out',
      }}
    >
      {/* Connection line */}
      <path
        d={pathData}
        stroke={colour}
        strokeWidth={effectiveStrokeWidth}
        strokeDasharray={dashArray}
        fill="none"
      />

      {/* Label */}
      <text
        x={labelPos.x}
        y={labelPos.y}
        fontSize="11"
        fill={colour}
        textAnchor="middle"
        fontWeight={isHighlighted ? '600' : '400'}
      >
        {label}
      </text>

      {/* Arrow head (if applicable) */}
      {showArrow && arrowPoints && (
        <polygon points={arrowPoints} fill={colour} />
      )}

      {/* Join marker for MITRE (diagonal hatch) */}
      {type === 'MITRE_JOIN' && mitreMarker && (
        <line
          x1={mitreMarker.x1}
          y1={mitreMarker.y1}
          x2={mitreMarker.x2}
          y2={mitreMarker.y2}
          stroke={colour}
          strokeWidth="2"
        />
      )}
    </g>
  );
}
