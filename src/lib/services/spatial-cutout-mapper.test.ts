import { spatialCutoutsFromShapeConfig, spatialFeatureToCutout } from './spatial-cutout-mapper';
import type { CanonicalPolygonShapeConfig } from '@/lib/types/shapes';

describe('spatial-cutout-mapper', () => {
  it('maps spatial sink, cooktop, and tap features to priced V2 cutouts', () => {
    expect(spatialFeatureToCutout({
      kind: 'undermount-sink',
      position: { x: 500, y: 300 },
    })).toMatchObject({ type: 'Undermount Sink', quantity: 1, positionXMm: 500, positionYMm: 300 });

    expect(spatialFeatureToCutout({
      kind: 'cooktop-cutout',
      position: { x: 1200, y: 300 },
    })).toMatchObject({ type: 'Cooktop / Hotplate', quantity: 1 });

    expect(spatialFeatureToCutout({
      kind: 'tap-hole',
      position: { x: 520, y: 120 },
    })).toMatchObject({ type: 'Tap Hole', quantity: 1 });
  });

  it('maps small custom structural cutouts to Post for Northcoast-style pricing', () => {
    expect(spatialFeatureToCutout({
      kind: 'custom-cutout',
      position: { x: 800, y: 300 },
      outline: [
        { x: -60, y: -60 },
        { x: 60, y: -60 },
        { x: 60, y: 60 },
        { x: -60, y: 60 },
      ],
    })).toMatchObject({ type: 'Post', name: 'Post', quantity: 1 });
  });

  it('keeps larger custom structural cutouts as custom cutouts', () => {
    expect(spatialFeatureToCutout({
      kind: 'custom-cutout',
      position: { x: 800, y: 300 },
      outline: [
        { x: -250, y: -150 },
        { x: 250, y: -150 },
        { x: 250, y: 150 },
        { x: -250, y: 150 },
      ],
    })).toMatchObject({ type: 'Custom Cutout', name: 'Custom Cutout', quantity: 1 });
  });

  it('extracts cutouts from canonical polygon snapshots', () => {
    const shapeConfig = {
      type: 'canonical-polygon',
      vertices: {},
      edges: {},
      outerRing: { edges: [], orientation: 'ccw' },
      innerRings: [],
      features: [
        { kind: 'overmount-sink', position: { x: 600, y: 300 } },
        { kind: 'tap-hole', position: { x: 700, y: 100 } },
      ],
      areaSqm: 1,
      perimeterMm: 4000,
      edgeLengths: [],
      boundingBox: { minX: 0, minY: 0, maxX: 1000, maxY: 500, lengthMm: 1000, widthMm: 500 },
    } as unknown as CanonicalPolygonShapeConfig;

    expect(spatialCutoutsFromShapeConfig(shapeConfig).map(cutout => cutout.type)).toEqual([
      'Drop-in Sink',
      'Tap Hole',
    ]);
  });
});
