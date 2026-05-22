import {
  computeAreaM2,
  computeBoundingBox,
  computeEdgeLengthMm,
  computePerimeterMm,
  isSimplePolygon,
  validatePiece,
} from '@stonehenge-proto/geometry';
import type {
  BuildUpDescriptor,
  Edge,
  EdgeExposure,
  EdgeFinish,
  EdgeId,
  EdgeProfile,
  Feature,
  FeatureId,
  Piece,
  PieceId,
  PieceRole,
  Ring,
  Vertex,
  VertexId,
} from '@stonehenge-proto/geometry';
import type {
  CanonicalPolygonShapeConfig,
} from '@/lib/types/shapes';
import { isCanonicalPolygonShapeConfig } from '@/lib/types/shapes';
import type { EdgeBuildupConfig } from '@/types/edge-buildup';

type RectEdgeSide = 'top' | 'right' | 'bottom' | 'left';
type V2ProtoEdge = Edge & { v2EdgeSide?: string; v2EdgeTypeId?: string | null };

export interface V2PieceAdapterInput {
  id: number | string;
  name?: string | null;
  length_mm?: number | null;
  width_mm?: number | null;
  thickness_mm?: number | null;
  material_id?: number | string | null;
  material_name?: string | null;
  piece_type?: string | null;
  shape_config?: unknown;
  edge_top?: string | null;
  edge_right?: string | null;
  edge_bottom?: string | null;
  edge_left?: string | null;
  no_strip_edges?: unknown;
  edge_buildups?: unknown;
  cutouts?: unknown;
}

export interface V2PiecePatch {
  length_mm: number;
  width_mm: number;
  area_sqm: number;
  shape_type: 'POLYGON';
  shape_config: CanonicalPolygonShapeConfig;
  edge_top: string | null;
  edge_right: string | null;
  edge_bottom: string | null;
  edge_left: string | null;
  no_strip_edges: string[];
  edge_buildups: Record<string, EdgeBuildupConfig> | null;
}

const SIDES: RectEdgeSide[] = ['top', 'right', 'bottom', 'left'];

export function v2PieceToProtoPiece(piece: V2PieceAdapterInput): Piece {
  if (isCanonicalPolygonShapeConfig(piece.shape_config)) {
    return canonicalPolygonConfigToProtoPiece(piece);
  }

  return rectangleV2PieceToProtoPiece(piece);
}

export function protoPieceToV2Patch(piece: Piece): V2PiecePatch {
  const snapshot = protoPieceToCanonicalGeometrySnapshot(piece);
  const edgeBySide = edgeTypeIdsByRectSide(snapshot);
  return {
    length_mm: Math.round(snapshot.boundingBox.lengthMm),
    width_mm: Math.round(snapshot.boundingBox.widthMm),
    area_sqm: snapshot.areaSqm,
    shape_type: 'POLYGON',
    shape_config: snapshot,
    edge_top: edgeBySide.top ?? null,
    edge_right: edgeBySide.right ?? null,
    edge_bottom: edgeBySide.bottom ?? null,
    edge_left: edgeBySide.left ?? null,
    no_strip_edges: snapshot.edgeLengths
      .filter(edge => {
        const source = snapshot.edges[edge.edgeId];
        return edge.v2EdgeSide && source && source.exposure !== 'exposed';
      })
      .map(edge => edge.v2EdgeSide as string),
    edge_buildups: buildUpsByRectSide(snapshot),
  };
}

