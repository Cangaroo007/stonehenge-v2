import { suggestRelationships } from './relationship-suggest-service';

describe('suggestRelationships', () => {
  const basePiece = {
    piece_type: 'BENCHTOP',
    length_mm: 1200,
    width_mm: 600,
    room_name: 'Kitchen',
  };

  it('does not treat a mitred build-up edge description as a piece relationship', () => {
    const suggestions = suggestRelationships(
      [
        {
          ...basePiece,
          id: 'bench-1',
          description: 'Island bench with mitred build-up edge',
        },
        {
          ...basePiece,
          id: 'bench-2',
          description: 'Rear bench with pencil round edge',
          length_mm: 1800,
        },
      ],
      []
    );

    expect(suggestions.some(s => s.suggestedType === 'MITRE_JOIN')).toBe(false);
  });

  it('still suggests a mitre relationship when a description explicitly says mitre join', () => {
    const suggestions = suggestRelationships(
      [
        {
          ...basePiece,
          id: 'bench-1',
          description: 'Island bench mitre join to return',
        },
        {
          ...basePiece,
          id: 'bench-2',
          description: 'Return bench',
          length_mm: 1800,
          width_mm: 750,
        },
      ],
      []
    );

    expect(suggestions.some(s => s.suggestedType === 'MITRE_JOIN')).toBe(true);
  });
});
