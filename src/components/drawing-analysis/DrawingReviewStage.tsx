'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { DrawingCatalogue } from '@/lib/types/drawing-catalogue';
import { logCorrection, CorrectionPayload } from '@/lib/services/correction-logger';
import MaterialPickerV2 from '@/components/quotes/MaterialPickerV2';
import { protoPieceToCanonicalGeometrySnapshot } from '@/lib/services/proto-geometry-adapter';
import type { Edge, EdgeId, Piece, Vertex, VertexId } from '@stonehenge-proto/geometry';

interface EdgeSelections {
  edgeTop: string | null;
  edgeBottom: string | null;
  edgeLeft: string | null;
  edgeRight: string | null;
}

interface ExtractedPiece {
  id: string;
  pieceNumber: number;
  name: string;
  materialId?: number | null;
  materialName?: string | null;
  shape?: string;
  shapeConfig?: Record<string, unknown> | null;
  edgeArcConfig?: Record<string, string | null> | null;
  length: number;
  width: number;
  thickness: number;
  room: string;
  confidence: number;
  notes: string | null;
  cutouts: { type: string }[];
  isEditing: boolean;
  edgeSelections: EdgeSelections;
}

interface DrawingReviewStageProps {
  pieces: ExtractedPiece[];
  catalogue: DrawingCatalogue;
  onConfirm: (pieces: ExtractedPiece[]) => void;
  onBack?: () => void;
  onCancel?: () => void;
  quoteId?: number;
  drawingId?: string;
  analysisId?: number;
  isImporting?: boolean;
  importError?: string | null;
}

interface DrawingDetails {
  id: string;
  filename: string;
  mimeType: string;
  url: string;
}

function confidenceLevel(c: number): 'high' | 'amber' | 'red' {
  if (c >= 0.85) return 'high';
  if (c >= 0.50) return 'amber';
  return 'red';
}

function aiConfidenceLabel(c: number): CorrectionPayload['aiConfidence'] {
  if (c >= 0.85) return 'HIGH';
  if (c >= 0.50) return 'MEDIUM';
  return 'LOW';
}

function cellClassName(piece: ExtractedPiece, isNull: boolean): string {
  if (isNull || piece.confidence < 0.50) {
    return 'bg-red-50 border-red-200';
  }
  if (piece.confidence < 0.85) {
    return 'bg-amber-50 border-amber-200';
  }
  return '';
}

function cellTooltip(piece: ExtractedPiece, isNull: boolean): string | undefined {
  if (isNull) return 'Missing value — must be set before importing';
  if (piece.confidence < 0.50) return 'AI confidence is low — verify this value';
  if (piece.confidence < 0.85) return 'AI was less certain about this value — verify before importing';
  return undefined;
}

function countFinishedEdges(edges: EdgeSelections): number {
  return [edges.edgeTop, edges.edgeBottom, edges.edgeLeft, edges.edgeRight]
    .filter(e => e !== null && e !== '').length;
}

const SHAPE_LABELS: Record<string, string> = {
  RECTANGLE: 'Rectangle',
  L_SHAPE: 'L-Shape',
  U_SHAPE: 'U-Shape',
  IRREGULAR: 'Irregular',
  RADIUS_END: 'Radius End',
  ROUNDED_RECT: 'Rounded Rect',
  ROUNDED_RECTANGLE: 'Rounded Rect',
  FULL_CIRCLE: 'Full Circle',
  CONCAVE_ARC: 'Concave Arc',
};

const SHAPES_REQUIRING_CONFIG = new Set([
  'L_SHAPE',
  'U_SHAPE',
  'RADIUS_END',
  'ROUNDED_RECT',
  'FULL_CIRCLE',
  'CONCAVE_ARC',
  'POLYGON',
  'IRREGULAR',
]);

function hasShapeConfig(piece: ExtractedPiece): boolean {
  return !!piece.shapeConfig && typeof piece.shapeConfig === 'object';
}

function hasIncompleteGeometry(piece: ExtractedPiece): boolean {
  if (!piece.shape || piece.shape === 'RECTANGLE') return false;
  if (!SHAPES_REQUIRING_CONFIG.has(piece.shape)) return false;
  return !hasShapeConfig(piece);
}

type TracePoint = { id: string; x: number; y: number };

