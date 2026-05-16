import { groupPiecesForJobView } from './piece-grouping';
import type { QuotePieceInput, RoomInput } from '@/lib/types/piece-groups';

function piece(overrides: Partial<QuotePieceInput>): QuotePieceInput {
  return {
    id: 1,
    name: 'Piece',
    room_id: 1,
    length_mm: 1000,
    width_mm: 600,
    thickness_mm: 20,
    area_sqm: 0.6,
    material_cost: 0,
    features_cost: 0,
    total_cost: 0,
    edge_top: null,
    edge_bottom: null,
    edge_left: null,
    edge_right: null,
    material_id: null,
    material_name: null,
    lamination_method: 'NONE',
    waterfall_height_mm: null,
    sort_order: 1,
    ...overrides,
  };
}

const rooms: RoomInput[] = [{ id: 1, name: 'Kitchen', sort_order: 1 }];

describe('groupPiecesForJobView', () => {
  it('does not infer a piece relationship from a mitred edge finish alone', () => {
    const groups = groupPiecesForJobView(
      [
        piece({
          id: 1,
          name: 'Kitchen Island',
          lamination_method: 'MITRED',
          sort_order: 1,
        }),
        piece({
          id: 2,
          name: 'Kitchen Bench',
          sort_order: 2,
        }),
      ],
      rooms
    );

    expect(groups).toHaveLength(2);
    expect(groups.every(group => group.relatedPieces.length === 0)).toBe(true);
  });

  it('normalises legacy RETURN_END relationships to RETURN for spatial rendering', () => {
    const groups = groupPiecesForJobView(
      [
        piece({
          id: 1,
          name: 'Kitchen Bench',
          sort_order: 1,
          sourceRelationships: [
            {
              id: 10,
              sourcePieceId: 1,
              targetPieceId: 2,
              relationType: 'RETURN_END',
              side: 'right',
            },
          ],
        }),
        piece({
          id: 2,
          name: 'Kitchen Return',
          sort_order: 2,
        }),
      ],
      rooms
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].relatedPieces[0].relationship).toBe('RETURN');
  });
});
