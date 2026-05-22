import type { CanonicalPolygonShapeConfig } from '@/lib/types/shapes';

export interface SpatialCutoutPatch {
  type: string;
  name: string;
  quantity: number;
  positionXMm?: number;
  positionYMm?: number;
}

function customCutoutLabel(feature: { outline?: Array<{ x?: number; y?: number }> }): string {
  const bounds = Array.isArray(feature.outline)
    ? feature.outline.reduce((acc, point) => ({
      minX: Math.min(acc.minX, Number(point.x) || 0),
      maxX: Math.max(acc.maxX, Number(point.x) || 0),
      minY: Math.min(acc.minY, Number(point.y) || 0),
      maxY: Math.max(acc.maxY, Number(point.y) || 0),
    }), { minX: 0, maxX: 0, minY: 0, maxY: 0 })
    : null;

  if (!bounds) return 'Custom Cutout';

  const widthMm = bounds.maxX - bounds.minX;
  const depthMm = bounds.maxY - bounds.minY;
  return widthMm <= 250 && depthMm <= 250 ? 'Post' : 'Custom Cutout';
}

export function spatialFeatureToCutout(feature: unknown): SpatialCutoutPatch | null {
  if (!feature || typeof feature !== 'object') return null;
  const candidate = feature as {
    kind?: string;
    position?: { x?: number; y?: number };
    outline?: Array<{ x?: number; y?: number }>;
  };

  const labelByKind: Record<string, string> = {
    'undermount-sink': 'Undermount Sink',
    'overmount-sink': 'Drop-in Sink',
    'cooktop-cutout': 'Cooktop / Hotplate',
    'tap-hole': 'Tap Hole',
  };
  const label = candidate.kind === 'custom-cutout'
    ? customCutoutLabel(candidate)
    : candidate.kind ? labelByKind[candidate.kind] : null;
  if (!label) return null;

  return {
    type: label,
    name: label,
    quantity: 1,
    ...(Number.isFinite(candidate.position?.x) ? { positionXMm: Number(candidate.position?.x) } : {}),
    ...(Number.isFinite(candidate.position?.y) ? { positionYMm: Number(candidate.position?.y) } : {}),
  };
}

export function spatialCutoutsFromShapeConfig(shapeConfig: CanonicalPolygonShapeConfig): SpatialCutoutPatch[] {
  return shapeConfig.features
    .map(spatialFeatureToCutout)
    .filter((cutout): cutout is SpatialCutoutPatch => Boolean(cutout));
}
