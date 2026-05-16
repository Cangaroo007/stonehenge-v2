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

  it('uses saved splashback offset and coverage when positioning partial attachments', () => {
    const layout = calculateRoomLayout(
      [
        {
          id: 'bench',
          description: 'Kitchen Bench',
          length_mm: 2400,
          width_mm: 600,
          piece_type: 'BENCHTOP',
        },
        {
          id: 'splashback',
          description: 'Short splashback',
          length_mm: 1200,
          width_mm: 600,
          piece_type: 'SPLASHBACK',
        },
      ],
      [
        {
          parentPieceId: 'bench',
          childPieceId: 'splashback',
          relationshipType: 'SPLASHBACK',
          joinPosition: 'top',
          positionMm: 300,
          positionReference: 'LEFT',
          coverageMm: 600,
        },
      ]
    );

    const bench = layout.pieces.find(p => p.pieceId === 'bench');
    const splashback = layout.pieces.find(p => p.pieceId === 'splashback');

    expect(bench).toBeDefined();
    expect(splashback).toBeDefined();
    expect(splashback!.x - bench!.x).toBeCloseTo(300 * layout.scale, 4);
    expect(splashback!.width).toBeCloseTo(600 * layout.scale, 4);
  });

  it('renders front/bottom waterfalls by drop depth, not by parent edge span', () => {
    const layout = calculateRoomLayout(
      [
        {
          id: 'bench',
          description: 'Kitchen Bench',
          length_mm: 2400,
          width_mm: 600,
          piece_type: 'BENCHTOP',
        },
        {
          id: 'waterfall',
          description: 'Waterfall - FRONT edge',
          length_mm: 2400,
          width_mm: 900,
          piece_type: 'WATERFALL',
        },
      ],
      [
        {
          parentPieceId: 'bench',
          childPieceId: 'waterfall',
          relationshipType: 'WATERFALL',
          joinPosition: 'FRONT',
        },
      ]
    );

    const bench = layout.pieces.find(p => p.pieceId === 'bench');
    const waterfall = layout.pieces.find(p => p.pieceId === 'waterfall');

    expect(bench).toBeDefined();
    expect(waterfall).toBeDefined();
    expect(waterfall!.height).toBeCloseTo(900 * layout.scale, 4);
    expect(waterfall!.width).toBeCloseTo(2400 * layout.scale, 4);
    expect(waterfall!.y).toBeGreaterThan(bench!.y);
  });

  it('maps back/rear relationships to the top wall side', () => {
    const layout = calculateRoomLayout(
      [
        {
          id: 'bench',
          description: 'Kitchen Bench',
          length_mm: 2400,
          width_mm: 600,
          piece_type: 'BENCHTOP',
        },
        {
          id: 'splashback',
          description: 'Back splashback',
          length_mm: 2400,
          width_mm: 600,
          piece_type: 'SPLASHBACK',
        },
      ],
      [
        {
          parentPieceId: 'bench',
          childPieceId: 'splashback',
          relationshipType: 'SPLASHBACK',
          joinPosition: 'BACK',
        },
      ]
    );

    const bench = layout.pieces.find(p => p.pieceId === 'bench');
    const splashback = layout.pieces.find(p => p.pieceId === 'splashback');

    expect(bench).toBeDefined();
    expect(splashback).toBeDefined();
    expect(splashback!.y).toBeLessThan(bench!.y);
  });
});
