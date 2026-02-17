import { RelationshipType } from '@prisma/client';

export interface PieceRelationshipData {
  id: number;
  source_piece_id: number;
  target_piece_id: number;
  relation_type: RelationshipType;
  side: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreatePieceRelationshipInput {
  source_piece_id: number;
  target_piece_id: number;
  relation_type: RelationshipType;
  side?: string;
  notes?: string;
}

export interface UpdatePieceRelationshipInput {
  relation_type?: RelationshipType;
  side?: string | null;
  notes?: string | null;
}

// For the auto-suggest engine (13.5)
export interface RelationshipSuggestion {
  parentPieceId: number;
  childPieceId: number;
  suggestedType: RelationshipType;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
}

// Join positions
export const JOIN_POSITIONS = ['LEFT', 'RIGHT', 'BACK', 'FRONT'] as const;
export type JoinPosition = typeof JOIN_POSITIONS[number];

// Relationship display metadata
export const RELATIONSHIP_DISPLAY: Record<RelationshipType, {
  label: string;
  description: string;
  colour: string;
  icon: string;
}> = {
  WATERFALL: {
    label: 'Waterfall',
    description: 'Vertical piece dropping from benchtop edge to floor',
    colour: '#3B82F6',
    icon: '↓',
  },
  SPLASHBACK: {
    label: 'Splashback',
    description: 'Wall piece behind benchtop',
    colour: '#10B981',
    icon: '↑',
  },
  RETURN: {
    label: 'Return',
    description: 'L-shaped benchtop turning a corner',
    colour: '#F59E0B',
    icon: '↰',
  },
  RETURN_END: {
    label: 'Return End',
    description: 'Short piece wrapping around a corner',
    colour: '#F59E0B',
    icon: '↰',
  },
  WINDOW_SILL: {
    label: 'Window Sill',
    description: 'Sill piece at window opening',
    colour: '#8B5CF6',
    icon: '⊞',
  },
  ISLAND: {
    label: 'Island',
    description: 'Standalone benchtop, may have waterfalls on ends',
    colour: '#06B6D4',
    icon: '◻',
  },
  MITRE_JOIN: {
    label: 'Mitre Join',
    description: 'Two pieces joined at 45° for seamless look',
    colour: '#EF4444',
    icon: '⊿',
  },
  BUTT_JOIN: {
    label: 'Butt Join',
    description: 'Two pieces joined with visible seam',
    colour: '#6B7280',
    icon: '|',
  },
  LAMINATION: {
    label: 'Lamination',
    description: 'Edge build-up strip related to parent piece',
    colour: '#D97706',
    icon: '≡',
  },
};
