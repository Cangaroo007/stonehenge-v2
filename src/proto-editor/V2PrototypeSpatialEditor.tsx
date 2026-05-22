'use client';

import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState } from 'react';
import type {
  Edge,
  EdgeExposure,
  EdgeId,
  EdgeProfile,
  Feature,
  FeatureId,
  Piece,
  Vertex,
  VertexId,
} from '@stonehenge-proto/geometry';
import type { CanonicalPolygonShapeConfig } from '@/lib/types/shapes';
import { isCanonicalPolygonShapeConfig } from '@/lib/types/shapes';
import {
  protoPieceToCanonicalGeometrySnapshot,
  v2PieceToProtoPiece,
} from '@/lib/services/proto-geometry-adapter';
import { usePiece } from '@/proto-editor/hooks/usePiece';
import { useFeaturePlacement } from '@/proto-editor/hooks/useFeaturePlacement';
import type { FeaturePlacement } from '@/proto-editor/types/editor';

const PolygonCanvas = dynamic(
  () => import('@/proto-editor/components/canvas/PolygonCanvas'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[420px] items-center justify-center rounded-lg bg-zinc-900 text-sm text-zinc-300">
        Loading spatial editor...
      </div>
    ),
  },
);

export interface V2PrototypeSpatialPieceInput {
  id: string;
  name: string;
  length: number;
  width: number;
  thickness: number;
  materialId?: number | null;
  materialName?: string | null;
  shape?: string;
  shapeConfig?: Record<string, unknown> | null;
  edgeSelections: {
    edgeTop: string | null;
    edgeBottom: string | null;
    edgeLeft: string | null;
    edgeRight: string | null;
  };
}

interface V2PrototypeSpatialEditorProps {
  piece: V2PrototypeSpatialPieceInput;
  onCancel: () => void;
  onSave: (
    pieceId: string,
    shapeConfig: CanonicalPolygonShapeConfig,
    length: number,
    width: number,
  ) => void;
}

const PROFILE_OPTIONS: Array<{ value: EdgeProfile; label: string }> = [
  { value: 'raw', label: 'Raw' },
  { value: 'pencil-round', label: 'Pencil round' },
  { value: 'bevel', label: 'Bevel' },
  { value: 'mitre-45', label: 'Mitre 45' },
  { value: 'half-bullnose', label: 'Half bullnose' },
  { value: 'full-bullnose', label: 'Full bullnose' },
];

const EXPOSURE_OPTIONS: Array<{ value: EdgeExposure; label: string }> = [
  { value: 'exposed', label: 'Exposed' },
  { value: 'wall', label: 'Wall' },
  { value: 'join', label: 'Join' },
  { value: 'concealed', label: 'Concealed' },
];

const FEATURE_TOOLS: Array<{ kind: Feature['kind']; label: string }> = [
  { kind: 'undermount-sink', label: 'Undermount sink' },
  { kind: 'overmount-sink', label: 'Drop-in sink' },
  { kind: 'cooktop-cutout', label: 'Cooktop' },
  { kind: 'tap-hole', label: 'Tap hole' },
  { kind: 'custom-cutout', label: 'Custom cutout' },
];

function safeKey(value: string): string {
  return value.replace(/[^a-z0-9_-]/gi, '-');
}

