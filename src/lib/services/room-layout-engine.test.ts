import { calculateRoomLayout } from './room-layout-engine';

describe('calculateRoomLayout', () => {
  it('anchors attached waterfall layouts on the parent surface, not the larger child', () => {
    const layout = calculateRoomLayout(
      [
        {
          id: 'vanity',
          description: 'Bathroom Vanity',
          length_mm: 600,
          width_mm: 500,
          piece_type: 'VANITY',
        },
        {
          id: 'waterfall',
          description: 'Waterfall - LEFT edge',
          length_mm: 900,
          width_mm: 500,
          piece_type: 'WATERFALL',
        },
      ],
      [
        {
          parentPieceId: 'vanity',
          childPieceId: 'waterfall',
          relationshipType: 'WATERFALL',
          joinPosition: 'left',
        },
      ]
    );

    const vanity = layout.pieces.find(p => p.pieceId === 'vanity');
    const waterfall = layout.pieces.find(p => p.pieceId === 'waterfall');

    expect(vanity).toBeDefined();
    expect(waterfall).toBeDefined();
    expect(vanity!.y).toBe(waterfall!.y);
    expect(vanity!.x).toBeGreaterThan(waterfall!.x);
  });
});
