'use client';

/**
 * StreamlinedAnalysisView — tradie-friendly display of AI drawing analysis results.
 *
 * Layout: Room → Piece → Dimensions → Mini SVG (edges)
 * Detail (AI notes, confidence, clarifications) hidden in accordion by default.
 *
 * Rule 33: Mini SVG IS the edge display — no old-style controls.
 * Rule 44: Uses only SVG-based edge display (compliant).
 * Rule 45: ALL hooks before any conditional returns.
 */

import { useState, useMemo } from 'react';
import { edgeColour, edgeCode } from './PieceVisualEditor';

// ── Types ────────────────────────────────────────────────────────────────────

interface AnalysisRoom {
  name: string;
  pieces: AnalysisPiece[];
}

interface AnalysisPiece {
  pieceNumber?: number;
  name: string;
  pieceType?: string;
  shape?: string;
  length: number;
  width: number;
  thickness: number;
  cutouts?: Array<{ type: string }>;
  notes?: string;
  confidence?: number;
  edges?: {
    top?: string;
    bottom?: string;
    left?: string;
    right?: string;
  };
}

interface AnalysisMetadata {
  jobNumber?: string | null;
  defaultThickness?: number;
  defaultOverhang?: number;
}

interface AnalysisData {
  drawingType?: string;
  metadata?: AnalysisMetadata;
  rooms?: AnalysisRoom[];
  warnings?: string[];
  questionsForUser?: string[];
}

export interface StreamlinedAnalysisViewProps {
  analysisResult: AnalysisData;
  drawingName: string;
  projectName: string;
  onCreateQuote: () => void;
  onEditQuickView: () => void;
  onEditDetailedBuilder: () => void;
}

// ── Confidence helpers ───────────────────────────────────────────────────────

function confidenceLabel(avg: number): string {
  if (avg >= 0.85) return 'Excellent';
  if (avg >= 0.7) return 'Good';
  if (avg >= 0.5) return 'Fair';
  return 'Low';
}

function confidenceDots(avg: number): string {
  if (avg >= 0.85) return '\u25CF\u25CF\u25CF\u25CF';
  if (avg >= 0.7) return '\u25CF\u25CF\u25CF\u25CB';
  if (avg >= 0.5) return '\u25CF\u25CF\u25CB\u25CB';
  return '\u25CF\u25CB\u25CB\u25CB';
}

function confidenceColourClass(avg: number): string {
  if (avg >= 0.85) return 'text-green-600';
  if (avg >= 0.7) return 'text-amber-600';
  if (avg >= 0.5) return 'text-orange-500';
  return 'text-red-500';
}

// ── Edge mapping: AI edge finish string → display name for edgeColour/edgeCode ──

function mapEdgeFinish(finish: string | undefined): string | undefined {
  if (!finish) return undefined;
  const upper = finish.toUpperCase();
  if (upper === 'RAW' || upper === 'UNKNOWN' || upper === 'NONE' || upper === '') return undefined;
  if (upper.includes('PENCIL')) return 'Pencil Round';
  if (upper.includes('BULLNOSE')) return 'Bullnose';
  if (upper.includes('OGEE')) return 'Ogee';
  if (upper.includes('BEVEL')) return 'Bevelled';
  if (upper.includes('MITR')) return 'Mitred';
  if (upper.includes('POLISH')) return 'Polished';
  return finish;
}

// ── Mini SVG for a single piece ──────────────────────────────────────────────

const SVG_W = 200;
const SVG_H = 120;
const PAD = 32;

interface MiniPieceSVGProps {
  piece: AnalysisPiece;
}