function shapeSeedPoints(piece: V2PrototypeSpatialPieceInput) {
  const length = Math.max(Number(piece.length) || 2400, 300);
  const width = Math.max(Number(piece.width) || 600, 200);

  if (piece.shape === 'L_SHAPE') {
    const returnDepth = Math.max(Math.round(width * 0.55), 250);
    const returnLength = Math.max(Math.round(length * 0.45), 450);
    return [
      { x: 0, y: 0 },
      { x: length, y: 0 },
      { x: length, y: width },
      { x: returnLength, y: width },
      { x: returnLength, y: width + returnDepth },
      { x: 0, y: width + returnDepth },
    ];
  }

  if (piece.shape === 'U_SHAPE') {
    const leg = Math.max(Math.round(length * 0.25), 350);
    const returnDepth = Math.max(Math.round(width * 0.65), 300);
    return [
      { x: 0, y: 0 },
      { x: length, y: 0 },
      { x: length, y: width + returnDepth },
      { x: length - leg, y: width + returnDepth },
      { x: length - leg, y: width },
      { x: leg, y: width },
      { x: leg, y: width + returnDepth },
      { x: 0, y: width + returnDepth },
    ];
  }

  if (piece.shape === 'RADIUS_END' || piece.shape === 'ROUNDED_RECT' || piece.shape === 'CONCAVE_ARC') {
    const radius = Math.round(width / 2);
    return [
      { x: 0, y: 0 },
      { x: length - radius, y: 0 },
      { x: length, y: Math.round(width / 2) },
      { x: length - radius, y: width },
      { x: 0, y: width },
    ];
  }

  const chamfer = Math.min(Math.round(width * 0.45), Math.round(length * 0.25));
  return [
    { x: 0, y: 0 },
    { x: length, y: 0 },
    { x: length, y: Math.max(width - chamfer, 1) },
    { x: Math.max(length - chamfer, 1), y: width },
    { x: 0, y: width },
  ];
}

function inferEdgeSide(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'edgeTop' : 'edgeBottom';
  return dy >= 0 ? 'edgeRight' : 'edgeLeft';
}

function firstEdgeType(piece: V2PrototypeSpatialPieceInput) {
  return piece.edgeSelections.edgeBottom ||
    piece.edgeSelections.edgeTop ||
    piece.edgeSelections.edgeLeft ||
    piece.edgeSelections.edgeRight ||
    null;
}

