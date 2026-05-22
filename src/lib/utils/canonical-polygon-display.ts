import type { CanonicalPolygonShapeConfig } from '@/lib/types/shapes';
import { isCanonicalPolygonShapeConfig } from '@/lib/types/shapes';

export interface PolygonRenderEdge {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  midX: number;
  midY: number;
  label: string;
  finish: string;
  profile: string;
  exposure: string;
  lengthMm: number;
}

export interface PolygonRenderFeature {
  id: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  outline?: string;
}

export interface PolygonRenderModel {
  config: CanonicalPolygonShapeConfig;
  outerPath: string;
  innerPaths: string[];
  edges: PolygonRenderEdge[];
  features: PolygonRenderFeature[];
  viewBox: string;
  width: number;
  height: number;
  scale: number;
  formatMm: (mm: number) => string;
}

export function getCanonicalPolygonConfig(value: unknown): CanonicalPolygonShapeConfig | null {
  return isCanonicalPolygonShapeConfig(value) ? value : null;
}

export function buildPolygonRenderModel(
  value: unknown,
  options: { width?: number; height?: number; padding?: number } = {},
): PolygonRenderModel | null {
  const config = getCanonicalPolygonConfig(value);
  if (!config) return null;
  try {
    return buildSafePolygonRenderModel(config, options);
  } catch (error) {
    console.warn('Unable to render canonical polygon preview', error);
    return null;
  }
}

function buildSafePolygonRenderModel(
  config: CanonicalPolygonShapeConfig,
  options: { width?: number; height?: number; padding?: number } = {},
): PolygonRenderModel | null {
  const width = options.width ?? 260;
  const height = options.height ?? 170;
  const padding = options.padding ?? 14;
  const bbox = config.boundingBox;
  if (!bbox || !Number.isFinite(bbox.lengthMm) || !Number.isFinite(bbox.widthMm)) {
    return null;
  }
  const rawW = Math.max(bbox.lengthMm, 1);
  const rawH = Math.max(bbox.widthMm, 1);
  const scale = Math.min((width - padding * 2) / rawW, (height - padding * 2) / rawH);
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const offsetX = padding - bbox.minX * scale + (width - padding * 2 - rawW * scale) / 2;
  const offsetY = padding + bbox.maxY * scale + (height - padding * 2 - rawH * scale) / 2;

  const point = (vertexId: string) => {
    const vertex = config.vertices[vertexId];
    if (!vertex) return { x: offsetX, y: offsetY };
    return {
      x: offsetX + vertex.x * scale,
      y: offsetY - vertex.y * scale,
    };
  };

  const pathForRing = (edgeIds: string[]) => {
    const points = edgeIds
      .map(edgeId => config.edges[edgeId])
      .filter(Boolean)
      .map(edge => point(edge.start));
    if (points.length === 0) return '';
    return [
      `M ${round(points[0].x)} ${round(points[0].y)}`,
      ...points.slice(1).map(p => `L ${round(p.x)} ${round(p.y)}`),
      'Z',
    ].join(' ');
  };

  const lengthByEdge = new Map(config.edgeLengths.map(edge => [edge.edgeId, edge.lengthMm]));
  const edges = config.outerRing.edges.flatMap((edgeId): PolygonRenderEdge[] => {
    const edge = config.edges[edgeId];
    if (!edge) return [];
    const start = point(edge.start);
    const end = point(edge.end);
    return [{
      id: edgeId,
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      midX: (start.x + end.x) / 2,
      midY: (start.y + end.y) / 2,
      label: edge.v2EdgeSide ?? shortEdgeId(edgeId),
      finish: edge.finish,
      profile: edge.profile,
      exposure: edge.exposure,
      lengthMm: lengthByEdge.get(edgeId) ?? 0,
    }];
  });

  const features = (config.features as Array<Record<string, unknown>>).flatMap((feature, index) => {
    const position = feature.position as { x?: unknown; y?: unknown } | undefined;
    const xMm = Number(position?.x) || bbox.minX + rawW / 2;
    const yMm = Number(position?.y) || bbox.minY + rawH / 2;
    const center = {
      x: offsetX + xMm * scale,
      y: offsetY - yMm * scale,
    };
    const kind = String(feature.kind ?? 'feature');
    const widthMm = Number(feature.cutoutWidthMm ?? feature.bowlWidthMm ?? feature.widthMm) || 180;
    const heightMm = Number(feature.cutoutDepthMm ?? feature.bowlDepthMm ?? feature.depthMm) || 120;
    const outline = Array.isArray(feature.outline)
      ? (feature.outline as Array<{ x?: unknown; y?: unknown }>)
          .map(p => `${round(offsetX + Number(p.x) * scale)},${round(offsetY - Number(p.y) * scale)}`)
          .join(' ')
      : undefined;
    return [{
      id: String(feature.id ?? `feature-${index}`),
      kind,
      x: center.x,
      y: center.y,
      width: Math.max(widthMm * scale, 5),
      height: Math.max(heightMm * scale, 5),
      radius: Math.max((Number(feature.diameterMm) || 35) * scale / 2, 3),
      outline,
    }];
  });

  return {
    config,
    outerPath: pathForRing(config.outerRing.edges),
    innerPaths: config.innerRings.map(ring => pathForRing(ring.edges)).filter(Boolean),
    edges,
    features,
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    scale,
    formatMm: (mm: number) => `${Math.round(mm)}mm`,
  };
}

export function polygonDimensionLabel(config: CanonicalPolygonShapeConfig): string {
  return `${Math.round(config.boundingBox.lengthMm)} x ${Math.round(config.boundingBox.widthMm)}mm bbox`;
}

export function polygonMetricLabel(config: CanonicalPolygonShapeConfig): string {
  return `${config.areaSqm.toFixed(2)} m2, ${(config.perimeterMm / 1000).toFixed(2)} lm perimeter`;
}

export function polygonEdgeSummary(
  config: CanonicalPolygonShapeConfig,
  edgeNameMap?: Map<string, string>,
): string {
  const parts = config.edgeLengths
    .map(({ edgeId, lengthMm }) => {
      const edge = config.edges[edgeId];
      if (!edge || edge.exposure !== 'exposed') return null;
      const profile = edge.v2EdgeTypeId
        ? edgeNameMap?.get(edge.v2EdgeTypeId) ?? edge.profile
        : edge.profile;
      if (!profile || profile === 'raw') return null;
      const label = edge.v2EdgeSide ?? shortEdgeId(edgeId);
      return `${label}: ${profile} (${Math.round(lengthMm)}mm, ${edge.finish})`;
    })
    .filter(Boolean);
  return parts.join(', ');
}

function shortEdgeId(edgeId: string): string {
  return edgeId.length > 8 ? edgeId.slice(0, 8) : edgeId;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