export function protoPieceToCanonicalGeometrySnapshot(piece: Piece): CanonicalPolygonShapeConfig {
  assertValidProtoPiece(piece);

  const areaSqm = Number(computeAreaM2(
    piece.vertices,
    piece.outerRing,
    piece.edges,
    piece.innerRings
  ).toFixed(4));
  const perimeterMm = Math.round(computePerimeterMm(piece.vertices, piece.outerRing, piece.edges) * 10) / 10;
  const boundingBox = computeBoundingBox(piece.vertices);
  const edgeLengths = piece.outerRing.edges.map((edgeId) => {
    const edge = findEdge(piece, edgeId);
    return {
      edgeId: String(edge.id),
      lengthMm: Math.round(computeEdgeLengthMm(edge, piece.vertices) * 10) / 10,
      ...(edge.v2EdgeSide ? { v2EdgeSide: edge.v2EdgeSide } : {}),
      ...(edge.v2EdgeTypeId !== undefined ? { v2EdgeTypeId: edge.v2EdgeTypeId } : {}),
    };
  });

  return {
    type: 'canonical-polygon',
    vertices: Object.fromEntries(piece.vertices.map(vertex => [
      String(vertex.id),
      {
        id: String(vertex.id),
        x: vertex.x,
        y: vertex.y,
        ...(vertex.mitre ? { mitre: vertex.mitre } : {}),
        ...(vertex.cornerRadiusMm !== undefined ? { cornerRadiusMm: vertex.cornerRadiusMm } : {}),
      },
    ])),
    edges: Object.fromEntries((piece.edges as V2ProtoEdge[]).map(edge => [
      String(edge.id),
      {
        id: String(edge.id),
        start: String(edge.start),
        end: String(edge.end),
        profile: edge.profile,
        finish: edge.finish,
        exposure: edge.exposure,
        ...(edge.curve ? { curve: edge.curve } : {}),
        ...(edge.buildUp ? { buildUp: edge.buildUp } : {}),
        ...(edge.generatedBy ? { generatedBy: edge.generatedBy } : {}),
        ...(edge.v2EdgeSide ? { v2EdgeSide: edge.v2EdgeSide } : {}),
        ...(edge.v2EdgeTypeId !== undefined ? { v2EdgeTypeId: edge.v2EdgeTypeId } : {}),
      },
    ])),
    outerRing: {
      edges: piece.outerRing.edges.map(String),
      orientation: piece.outerRing.orientation,
    },
    innerRings: piece.innerRings.map(ring => ({
      edges: ring.edges.map(String),
      orientation: ring.orientation,
    })),
    features: piece.features.map(feature => ({ ...feature, id: String(feature.id) })),
    areaSqm,
    perimeterMm,
    edgeLengths,
    boundingBox: {
      minX: boundingBox.minX,
      minY: boundingBox.minY,
      maxX: boundingBox.maxX,
      maxY: boundingBox.maxY,
      lengthMm: boundingBox.maxX - boundingBox.minX,
      widthMm: boundingBox.maxY - boundingBox.minY,
    },
  };
}

function rectangleV2PieceToProtoPiece(piece: V2PieceAdapterInput): Piece {
  const id = String(piece.id);
  const length = numberOrDefault(piece.length_mm, 0);
  const width = numberOrDefault(piece.width_mm, 0);
  const vertices: Vertex[] = [
    { id: stableVertexId(id, 'top-left'), x: 0, y: 0 },
    { id: stableVertexId(id, 'top-right'), x: length, y: 0 },
    { id: stableVertexId(id, 'bottom-right'), x: length, y: width },
    { id: stableVertexId(id, 'bottom-left'), x: 0, y: width },
  ];
  const noStripEdges = stringSet(piece.no_strip_edges);
  const buildups = edgeBuildupRecord(piece.edge_buildups);
  const edgeTypeBySide: Record<RectEdgeSide, string | null> = {
    top: piece.edge_top ?? null,
    right: piece.edge_right ?? null,
    bottom: piece.edge_bottom ?? null,
    left: piece.edge_left ?? null,
  };
  const vertexPairs: Array<[RectEdgeSide, Vertex, Vertex]> = [
    ['top', vertices[0], vertices[1]],
    ['right', vertices[1], vertices[2]],
    ['bottom', vertices[2], vertices[3]],
    ['left', vertices[3], vertices[0]],
  ];
  const edges: V2ProtoEdge[] = vertexPairs.map(([side, start, end]) => ({
    id: stableEdgeId(id, side),
    start: start.id,
    end: end.id,
    profile: edgeTypeBySide[side] ? 'pencil-round' : 'raw',
    finish: edgeTypeBySide[side] ? 'polished' : 'unfinished',
    exposure: noStripEdges.has(side) ? 'wall' : 'exposed',
    ...(buildups[side] ? { buildUp: buildUpDescriptor(buildups[side]) } : {}),
    v2EdgeSide: side,
    v2EdgeTypeId: edgeTypeBySide[side],
  }));
  const outerRing: Ring = {
    edges: edges.map(edge => edge.id),
    orientation: 'ccw',
  };

  const protoPiece: Piece = {
    id: stablePieceId(id),
    name: piece.name || `Piece ${id}`,
    pieceRole: pieceRoleFromV2(piece.piece_type),
    materialId: String(piece.material_id ?? piece.material_name ?? 'unassigned'),
    thicknessMm: numberOrDefault(piece.thickness_mm, 20),
    vertices,
    edges,
    outerRing,
    innerRings: [],
    features: cutoutsToFeatures(piece.cutouts, id, length, width),
  };

  assertValidProtoPiece(protoPiece);
  return protoPiece;
}

