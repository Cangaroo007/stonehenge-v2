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
});
