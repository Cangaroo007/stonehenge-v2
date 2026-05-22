import { optimizeSlabs } from './slab-optimizer';
import type { CanonicalPolygonShapeConfig } from '@/lib/types/shapes';

function canonicalPolygonFixture(): CanonicalPolygonShapeConfig {
  return {
    type: 'canonical-polygon',
    vertices: {
      v1: { id: 'v1', x: 0, y: 0 },
      v2: { id: 'v2', x: 1200, y: 0 },
      v3: { id: 'v3', x: 1200, y: 500 },
      v4: { id: 'v4', x: 0, y: 500 },
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
        v2EdgeTypeId: 'mitre-edge',
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
    areaSqm: 0.42,
    perimeterMm: 3400,
    edgeLengths: [
      { edgeId: 'edge-top', lengthMm: 1200, v2EdgeSide: 'top', v2EdgeTypeId: 'mitre-edge' },
      { edgeId: 'edge-right', lengthMm: 500, v2EdgeSide: 'right', v2EdgeTypeId: null },
      { edgeId: 'edge-bottom', lengthMm: 1200, v2EdgeSide: 'bottom', v2EdgeTypeId: 'arrised-edge' },
      { edgeId: 'edge-left', lengthMm: 500, v2EdgeSide: 'left', v2EdgeTypeId: 'arrised-edge' },
    ],
    boundingBox: { minX: 0, minY: 0, maxX: 1200, maxY: 500, lengthMm: 1200, widthMm: 500 },
  };
}

describe('optimizeSlabs', () => {
  it('uses persisted canonical polygon area, bounding box, and edge metadata in placements and strips', async () => {
    const result = await optimizeSlabs({
      slabWidth: 3200,
      slabHeight: 1600,
      kerfWidth: 5,
      allowRotation: true,
      pieces: [
        {
          id: 'poly-bench',
          label: 'Polygon Bench',
          width: 9999,
          height: 9999,
          thickness: 40,
          shapeType: 'POLYGON',
          shapeConfig: canonicalPolygonFixture(),
          shapeConfigEdges: {
            'edge-top': '40mm Mitre',
            'edge-bottom': 'Arris',
            'edge-left': 'Arris',
          },
          noStripEdges: ['right'],
        },
      ],
    });

    const placement = result.placements.find(p => p.pieceId === 'poly-bench');

    expect(placement).toEqual(expect.objectContaining({
      width: 1200,
      height: 500,
      trueArea_m2: 0.42,
      shapeType: 'POLYGON',
      boundingBoxMm: expect.objectContaining({ lengthMm: 1200, widthMm: 500 }),
    }));
    expect(placement?.edgeLengths).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ edgeId: 'edge-top', lengthMm: 1200, v2EdgeSide: 'top' }),
        expect.objectContaining({ edgeId: 'edge-right', lengthMm: 500, v2EdgeSide: 'right' }),
      ])
    );

    const strips = result.laminationSummary?.stripsByParent[0]?.strips ?? [];
    expect(strips.map(strip => strip.position)).toEqual(['edge-top', 'edge-bottom', 'edge-left']);
    expect(strips.find(strip => strip.position === 'edge-top')).toEqual(expect.objectContaining({
      lengthMm: 1200,
      widthMm: 40,
    }));
  });

  it('uses per-edge strip width overrides when generating lamination strips', async () => {
    const result = await optimizeSlabs({
      slabWidth: 3200,
      slabHeight: 1600,
      kerfWidth: 5,
      allowRotation: true,
      pieces: [
        {
          id: 'bench',
          label: 'Bench',
          width: 1200,
          height: 600,
          thickness: 40,
          edgeTypeNames: {
            top: 'Arris',
            bottom: 'Arris',
            left: 'Arris',
            right: 'Arris',
          },
          stripWidthOverrides: {
            top: 75,
          },
        },
      ],
    });

    const strips = result.laminationSummary?.stripsByParent[0]?.strips ?? [];
    const topStrip = strips.find(strip => strip.position === 'top');
    const bottomStrip = strips.find(strip => strip.position === 'bottom');

    expect(topStrip?.widthMm).toBe(75);
    expect(bottomStrip?.widthMm).toBe(60);
  });

  it('only generates legacy lamination strips for finished edges when edge flags are present', async () => {
    const result = await optimizeSlabs({
      slabWidth: 3200,
      slabHeight: 1600,
      kerfWidth: 5,
      allowRotation: true,
      pieces: [
        {
          id: 'bench',
          label: 'Bench',
          width: 1200,
          height: 600,
          thickness: 40,
          finishedEdges: {
            top: true,
            bottom: false,
            left: false,
            right: false,
          },
          edgeTypeNames: {
            top: 'Arris',
            bottom: 'Arris',
            left: 'Arris',
            right: 'Arris',
          },
        },
      ],
    });

    const strips = result.laminationSummary?.stripsByParent[0]?.strips ?? [];

    expect(strips.map(strip => strip.position)).toEqual(['top']);
  });

  it('does not add legacy finished-edge strips when explicit build-ups are present', async () => {
    const result = await optimizeSlabs({
      slabWidth: 3200,
      slabHeight: 1600,
      kerfWidth: 5,
      allowRotation: true,
      pieces: [
        {
          id: 'bench',
          label: 'Bench',
          width: 1000,
          height: 600,
          thickness: 20,
          finishedEdges: {
            top: true,
            bottom: true,
            left: true,
            right: true,
          },
          edgeTypeNames: {
            top: 'Arris',
            bottom: 'Arris',
            left: 'Arris',
            right: 'Arris',
          },
          edgeBuildups: {
            top: { depth: 40, exposed: true, chargeCut: true, chargePolish: true },
            right: { depth: 40, exposed: true, chargeCut: true, chargePolish: true },
          },
        },
      ],
    });

    const strips = result.laminationSummary?.stripsByParent[0]?.strips ?? [];

    expect(strips.map(strip => `${strip.position}:${strip.stripSubType}`)).toEqual([
      'top:FACE',
      'top:RETURN',
      'right:FACE',
      'right:RETURN',
    ]);
  });

  it('uses explicit build-up semantics for shaped pieces without adding every shape edge', async () => {
    const result = await optimizeSlabs({
      slabWidth: 3200,
      slabHeight: 1600,
      kerfWidth: 5,
      allowRotation: true,
      pieces: [
        {
          id: 'l-bench',
          label: 'L Bench',
          width: 1800,
          height: 1200,
          thickness: 20,
          shapeType: 'L_SHAPE',
          shapeConfig: {
            shape: 'L_SHAPE',
            leg1: { length_mm: 1800, width_mm: 600 },
            leg2: { length_mm: 1200, width_mm: 600 },
          },
          edgeBuildups: {
            top: { depth: 80, exposed: true, chargeCut: true, chargePolish: true },
          },
        },
      ],
    });

    const strips = result.laminationSummary?.stripsByParent[0]?.strips ?? [];

    expect(strips.map(strip => strip.position)).toEqual(['top', 'top', 'top']);
    expect(strips.map(strip => strip.stripSubType)).toEqual(['FACE', 'RETURN', 'SUPPORT']);
    expect(strips.map(strip => strip.widthMm)).toEqual([80, 60, 40]);
  });

  it('splits grain-matched pieces in fixed orientation instead of rotating them', async () => {
    const result = await optimizeSlabs({
      slabWidth: 1000,
      slabHeight: 700,
      kerfWidth: 3,
      allowRotation: true,
      pieces: [
        {
          id: 'veined-waterfall',
          label: 'Veined Waterfall',
          width: 650,
          height: 900,
          grainMatched: true,
        },
      ],
    });

    const mainPlacements = result.placements.filter(p => !p.isLaminationStrip);

    expect(mainPlacements).toHaveLength(2);
    expect(mainPlacements.every(p => p.rotated === false)).toBe(true);
    expect(mainPlacements.every(p => p.grainMatched === true)).toBe(true);
    expect(mainPlacements.every(p => p.pieceId.startsWith('veined-waterfall-seg-'))).toBe(true);
  });

  it('preserves original segment dimensions when a split segment is rotated for packing', async () => {
    const result = await optimizeSlabs({
      slabWidth: 1000,
      slabHeight: 700,
      kerfWidth: 3,
      allowRotation: true,
      pieces: [
        {
          id: 'tall-panel',
          label: 'Tall Panel',
          width: 650,
          height: 1400,
        },
      ],
    });

    const segment = result.placements.find(p => p.isSegment);

    expect(segment).toEqual(
      expect.objectContaining({
        parentPieceId: 'tall-panel',
        rotated: true,
        width: 997,
        height: 650,
        segmentWidthMm: 650,
        segmentHeightMm: 997,
        segmentColumnIndex: 0,
        segmentRowIndex: 0,
        segmentColumns: 1,
        segmentRows: 2,
      })
    );
  });

  it('keeps split lamination strip parts in the lamination summary for oversize pieces', async () => {
    const result = await optimizeSlabs({
      slabWidth: 1000,
      slabHeight: 700,
      kerfWidth: 3,
      allowRotation: true,
      pieces: [
        {
          id: 'oversize-build-up',
          label: 'Oversize Build-Up',
          width: 1400,
          height: 650,
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
        },
      ],
    });

    const strips = result.laminationSummary?.stripsByParent[0]?.strips ?? [];

    expect(strips).toHaveLength(2);
    expect(strips.map(strip => strip.lengthMm).sort((a, b) => a - b)).toEqual([403, 997]);
  });

  it('keeps explicit build-up strip semantics when oversize pieces are split', async () => {
    const result = await optimizeSlabs({
      slabWidth: 1000,
      slabHeight: 700,
      kerfWidth: 3,
      allowRotation: true,
      pieces: [
        {
          id: 'oversize-build-up',
          label: 'Oversize Build-Up',
          width: 1400,
          height: 650,
          thickness: 20,
          edgeBuildups: {
            top: { depth: 80, exposed: true, chargeCut: true, chargePolish: true },
          },
        },
      ],
    });

    const strips = result.laminationSummary?.stripsByParent[0]?.strips ?? [];

    expect(strips).toHaveLength(6);
    expect(strips.map(strip => strip.stripSubType)).toEqual([
      'FACE',
      'RETURN',
      'SUPPORT',
      'FACE',
      'RETURN',
      'SUPPORT',
    ]);
    expect(strips.map(strip => strip.widthMm)).toEqual([80, 60, 40, 80, 60, 40]);
  });

  it('exposes no-rotation metadata on slab placements for renderer warnings', async () => {
    const result = await optimizeSlabs({
      slabWidth: 1000,
      slabHeight: 700,
      kerfWidth: 3,
      allowRotation: true,
      pieces: [
        {
          id: 'locked-bench',
          label: 'Locked Bench',
          width: 500,
          height: 400,
          canRotate: false,
        },
      ],
    });

    expect(result.placements[0]).toEqual(
      expect.objectContaining({
        pieceId: 'locked-bench',
        canRotate: false,
        rotated: false,
      })
    );
  });

  it('keeps non-grain pieces rotatable when global rotation is enabled', async () => {
    const result = await optimizeSlabs({
      slabWidth: 1000,
      slabHeight: 700,
      kerfWidth: 3,
      allowRotation: true,
      pieces: [
        {
          id: 'plain-panel',
          label: 'Plain Panel',
          width: 650,
          height: 900,
        },
      ],
    });

    expect(result.unplacedPieces).not.toContain('plain-panel');
    expect(result.placements[0]).toEqual(
      expect.objectContaining({ pieceId: 'plain-panel', rotated: true })
    );
  });
});