function canonicalPolygonConfigToProtoPiece(piece: V2PieceAdapterInput): Piece {
  const config = piece.shape_config as CanonicalPolygonShapeConfig;
  const vertices = Object.values(config.vertices).map(vertex => ({
    id: vertex.id as VertexId,
    x: vertex.x,
    y: vertex.y,
    ...(vertex.mitre ? { mitre: vertex.mitre as Vertex['mitre'] } : {}),
    ...(vertex.cornerRadiusMm !== undefined ? { cornerRadiusMm: vertex.cornerRadiusMm } : {}),
  }));
  const edges: V2ProtoEdge[] = Object.values(config.edges).map(edge => ({
    id: edge.id as EdgeId,
    start: edge.start as VertexId,
    end: edge.end as VertexId,
    profile: edge.profile as EdgeProfile,
    finish: edge.finish as EdgeFinish,
    exposure: edge.exposure as EdgeExposure,
    ...(edge.curve ? { curve: edge.curve as Edge['curve'] } : {}),
    ...(edge.buildUp ? { buildUp: edge.buildUp as BuildUpDescriptor } : {}),
    ...(edge.generatedBy ? { generatedBy: edge.generatedBy as Edge['generatedBy'] } : {}),
    ...(edge.v2EdgeSide ? { v2EdgeSide: edge.v2EdgeSide } : {}),
    ...(edge.v2EdgeTypeId !== undefined ? { v2EdgeTypeId: edge.v2EdgeTypeId } : {}),
  }));
  const protoPiece: Piece = {
    id: stablePieceId(String(piece.id)),
    name: piece.name || `Piece ${piece.id}`,
    pieceRole: pieceRoleFromV2(piece.piece_type),
    materialId: String(piece.material_id ?? piece.material_name ?? 'unassigned'),
    thicknessMm: numberOrDefault(piece.thickness_mm, 20),
    vertices,
    edges,
    outerRing: {
      edges: config.outerRing.edges.map(edgeId => edgeId as EdgeId),
      orientation: config.outerRing.orientation,
    },
    innerRings: config.innerRings.map(ring => ({
      edges: ring.edges.map(edgeId => edgeId as EdgeId),
      orientation: ring.orientation,
    })),
    features: config.features.map(feature => feature as Feature),
  };
  assertValidProtoPiece(protoPiece);
  return protoPiece;
}

function assertValidProtoPiece(piece: Piece) {
  if (piece.outerRing.edges.length < 3) {
    throw new Error('Polygon must have at least three edges.');
  }
  const validation = validatePiece(piece);
  if (!validation.valid) {
    throw new Error(`Invalid polygon: ${validation.errors.join('; ')}`);
  }
  if (!isSimplePolygon(piece)) {
    throw new Error('Invalid polygon: outer ring self-intersects.');
  }
  for (const edge of piece.edges) {
    if (computeEdgeLengthMm(edge, piece.vertices) < 1) {
      throw new Error(`Invalid polygon: edge ${String(edge.id)} is shorter than 1mm.`);
    }
  }
}

function findEdge(piece: Piece, edgeId: EdgeId): V2ProtoEdge {
  const edge = piece.edges.find(candidate => candidate.id === edgeId);
  if (!edge) throw new Error(`Missing edge ${String(edgeId)}`);
  return edge as V2ProtoEdge;
}

function buildUpDescriptor(config: EdgeBuildupConfig): BuildUpDescriptor {
  const targetThicknessMm = Math.max(1, Math.round(Number(config.depth) || 40));
  return {
    targetThicknessMm,
    method: 'LAMINATED',
    stripWidthMm: targetThicknessMm,
  };
}

function edgeTypeIdsByRectSide(snapshot: CanonicalPolygonShapeConfig): Record<RectEdgeSide, string | null> {
  return SIDES.reduce((acc, side) => {
    const edge = snapshot.edgeLengths.find(candidate => candidate.v2EdgeSide === side);
    acc[side] = edge?.v2EdgeTypeId ?? null;
    return acc;
  }, {} as Record<RectEdgeSide, string | null>);
}

