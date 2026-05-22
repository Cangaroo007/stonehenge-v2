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
import {
  computeEdgeLengthMm,
  interiorAngleDeg,
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
];

function featureId(): FeatureId {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `v2-spatial-feature-${id}` as FeatureId;
}

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

function formatMm(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'Select edge';
  return `${Math.round(value).toLocaleString()} mm`;
}

function formatAngle(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'Select corner';
  return `${value.toFixed(1).replace(/\.0$/, '')}°`;
}

function GeometryStat({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'active' }) {
  return (
    <div className={tone === 'active' ? 'rounded-lg border border-blue-200 bg-blue-50 px-3 py-2' : 'rounded-lg border border-zinc-200 bg-white px-3 py-2'}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-900">{value}</p>
    </div>
  );
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
  const [fullScreen, setFullScreen] = useState(false);

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

  const selectedEdgeLengthMm = useMemo(() => {
    if (!selectedEdge) return null;
    return Math.round(computeEdgeLengthMm(selectedEdge, editor.piece.vertices) * 10) / 10;
  }, [editor.piece.vertices, selectedEdge]);

  const selectedVertex = useMemo(() => {
    if (!editor.state.selectedVertexId) return null;
    return editor.piece.vertices.find(vertex => vertex.id === editor.state.selectedVertexId) ?? null;
  }, [editor.piece.vertices, editor.state.selectedVertexId]);

  const selectedVertexAngleDeg = useMemo(() => {
    if (!selectedVertex) return null;
    const angle = interiorAngleDeg(editor.piece, selectedVertex.id);
    return angle === null ? null : Math.round(angle * 10) / 10;
  }, [editor.piece, selectedVertex]);

  const geometrySnapshot = useMemo(() => protoPieceToCanonicalGeometrySnapshot(editor.piece), [editor.piece]);
  const sizeLabel = `${Math.round(geometrySnapshot.boundingBox.lengthMm).toLocaleString()} × ${Math.round(geometrySnapshot.boundingBox.widthMm).toLocaleString()} mm`;
  const perimeterLabel = `${(geometrySnapshot.perimeterMm / 1000).toFixed(2)} Lm`;
  const selectedDetailLabel = selectedEdge
    ? `Edge ${formatMm(selectedEdgeLengthMm)}`
    : `Corner ${formatAngle(selectedVertexAngleDeg)}`;

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

  const setSelectedEdgeLength = useCallback((value: string) => {
    if (!selectedEdge) return;
    const length = Number(value);
    if (!Number.isFinite(length) || length <= 0) return;
    editor.setEdgeLength(selectedEdge.id, Math.round(length));
  }, [editor, selectedEdge]);

  const setSelectedVertexAngle = useCallback((value: string) => {
    if (!selectedVertex) return;
    const angle = Number(value);
    if (!Number.isFinite(angle) || angle <= 0 || angle >= 360) return;
    editor.setVertexAngle(selectedVertex.id, Math.round(angle * 10) / 10);
  }, [editor, selectedVertex]);

  const setSelectedCornerRadius = useCallback((value: string) => {
    if (!selectedVertex) return;
    const radius = Number(value);
    if (!Number.isFinite(radius) || radius < 0) return;
    editor.setCornerRadius(selectedVertex.id, Math.round(radius));
  }, [editor, selectedVertex]);

  const handlePlaceFeature = useCallback((xMm: number, yMm: number) => {
    if (editor.state.toolMode.kind === 'structural-place') {
      const widthMm = editor.state.toolMode.widthMm;
      const depthMm = editor.state.toolMode.depthMm;
      editor.addFeature({
        id: featureId(),
        kind: 'custom-cutout',
        position: { x: xMm, y: yMm },
        outline: [
          { x: -widthMm / 2, y: -depthMm / 2 },
          { x: widthMm / 2, y: -depthMm / 2 },
          { x: widthMm / 2, y: depthMm / 2 },
          { x: -widthMm / 2, y: depthMm / 2 },
        ],
      });
      editor.setToolMode({ kind: 'select' });
      return;
    }
    featurePlacement.tryPlace(xMm, yMm);
  }, [editor, featurePlacement]);

  const selectedFeatureId = editor.state.selectedFeatureId;
  const activeToolKind = editor.state.toolMode.kind;
  const activeFeatureKind = activeToolKind === 'feature-place'
    ? editor.state.toolMode.featureKind
    : null;
  const isPostToolActive = activeToolKind === 'structural-place' && editor.state.toolMode.shape === 'rectangle';

  return (
    <div className={
      fullScreen
        ? 'fixed inset-3 z-[120] flex min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl'
        : 'flex min-h-[520px] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white'
    }>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
        <div>
          <h3 className="text-base font-semibold text-zinc-900">Spatial polygon editor</h3>
          <p className="text-xs text-zinc-500">
            Edit measured geometry, edge exposure, cutouts, and angles. Saving updates the actual quote piece.
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
          <button type="button" onClick={() => setFullScreen(value => !value)} className={fullScreen ? 'btn-primary' : 'btn-secondary'}>
            {fullScreen ? 'Exit full page' : 'Full page'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-3 md:grid-cols-4">
        <GeometryStat label="Bounding size" value={sizeLabel} />
        <GeometryStat label="Area" value={`${geometrySnapshot.areaSqm.toFixed(2)} m²`} />
        <GeometryStat label="Cut perimeter" value={perimeterLabel} />
        <GeometryStat label={selectedEdge ? 'Selected edge' : selectedVertex ? 'Selected corner' : 'Selection'} value={selectedDetailLabel} tone={selectedEdge || selectedVertex ? 'active' : 'default'} />
      </div>

      <div className={
        fullScreen
          ? 'grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px]'
          : 'grid min-h-[460px] flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]'
      }>
        <div className={fullScreen ? 'min-h-[calc(100vh-240px)] bg-zinc-950' : 'h-[430px] min-h-[430px] bg-zinc-950 lg:h-[520px]'}>
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
            onPlaceFeature={handlePlaceFeature}
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
            fullScreen={fullScreen}
            onToggleFullScreen={() => setFullScreen(value => !value)}
            gridVisible={gridVisible}
            onToggleGrid={() => setGridVisible(value => !value)}
            measurementMode={measurementMode}
            onToggleMeasurement={() => setMeasurementMode(value => !value)}
            anglesVisible={anglesVisible}
            onToggleAngles={() => setAnglesVisible(value => !value)}
          />
        </div>

        <aside className="overflow-auto border-l border-zinc-200 bg-zinc-50 p-4">
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
                    Length
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        key={`${selectedEdge.id}-${selectedEdgeLengthMm ?? 0}`}
                        type="number"
                        inputMode="numeric"
                        defaultValue={selectedEdgeLengthMm ?? ''}
                        onBlur={event => setSelectedEdgeLength(event.currentTarget.value)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') {
                            event.currentTarget.blur();
                          }
                        }}
                        className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm font-mono"
                      />
                      <span className="text-xs text-zinc-500">mm</span>
                    </div>
                  </label>
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
                <p className="text-sm font-semibold text-zinc-800">Selected corner</p>
                {selectedVertexAngleDeg !== null && (
                  <button
                    type="button"
                    onClick={editor.correctAngles}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800"
                  >
                    Correct angles
                  </button>
                )}
              </div>
              {selectedVertex ? (
                <div className="mt-3 space-y-3">
                  <label className="block text-xs font-medium text-zinc-500">
                    Interior angle
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        key={`${selectedVertex.id}-angle-${selectedVertexAngleDeg ?? 0}`}
                        type="number"
                        inputMode="decimal"
                        defaultValue={selectedVertexAngleDeg ?? ''}
                        onBlur={event => setSelectedVertexAngle(event.currentTarget.value)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') {
                            event.currentTarget.blur();
                          }
                        }}
                        className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm font-mono"
                      />
                      <span className="text-xs text-zinc-500">deg</span>
                    </div>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[45, 90, 135].map(angle => (
                      <button
                        key={angle}
                        type="button"
                        onClick={() => editor.setVertexAngle(selectedVertex.id, angle)}
                        className="btn-secondary"
                      >
                        {angle}°
                      </button>
                    ))}
                  </div>
                  <label className="block text-xs font-medium text-zinc-500">
                    Corner radius
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        key={`${selectedVertex.id}-radius-${selectedVertex.cornerRadiusMm ?? 0}`}
                        type="number"
                        inputMode="numeric"
                        defaultValue={selectedVertex.cornerRadiusMm ?? 0}
                        onBlur={event => setSelectedCornerRadius(event.currentTarget.value)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') {
                            event.currentTarget.blur();
                          }
                        }}
                        className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm font-mono"
                      />
                      <span className="text-xs text-zinc-500">mm</span>
                    </div>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[0, 25, 50, 100].map(radius => (
                      <button
                        key={radius}
                        type="button"
                        onClick={() => editor.setCornerRadius(selectedVertex.id, radius)}
                        className="btn-secondary"
                      >
                        {radius === 0 ? 'Sharp' : `R${radius}`}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-xs text-zinc-500">Click a corner handle to lock/check angles or add a radius.</p>
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
