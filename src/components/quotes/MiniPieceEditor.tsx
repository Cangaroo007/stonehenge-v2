'use client';

/**
 * MiniPieceEditor — compact piece editor for wizard step 4 + Quick View.
 *
 * Uses inline Quick Edge palette for edge selection: pick a profile chip, then
 * click edges on the SVG to apply. Matches PieceVisualEditor's Quick Edge mode.
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { edgeColour, edgeCode, cutoutLabel } from '@/lib/utils/edge-utils';
import type { EdgeScope } from './EdgeProfilePopover';

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
  /** Batch edge scope — kept for interface stability */
  pieceId?: number;
  roomName?: string;
  roomId?: string;
  onApplyWithScope?: (
    pieceId: number,
    side: string,
    profileId: string | null,
    scope: EdgeScope,
  ) => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const SUGGESTED_CUTOUT_LABELS = ['U/M Sink', 'TH', 'HP', 'GPO'];
const SVG_W = 240;
const SVG_H = 160;
const PAD = 40;
const EDGE_HIT_WIDTH = 24;

type EdgeSide = 'top' | 'right' | 'bottom' | 'left';

// ── Component ────────────────────────────────────────────────────────────────

export default function MiniPieceEditor({
  piece,
  onChange,
  edgeTypes,
  cutoutTypes,
  readOnly = false,
}: MiniPieceEditorProps) {
  // ── ALL hooks MUST be called before any early returns (React Rule of Hooks) ──

  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [flashEdge, setFlashEdge] = useState<EdgeSide | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [showMoreCutouts, setShowMoreCutouts] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // ── SVG layout ────────────────────────────────────────────────────────

  const layout = useMemo(() => {
    if (!piece) return { innerW: 60, innerH: 30, x: 90, y: 65 };

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

    innerW = Math.max(innerW, 60);
    innerH = Math.max(innerH, 30);

    const x = (SVG_W - innerW) / 2;
    const y = (SVG_H - innerH) / 2;

    return { innerW, innerH, x, y };
  }, [piece?.length_mm, piece?.width_mm]);

  const edgeDefs = useMemo(() => {
    const { x, y, innerW, innerH } = layout;
    return {
      top: {
        x1: x, y1: y, x2: x + innerW, y2: y,
        labelX: x + innerW / 2, labelY: y - 12,
        anchor: 'middle' as const,
      },
      bottom: {
        x1: x, y1: y + innerH, x2: x + innerW, y2: y + innerH,
        labelX: x + innerW / 2, labelY: y + innerH + 16,
        anchor: 'middle' as const,
      },
      left: {
        x1: x, y1: y, x2: x, y2: y + innerH,
        labelX: x - 8, labelY: y + innerH / 2,
        anchor: 'end' as const,
      },
      right: {
        x1: x + innerW, y1: y, x2: x + innerW, y2: y + innerH,
        labelX: x + innerW + 8, labelY: y + innerH / 2,
        anchor: 'start' as const,
      },
    };
  }, [layout]);

  // ── Mitred check ──────────────────────────────────────────────────────

  const isMitred = piece?.thickness_mm === 40;

  const pencilRoundId = useMemo(() => {
    if (!edgeTypes) return null;
    return edgeTypes.find(e => e.name.toLowerCase().includes('pencil'))?.id ?? null;
  }, [edgeTypes]);

  // ── Cutout helpers ────────────────────────────────────────────────────

  const suggestedCutouts = useMemo(() => {
    if (!cutoutTypes?.length) return [];
    return SUGGESTED_CUTOUT_LABELS
      .map((code) => {
        const match = cutoutTypes.find((ct) => cutoutLabel(ct.name) === code);
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

      let profileToApply = selectedProfileId;

      // Mitred enforcement: only Pencil Round allowed (Pricing Bible Rule #1)
      if (isMitred && profileToApply && profileToApply !== pencilRoundId) {
        profileToApply = pencilRoundId;
      }

      const updated = {
        ...piece,
        edges: {
          ...piece.edges,
          [side]: profileToApply ?? '',
        },
      };
      onChange(updated);

      // Flash animation
      setFlashEdge(side);
      setTimeout(() => setFlashEdge(null), 200);
    },
    [readOnly, piece, onChange, selectedProfileId, isMitred, pencilRoundId],
  );

  const handleCutoutAdd = useCallback(
    (cutoutName: string) => {
      if (!piece) return;
      const existing = piece.cutouts.find((c) => c.type === cutoutName);
      let updatedCutouts: Array<{ type: string; quantity: number }>;

      if (existing) {
        updatedCutouts = piece.cutouts.map((c) =>
          c.type === cutoutName ? { ...c, quantity: c.quantity + 1 } : c,
        );
      } else {
        updatedCutouts = [...piece.cutouts, { type: cutoutName, quantity: 1 }];
      }

      onChange({ ...piece, cutouts: updatedCutouts });
      setShowMoreCutouts(false);
    },
    [piece, onChange],
  );

  const handleCutoutRemove = useCallback(
    (cutoutType: string) => {
      if (!piece) return;
      const updatedCutouts = piece.cutouts.filter((c) => c.type !== cutoutType);
      onChange({ ...piece, cutouts: updatedCutouts });
    },
    [piece, onChange],
  );

  // ── Null guards AFTER all hooks (React Rule of Hooks) ─────────────────

  if (!piece) return null;
  if (!edgeTypes?.length) return <div className="text-xs text-gray-400 py-4">Loading edge types...</div>;
  if (!cutoutTypes?.length) return <div className="text-xs text-gray-400 py-4">Loading cutout types...</div>;

  // ── Edge name resolution ──────────────────────────────────────────────

  const resolveEdgeName = (edgeId: string | null): string | undefined => {
    if (!edgeId) return undefined;
    return edgeTypes.find((e) => e.id === edgeId)?.name;
  };

  const getEdgeId = (side: EdgeSide): string | null => {
    const val = piece.edges[side];
    return val || null;
  };

  // ── Render ────────────────────────────────────────────────────────────

  const sides: EdgeSide[] = ['top', 'bottom', 'left', 'right'];

  return (
    <div ref={containerRef} className="py-2">
      {/* ── Quick Edge palette — edge profile chips ─────────────────── */}
      {!readOnly && (
        <div className="flex items-center gap-1 mb-2 flex-wrap">
          <button
            onClick={() => setSelectedProfileId(null)}
            className={`px-2 py-0.5 text-[10px] font-medium rounded border transition-colors ${
              selectedProfileId === null
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            Raw
          </button>
          {edgeTypes.map((et) => {
            const disabled = isMitred && !et.name.toLowerCase().includes('pencil');
            return (
              <button
                key={et.id}
                onClick={() => !disabled && setSelectedProfileId(et.id)}
                disabled={disabled}
                className={`px-2 py-0.5 text-[10px] font-medium rounded border transition-colors ${
                  disabled
                    ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                    : selectedProfileId === et.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
                title={disabled ? 'Mitred edges use Pencil Round only' : et.name}
              >
                {et.name}
              </button>
            );
          })}
          {isMitred && (
            <span className="text-[9px] text-amber-600 ml-1">Mitred — Pencil Round only</span>
          )}
        </div>
      )}

      <div className="flex items-start gap-4">
        {/* Left: SVG diagram */}
        <div className="relative flex-shrink-0" style={{ width: SVG_W, height: SVG_H }}>
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            width={SVG_W}
            height={SVG_H}
            className="w-full h-full"
          >
            <defs>
              <style>{`
                @keyframes mini-edge-flash {
                  0% { stroke: #22c55e; stroke-width: 5; }
                  100% { stroke: inherit; stroke-width: inherit; }
                }
                .mini-edge-flash { animation: mini-edge-flash 200ms ease-out; }
              `}</style>
            </defs>

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
              const isHovered = hoveredEdge === side && !readOnly;
              const isFlashing = flashEdge === side;

              return (
                <g key={side}>
                  {/* Hover glow (behind visible edge) */}
                  {isHovered && (
                    <line
                      x1={def.x1}
                      y1={def.y1}
                      x2={def.x2}
                      y2={def.y2}
                      stroke="#3b82f6"
                      strokeWidth={10}
                      strokeOpacity={0.15}
                      strokeLinecap="round"
                    />
                  )}

                  {/* Visible edge line */}
                  <line
                    x1={def.x1}
                    y1={def.y1}
                    x2={def.x2}
                    y2={def.y2}
                    stroke={isFlashing ? '#22c55e' : colour}
                    strokeWidth={isFlashing ? 4 : (isFinished ? 2.5 : 1)}
                    strokeDasharray={isFinished ? undefined : '3 2'}
                    className={isFlashing ? 'mini-edge-flash' : undefined}
                  >
                    <title>{name || 'Raw / Unfinished'}</title>
                  </line>

                  {/* Hit area for clicking + hover */}
                  {!readOnly && (
                    <line
                      x1={def.x1}
                      y1={def.y1}
                      x2={def.x2}
                      y2={def.y2}
                      stroke="transparent"
                      strokeWidth={EDGE_HIT_WIDTH}
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => handleEdgeClick(side, e)}
                      onMouseEnter={() => setHoveredEdge(side)}
                      onMouseLeave={() => setHoveredEdge(null)}
                    >
                      <title>Click to apply {selectedProfileId ? resolveEdgeName(selectedProfileId) || 'profile' : 'Raw'}</title>
                    </line>
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
                    <title>{name || 'Raw / Unfinished'}</title>
                    {code}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Right: Piece name + Cutout quick-add */}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-gray-700 mb-1.5">{piece.name}</div>

          {/* Hint text */}
          {!readOnly && (
            <p className="text-[9px] text-gray-400 italic mb-1.5">
              Select profile above, then click edges to apply
            </p>
          )}

          {/* Suggested cutout buttons */}
          {!readOnly && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {suggestedCutouts.map((ct) => (
                <button
                  key={ct.id}
                  onClick={() => handleCutoutAdd(ct.name)}
                  className="px-2 py-0.5 text-[10px] font-medium border border-gray-200 rounded bg-white text-gray-600 hover:border-amber-300 hover:text-amber-700 transition-colors"
                  title={ct.name}
                >
                  + {ct.code}
                </button>
              ))}

              {/* More dropdown */}
              {remainingCutouts.length > 0 && (
                <div className="relative" ref={moreRef}>
                  <button
                    onClick={() => setShowMoreCutouts(!showMoreCutouts)}
                    className="px-2 py-0.5 text-[10px] font-medium border border-gray-200 rounded bg-white text-gray-500 hover:border-amber-300 hover:text-amber-700 transition-colors"
                  >
                    + More &#9662;
                  </button>
                  {showMoreCutouts && (
                    <div className="absolute left-0 top-6 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px] max-h-[200px] overflow-y-auto">
                      {remainingCutouts.map((ct) => (
                        <button
                          key={ct.id}
                          onClick={() => handleCutoutAdd(ct.name)}
                          className="w-full text-left px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
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
          {piece.cutouts.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {piece.cutouts.map((c) => (
                <span
                  key={c.type}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded"
                  title={c.type}
                >
                  {cutoutLabel(c.type)} x{c.quantity}
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
    </div>
  );
}
