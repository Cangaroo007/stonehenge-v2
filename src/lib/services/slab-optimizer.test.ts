import { optimizeSlabs } from './slab-optimizer';

describe('optimizeSlabs', () => {
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
