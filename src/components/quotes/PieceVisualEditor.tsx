'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import EdgeProfilePopover from './EdgeProfilePopover';

// ── Interfaces ──────────────────────────────────────────────────────────────

interface EdgeTypeOption {
  id: string;
  name: string;
  code?: string;
}

interface CutoutDisplay {
  id: string;
  typeId: string;
  typeName: string;
  quantity: number;
}

export type EdgeSide = 'top' | 'right' | 'bottom' | 'left';

export interface PieceVisualEditorProps {
  /** Piece dimensions in mm */
  lengthMm: number;
  widthMm: number;

  /** Edge type IDs per side (null = raw / unfinished) */
  edgeTop: string | null;
  edgeBottom: string | null;
  edgeLeft: string | null;
  edgeRight: string | null;

  /** Resolved edge type names for display (looked up from edgeTypes) */
  edgeTypes: EdgeTypeOption[];

  /** Cutouts on the piece */
  cutouts: CutoutDisplay[];

  /** Oversize join position from left edge (mm) */
  joinAtMm?: number;

  /** Whether the piece is in edit mode */
  isEditMode: boolean;

  /** Whether lamination method is mitred */
  isMitred?: boolean;

  /** Called when an edge profile changes (edit mode) */
  onEdgeChange?: (side: EdgeSide, profileId: string | null) => void;

  /** Called to add a cutout (edit mode) */
  onCutoutAdd?: (cutoutTypeId: string) => void;

  /** Called to remove a cutout (edit mode) */
  onCutoutRemove?: (cutoutId: string) => void;

  /** Available cutout types for the add dialog */
  cutoutTypes?: Array<{ id: string; name: string; baseRate: number }>;
}

// ── Constants ───────────────────────────────────────────────────────────────

const SVG_PADDING = 60;
const MAX_HEIGHT = 250;
const EDGE_HIT_WIDTH = 16;

/** Colour by edge profile name */
function edgeColour(name: string | undefined): string {
  if (!name) return '#d1d5db';
  const lower = name.toLowerCase();
  if (lower.includes('pencil')) return '#2563eb';
  if (lower.includes('bullnose')) return '#16a34a';
  if (lower.includes('ogee')) return '#9333ea';
  if (lower.includes('mitr')) return '#ea580c';
  if (lower.includes('bevel')) return '#0d9488';
  return '#6b7280';
}

/** Short code for an edge profile */
function edgeCode(name: string | undefined): string {
  if (!name) return 'RAW';
  const lower = name.toLowerCase();
  if (lower.includes('pencil')) return 'PR';
  if (lower.includes('bullnose')) return 'BN';
  if (lower.includes('ogee')) return 'OG';
  if (lower.includes('mitr')) return 'M';
  if (lower.includes('bevel')) return 'BV';
  if (lower.includes('polish')) return 'P';
  return name.substring(0, 3).toUpperCase();
}

/** Short label for cutout type */
function cutoutLabel(typeName: string): string {
  const lower = typeName.toLowerCase();
  if (lower.includes('undermount')) return 'U/M Sink';
  if (lower.includes('drop')) return 'D/I Sink';
  if (lower.includes('hotplate') || lower.includes('cooktop')) return 'HP';
  if (lower.includes('tap')) return 'TH';
  if (lower.includes('gpo')) return 'GPO';
  if (lower.includes('basin')) return 'B';
  if (lower.includes('drainer') || lower.includes('groove')) return 'DG';
  if (lower.includes('flush')) return 'FC';
  return typeName.substring(0, 4);
}

// ── Component ───────────────────────────────────────────────────────────────

