import { optimizeMultiMaterial } from './multi-material-optimizer';

describe('optimizeMultiMaterial', () => {
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
