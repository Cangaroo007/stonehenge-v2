import type { Prisma } from '@prisma/client';
import type { LidarAppliance, LidarPoint, LidarScan } from '@/lib/lidar/mock-scans';
import {
  calculateLShapeGeometry,
  calculateUShapeGeometry,
  type LShapeConfig,
  type ShapeConfig,
  type ShapeType,
  type UShapeConfig,
} from '@/lib/types/shapes';

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

export function convertLidarScanToQuotePieces(scan: LidarScan): LidarConversionResult {
  const warnings: string[] = [];

  const pieces = scan.countertops.map((countertop, index) => {
    if (countertop.vertices.length < 3) {
      throw new Error(`Countertop ${index + 1} has fewer than 3 vertices`);
    }

    const bounds = getBounds(countertop.vertices);
    const shape = inferShape(countertop.vertices, warnings);
    const areaSqm = getAreaSqm(shape.shapeType, shape.shapeConfig, bounds);

    return {
      name: countertop.name || `${titleCase(scan.roomType)} benchtop ${index + 1}`,
      roomName: titleCase(scan.roomType || 'Kitchen'),
      lengthMm: bounds.width,
      widthMm: bounds.height,
      thicknessMm: 20,
      pieceType: inferPieceType(scan.roomType),
      areaSqm,
      shapeType: shape.shapeType,
      shapeConfig: shape.shapeConfig,
      noStripEdges: inferNoStripEdges(scan, countertop.vertices),
      cutouts: scan.appliances
        .filter(appliance => appliance.confidence >= 0.7)
        .map(cutoutFromAppliance),
      source: {
        scanId: scan.scanId,
        countertopIndex: index,
        vertexCount: countertop.vertices.length,
        applianceCount: scan.appliances.length,
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

function inferShape(
  vertices: LidarPoint[],
  warnings: string[]
): { shapeType: ShapeType; shapeConfig: ShapeConfig } {
  const bounds = getBounds(vertices);
  const uniqueX = sortedUnique(vertices.map(v => v.x));
  const uniqueY = sortedUnique(vertices.map(v => v.y));

  if (vertices.length === 4) {
    return { shapeType: 'RECTANGLE', shapeConfig: null };
  }

  if (vertices.length === 6 && uniqueX.length >= 3 && uniqueY.length >= 3) {
    const legWidthX = smallestPositiveGap(uniqueX);
    const legWidthY = smallestPositiveGap(uniqueY);
    const config: LShapeConfig = {
      shape: 'L_SHAPE',
      leg1: { length_mm: bounds.width, width_mm: legWidthY },
      leg2: { length_mm: bounds.height, width_mm: legWidthX },
    };
    return { shapeType: 'L_SHAPE', shapeConfig: config };
  }

  if (vertices.length === 8 && uniqueX.length >= 4 && uniqueY.length >= 3) {
    const leftWidth = uniqueX[1] - uniqueX[0];
    const rightWidth = uniqueX[uniqueX.length - 1] - uniqueX[uniqueX.length - 2];
    const backWidth = smallestPositiveGap(uniqueY);
    const config: UShapeConfig = {
      shape: 'U_SHAPE',
      leftLeg: { length_mm: bounds.height, width_mm: leftWidth },
      back: { length_mm: bounds.width, width_mm: backWidth },
      rightLeg: { length_mm: bounds.height, width_mm: rightWidth },
    };
    return { shapeType: 'U_SHAPE', shapeConfig: config };
  }

  warnings.push(
    `Unsupported LiDAR polygon with ${vertices.length} vertices was imported as a rectangular bounding box`
  );
  return { shapeType: 'RECTANGLE', shapeConfig: null };
}

function getAreaSqm(shapeType: ShapeType, shapeConfig: ShapeConfig, bounds: { width: number; height: number }) {
  if (shapeType === 'L_SHAPE') {
    return calculateLShapeGeometry(shapeConfig as LShapeConfig).totalAreaSqm;
  }
  if (shapeType === 'U_SHAPE') {
    return calculateUShapeGeometry(shapeConfig as UShapeConfig).totalAreaSqm;
  }
  return (bounds.width * bounds.height) / 1_000_000;
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
    return { ...base, type: 'Cooktop', name: 'Cooktop' };
  }
  return { ...base, type: 'Tap Hole', name: 'Tap Hole' };
}

function sortedUnique(values: number[]) {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function smallestPositiveGap(values: number[]) {
  const gaps = values.slice(1).map((value, index) => value - values[index]).filter(gap => gap > 0);
  return Math.min(...gaps);
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