export default function PieceVisualEditor({
  lengthMm,
  widthMm,
  edgeTop,
  edgeBottom,
  edgeLeft,
  edgeRight,
  edgeTypes,
  cutouts,
  joinAtMm,
  isEditMode,
  isMitred = false,
  onEdgeChange,
  onCutoutAdd,
  onCutoutRemove,
  cutoutTypes = [],
}: PieceVisualEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [popover, setPopover] = useState<{
    side: EdgeSide;
    x: number;
    y: number;
  } | null>(null);
  const [showCutoutDialog, setShowCutoutDialog] = useState(false);
  const [hoveredEdge, setHoveredEdge] = useState<EdgeSide | null>(null);
  const [hoveredCutout, setHoveredCutout] = useState<string | null>(null);

  // ── Resolve edge names ────────────────────────────────────────────────

  const resolveEdgeName = useCallback(
    (edgeId: string | null): string | undefined => {
      if (!edgeId) return undefined;
      return edgeTypes.find((e) => e.id === edgeId)?.name;
    },
    [edgeTypes]
  );

  const edgeNames = useMemo(
    () => ({
      top: resolveEdgeName(edgeTop),
      bottom: resolveEdgeName(edgeBottom),
      left: resolveEdgeName(edgeLeft),
      right: resolveEdgeName(edgeRight),
    }),
    [edgeTop, edgeBottom, edgeLeft, edgeRight, resolveEdgeName]
  );

  const edgeIds: Record<EdgeSide, string | null> = useMemo(
    () => ({ top: edgeTop, bottom: edgeBottom, left: edgeLeft, right: edgeRight }),
    [edgeTop, edgeBottom, edgeLeft, edgeRight]
  );

  // ── SVG sizing ────────────────────────────────────────────────────────

  const layout = useMemo(() => {
    const aspectRatio = lengthMm / widthMm;
    // Target a reasonable inner rectangle size
    const maxInnerWidth = 500;
    const maxInnerHeight = MAX_HEIGHT - SVG_PADDING * 2;

    let innerW: number;
    let innerH: number;

    if (aspectRatio > maxInnerWidth / maxInnerHeight) {
      innerW = maxInnerWidth;
      innerH = maxInnerWidth / aspectRatio;
    } else {
      innerH = maxInnerHeight;
      innerW = maxInnerHeight * aspectRatio;
    }

    // Ensure minimum dimensions
    innerW = Math.max(innerW, 100);
    innerH = Math.max(innerH, 40);

    const svgW = innerW + SVG_PADDING * 2;
    const svgH = innerH + SVG_PADDING * 2;

    return {
      svgW,
      svgH,
      innerW,
      innerH,
      x: SVG_PADDING,
      y: SVG_PADDING,
    };
  }, [lengthMm, widthMm]);

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleEdgeClick = useCallback(
    (side: EdgeSide, event: React.MouseEvent) => {
      if (!isEditMode || !onEdgeChange) return;
      event.stopPropagation();

      const svgRect = (event.currentTarget as SVGElement)
        .closest('svg')
        ?.getBoundingClientRect();
      if (!svgRect) return;

      // Position popover near the click
      const relX = event.clientX - svgRect.left;
      const relY = event.clientY - svgRect.top;

      setPopover({ side, x: relX, y: relY });
    },
    [isEditMode, onEdgeChange]
  );

  const handleProfileSelect = useCallback(
    (profileId: string | null) => {
      if (!popover || !onEdgeChange) return;
      onEdgeChange(popover.side, profileId);
      setPopover(null);
    },
    [popover, onEdgeChange]
  );

  const handleCutoutAddClick = useCallback(
    (cutoutTypeId: string) => {
      if (onCutoutAdd) onCutoutAdd(cutoutTypeId);
      setShowCutoutDialog(false);
    },
    [onCutoutAdd]
  );

  // ── Edge rendering data ───────────────────────────────────────────────

  const edgeDefs = useMemo(() => {
    const { x, y, innerW, innerH } = layout;
    return {
      top: {
        x1: x,
        y1: y,
        x2: x + innerW,
        y2: y,
        labelX: x + innerW / 2,
        labelY: y - 8,
        lengthMm: lengthMm,
      },
      bottom: {
        x1: x,
        y1: y + innerH,
        x2: x + innerW,
        y2: y + innerH,
        labelX: x + innerW / 2,
        labelY: y + innerH + 16,
        lengthMm: lengthMm,
      },
      left: {
        x1: x,
        y1: y,
        x2: x,
        y2: y + innerH,
        labelX: x - 8,
        labelY: y + innerH / 2,
        lengthMm: widthMm,
      },
      right: {
        x1: x + innerW,
        y1: y,
        x2: x + innerW,
        y2: y + innerH,
        labelX: x + innerW + 8,
        labelY: y + innerH / 2,
        lengthMm: widthMm,
      },
    };
  }, [layout, lengthMm, widthMm]);

  // ── Cutout positions ──────────────────────────────────────────────────

  const cutoutPositions = useMemo(() => {
    const { x, y, innerW, innerH } = layout;
    const pad = 8;

    return cutouts.map((cutout, idx) => {
      const lower = cutout.typeName.toLowerCase();
      let cw: number;
      let ch: number;
      let shape: 'rect' | 'circle' | 'oval' | 'lines';

      if (lower.includes('undermount') || lower.includes('sink')) {
        cw = innerW * 0.35;
        ch = innerH * 0.45;
        shape = 'rect';
      } else if (lower.includes('hotplate') || lower.includes('cooktop') || lower.includes('flush')) {
        cw = innerW * 0.25;
        ch = innerH * 0.4;
        shape = 'rect';
      } else if (lower.includes('tap')) {
        cw = 16;
        ch = 16;
        shape = 'circle';
      } else if (lower.includes('gpo')) {
        cw = 18;
        ch = 18;
        shape = 'rect';
      } else if (lower.includes('basin')) {
        cw = innerW * 0.2;
        ch = innerH * 0.35;
        shape = 'oval';
      } else if (lower.includes('drainer') || lower.includes('groove')) {
        cw = innerW * 0.25;
        ch = innerH * 0.35;
        shape = 'lines';
      } else {
        cw = innerW * 0.15;
        ch = innerH * 0.3;
        shape = 'rect';
      }

      // Distribute cutouts horizontally across the piece
      const totalCutouts = cutouts.length;
      const slotW = (innerW - pad * 2) / totalCutouts;
      const cx = x + pad + slotW * idx + slotW / 2;
      const cy = y + innerH / 2;

      return {
        ...cutout,
        cx,
        cy,
        w: cw,
        h: ch,
        shape,
      };
    });
  }, [cutouts, layout]);

  // ── Join line position ────────────────────────────────────────────────

  const joinLineX = useMemo(() => {
    if (joinAtMm == null) return null;
    const ratio = joinAtMm / lengthMm;
    return layout.x + layout.innerW * ratio;
  }, [joinAtMm, lengthMm, layout]);

  // ── Legend ────────────────────────────────────────────────────────────

  const legendItems = useMemo(() => {
    const items: Array<{ code: string; name: string; colour: string }> = [];
    const seen = new Set<string>();

    const addIfPresent = (id: string | null) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      const name = resolveEdgeName(id);
      if (name) {
        items.push({ code: edgeCode(name), name, colour: edgeColour(name) });
      }
    };

    addIfPresent(edgeTop);
    addIfPresent(edgeBottom);
    addIfPresent(edgeLeft);
    addIfPresent(edgeRight);

    // Always show RAW in legend
    items.push({ code: 'R', name: 'Raw', colour: '#d1d5db' });

    return items;
  }, [edgeTop, edgeBottom, edgeLeft, edgeRight, resolveEdgeName]);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      onClick={(e) => e.stopPropagation()}
    >
      <svg
        viewBox={`0 0 ${layout.svgW} ${layout.svgH}`}
        className="w-full"
        style={{ maxHeight: MAX_HEIGHT }}
        preserveAspectRatio="xMidYMid meet"
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

        {/* Join line (oversize) */}
        {joinLineX != null && (
          <>
            <line
              x1={joinLineX}
              y1={layout.y - 4}
              x2={joinLineX}
              y2={layout.y + layout.innerH + 4}
              stroke="#f59e0b"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            <text
              x={joinLineX}
              y={layout.y - 8}
              textAnchor="middle"
              className="text-[8px] fill-amber-600"
            >
              Join at {joinAtMm}mm
            </text>
          </>
        )}

        {/* Edges */}
        {(Object.keys(edgeDefs) as EdgeSide[]).map((side) => {
          const def = edgeDefs[side];
          const name = edgeNames[side];
          const isFinished = !!edgeIds[side];
          const colour = edgeColour(name);
          const code = edgeCode(name);
          const isHorizontal = side === 'top' || side === 'bottom';
          const isHovered = hoveredEdge === side;

          return (
            <g key={side}>
              {/* Visible edge line */}
              <line
                x1={def.x1}
                y1={def.y1}
                x2={def.x2}
                y2={def.y2}
                stroke={colour}
                strokeWidth={isFinished ? 3 : 1}
                strokeDasharray={isFinished ? undefined : '4 3'}
                opacity={isHovered && isEditMode ? 0.7 : 1}
              />

              {/* Hit area for clicking (edit mode only) */}
              {isEditMode && onEdgeChange && (
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
                />
              )}

              {/* Edge label */}
              <text
                x={def.labelX}
                y={def.labelY}
                textAnchor={isHorizontal ? 'middle' : side === 'left' ? 'end' : 'start'}
                dominantBaseline={isHorizontal ? (side === 'top' ? 'auto' : 'hanging') : 'middle'}
                className={`select-none ${
                  isFinished
                    ? 'text-[10px] font-medium'
                    : 'text-[9px]'
                }`}
                fill={colour}
              >
                {isFinished
                  ? `${code} (${def.lengthMm}mm)`
                  : 'RAW'}
              </text>
            </g>
          );
        })}

        {/* Dimension labels */}
        <text
          x={layout.x + layout.innerW / 2}
          y={layout.y - 24}
          textAnchor="middle"
          className="text-[9px] fill-gray-400"
        >
          {lengthMm}mm
        </text>
        <text
          x={layout.x - 28}
          y={layout.y + layout.innerH / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          className="text-[9px] fill-gray-400"
          transform={`rotate(-90, ${layout.x - 28}, ${layout.y + layout.innerH / 2})`}
        >
          {widthMm}mm
        </text>

        {/* Cutouts */}
        {cutoutPositions.map((c) => (
          <g
            key={c.id}
            onMouseEnter={() => setHoveredCutout(c.id)}
            onMouseLeave={() => setHoveredCutout(null)}
          >
            {c.shape === 'circle' ? (
              <circle
                cx={c.cx}
                cy={c.cy}
                r={c.w / 2}
                fill="none"
                stroke="#6b7280"
                strokeWidth={1}
                strokeDasharray="3 2"
              />
            ) : c.shape === 'oval' ? (
              <ellipse
                cx={c.cx}
                cy={c.cy}
                rx={c.w / 2}
                ry={c.h / 2}
                fill="none"
                stroke="#6b7280"
                strokeWidth={1}
                strokeDasharray="3 2"
              />
            ) : c.shape === 'lines' ? (
              <>
                <rect
                  x={c.cx - c.w / 2}
                  y={c.cy - c.h / 2}
                  width={c.w}
                  height={c.h}
                  fill="none"
                  stroke="#6b7280"
                  strokeWidth={1}
                  strokeDasharray="3 2"
                />
                {/* Horizontal lines inside for drainer grooves */}
                {[0.25, 0.5, 0.75].map((frac) => (
                  <line
                    key={frac}
                    x1={c.cx - c.w / 2 + 3}
                    y1={c.cy - c.h / 2 + c.h * frac}
                    x2={c.cx + c.w / 2 - 3}
                    y2={c.cy - c.h / 2 + c.h * frac}
                    stroke="#9ca3af"
                    strokeWidth={0.5}
                  />
                ))}
              </>
            ) : (
              <rect
                x={c.cx - c.w / 2}
                y={c.cy - c.h / 2}
                width={c.w}
                height={c.h}
                fill="none"
                stroke="#6b7280"
                strokeWidth={1}
                strokeDasharray={c.typeName.toLowerCase().includes('undermount') ? '4 2' : undefined}
              />
            )}

            {/* Cutout label */}
            <text
              x={c.cx}
              y={c.cy}
              textAnchor="middle"
              dominantBaseline="middle"
              className="text-[8px] fill-gray-500 select-none"
            >
              {cutoutLabel(c.typeName)}
            </text>

            {/* Remove button (edit mode, on hover) */}
            {isEditMode && onCutoutRemove && hoveredCutout === c.id && (
              <g
                onClick={(e) => {
                  e.stopPropagation();
                  onCutoutRemove(c.id);
                }}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  cx={c.cx + c.w / 2 - 2}
                  cy={c.cy - c.h / 2 + 2}
                  r={6}
                  fill="white"
                  stroke="#ef4444"
                  strokeWidth={1}
                />
                <text
                  x={c.cx + c.w / 2 - 2}
                  y={c.cy - c.h / 2 + 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-[8px] fill-red-500 font-bold select-none"
                >
                  ✕
                </text>
              </g>
            )}
          </g>
        ))}
      </svg>

      {/* Edge profile popover */}
      {popover && (
        <EdgeProfilePopover
          isOpen={true}
          position={{ x: popover.x, y: popover.y }}
          currentProfileId={edgeIds[popover.side]}
          profiles={edgeTypes}
          isMitred={isMitred}
          onSelect={handleProfileSelect}
          onClose={() => setPopover(null)}
        />
      )}

      {/* Legend */}
      <div className="flex items-center gap-3 mt-1 px-1 flex-wrap">
        {legendItems.map((item) => (
          <span key={item.code} className="flex items-center gap-1 text-[10px] text-gray-500">
            <span
              className="inline-block w-3 h-0.5 rounded"
              style={{ backgroundColor: item.colour }}
            />
            {item.code}={item.name}
          </span>
        ))}
      </div>

      {/* Edit mode hint + add cutout */}
      {isEditMode && (
        <div className="flex items-center gap-3 mt-1 px-1">
          <span className="text-[10px] text-gray-400 italic">
            Click any edge to change profile
          </span>
          {onCutoutAdd && cutoutTypes.length > 0 && (
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCutoutDialog(!showCutoutDialog);
                }}
                className="text-[10px] text-primary-600 hover:text-primary-700 font-medium"
              >
                + Add Cutout
              </button>
              {showCutoutDialog && (
                <div className="absolute left-0 top-5 z-50">
                  <CutoutAddDialogInline
                    cutoutTypes={cutoutTypes}
                    onAdd={handleCutoutAddClick}
                    onClose={() => setShowCutoutDialog(false)}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Inline Cutout Add (to avoid circular import) ────────────────────────────

function CutoutAddDialogInline({
  cutoutTypes,
  onAdd,
  onClose,
}: {
  cutoutTypes: Array<{ id: string; name: string; baseRate: number }>;
  onAdd: (cutoutTypeId: string) => void;
  onClose: () => void;
}) {
  // Dynamically import to keep this file from getting heavy
  // Use inline implementation for simplicity
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[200px]"
    >
      <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 border-b border-gray-100">
        Select Cutout Type
      </div>
      <div className="max-h-[180px] overflow-y-auto">
        {cutoutTypes.map((ct) => (
          <button
            key={ct.id}
            onClick={(e) => {
              e.stopPropagation();
              onAdd(ct.id);
            }}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {ct.name}
          </button>
        ))}
      </div>
    </div>
  );
}