function buildUpsByRectSide(snapshot: CanonicalPolygonShapeConfig): Record<string, EdgeBuildupConfig> | null {
  const output: Record<string, EdgeBuildupConfig> = {};
  for (const [edgeId, edge] of Object.entries(snapshot.edges)) {
    if (!edge.v2EdgeSide || !edge.buildUp || typeof edge.buildUp !== 'object') continue;
    const buildUp = edge.buildUp as BuildUpDescriptor;
    output[edge.v2EdgeSide] = {
      depth: buildUp.targetThicknessMm,
      exposed: edge.exposure === 'exposed',
      chargeCut: true,
      chargePolish: edge.exposure === 'exposed',
    };
  }
  return Object.keys(output).length > 0 ? output : null;
}

function cutoutsToFeatures(cutouts: unknown, pieceId: string, lengthMm: number, widthMm: number): Feature[] {
  const values = Array.isArray(cutouts) ? cutouts : [];
  return values.flatMap((cutout, index) => {
    const item = cutout as Record<string, unknown>;
    const quantity = Math.max(1, Math.round(Number(item.quantity) || 1));
    return Array.from({ length: quantity }, (_, quantityIndex) =>
      featureFromCutout(item, pieceId, index, quantityIndex, lengthMm, widthMm)
    );
  });
}

function featureFromCutout(
  cutout: Record<string, unknown>,
  pieceId: string,
  index: number,
  quantityIndex: number,
  lengthMm: number,
  widthMm: number
): Feature {
  const label = String(cutout.type ?? cutout.name ?? '').toLowerCase();
  const position = {
    x: Number(cutout.x ?? cutout.positionX ?? cutout.positionXMm) || lengthMm / 2,
    y: Number(cutout.y ?? cutout.positionY ?? cutout.positionYMm) || widthMm / 2,
  };
  const id = `v2-piece-${pieceId}-feature-${index}-${quantityIndex}` as FeatureId;

  if (label.includes('tap')) {
    return { id, kind: 'tap-hole', position, diameterMm: 35 };
  }
  if (label.includes('cooktop') || label.includes('hotplate')) {
    return { id, kind: 'cooktop-cutout', position, cutoutWidthMm: 600, cutoutDepthMm: 520, cornerRadiusMm: 6 };
  }
  if (label.includes('drop') || label.includes('overmount') || label.includes('topmount')) {
    return { id, kind: 'overmount-sink', position, cutoutWidthMm: 760, cutoutDepthMm: 450 };
  }
  if (label.includes('sink') || label.includes('basin') || label.includes('undermount')) {
    return { id, kind: 'undermount-sink', position, bowlWidthMm: 760, bowlDepthMm: 450 };
  }
  return {
    id,
    kind: 'custom-cutout',
    position,
    outline: [
      { x: position.x - 50, y: position.y - 50 },
      { x: position.x + 50, y: position.y - 50 },
      { x: position.x + 50, y: position.y + 50 },
      { x: position.x - 50, y: position.y + 50 },
    ],
  };
}

function pieceRoleFromV2(value: string | null | undefined): PieceRole {
  const normalized = String(value ?? '').toUpperCase();
  if (normalized === 'ISLAND') return 'ISLAND_TOP';
  if (normalized === 'WATERFALL') return 'WATERFALL_END';
  if (normalized === 'SPLASHBACK') return 'SPLASHBACK_FULL';
  if (normalized === 'WINDOW_SILL' || normalized === 'WINDOWSILL') return 'WINDOWSILL';
  return 'BENCHTOP';
}

function edgeBuildupRecord(value: unknown): Record<string, EdgeBuildupConfig> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, EdgeBuildupConfig>;
}

function stringSet(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set();
  return new Set(value.map(item => String(item).toLowerCase()));
}

function numberOrDefault(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function stablePieceId(pieceId: string): PieceId {
  return `v2-piece-${pieceId}` as PieceId;
}

function stableVertexId(pieceId: string, label: string): VertexId {
  return `v2-piece-${pieceId}-vertex-${label}` as VertexId;
}

function stableEdgeId(pieceId: string, side: RectEdgeSide): EdgeId {
  return `v2-piece-${pieceId}-edge-${side}` as EdgeId;
}