function defaultTracePoints(piece: ExtractedPiece): TracePoint[] {
  const length = Math.max(Number(piece.length) || 2400, 300);
  const width = Math.max(Number(piece.width) || 600, 200);
  const key = piece.id.replace(/[^a-z0-9_-]/gi, '-');

  if (piece.shape === 'L_SHAPE') {
    const returnDepth = Math.max(Math.round(width * 0.55), 250);
    const returnLength = Math.max(Math.round(length * 0.45), 450);
    return [
      { id: `${key}-v0`, x: 0, y: 0 },
      { id: `${key}-v1`, x: length, y: 0 },
      { id: `${key}-v2`, x: length, y: width },
      { id: `${key}-v3`, x: returnLength, y: width },
      { id: `${key}-v4`, x: returnLength, y: width + returnDepth },
      { id: `${key}-v5`, x: 0, y: width + returnDepth },
    ];
  }

  if (piece.shape === 'U_SHAPE') {
    const leg = Math.max(Math.round(length * 0.25), 350);
    const returnDepth = Math.max(Math.round(width * 0.65), 300);
    return [
      { id: `${key}-v0`, x: 0, y: 0 },
      { id: `${key}-v1`, x: length, y: 0 },
      { id: `${key}-v2`, x: length, y: width + returnDepth },
      { id: `${key}-v3`, x: length - leg, y: width + returnDepth },
      { id: `${key}-v4`, x: length - leg, y: width },
      { id: `${key}-v5`, x: leg, y: width },
      { id: `${key}-v6`, x: leg, y: width + returnDepth },
      { id: `${key}-v7`, x: 0, y: width + returnDepth },
    ];
  }

  if (piece.shape === 'RADIUS_END' || piece.shape === 'ROUNDED_RECT' || piece.shape === 'CONCAVE_ARC') {
    const radius = Math.round(width / 2);
    return [
      { id: `${key}-v0`, x: 0, y: 0 },
      { id: `${key}-v1`, x: length - radius, y: 0 },
      { id: `${key}-v2`, x: length, y: Math.round(width / 2) },
      { id: `${key}-v3`, x: length - radius, y: width },
      { id: `${key}-v4`, x: 0, y: width },
    ];
  }

  const chamfer = Math.min(Math.round(width * 0.45), Math.round(length * 0.25));
  return [
    { id: `${key}-v0`, x: 0, y: 0 },
    { id: `${key}-v1`, x: length, y: 0 },
    { id: `${key}-v2`, x: length, y: Math.max(width - chamfer, 1) },
    { id: `${key}-v3`, x: Math.max(length - chamfer, 1), y: width },
    { id: `${key}-v4`, x: 0, y: width },
  ];
}

function inferTraceEdgeSide(a: TracePoint, b: TracePoint): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'top' : 'bottom';
  }
  return dy >= 0 ? 'right' : 'left';
}

function firstFinishedEdge(piece: ExtractedPiece): string | null {
  return piece.edgeSelections.edgeBottom ||
    piece.edgeSelections.edgeTop ||
    piece.edgeSelections.edgeLeft ||
    piece.edgeSelections.edgeRight ||
    null;
}

function buildPolygonConfigFromTrace(piece: ExtractedPiece, points: TracePoint[]) {
  const vertices: Vertex[] = points.map(point => ({
    id: point.id as VertexId,
    x: Math.round(point.x),
    y: Math.round(point.y),
  }));
  const defaultEdgeTypeId = firstFinishedEdge(piece);
  const edges: Array<Edge & { v2EdgeSide: string; v2EdgeTypeId: string | null }> = vertices.map((vertex, index) => {
    const nextVertex = vertices[(index + 1) % vertices.length];
    const side = inferTraceEdgeSide(points[index], points[(index + 1) % points.length]);
    const edgeTypeId =
      piece.edgeSelections[side === 'top' ? 'edgeTop' : side === 'bottom' ? 'edgeBottom' : side === 'left' ? 'edgeLeft' : 'edgeRight'] ||
      defaultEdgeTypeId;

    return {
      id: `${piece.id.replace(/[^a-z0-9_-]/gi, '-')}-e${index}` as EdgeId,
      start: vertex.id,
      end: nextVertex.id,
      profile: edgeTypeId ? 'pencil-round' : 'raw',
      finish: edgeTypeId ? 'polished' : 'unfinished',
      exposure: 'exposed',
      generatedBy: 'import',
      v2EdgeSide: `edge-${index + 1}`,
      v2EdgeTypeId: edgeTypeId ?? null,
    };
  });

  const protoPiece: Piece = {
    id: `drawing-review-${piece.id}` as Piece['id'],
    name: piece.name || 'Traced piece',
    pieceRole: 'BENCHTOP',
    materialId: String(piece.materialId ?? piece.materialName ?? 'unassigned'),
    thicknessMm: piece.thickness || 20,
    vertices,
    edges,
    outerRing: {
      edges: edges.map(edge => edge.id),
      orientation: 'ccw',
    },
    innerRings: [],
    features: [],
  };

  return protoPieceToCanonicalGeometrySnapshot(protoPiece);
}

