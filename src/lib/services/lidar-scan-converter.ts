import type { Prisma } from '@prisma/client';
import type { LidarAppliance, LidarPoint, LidarScan } from '@/lib/lidar/mock-scans';
import type { CanonicalPolygonShapeConfig, ShapeConfig, ShapeType } from '@/lib/types/shapes';
import { protoPieceToCanonicalGeometrySnapshot } from '@/lib/services/proto-geometry-adapter';
import type { Edge, EdgeExposure, EdgeProfile, Feature, Piece, Ring, Vertex } from '@stonehenge-proto/geometry';

type EdgeSide = 'top' | 'bottom' | 'left' | 'right';

export interface LidarQuotePieceDraft {
  name: string;
  roomName: string;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  pieceType: string;
  areaSqm: number;
  shapeType: ShapeType;
  shapeConfig: ShapeConfig;
  noStripEdges: EdgeSide[];
  cutouts: Array<{
    type: string;
    name: string;
    quantity: number;
    source: 'lidar';
    confidence: number;
  }>;
  source: {
    scanId: string;
    countertopIndex: number;
    vertexCount: number;
    applianceCount: number;
  };
}

export interface LidarConversionResult {
  pieces: LidarQuotePieceDraft[];
  warnings: string[];
}

export interface LidarConversionOptions {
  edgeTypeIdForExposedEdges?: string | null;
}

export function convertLidarScanToQuotePieces(
  scan: LidarScan,
  options: LidarConversionOptions = {},
): LidarConversionResult {
  const warnings: string[] = [];

  const pieces = scan.countertops.map((countertop, index) => {
    if (countertop.vertices.length < 3) {
      throw new Error(`Countertop ${index + 1} has fewer than 3 vertices`);
    }

    const bounds = getBounds(countertop.vertices);
    const countertopAppliances = scan.appliances.filter(appliance =>
      appliance.confidence >= 0.7 && applianceBelongsToCountertop(appliance, countertop.vertices),
    );
    const noStripEdges = inferNoStripEdges(scan, countertop.vertices);
    const canonicalShape = buildCanonicalPolygonFromScan(
      scan,
      countertop.vertices,
      index,
      noStripEdges,
      options.edgeTypeIdForExposedEdges ?? null,
      countertopAppliances,
    );

    return {
      name: countertop.name || `${titleCase(scan.roomType)} benchtop ${index + 1}`,
      roomName: titleCase(scan.roomType || 'Unassigned'),
      lengthMm: bounds.width,
      widthMm: bounds.height,
      thicknessMm: 20,
      pieceType: inferPieceType(scan.roomType),
      areaSqm: canonicalShape.areaSqm,
      shapeType: 'POLYGON' as ShapeType,
      shapeConfig: canonicalShape as ShapeConfig,
      noStripEdges,
      cutouts: countertopAppliances.map(cutoutFromAppliance),
      source: {
        scanId: scan.scanId,
        countertopIndex: index,
        vertexCount: countertop.vertices.length,
        applianceCount: countertopAppliances.length,
      },
    };
  });

  return { pieces, warnings };
}

function inferPieceType(roomType: string): string {
  const normalized = roomType.toLowerCase();
  if (normalized.includes('bath') || normalized.includes('ensuite') || normalized.includes('powder')) {
    return 'VANITY';
  }
  return 'BENCHTOP';
}