function MiniPieceSVG({ piece }: MiniPieceSVGProps) {
  const maxInnerW = SVG_W - PAD * 2;
  const maxInnerH = SVG_H - PAD * 2;
  const aspectRatio = piece.length / Math.max(piece.width, 1);

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

  const edges = piece.edges || {};

  const edgeDefs = {
    top: {
      x1: x, y1: y, x2: x + innerW, y2: y,
      labelX: x + innerW / 2, labelY: y - 8,
      anchor: 'middle' as const,
      finish: mapEdgeFinish(edges.top),
    },
    bottom: {
      x1: x, y1: y + innerH, x2: x + innerW, y2: y + innerH,
      labelX: x + innerW / 2, labelY: y + innerH + 12,
      anchor: 'middle' as const,
      finish: mapEdgeFinish(edges.bottom),
    },
    left: {
      x1: x, y1: y, x2: x, y2: y + innerH,
      labelX: x - 4, labelY: y + innerH / 2,
      anchor: 'end' as const,
      finish: mapEdgeFinish(edges.left),
    },
    right: {
      x1: x + innerW, y1: y, x2: x + innerW, y2: y + innerH,
      labelX: x + innerW + 4, labelY: y + innerH / 2,
      anchor: 'start' as const,
      finish: mapEdgeFinish(edges.right),
    },
  };

  const sides: Array<'top' | 'bottom' | 'left' | 'right'> = ['top', 'bottom', 'left', 'right'];

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      width={SVG_W}
      height={SVG_H}
      className="flex-shrink-0"
    >
      {/* Piece rectangle */}
      <rect
        x={x} y={y}
        width={innerW} height={innerH}
        fill="#f5f5f5" stroke="#e5e7eb" strokeWidth={1}
      />
      {/* Dimension label */}
      <text
        x={x + innerW / 2} y={y + innerH / 2}
        textAnchor="middle" dominantBaseline="middle"
        className="text-[8px] fill-gray-400 select-none"
      >
        {piece.length} x {piece.width}
      </text>

      {/* Edges */}
      {sides.map((side) => {
        const def = edgeDefs[side];
        const isFinished = !!def.finish;
        const colour = edgeColour(def.finish);
        const code = edgeCode(def.finish);

        return (
          <g key={side}>
            <line
              x1={def.x1} y1={def.y1} x2={def.x2} y2={def.y2}
              stroke={colour}
              strokeWidth={isFinished ? 2.5 : 1}
              strokeDasharray={isFinished ? undefined : '3 2'}
            />
            <text
              x={def.labelX} y={def.labelY}
              textAnchor={def.anchor} dominantBaseline="middle"
              className={`select-none ${isFinished ? 'text-[9px] font-semibold' : 'text-[8px]'}`}
              fill={colour}
            >
              {code}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function StreamlinedAnalysisView({
  analysisResult,
  drawingName,
  projectName,
  onCreateQuote,
  onEditQuickView,
  onEditDetailedBuilder,
}: StreamlinedAnalysisViewProps) {
  // ── ALL hooks at the TOP (Rule 45) ──
  const [expandedRooms, setExpandedRooms] = useState<Record<string, boolean>>({});

  const rooms = useMemo(() => analysisResult.rooms || [], [analysisResult.rooms]);

  const totalPieces = useMemo(
    () => rooms.reduce((sum, r) => sum + r.pieces.length, 0),
    [rooms],
  );

  const avgConfidence = useMemo(() => {
    const allPieces = rooms.flatMap((r) => r.pieces);
    if (allPieces.length === 0) return 0;
    const total = allPieces.reduce((sum, p) => sum + (p.confidence ?? 0.5), 0);
    return total / allPieces.length;
  }, [rooms]);

  // ── Null guard after hooks (Rule 36) ──
  if (!analysisResult) return null;

  const toggleRoom = (roomName: string) => {
    setExpandedRooms((prev) => ({
      ...prev,
      [roomName]: !prev[roomName],
    }));
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Analysis Results</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
          {projectName && <span>Quote: {projectName}</span>}
          <span>Drawing: {drawingName}</span>
          <span className={confidenceColourClass(avgConfidence)}>
            AI Confidence: {confidenceDots(avgConfidence)} {confidenceLabel(avgConfidence)}
          </span>
        </div>
      </div>

      {/* Rooms + pieces */}
      {rooms.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">
          No pieces detected in this drawing. Try uploading a clearer image or use the manual builder.
        </div>
      ) : (
        <div className="space-y-6">
          {rooms.map((room) => (
            <div key={room.name} className="card overflow-hidden">
              {/* Room header */}
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
                  {room.name}{' '}
                  <span className="text-gray-400 font-normal normal-case">
                    ({room.pieces.length} piece{room.pieces.length !== 1 ? 's' : ''} detected)
                  </span>
                </h2>
              </div>

              {/* Pieces */}
              <div className="divide-y divide-gray-100">
                {room.pieces.map((piece, idx) => (
                  <div key={`${room.name}-${idx}`} className="px-4 py-3">
                    <div className="flex items-start gap-4">
                      {/* Mini SVG */}
                      <MiniPieceSVG piece={piece} />

                      {/* Piece info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="font-medium text-gray-900">{piece.name}</span>
                          {piece.pieceNumber != null && (
                            <span className="text-xs text-gray-400">#{piece.pieceNumber}</span>
                          )}
                        </div>

                        <p className="text-sm text-gray-600 mt-0.5">
                          {piece.length} &times; {piece.width}mm &middot; {piece.thickness}mm
                        </p>

                        {/* Cutouts */}
                        {piece.cutouts && piece.cutouts.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {piece.cutouts.map((c, ci) => (
                              <span
                                key={ci}
                                className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded"
                              >
                                {c.type}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Confidence indicator */}
                        {piece.confidence != null && piece.confidence < 0.7 && (
                          <p className="text-xs text-orange-500 mt-1">
                            Low confidence &mdash; verify dimensions
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Accordion: AI detail (collapsed by default) */}
              <div className="border-t border-gray-100">
                <button
                  onClick={() => toggleRoom(room.name)}
                  className="w-full px-4 py-2 text-left text-xs text-gray-500 hover:bg-gray-50 flex items-center gap-1 transition-colours"
                >
                  <span
                    className="inline-block transition-transform"
                    style={{
                      transform: expandedRooms[room.name] ? 'rotate(90deg)' : 'rotate(0deg)',
                    }}
                  >
                    &#9656;
                  </span>
                  Details &amp; AI Notes
                </button>

                {expandedRooms[room.name] && (
                  <div className="px-4 pb-3 text-xs text-gray-500 space-y-2">
                    {room.pieces.map((piece, idx) => (
                      <div key={`detail-${room.name}-${idx}`}>
                        <span className="font-medium text-gray-700">{piece.name}:</span>
                        {piece.notes && (
                          <span className="ml-1">{piece.notes}</span>
                        )}
                        {piece.confidence != null && (
                          <span className="ml-2 text-gray-400">
                            (confidence: {Math.round(piece.confidence * 100)}%)
                          </span>
                        )}
                        {piece.shape && (
                          <span className="ml-2 text-gray-400">Shape: {piece.shape}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Warnings / questions from AI */}
      {((analysisResult.warnings && analysisResult.warnings.length > 0) ||
        (analysisResult.questionsForUser && analysisResult.questionsForUser.length > 0)) && (
        <div className="mt-6 card p-4">
          {analysisResult.warnings && analysisResult.warnings.length > 0 && (
            <div className="mb-3">
              <h3 className="text-xs font-semibold text-amber-700 uppercase mb-1">Warnings</h3>
              <ul className="text-sm text-gray-600 list-disc list-inside space-y-0.5">
                {analysisResult.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          {analysisResult.questionsForUser && analysisResult.questionsForUser.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-blue-700 uppercase mb-1">Needs Clarification</h3>
              <ul className="text-sm text-gray-600 list-disc list-inside space-y-0.5">
                {analysisResult.questionsForUser.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Summary */}
      <div className="mt-6 text-sm text-gray-500">
        {totalPieces} piece{totalPieces !== 1 ? 's' : ''} across {rooms.length} room{rooms.length !== 1 ? 's' : ''}
        {analysisResult.metadata?.defaultThickness && (
          <span> &middot; Default thickness: {analysisResult.metadata.defaultThickness}mm</span>
        )}
      </div>

      {/* Actions */}
      <div className="mt-6 flex flex-wrap gap-3">
        <button onClick={onEditQuickView} className="btn-secondary">
          Edit in Quick View
        </button>
        <button onClick={onEditDetailedBuilder} className="btn-secondary">
          Edit in Detailed Builder
        </button>
      </div>
      <div className="mt-3">
        <button onClick={onCreateQuote} className="btn-primary">
          Create Quote &rarr;
        </button>
      </div>
    </div>
  );
}