function buildSeedPiece(piece: V2PrototypeSpatialPieceInput): Piece {
  if (isCanonicalPolygonShapeConfig(piece.shapeConfig)) {
    return v2PieceToProtoPiece({
      id: piece.id,
      name: piece.name,
      length_mm: piece.length,
      width_mm: piece.width,
      thickness_mm: piece.thickness,
      material_id: piece.materialId ?? piece.materialName ?? null,
      shape_config: piece.shapeConfig,
      edge_top: piece.edgeSelections.edgeTop,
      edge_right: piece.edgeSelections.edgeRight,
      edge_bottom: piece.edgeSelections.edgeBottom,
      edge_left: piece.edgeSelections.edgeLeft,
    });
  }

  const key = safeKey(piece.id);
  const seedPoints = shapeSeedPoints(piece);
  const defaultEdgeType = firstEdgeType(piece);
  const vertices: Vertex[] = seedPoints.map((point, index) => ({
    id: `${key}-proto-v${index}` as VertexId,
    x: point.x,
    y: point.y,
  }));
  const edges: Array<Edge & { v2EdgeSide: string; v2EdgeTypeId: string | null }> = vertices.map((vertex, index) => {
    const next = vertices[(index + 1) % vertices.length];
    const side = inferEdgeSide(seedPoints[index], seedPoints[(index + 1) % seedPoints.length]);
    const edgeTypeId = piece.edgeSelections[side] ?? defaultEdgeType;
    return {
      id: `${key}-proto-e${index}` as EdgeId,
      start: vertex.id,
      end: next.id,
      profile: edgeTypeId ? 'pencil-round' : 'raw',
      finish: edgeTypeId ? 'polished' : 'unfinished',
      exposure: 'exposed',
      generatedBy: 'import',
      v2EdgeSide: `edge-${index + 1}`,
      v2EdgeTypeId: edgeTypeId,
    };
  });

  return {
    id: `drawing-review-${key}` as Piece['id'],
    name: piece.name || 'Spatial piece',
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
}

export default function V2PrototypeSpatialEditor({
  piece,
  onCancel,
  onSave,
}: V2PrototypeSpatialEditorProps) {
  const initialPiece = useMemo(() => buildSeedPiece(piece), [piece]);
  const editor = usePiece(initialPiece);
  const [gridVisible, setGridVisible] = useState(true);
  const [measurementMode, setMeasurementMode] = useState(true);
  const [anglesVisible, setAnglesVisible] = useState(true);

  const featurePlacement = useFeaturePlacement({
    piece: editor.piece,
    toolMode: editor.state.toolMode,
    addFeature: editor.addFeature,
    setToolMode: editor.setToolMode,
  });

  const selectedEdge = useMemo(() => {
    if (!editor.state.selectedEdgeId) return null;
    return editor.piece.edges.find(edge => edge.id === editor.state.selectedEdgeId) ?? null;
  }, [editor.piece.edges, editor.state.selectedEdgeId]);

  const save = useCallback(() => {
    const snapshot = protoPieceToCanonicalGeometrySnapshot(editor.piece);
    onSave(
      piece.id,
      snapshot,
      Math.round(snapshot.boundingBox.lengthMm),
      Math.round(snapshot.boundingBox.widthMm),
    );
  }, [editor.piece, onSave, piece.id]);

  const setSelectedEdgeProfile = useCallback((profile: EdgeProfile) => {
    if (!selectedEdge) return;
    editor.setEdgeProfile(selectedEdge.id, profile);
  }, [editor, selectedEdge]);

  const setSelectedEdgeExposure = useCallback((exposure: EdgeExposure) => {
    if (!selectedEdge) return;
    editor.setEdgeExposure(selectedEdge.id, exposure);
  }, [editor, selectedEdge]);

  const selectedFeatureId = editor.state.selectedFeatureId;
  const activeToolKind = editor.state.toolMode.kind;
  const activeFeatureKind = activeToolKind === 'feature-place'
    ? editor.state.toolMode.featureKind
    : null;
  const isPostToolActive = activeToolKind === 'structural-place' && editor.state.toolMode.shape === 'rectangle';

  return (
    <div className="flex min-h-[620px] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
        <div>
          <h3 className="text-base font-semibold text-zinc-900">Spatial polygon editor</h3>
          <p className="text-xs text-zinc-500">
            Prototype canvas embedded in V2. Drag vertices, double-click edges, edit dimensions, then save back into the quote.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={editor.undo} disabled={!editor.canUndo} className="btn-secondary disabled:opacity-40">
            Undo
          </button>
          <button type="button" onClick={editor.redo} disabled={!editor.canRedo} className="btn-secondary disabled:opacity-40">
            Redo
          </button>
          <button
            type="button"
            onClick={() => editor.setToolMode(editor.state.toolMode.kind === 'insert-vertex' ? { kind: 'select' } : { kind: 'insert-vertex' })}
            className={editor.state.toolMode.kind === 'insert-vertex' ? 'btn-primary' : 'btn-secondary'}
          >
            Add vertex
          </button>
          <button type="button" onClick={() => setMeasurementMode(value => !value)} className={measurementMode ? 'btn-primary' : 'btn-secondary'}>
            Measurements
          </button>
          <button type="button" onClick={() => setAnglesVisible(value => !value)} className={anglesVisible ? 'btn-primary' : 'btn-secondary'}>
            Angles
          </button>
          <button type="button" onClick={() => setGridVisible(value => !value)} className={gridVisible ? 'btn-primary' : 'btn-secondary'}>
            Grid
          </button>
        </div>
      </div>

      <div className="grid min-h-[560px] flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-h-[520px] bg-zinc-950">
          <PolygonCanvas
            piece={editor.piece}
            toolMode={editor.state.toolMode}
            selectedEdgeId={editor.state.selectedEdgeId}
            selectedFeatureId={selectedFeatureId}
            selectedVertexId={editor.state.selectedVertexId}
            selectedVertexIds={editor.state.selectedVertexIds}
            materialCategory={undefined}
            featurePlacements={editor.featurePlacements}
            fixtureMetadata={editor.fixtureMetadata}
            onMoveVertex={editor.moveVertex}
            onSelectEdge={editor.selectEdge}
            onSelectFeature={editor.selectFeature}
            onSelectVertex={(vertexId, additive) => additive ? editor.toggleVertexSelection(vertexId) : editor.selectVertex(vertexId)}
            onPlaceFeature={(xMm, yMm) => featurePlacement.tryPlace(xMm, yMm)}
            onClearSelection={editor.clearSelection}
            onSetEdgeLength={editor.setEdgeLength}
            onSetDiameter={(newDiameterMm) => {
              const bbox = protoPieceToCanonicalGeometrySnapshot(editor.piece).boundingBox;
              const current = Math.max(bbox.lengthMm, bbox.widthMm, 1);
              editor.scalePiece(newDiameterMm / current, {
                x: bbox.minX + bbox.lengthMm / 2,
                y: bbox.minY + bbox.widthMm / 2,
              });
            }}
            onSetVertexAngle={editor.setVertexAngle}
            onCorrectAngles={editor.correctAngles}
            onInsertVertex={editor.insertVertex}
            onPlaceRecess={(edgeId, point) => editor.createWindowRecess(edgeId, point.x, 600, 120)}
            onMoveFeature={editor.moveFeature}
            onResizeFeature={editor.resizeFeature}
            onResizeFeatureAsymmetric={editor.resizeAndShiftFeature}
            onDeleteFeature={editor.removeFeature}
            joins={editor.state.job.joins}
            gridVisible={gridVisible}
            onToggleGrid={() => setGridVisible(value => !value)}
            measurementMode={measurementMode}
            onToggleMeasurement={() => setMeasurementMode(value => !value)}
            anglesVisible={anglesVisible}
            onToggleAngles={() => setAnglesVisible(value => !value)}
          />
        </div>

        <aside className="border-l border-zinc-200 bg-zinc-50 p-4">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Piece</p>
              <p className="mt-1 text-sm font-medium text-zinc-900">{editor.piece.name}</p>
              <p className="mt-1 text-xs text-zinc-500">
                {editor.piece.vertices.length} vertices · {editor.piece.edges.length} edges
              </p>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-3">
              <p className="text-sm font-semibold text-zinc-800">Selected edge</p>
              {selectedEdge ? (
                <div className="mt-3 space-y-3">
                  <label className="block text-xs font-medium text-zinc-500">
                    Profile
                    <select
                      value={selectedEdge.profile}
                      onChange={event => setSelectedEdgeProfile(event.target.value as EdgeProfile)}
                      className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                    >
                      {PROFILE_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-medium text-zinc-500">
                    Exposure
                    <select
                      value={selectedEdge.exposure}
                      onChange={event => setSelectedEdgeExposure(event.target.value as EdgeExposure)}
                      className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                    >
                      {EXPOSURE_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : (
                <p className="mt-2 text-xs text-zinc-500">Click an edge on the canvas to edit profile or wall/join exposure.</p>
              )}
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-zinc-800">Add cutouts</p>
                {activeToolKind !== 'select' && (
                  <button
                    type="button"
                    onClick={() => editor.setToolMode({ kind: 'select' })}
                    className="text-xs font-medium text-zinc-500 hover:text-zinc-900"
                  >
                    Cancel tool
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-zinc-500">Choose a cutout, then click inside the stone.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {FEATURE_TOOLS.map(tool => (
                  <button
                    key={tool.kind}
                    type="button"
                    onClick={() => editor.setToolMode(
                      activeFeatureKind === tool.kind
                        ? { kind: 'select' }
                        : { kind: 'feature-place', featureKind: tool.kind }
                    )}
                    className={activeFeatureKind === tool.kind ? 'btn-primary' : 'btn-secondary'}
                  >
                    {tool.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => editor.setToolMode(
                    isPostToolActive
                      ? { kind: 'select' }
                      : { kind: 'structural-place', shape: 'rectangle', widthMm: 120, depthMm: 120 }
                  )}
                  className={isPostToolActive ? 'btn-primary' : 'btn-secondary'}
                >
                  Post cutout
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              This uses the prototype geometry reducer, so vertex moves preserve edge IDs and metadata. Saving writes the V2 canonical polygon snapshot.
            </div>
          </div>
        </aside>
      </div>

      <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-3">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="button" onClick={save} className="btn-primary">Use edited geometry</button>
      </div>
    </div>
  );
}
