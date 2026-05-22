import { optimizeMultiMaterial } from './multi-material-optimizer';
import type { CanonicalPolygonShapeConfig } from '@/lib/types/shapes';

function canonicalPolygonFixture(): CanonicalPolygonShapeConfig {
  return {
    type: 'canonical-polygon',
    vertices: {
      v1: { id: 'v1', x: 0, y: 0 },
      v2: { id: 'v2', x: 900, y: 0 },
      v3: { id: 'v3', x: 900, y: 400 },
      v4: { id: 'v4', x: 0, y: 400 },
    },
    edges: {
      'edge-top': {
        id: 'edge-top',
        start: 'v1',
        end: 'v2',
        profile: 'pencil-round',
        finish: 'polished',
        exposure: 'exposed',
        v2EdgeSide: 'top',
        v2EdgeTypeId: 'arrised-edge',
      },
      'edge-right': {
        id: 'edge-right',
        start: 'v2',
        end: 'v3',
        profile: 'raw',
        finish: 'unfinished',
        exposure: 'wall',
        v2EdgeSide: 'right',
        v2EdgeTypeId: null,
      },
      'edge-bottom': {
        id: 'edge-bottom',
        start: 'v3',
        end: 'v4',
        profile: 'pencil-round',
        finish: 'polished',
        exposure: 'exposed',
        v2EdgeSide: 'bottom',
        v2EdgeTypeId: 'arrised-edge',
      },
      'edge-left': {
        id: 'edge-left',
        start: 'v4',
        end: 'v1',
        profile: 'pencil-round',
        finish: 'polished',
        exposure: 'exposed',
        v2EdgeSide: 'left',
        v2EdgeTypeId: 'arrised-edge',
      },
    },
    outerRing: { edges: ['edge-top', 'edge-right', 'edge-bottom', 'edge-left'], orientation: 'ccw' },
    innerRings: [],
    features: [],
    areaSqm: 0.31,
    perimeterMm: 2600,
    edgeLengths: [
      { edgeId: 'edge-top', lengthMm: 900, v2EdgeSide: 'top', v2EdgeTypeId: 'arrised-edge' },
      { edgeId: 'edge-right', lengthMm: 400, v2EdgeSide: 'right', v2EdgeTypeId: null },
      { edgeId: 'edge-bottom', lengthMm: 900, v2EdgeSide: 'bottom', v2EdgeTypeId: 'arrised-edge' },
      { edgeId: 'edge-left', lengthMm: 400, v2EdgeSide: 'left', v2EdgeTypeId: 'arrised-edge' },
    ],
    boundingBox: { minX: 0, minY: 0, maxX: 900, maxY: 400, lengthMm: 900, widthMm: 400 },
  };
}

describe('optimizeMultiMaterial', () => {
  it('preserves canonical polygon true area, bounding box, and edge metadata through material groups', async () => {
    const result = await optimizeMultiMaterial({
      pieces: [
        {
          id: 'poly-bench',
          width: 9999,
          height: 9999,
          label: 'Polygon Bench',
          materialId: 'mat-1',
          thickness: 40,
          shapeType: 'POLYGON',
          shapeConfig: canonicalPolygonFixture(),
          shapeConfigEdges: {
            'edge-top': 'Arris',
            'edge-bottom': 'Arris',
            'edge-left': 'Arris',
          },
          noStripEdges: ['right'],
        },
      ],
      materials: [
        {
          id: 'mat-1',
          name: 'Test Stone',
          slabLengthMm: 3200,
          slabWidthMm: 1600,
        },
      ],
      kerfWidth: 3,
      allowRotation: true,
    });

    const placement = result.materialGroups[0].optimizationResult.placements.find(p => p.pieceId === 'poly-bench');
    const strips = result.materialGroups[0].optimizationResult.laminationSummary?.stripsByParent[0]?.strips ?? [];

    expect(placement).toEqual(expect.objectContaining({
      width: 900,
      height: 400,
      trueArea_m2: 0.31,
      boundingBoxMm: expect.objectContaining({ lengthMm: 900, widthMm: 400 }),
    }));
    expect(placement?.edgeLengths).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ edgeId: 'edge-top', lengthMm: 900, v2EdgeSide: 'top' }),
      ])
    );
    expect(strips.map(strip => strip.position)).toEqual(['edge-top', 'edge-bottom', 'edge-left']);
  });

  it('preserves group IDs when forwarding pieces to the slab optimizer', async () => {
    const result = await optimizeMultiMaterial({
      pieces: [
        {
          id: 'bench',
          width: 1200,
          height: 600,
          label: 'Bench',
          materialId: 'mat-1',
          groupId: 'grain-bench',
        },
        {
          id: 'waterfall',
          width: 600,
          height: 900,
          label: 'Waterfall',
          materialId: 'mat-1',
          groupId: 'grain-bench',
        },
      ],
      materials: [
        {
          id: 'mat-1',
          name: 'Test Stone',
          slabLengthMm: 3200,
          slabWidthMm: 1600,
        },
      ],
      kerfWidth: 3,
      allowRotation: true,
    });

    const placements = result.materialGroups[0].optimizationResult.placements;

    expect(placements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pieceId: 'bench', groupId: 'grain-bench' }),
        expect.objectContaining({ pieceId: 'waterfall', groupId: 'grain-bench' }),
      ])
    );
  });

  it('keeps grain and rotation lock metadata in the material group summary', async () => {
    const result = await optimizeMultiMaterial({
      pieces: [
        {
          id: 'bench',
          width: 1200,
          height: 600,
          label: 'Bench',
          materialId: 'mat-1',
          grainMatched: true,
          canRotate: false,
        },
      ],
      materials: [
        {
          id: 'mat-1',
          name: 'Test Stone',
          slabLengthMm: 3200,
          slabWidthMm: 1600,
        },
      ],
      kerfWidth: 3,
      allowRotation: true,
    });

    expect(result.materialGroups[0].pieces[0]).toEqual(expect.objectContaining({
      grainMatched: true,
      canRotate: false,
    }));
  });

  it('warns when pieces have no material assigned', async () => {
    const result = await optimizeMultiMaterial({
      pieces: [
        {
          id: 'unassigned',
          width: 1200,
          height: 600,
          label: 'Unassigned Bench',
          materialId: null,
        },
      ],
      materials: [],
      kerfWidth: 3,
      allowRotation: true,
    });

    expect(result.materialGroups).toHaveLength(0);
    expect(result.warnings?.[0]).toContain('no material assigned');
  });

  it('forwards per-edge strip width overrides to each material optimizer run', async () => {
    const result = await optimizeMultiMaterial({
      pieces: [
        {
          id: 'bench',
          width: 1200,
          height: 600,
          label: 'Bench',
          materialId: 'mat-1',
          thickness: 40,
          finishedEdges: {
            top: true,
            bottom: false,
            left: false,
            right: false,
          },
          edgeTypeNames: {
            top: 'Arris',
          },
          stripWidthOverrides: {
            top: 90,
          },
        },
      ],
      materials: [
        {
          id: 'mat-1',
          name: 'Test Stone',
          slabLengthMm: 3200,
          slabWidthMm: 1600,
        },
      ],
      kerfWidth: 3,
      allowRotation: true,
    });

    const strips = result.materialGroups[0].optimizationResult.laminationSummary?.stripsByParent[0]?.strips ?? [];

    expect(strips[0]).toEqual(expect.objectContaining({
      position: 'top',
      widthMm: 90,
    }));
  });
});