function PolygonTraceModal({
  piece,
  quoteId,
  drawingId,
  onSave,
  onClose,
}: {
  piece: ExtractedPiece;
  quoteId?: number;
  drawingId?: string;
  onSave: (pieceId: string, shapeConfig: Record<string, unknown>, length: number, width: number) => void;
  onClose: () => void;
}) {
  const [points, setPoints] = useState<TracePoint[]>(() => defaultTracePoints(piece));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const svgWidth = 620;
  const svgHeight = 360;
  const padding = 34;

  const bounds = useMemo(() => {
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }, [points]);

  const scale = useMemo(() => {
    const width = Math.max(bounds.maxX - bounds.minX, 1);
    const height = Math.max(bounds.maxY - bounds.minY, 1);
    return Math.min((svgWidth - padding * 2) / width, (svgHeight - padding * 2) / height);
  }, [bounds, padding]);

  const toScreen = useCallback((point: TracePoint) => ({
    x: padding + (point.x - bounds.minX) * scale,
    y: svgHeight - padding - (point.y - bounds.minY) * scale,
  }), [bounds, scale, padding]);

  const fromScreen = useCallback((clientX: number, clientY: number, svg: SVGSVGElement) => {
    const rect = svg.getBoundingClientRect();
    const x = (clientX - rect.left - padding) / scale + bounds.minX;
    const y = (svgHeight - padding - (clientY - rect.top)) / scale + bounds.minY;
    return {
      x: Math.max(0, Math.round(x)),
      y: Math.max(0, Math.round(y)),
    };
  }, [bounds, scale, padding]);

  const path = useMemo(() => {
    const screenPoints = points.map(toScreen);
    if (screenPoints.length === 0) return '';
    return [
      `M ${screenPoints[0].x} ${screenPoints[0].y}`,
      ...screenPoints.slice(1).map(point => `L ${point.x} ${point.y}`),
      'Z',
    ].join(' ');
  }, [points, toScreen]);

  const updatePoint = useCallback((id: string, next: Partial<TracePoint>) => {
    setPoints(prev => prev.map(point => point.id === id ? { ...point, ...next } : point));
  }, []);

  const insertVertexAfter = useCallback((index: number) => {
    setPoints(prev => {
      const current = prev[index];
      const next = prev[(index + 1) % prev.length];
      const inserted = {
        id: `${piece.id.replace(/[^a-z0-9_-]/gi, '-')}-v${Date.now()}`,
        x: Math.round((current.x + next.x) / 2),
        y: Math.round((current.y + next.y) / 2),
      };
      return [...prev.slice(0, index + 1), inserted, ...prev.slice(index + 1)];
    });
  }, [piece.id]);

  const removeVertex = useCallback((id: string) => {
    setPoints(prev => prev.length <= 3 ? prev : prev.filter(point => point.id !== id));
  }, []);

  const saveTrace = useCallback(() => {
    setError(null);
    try {
      const config = buildPolygonConfigFromTrace(piece, points);
      onSave(piece.id, config as unknown as Record<string, unknown>, Math.round(config.boundingBox.lengthMm), Math.round(config.boundingBox.widthMm));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The traced shape is not valid yet.');
    }
  }, [onSave, piece, points]);

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4">
      <div className="w-[min(1180px,96vw)] max-h-[92vh] overflow-hidden rounded-xl bg-white shadow-2xl border border-zinc-200 flex flex-col">
        <div className="px-5 py-4 border-b border-zinc-200 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900">Trace spatial geometry</h3>
            <p className="text-sm text-zinc-600">
              Drag vertices to match the drawing. Add points for angled joins, chamfers, curves approximated as segments, or notches.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50"
            aria-label="Close spatial trace"
          >
            ×
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(300px,36%)_minmax(0,1fr)_330px] gap-0 overflow-auto">
          <div className="p-5 bg-zinc-50 border-r border-zinc-200">
            <DrawingSourcePreview drawingId={drawingId} quoteId={quoteId} />
          </div>

          <div className="p-5 bg-zinc-50">
            <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-zinc-700">
              <span className="font-medium">{piece.name}</span>
              <span>{Math.round(bounds.maxX - bounds.minX)} x {Math.round(bounds.maxY - bounds.minY)}mm bounding box</span>
              <span>{points.length} vertices</span>
            </div>
            <svg
              width={svgWidth}
              height={svgHeight}
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="max-w-full rounded-lg border border-zinc-200 bg-white touch-none"
              onMouseMove={(event) => {
                if (!draggingId) return;
                const svg = event.currentTarget;
                updatePoint(draggingId, fromScreen(event.clientX, event.clientY, svg));
              }}
              onMouseUp={() => setDraggingId(null)}
              onMouseLeave={() => setDraggingId(null)}
            >
              <defs>
                <pattern id="trace-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                  <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#e4e4e7" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#trace-grid)" />
              <path d={path} fill="#eff6ff" stroke="#2563eb" strokeWidth="3" />
              {points.map((point, index) => {
                const screen = toScreen(point);
                const next = toScreen(points[(index + 1) % points.length]);
                return (
                  <g key={point.id}>
                    <text
                      x={(screen.x + next.x) / 2}
                      y={(screen.y + next.y) / 2 - 8}
                      textAnchor="middle"
                      className="fill-blue-700 text-[11px] font-semibold"
                    >
                      {Math.round(Math.hypot(points[(index + 1) % points.length].x - point.x, points[(index + 1) % points.length].y - point.y))}mm
                    </text>
                    <circle
                      cx={screen.x}
                      cy={screen.y}
                      r="7"
                      className="fill-white stroke-blue-600 cursor-move"
                      strokeWidth="3"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        setDraggingId(point.id);
                      }}
                    />
                    <text x={screen.x} y={screen.y - 12} textAnchor="middle" className="fill-zinc-600 text-[10px]">
                      {index + 1}
                    </text>
                  </g>
                );
              })}
            </svg>
            {error && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          <div className="p-5 border-l border-zinc-200 bg-white">
            <h4 className="text-sm font-semibold text-zinc-800 mb-2">Vertices</h4>
            <div className="space-y-2 max-h-[430px] overflow-auto pr-1">
              {points.map((point, index) => (
                <div key={point.id} className="rounded-lg border border-zinc-200 p-2">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-medium text-zinc-600">Point {index + 1}</span>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => insertVertexAfter(index)} className="text-xs text-primary-600 hover:text-primary-700">
                        + point
                      </button>
                      <button type="button" onClick={() => removeVertex(point.id)} className="text-xs text-red-500 hover:text-red-700 disabled:text-zinc-300" disabled={points.length <= 3}>
                        remove
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-zinc-500">
                      X mm
                      <input
                        type="number"
                        value={Math.round(point.x)}
                        onChange={(event) => updatePoint(point.id, { x: Number(event.target.value) || 0 })}
                        className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="text-xs text-zinc-500">
                      Y mm
                      <input
                        type="number"
                        value={Math.round(point.y)}
                        onChange={(event) => updatePoint(point.id, { y: Number(event.target.value) || 0 })}
                        className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
              <button type="button" onClick={saveTrace} className="btn-primary">Use traced geometry</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DrawingSourcePreview({ drawingId, quoteId }: { drawingId?: string; quoteId?: number }) {
  const [details, setDetails] = useState<DrawingDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!drawingId) {
      setDetails(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetch(`/api/drawings/${drawingId}/details`)
      .then(async response => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || 'Could not load drawing preview');
        }
        return response.json();
      })
      .then(data => {
        if (!cancelled) {
          setDetails(data as DrawingDetails);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load drawing preview');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [drawingId]);

  const isPdf = details?.mimeType?.includes('pdf') || details?.filename?.toLowerCase().endsWith('.pdf');
  const isImage = details?.mimeType?.startsWith('image/');

  return (
    <aside className="lg:sticky lg:top-0 h-[520px] lg:h-[calc(90vh-190px)] min-h-[420px] rounded-lg border border-zinc-200 bg-zinc-50 overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b border-zinc-200 bg-white flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Source Drawing</p>
          <p className="text-sm font-medium text-zinc-800 truncate">
            {details?.filename || (drawingId ? 'Loading drawing...' : 'No drawing linked')}
          </p>
        </div>
        {quoteId && drawingId && (
          <a
            href={`/quotes/${quoteId}/drawings/${drawingId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-xs font-medium text-primary-600 hover:text-primary-700"
          >
            Open
          </a>
        )}
      </div>

      <div className="flex-1 bg-zinc-100">
        {isLoading && (
          <div className="h-full flex items-center justify-center text-sm text-zinc-500">
            Loading drawing preview...
          </div>
        )}

        {!isLoading && error && (
          <div className="h-full flex items-center justify-center p-4 text-center text-sm text-red-600">
            {error}
          </div>
        )}

        {!isLoading && !error && !drawingId && (
          <div className="h-full flex items-center justify-center p-4 text-center text-sm text-zinc-500">
            The source drawing was not linked to this review. Open the quote drawings panel to cross-check the file.
          </div>
        )}

        {!isLoading && !error && details && isPdf && (
          <iframe
            title={details.filename}
            src={`${details.url}#view=FitH`}
            className="w-full h-full border-0 bg-white"
          />
        )}

        {!isLoading && !error && details && isImage && (
          <div className="h-full w-full overflow-auto bg-white">
            <img
              src={details.url}
              alt={details.filename}
              className="max-w-none min-w-full h-auto"
            />
          </div>
        )}

        {!isLoading && !error && details && !isPdf && !isImage && (
          <div className="h-full flex items-center justify-center p-4 text-center text-sm text-zinc-500">
            Preview is not available for this file type. Use Open to view the source drawing.
          </div>
        )}
      </div>
    </aside>
  );
}

export function DrawingReviewStage({
  pieces: initialPieces,
  catalogue,
  onConfirm,
  onBack,
  onCancel,
  quoteId,
  drawingId,
  analysisId,
  isImporting = false,
  importError = null,
}: DrawingReviewStageProps) {
  const [pieces, setPieces] = useState<ExtractedPiece[]>(initialPieces);
  const [editingCutouts, setEditingCutouts] = useState<string | null>(null);
  const [tracePieceId, setTracePieceId] = useState<string | null>(null);

  // Group pieces by room for visual sections
  const roomGroups = useMemo(() => {
    const groups: { name: string; pieces: ExtractedPiece[] }[] = [];
    const roomMap = new Map<string, ExtractedPiece[]>();
    for (const piece of pieces) {
      const room = piece.room || 'Unassigned';
      if (!roomMap.has(room)) {
        roomMap.set(room, []);
        groups.push({ name: room, pieces: roomMap.get(room)! });
      }
      roomMap.get(room)!.push(piece);
    }
    return groups;
  }, [pieces]);

  // Count red and amber cells
  const { redCount, amberCount } = useMemo(() => {
    let red = 0;
    let amber = 0;
    for (const p of pieces) {
      const level = confidenceLevel(p.confidence);
      if (hasIncompleteGeometry(p)) red++;
      // Each dimension cell (length, width, thickness) counts individually
      if (p.length === 0 || p.length === null) red++;
      else if (level === 'red') red++;
      else if (level === 'amber') amber++;

      if (p.width === 0 || p.width === null) red++;
      else if (level === 'red') red++;
      else if (level === 'amber') amber++;

      // Thickness: always has a value (20 or 40), but low confidence still flags
      if (level === 'red') red++;
      else if (level === 'amber') amber++;
    }
    return { redCount: red, amberCount: amber };
  }, [pieces]);

  const canConfirm = redCount === 0;
  const pickerMaterials = useMemo(() => catalogue.materials, [catalogue.materials]);
  const tracePiece = useMemo(() => pieces.find(piece => piece.id === tracePieceId) ?? null, [pieces, tracePieceId]);

  // Unique rooms for room dropdown
  const roomOptions = useMemo(() => {
    const rooms = new Set(pieces.map(p => p.room));
    // Add standard rooms
    ['Kitchen', 'Bathroom', 'Laundry', 'Ensuite', 'Butler\'s Pantry', 'Other'].forEach(r => rooms.add(r));
    return Array.from(rooms).sort();
  }, [pieces]);

  // Fire correction log — fire-and-forget
  const fireCorrection = useCallback((
    correctionType: CorrectionPayload['correctionType'],
    fieldName: string,
    originalValue: unknown,
    correctedValue: unknown,
    pieceConfidence: number,
  ) => {
    logCorrection({
      drawingId,
      analysisId,
      quoteId,
      correctionType,
      fieldName,
      originalValue,
      correctedValue,
      aiConfidence: aiConfidenceLabel(pieceConfidence),
    });
  }, [drawingId, analysisId, quoteId]);

  // Update a single piece field
  const updatePiece = useCallback((
    pieceId: string,
    field: keyof ExtractedPiece,
    value: unknown,
    correctionType: CorrectionPayload['correctionType'],
  ) => {
    setPieces(prev => {
      const updated = prev.map(p => {
        if (p.id !== pieceId) return p;
        const originalValue = p[field];
        if (originalValue !== value) {
          fireCorrection(correctionType, field, originalValue, value, p.confidence);
        }
        return { ...p, [field]: value };
      });
      return updated;
    });
  }, [fireCorrection]);

  // Apply material to all pieces as an explicit bulk action. Individual rows
  // remain editable because mixed-material jobs are common.
  const applyMaterialToAll = useCallback((materialId: number | null) => {
    if (materialId == null) return;
    const material = catalogue.materials.find(m => m.id === materialId);
    if (!material) return;
    setPieces(prev => prev.map(p => {
      fireCorrection('MATERIAL', 'material', p.materialName ?? null, material.name, p.confidence);
      return { ...p, materialId: material.id, materialName: material.name };
    }));
  }, [catalogue.materials, fireCorrection]);

  // Apply thickness to all pieces
  const applyThicknessToAll = useCallback((thickness: number) => {
    setPieces(prev => prev.map(p => {
      if (p.thickness !== thickness) {
        fireCorrection('DIMENSION', 'thickness', p.thickness, thickness, p.confidence);
      }
      return { ...p, thickness };
    }));
  }, [fireCorrection]);

  // Update cutout for a piece
  const updateCutout = useCallback((pieceId: string, cutoutIndex: number, field: 'type', value: string) => {
    setPieces(prev => prev.map(p => {
      if (p.id !== pieceId) return p;
      const newCutouts = [...p.cutouts];
      const original = newCutouts[cutoutIndex]?.type;
      newCutouts[cutoutIndex] = { ...newCutouts[cutoutIndex], [field]: value };
      if (original !== value) {
        fireCorrection('CUTOUT_TYPE', `cutout_${cutoutIndex}_type`, original, value, p.confidence);
      }
      return { ...p, cutouts: newCutouts };
    }));
  }, [fireCorrection]);

  const addCutout = useCallback((pieceId: string) => {
    setPieces(prev => prev.map(p => {
      if (p.id !== pieceId) return p;
      return { ...p, cutouts: [...p.cutouts, { type: 'SINK' }] };
    }));
  }, []);

  const removeCutout = useCallback((pieceId: string, cutoutIndex: number) => {
    setPieces(prev => prev.map(p => {
      if (p.id !== pieceId) return p;
      const newCutouts = p.cutouts.filter((_, i) => i !== cutoutIndex);
      fireCorrection('CUTOUT_TYPE', `cutout_${cutoutIndex}_removed`, p.cutouts[cutoutIndex]?.type, null, p.confidence);
      return { ...p, cutouts: newCutouts };
    }));
  }, [fireCorrection]);

  const applyTracedGeometry = useCallback((
    pieceId: string,
    shapeConfig: Record<string, unknown>,
    length: number,
    width: number,
  ) => {
    setPieces(prev => prev.map(p => {
      if (p.id !== pieceId) return p;
      fireCorrection('DIMENSION', 'shapeConfig', p.shapeConfig ?? null, 'canonical-polygon', p.confidence);
      return {
        ...p,
        shape: 'POLYGON',
        shapeConfig,
        length,
        width,
        confidence: Math.max(p.confidence, 0.85),
      };
    }));
    setTracePieceId(null);
  }, [fireCorrection]);

  // Button label
  const buttonLabel = useMemo(() => {
    if (isImporting) return 'Importing...';
    if (redCount > 0) return `${redCount} issue${redCount !== 1 ? 's' : ''} to fix`;
    if (amberCount > 0) return 'Import reviewed pieces';
    return 'Confirm & Import →';
  }, [isImporting, redCount, amberCount]);

  const buttonClass = useMemo(() => {
    if (isImporting) return 'bg-amber-500 text-white opacity-70 cursor-wait';
    if (redCount > 0) return 'bg-red-100 text-red-700 cursor-not-allowed';
    if (amberCount > 0) return 'bg-amber-500 hover:bg-amber-600 text-white';
    return 'bg-green-600 hover:bg-green-700 text-white';
  }, [isImporting, redCount, amberCount]);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h2 className="text-lg font-semibold">Review Extracted Pieces</h2>
          <p className="text-sm text-zinc-600">
            Check each piece before importing. Edit anything that looks wrong.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onConfirm(pieces)}
            disabled={!canConfirm || isImporting}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${buttonClass}`}
          >
            {buttonLabel}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="w-9 h-9 rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800 transition-colors"
              aria-label="Close drawing import review"
              title="Close without importing"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-zinc-500 mb-4">
        {pieces.length} piece{pieces.length !== 1 ? 's' : ''} across {roomGroups.length} room{roomGroups.length !== 1 ? 's' : ''}
      </p>

      {importError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {importError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(360px,42%)_minmax(0,1fr)] gap-4">
        <DrawingSourcePreview drawingId={drawingId} quoteId={quoteId} />

        <div className="min-w-0">
          {/* Bulk defaults. These are convenience actions only; row-level material can differ. */}
          <div className="flex flex-wrap items-center gap-4 mb-4 p-3 bg-zinc-50 rounded-lg border border-zinc-200">
            <span className="text-sm font-medium text-zinc-700">Bulk defaults:</span>
            <div className="flex items-center gap-2">
              <label className="text-sm text-zinc-600">Material</label>
              <MaterialPickerV2
                materials={pickerMaterials}
                value={null}
                onChange={(materialId) => applyMaterialToAll(materialId)}
                placeholder="Select material"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-zinc-600">Thickness</label>
              <div className="inline-flex rounded-lg border border-zinc-300 overflow-hidden">
                <button
                  onClick={() => applyThicknessToAll(20)}
                  className="px-3 py-1 text-sm hover:bg-zinc-100 transition-colors"
                >
                  20mm
                </button>
                <button
                  onClick={() => applyThicknessToAll(40)}
                  className="px-3 py-1 text-sm border-l border-zinc-300 hover:bg-zinc-100 transition-colors"
                >
                  40mm
                </button>
              </div>
            </div>
          </div>

          {/* Per-room sections */}
          {roomGroups.map(group => (
            <div key={group.name} className="mb-6">
              <h3 className="text-sm font-semibold text-zinc-800 mb-2 px-1">{group.name}</h3>
              <div className="overflow-x-auto border border-zinc-200 rounded-lg">
                <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="bg-zinc-50 text-zinc-600 text-xs uppercase tracking-wider">
                  <th className="px-3 py-2 text-left font-medium">#</th>
                  <th className="px-3 py-2 text-left font-medium">Name</th>
                  <th className="px-3 py-2 text-left font-medium">Shape</th>
                  <th className="px-3 py-2 text-left font-medium">Material</th>
                  <th className="px-3 py-2 text-left font-medium">Length</th>
                  <th className="px-3 py-2 text-left font-medium">Width</th>
                  <th className="px-3 py-2 text-left font-medium">Thickness</th>
                  <th className="px-3 py-2 text-left font-medium">Cutouts</th>
                  <th className="px-3 py-2 text-left font-medium">Edges</th>
                  <th className="px-3 py-2 text-left font-medium">Room</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {group.pieces.map((piece) => {
                  const lengthNull = piece.length === 0 || piece.length === null;
                  const widthNull = piece.width === 0 || piece.width === null;
                  const edgeCount = countFinishedEdges(piece.edgeSelections);

                  return (
                    <tr key={piece.id} className="hover:bg-zinc-50">
                      {/* # */}
                      <td className="px-3 py-2 text-zinc-500">{piece.pieceNumber}</td>

                      {/* Name — inline editable */}
                      <td className="px-3 py-2 min-w-[190px]">
                        <input
                          type="text"
                          defaultValue={piece.name}
                          onBlur={(e) => {
                            if (e.target.value !== piece.name) {
                              updatePiece(piece.id, 'name', e.target.value, 'DIMENSION');
                            }
                          }}
                          className="w-full min-w-[160px] px-1 py-0.5 border border-transparent hover:border-zinc-300 focus:border-primary-500 rounded text-sm bg-transparent focus:bg-white focus:outline-none"
                        />
                      </td>

                      {/* Shape — display only */}
                      <td className="px-3 py-2">
                        {piece.shape ? (
                          <div className="space-y-1">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              hasIncompleteGeometry(piece)
                                ? 'bg-red-100 text-red-700'
                                : 'bg-zinc-100 text-zinc-700'
                            }`}>
                              {SHAPE_LABELS[piece.shape] || piece.shape}
                            </span>
                            {hasIncompleteGeometry(piece) && (
                              <div className="max-w-[170px] space-y-1">
                                <div className="text-[11px] leading-snug text-red-600">
                                  Needs polygon/spatial trace before import
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setTracePieceId(piece.id)}
                                  className="inline-flex items-center rounded border border-red-200 bg-white px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50"
                                >
                                  Trace shape
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>

                      {/* Material — per-piece editable */}
                      <td className="px-3 py-2 min-w-[220px]">
                        <MaterialPickerV2
                          materials={pickerMaterials}
                          value={piece.materialId ?? null}
                          onChange={(nextId, nextMaterial) => {
                            fireCorrection('MATERIAL', 'material', piece.materialName ?? null, nextMaterial?.name ?? null, piece.confidence);
                            setPieces(prev => prev.map(p => p.id === piece.id
                              ? { ...p, materialId: nextId, materialName: nextMaterial?.name ?? null }
                              : p
                            ));
                          }}
                          placeholder={piece.materialName || 'Select material'}
                        />
                      </td>

                      {/* Length — confidence-coloured */}
                      <td
                        className={`px-3 py-2 border ${cellClassName(piece, lengthNull)}`}
                        title={cellTooltip(piece, lengthNull)}
                      >
                        <input
                          type="number"
                          defaultValue={piece.length || ''}
                          placeholder="mm"
                          onBlur={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            if (val !== piece.length) {
                              updatePiece(piece.id, 'length', val, 'DIMENSION');
                            }
                          }}
                          className="w-20 px-1 py-0.5 border border-transparent hover:border-zinc-300 focus:border-primary-500 rounded text-sm bg-transparent focus:bg-white focus:outline-none"
                        />
                      </td>

                      {/* Width — confidence-coloured */}
                      <td
                        className={`px-3 py-2 border ${cellClassName(piece, widthNull)}`}
                        title={cellTooltip(piece, widthNull)}
                      >
                        <input
                          type="number"
                          defaultValue={piece.width || ''}
                          placeholder="mm"
                          onBlur={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            if (val !== piece.width) {
                              updatePiece(piece.id, 'width', val, 'DIMENSION');
                            }
                          }}
                          className="w-20 px-1 py-0.5 border border-transparent hover:border-zinc-300 focus:border-primary-500 rounded text-sm bg-transparent focus:bg-white focus:outline-none"
                        />
                      </td>

                      {/* Thickness — confidence-coloured, toggle */}
                      <td
                        className={`px-3 py-2 border ${cellClassName(piece, false)}`}
                        title={cellTooltip(piece, false)}
                      >
                        <div className="inline-flex rounded border border-zinc-300 overflow-hidden">
                          <button
                            onClick={() => {
                              if (piece.thickness !== 20) {
                                updatePiece(piece.id, 'thickness', 20, 'DIMENSION');
                              }
                            }}
                            className={`px-2 py-0.5 text-xs transition-colors ${
                              piece.thickness === 20
                                ? 'bg-primary-600 text-white'
                                : 'bg-white text-zinc-600 hover:bg-zinc-50'
                            }`}
                          >
                            20
                          </button>
                          <button
                            onClick={() => {
                              if (piece.thickness !== 40) {
                                updatePiece(piece.id, 'thickness', 40, 'DIMENSION');
                              }
                            }}
                            className={`px-2 py-0.5 text-xs border-l border-zinc-300 transition-colors ${
                              piece.thickness === 40
                                ? 'bg-primary-600 text-white'
                                : 'bg-white text-zinc-600 hover:bg-zinc-50'
                            }`}
                          >
                            40
                          </button>
                        </div>
                      </td>

                      {/* Cutouts — comma-separated with edit popover */}
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-zinc-600">
                            {piece.cutouts.length > 0
                              ? piece.cutouts.map(c => c.type).join(', ')
                              : 'None'}
                          </span>
                          <button
                            onClick={() => setEditingCutouts(editingCutouts === piece.id ? null : piece.id)}
                            className="text-xs text-primary-600 hover:text-primary-700 ml-1"
                          >
                            Edit
                          </button>
                        </div>
                        {editingCutouts === piece.id && (
                          <div className="absolute z-10 mt-1 p-3 bg-white border border-zinc-200 rounded-lg shadow-lg min-w-[200px]">
                            <div className="space-y-2">
                              {piece.cutouts.map((cutout, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                  <select
                                    value={cutout.type}
                                    onChange={(e) => updateCutout(piece.id, idx, 'type', e.target.value)}
                                    className="flex-1 px-2 py-1 border border-zinc-300 rounded text-xs"
                                  >
                                    {catalogue.cutoutTypes.map(ct => (
                                      <option key={ct.id} value={ct.name}>{ct.name}</option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={() => removeCutout(piece.id, idx)}
                                    className="text-red-500 hover:text-red-700 text-xs"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                              <button
                                onClick={() => addCutout(piece.id)}
                                className="text-xs text-primary-600 hover:text-primary-700"
                              >
                                + Add cutout
                              </button>
                              <button
                                onClick={() => setEditingCutouts(null)}
                                className="block text-xs text-zinc-500 hover:text-zinc-700 mt-1"
                              >
                                Done
                              </button>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Edges — display only count */}
                      <td className="px-3 py-2 text-xs text-zinc-600">
                        {edgeCount > 0
                          ? `${edgeCount} finished`
                          : <span className="text-zinc-400">None</span>}
                      </td>

                      {/* Room — dropdown */}
                      <td className="px-3 py-2">
                        <select
                          value={piece.room}
                          onChange={(e) => {
                            if (e.target.value !== piece.room) {
                              updatePiece(piece.id, 'room', e.target.value, 'ROOM_ASSIGNMENT');
                            }
                          }}
                          className="px-1 py-0.5 border border-transparent hover:border-zinc-300 focus:border-primary-500 rounded text-sm bg-transparent focus:bg-white focus:outline-none"
                        >
                          {roomOptions.map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Confidence legend */}
      <div className="mt-4 flex items-center gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-red-50 border border-red-200" />
          Low confidence / missing geometry — blocks import
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-amber-50 border border-amber-200" />
          Medium confidence — verify
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-white border border-zinc-200" />
          High confidence
        </span>
      </div>

      {/* Footer */}
      <div className="mt-6 flex justify-between gap-3">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="btn-secondary">
              ← Back to Questions
            </button>
          )}
          {onCancel && (
            <button onClick={onCancel} className="btn-secondary">
              Cancel import
            </button>
          )}
        </div>
        <div className="ml-auto">
          <button
            onClick={() => onConfirm(pieces)}
            disabled={!canConfirm || isImporting}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${buttonClass}`}
          >
            {buttonLabel}
          </button>
        </div>
      </div>

      {tracePiece && (
        <PolygonTraceModal
          piece={tracePiece}
          quoteId={quoteId}
          drawingId={drawingId}
          onSave={applyTracedGeometry}
          onClose={() => setTracePieceId(null)}
        />
      )}
    </div>
  );
}
