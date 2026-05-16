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
});