export function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function getBounds(vertices: LidarPoint[]) {
  const xs = vertices.map(v => v.x);
  const ys = vertices.map(v => v.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function inferNoStripEdges(scan: LidarScan, vertices: LidarPoint[]): EdgeSide[] {
  const hinted = scan.exposureHints?.edgesAgainstWall?.flatMap(directionToSide) ?? [];
  if (hinted.length > 0 || scan.exposureHints?.edgesAgainstWall) {
    return uniqueSides(hinted);
  }

  const bounds = getBounds(vertices);
  const toleranceMm = 50;
  const sides: EdgeSide[] = [];

  if (Math.abs(bounds.minY) <= toleranceMm) sides.push('top');
  if (Math.abs(bounds.minX) <= toleranceMm) sides.push('left');
  if (Math.abs(scan.dimensions.widthMm - bounds.maxX) <= toleranceMm) sides.push('right');
  if (Math.abs(scan.dimensions.depthMm - bounds.maxY) <= toleranceMm) sides.push('bottom');

  return uniqueSides(sides);
}

function buildCanonicalPolygonFromScan(
  scan: LidarScan,
  points: LidarPoint[],
  countertopIndex: number,
  noStripEdges: EdgeSide[],
  edgeTypeIdForExposedEdges: string | null,
  appliances: LidarAppliance[],
): CanonicalPolygonShapeConfig {
  const pieceKey = `${scan.scanId}-${countertopIndex}`;
  const vertices: Vertex[] = points.map((point, index) => ({
    id: `lidar-${pieceKey}-vertex-${index}` as Vertex['id'],
    x: point.x,
    y: point.y,
  }));
  const edges: Edge[] = vertices.map((vertex, index) => {
    const side = inferCardinalSide(points[index], points[(index + 1) % points.length]);
    const isWallEdge = noStripEdges.includes(side);
    return {
      id: `lidar-${pieceKey}-edge-${index}` as Edge['id'],
      start: vertex.id,
      end: vertices[(index + 1) % vertices.length].id,
      profile: edgeProfileForScanSide(scan, side),
      finish: isWallEdge ? 'unfinished' : 'polished',
      exposure: isWallEdge ? 'wall' : 'exposed',
      v2EdgeSide: side,
      v2EdgeTypeId: isWallEdge ? null : edgeTypeIdForExposedEdges,
    } as Edge & { v2EdgeSide: EdgeSide; v2EdgeTypeId: string | null };
  });
  const outerRing: Ring = {
    edges: edges.map(edge => edge.id),
    orientation: 'ccw',
  };
  const protoPiece: Piece = {
    id: `lidar-${pieceKey}` as Piece['id'],
    name: scan.countertops[countertopIndex]?.name || `${titleCase(scan.roomType)} benchtop ${countertopIndex + 1}`,
    pieceRole: 'BENCHTOP',
    materialId: scan.countertops[countertopIndex]?.estimatedMaterial || 'unassigned',
    thicknessMm: 20,
    vertices,
    edges,
    outerRing,
    innerRings: [],
    features: appliances.map((appliance, index) => featureFromAppliance(scan.scanId, appliance, index)),
  };
  return protoPieceToCanonicalGeometrySnapshot(protoPiece);
}

function applianceBelongsToCountertop(appliance: LidarAppliance, vertices: LidarPoint[]): boolean {
  const center = {
    x: appliance.boundingBox.x + appliance.boundingBox.widthMm / 2,
    y: appliance.boundingBox.y + appliance.boundingBox.depthMm / 2,
  };

  if (pointInPolygon(center, vertices)) {
    return true;
  }

  const bounds = getBounds(vertices);
  const toleranceMm = 25;
  return center.x >= bounds.minX - toleranceMm &&
    center.x <= bounds.maxX + toleranceMm &&
    center.y >= bounds.minY - toleranceMm &&
    center.y <= bounds.maxY + toleranceMm;
}

function pointInPolygon(point: LidarPoint, vertices: LidarPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x;
    const yi = vertices[i].y;
    const xj = vertices[j].x;
    const yj = vertices[j].y;
    const intersects = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < ((xj - xi) * (point.y - yi)) / (yj - yi || 1e-9) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function inferCardinalSide(start: LidarPoint, end: LidarPoint): EdgeSide {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'top' : 'bottom';
  }
  return dy >= 0 ? 'right' : 'left';
}

function edgeProfileForScanSide(scan: LidarScan, side: EdgeSide): EdgeProfile {
  const hint = scan.edgeFinishHints?.[side]?.profile?.toLowerCase();
  if (hint?.includes('mitre') || hint?.includes('miter')) return 'mitre-45';
  if (hint?.includes('bullnose')) return 'full-bullnose';
  if (hint?.includes('bevel')) return 'bevel';
  return 'pencil-round';
}

function featureFromAppliance(scanId: string, appliance: LidarAppliance, index: number): Feature {
  const position = {
    x: appliance.boundingBox.x + appliance.boundingBox.widthMm / 2,
    y: appliance.boundingBox.y + appliance.boundingBox.depthMm / 2,
  };
  const id = `lidar-${scanId}-feature-${index}` as Feature['id'];
  if (appliance.kind === 'sink') {
    return {
      id,
      kind: 'undermount-sink',
      position,
      bowlWidthMm: appliance.boundingBox.widthMm,
      bowlDepthMm: appliance.boundingBox.depthMm,
    };
  }
  if (appliance.kind === 'cooktop') {
    return {
      id,
      kind: 'cooktop-cutout',
      position,
      cutoutWidthMm: appliance.boundingBox.widthMm,
      cutoutDepthMm: appliance.boundingBox.depthMm,
      cornerRadiusMm: 6,
    };
  }
  return {
    id,
    kind: 'tap-hole',
    position,
    diameterMm: Math.max(1, Math.round(Math.min(appliance.boundingBox.widthMm, appliance.boundingBox.depthMm) || 35)),
  };
}

function directionToSide(direction: string): EdgeSide[] {
  switch (direction.toLowerCase()) {
    case 'north':
      return ['top'];
    case 'south':
      return ['bottom'];
    case 'east':
      return ['right'];
    case 'west':
      return ['left'];
    default:
      return [];
  }
}

function cutoutFromAppliance(appliance: LidarAppliance) {
  const base = {
    quantity: 1,
    source: 'lidar' as const,
    confidence: appliance.confidence,
  };

  if (appliance.kind === 'sink') {
    return { ...base, type: 'Undermount Sink', name: 'Undermount Sink' };
  }
  if (appliance.kind === 'cooktop') {
    return { ...base, type: 'Cooktop Cutout', name: 'Cooktop Cutout' };
  }
  return { ...base, type: 'Tap Hole', name: 'Tap Hole' };
}

function uniqueSides(sides: EdgeSide[]) {
  return Array.from(new Set(sides));
}

function titleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}
