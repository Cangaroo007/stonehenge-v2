'use client';

/**
 * MiniPieceEditor — compact piece editor for wizard step 4 + Quick View.
 *
 * DECISION (Rule 43 audit): PieceVisualEditor CAN accept wizard-state data
 * (no DB IDs required), but at ~1300 lines it includes templates, paint mode,
 * keyboard shortcuts, and bulk apply — far too heavy for a compact ~150px row.
 * This component creates a lightweight SVG that matches PieceVisualEditor's
 * visual language while importing its shared colour/code helpers.
 *
 * Rule 33: The mini SVG IS the edge editor. No checkboxes, no dropdowns,
 * no separate panels. Click an edge label → popover → done.
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { edgeColour, edgeCode } from './PieceVisualEditor';
import EdgeProfilePopover from './EdgeProfilePopover';

// ── Interfaces ──────────────────────────────────────────────────────────────

interface WizardPiece {
  name: string;
  length_mm: number;
  width_mm: number;
  thickness_mm: number;
  edges: { top: string; bottom: string; left: string; right: string };
  cutouts: Array<{ type: string; quantity: number }>;
}

interface EdgeTypeOption {
  id: string;
  name: string;
  code?: string;
}

interface CutoutTypeOption {
  id: string;
  name: string;
  code?: string;
  baseRate?: number;
}

export interface MiniPieceEditorProps {
  piece: WizardPiece;
  onChange: (updated: WizardPiece) => void;
  edgeTypes: EdgeTypeOption[];
  cutoutTypes: CutoutTypeOption[];
  readOnly?: boolean;
}

// ── Suggested cutout codes (for quick-add buttons) ──────────────────────────

const SUGGESTED_CUTOUT_CODES = ['UMS', 'TH', 'HP', 'GPO'];

function cutoutShortCode(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('undermount')) return 'UMS';
  if (lower.includes('tap')) return 'TH';
  if (lower.includes('hotplate') || lower.includes('cooktop')) return 'HP';
  if (lower.includes('gpo') || lower.includes('powerpoint')) return 'GPO';
  if (lower.includes('drop')) return 'DIS';
  if (lower.includes('basin')) return 'BSN';
  if (lower.includes('drainer') || lower.includes('groove')) return 'DG';
  return name.substring(0, 3).toUpperCase();
}

type EdgeSide = 'top' | 'right' | 'bottom' | 'left';

// ── Component ───────────────────────────────────────────────────────────────

export default function MiniPieceEditor({
  piece,
  onChange,
  edgeTypes,
  cutoutTypes,
  readOnly = false,
}: MiniPieceEditorProps) {
  // ── ALL hooks MUST be called before any early returns (React Rule of Hooks) ──

  const containerRef = useRef<HTMLDivElement>(null);
  const [popover, setPopover] = useState<{
    side: EdgeSide;
    x: number;
    y: number;
  } | null>(null);
  const [showMoreCutouts, setShowMoreCutouts] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // ── SVG layout ────────────────────────────────────────────────────────

  const SVG_W = 200;
  const SVG_H = 130;
  const PAD = 36;

  const layout = useMemo(() => {
    if (!piece) return { innerW: 40, innerH: 20, x: 80, y: 55 };

    const maxInnerW = SVG_W - PAD * 2;
    const maxInnerH = SVG_H - PAD * 2;
    const aspectRatio = piece.length_mm / Math.max(piece.width_mm, 1);

    let innerW: number;
    let innerH: number;

    if (aspectRatio > maxInnerW / maxInnerH) {
      innerW = maxInnerW;
      innerH = maxInnerW / aspectRatio;
    } else {
      innerH = maxInnerH;
      innerW = maxInnerH * aspectRatio;
    }

    innerW = Math.max(innerW, 40);
    innerH = Math.max(innerH, 20);

    const x = (SVG_W - innerW) / 2;
    const y = (SVG_H - innerH) / 2;

    return { innerW, innerH, x, y };
  }, [piece?.length_mm, piece?.width_mm]);

  const edgeDefs = useMemo(() => {
    const { x, y, innerW, innerH } = layout;
    return {
      top: {
        x1: x, y1: y, x2: x + innerW, y2: y,
        labelX: x + innerW / 2, labelY: y - 10,
        anchor: 'middle' as const,
      },
      bottom: {
        x1: x, y1: y + innerH, x2: x + innerW, y2: y + innerH,
        labelX: x + innerW / 2, labelY: y + innerH + 14,
        anchor: 'middle' as const,
      },
      left: {
        x1: x, y1: y, x2: x, y2: y + innerH,
        labelX: x - 6, labelY: y + innerH / 2,
        anchor: 'end' as const,
      },
      right: {
        x1: x + innerW, y1: y, x2: x + innerW, y2: y + innerH,
        labelX: x + innerW + 6, labelY: y + innerH / 2,
        anchor: 'start' as const,
      },
    };
  }, [layout]);

  const suggestedCutouts = useMemo(() => {
    if (!cutoutTypes?.length) return [];
    return SUGGESTED_CUTOUT_CODES
      .map((code) => {
        const match = cutoutTypes.find((ct) => cutoutShortCode(ct.name) === code);
        return match ? { ...match, code } : null;
      })
      .filter((x): x is CutoutTypeOption & { code: string } => x !== null);
  }, [cutoutTypes]);

  const remainingCutouts = useMemo(() => {
    if (!cutoutTypes?.length) return [];
    const suggestedIds = new Set(suggestedCutouts.map((s) => s.id));
    return cutoutTypes.filter((ct) => !suggestedIds.has(ct.id));
  }, [cutoutTypes, suggestedCutouts]);

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleEdgeClick = useCallback(
    (side: EdgeSide, event: React.MouseEvent) => {
      if (readOnly) return;
      event.stopPropagation();

      const svgRect = (event.currentTarget as SVGElement)
        .closest('svg')
        ?.getBoundingClientRect();
      if (!svgRect) return;

      const relX = event.clientX - svgRect.left;
      const relY = event.clientY - svgRect.top;
      setPopover({ side, x: relX, y: relY });
    },
    [readOnly],
  );

  const handleProfileSelect = useCallback(
    (profileId: string | null) => {
      if (!popover || !piece) return;
      const updated = {
        ...piece,
        edges: {
          ...(piece.edges || { top: '', bottom: '', left: '', right: '' }),
          [popover.side]: profileId ?? '',
        },
      };
      onChange(updated);
      setPopover(null);
    },
    [popover, piece, onChange],
  );

  const handleCutoutAdd = useCallback(
    (cutoutName: string) => {
      if (!piece) return;
      const cutouts = piece.cutouts || [];
      const existing = cutouts.find((c) => c.type === cutoutName);
      let updatedCutouts: Array<{ type: string; quantity: number }>;

      if (existing) {
        // Increment quantity
        updatedCutouts = cutouts.map((c) =>
          c.type === cutoutName ? { ...c, quantity: c.quantity + 1 } : c,
        );
      } else {
        // Add new
        updatedCutouts = [...cutouts, { type: cutoutName, quantity: 1 }];
      }

      onChange({ ...piece, cutouts: updatedCutouts });
      setShowMoreCutouts(false);
    },
    [piece, onChange],
  );

  const handleCutoutRemove = useCallback(
    (cutoutType: string) => {
      if (!piece) return;
      const updatedCutouts = (piece.cutouts || []).filter((c) => c.type !== cutoutType);
      onChange({ ...piece, cutouts: updatedCutouts });
    },
    [piece, onChange],
  );

  // ── Null guards AFTER all hooks (Rule 36 + React Rule of Hooks) ─────

  if (!piece) return null;

  // Defensive: ensure edges/cutouts are never undefined (Cause C crash guard)
  const safeEdges = piece.edges || { top: '', bottom: '', left: '', right: '' };
  const safeCutouts = piece.cutouts || [];

  if (!edgeTypes?.length) return <div className="text-xs text-gray-400 py-4">Loading edge types...</div>;
  if (!cutoutTypes?.length) return <div className="text-xs text-gray-400 py-4">Loading cutout types...</div>;

  // ── Edge name resolution ───────────────────────────────────────────────

  const resolveEdgeName = (edgeId: string | null): string | undefined => {
    if (!edgeId) return undefined;
    return edgeTypes.find((e) => e.id === edgeId)?.name;
  };

  // ── Edge ID lookup ────────────────────────────────────────────────────

  const getEdgeId = (side: EdgeSide): string | null => {
    const val = safeEdges[side];
    return val || null;
  };

  // ── Render ────────────────────────────────────────────────────────────

  const sides: EdgeSide[] = ['top', 'bottom', 'left', 'right'];

  return (
    <div ref={containerRef} className="flex items-start gap-4 py-2">
      {/* Left: Mini SVG diagram */}
      <div className="relative flex-shrink-0" style={{ width: SVG_W, height: SVG_H }}>
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          width={SVG_W}
          height={SVG_H}
          className="w-full h-full"
        >
          {/* Piece rectangle */}
          <rect
            x={layout.x}
            y={layout.y}
            width={layout.innerW}
            height={layout.innerH}
            fill="#f5f5f5"
            stroke="#e5e7eb"
            strokeWidth={1}
          />

          {/* Dimension label inside rectangle */}
          <text
            x={layout.x + layout.innerW / 2}
            y={layout.y + layout.innerH / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-[8px] fill-gray-400 select-none"
          >
            {piece.length_mm} x {piece.width_mm}
          </text>

          {/* Edges */}
          {sides.map((side) => {
            const def = edgeDefs[side];
            const edgeId = getEdgeId(side);
            const name = resolveEdgeName(edgeId);
            const isFinished = !!edgeId;
            const colour = edgeColour(name);
            const code = edgeCode(name);

            return (
              <g key={side}>
                {/* Visible edge line */}
                <line
                  x1={def.x1}
                  y1={def.y1}
                  x2={def.x2}
                  y2={def.y2}
                  stroke={colour}
                  strokeWidth={isFinished ? 2.5 : 1}
                  strokeDasharray={isFinished ? undefined : '3 2'}
                />

                {/* Hit area for clicking */}
                {!readOnly && (
                  <line
                    x1={def.x1}
                    y1={def.y1}
                    x2={def.x2}
                    y2={def.y2}
                    stroke="transparent"
                    strokeWidth={14}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => handleEdgeClick(side, e)}
                  />
                )}

                {/* Edge label */}
                <text
                  x={def.labelX}
                  y={def.labelY}
                  textAnchor={def.anchor}
                  dominantBaseline="middle"
                  className={`select-none ${
                    isFinished ? 'text-[9px] font-semibold' : 'text-[8px]'
                  }`}
                  fill={colour}
                  style={!readOnly ? { cursor: 'pointer' } : undefined}
                  onClick={!readOnly ? (e) => handleEdgeClick(side, e) : undefined}
                >
                  {code}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Edge profile popover */}
        {popover && (
          <EdgeProfilePopover
            isOpen={true}
            position={{ x: popover.x, y: popover.y }}
            currentProfileId={getEdgeId(popover.side)}
            profiles={edgeTypes}
            isMitred={piece.thickness_mm === 40}
            onSelect={handleProfileSelect}
            onClose={() => setPopover(null)}
          />
        )}
      </div>

      {/* Right: Cutout quick-add */}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-gray-700 mb-1.5">{piece.name}</div>

        {/* Suggested cutout buttons */}
        {!readOnly && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {suggestedCutouts.map((ct) => (
              <button
                key={ct.id}
                onClick={() => handleCutoutAdd(ct.name)}
                className="px-2 py-0.5 text-[10px] font-medium border border-gray-200 rounded bg-white text-gray-600 hover:border-amber-300 hover:text-amber-700 transition-colours"
              >
                + {ct.code}
              </button>
            ))}

            {/* More dropdown */}
            {remainingCutouts.length > 0 && (
              <div className="relative" ref={moreRef}>
                <button
                  onClick={() => setShowMoreCutouts(!showMoreCutouts)}
                  className="px-2 py-0.5 text-[10px] font-medium border border-gray-200 rounded bg-white text-gray-500 hover:border-amber-300 hover:text-amber-700 transition-colours"
                >
                  + More &#9662;
                </button>
                {showMoreCutouts && (
                  <div className="absolute left-0 top-6 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px] max-h-[200px] overflow-y-auto">
                    {remainingCutouts.map((ct) => (
                      <button
                        key={ct.id}
                        onClick={() => handleCutoutAdd(ct.name)}
                        className="w-full text-left px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 transition-colours"
                      >
                        {ct.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Active cutout badges */}
        {safeCutouts.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {safeCutouts.map((c) => (
              <span
                key={c.type}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded"
              >
                {cutoutShortCode(c.type)} x{c.quantity}
                {!readOnly && (
                  <button
                    onClick={() => handleCutoutRemove(c.type)}
                    className="text-amber-400 hover:text-red-500 ml-0.5"
                    title="Remove cutout"
                  >
                    &#10005;
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
