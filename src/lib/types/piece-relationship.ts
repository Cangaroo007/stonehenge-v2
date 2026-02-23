import type { RelationshipType } from '@prisma/client';

export interface PieceRelationshipData {
  id: string;
  parentPieceId: string;       // Maps from DB: source_piece_id
  childPieceId: string;        // Maps from DB: target_piece_id
  relationshipType: RelationshipType; // Maps from DB: relationship_type
  joinPosition: string | null; // Maps from DB: side
  notes: string | null;
}

export interface CreatePieceRelationshipInput {
  parentPieceId: string;
  childPieceId: string;
  relationshipType: RelationshipType;
  joinPosition?: string;
  notes?: string;
}

export interface UpdatePieceRelationshipInput {
  relationshipType?: RelationshipType;
  joinPosition?: string | null;
  notes?: string | null;
}

// For the auto-suggest engine (13.5)
export interface RelationshipSuggestion {
  parentPieceId: string;
  childPieceId: string;
  suggestedType: RelationshipType;
  suggestedPosition: string | null;
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
    icon: '\u2193',
  },
  SPLASHBACK: {
    label: 'Splashback',
    description: 'Wall piece behind benchtop',
    colour: '#10B981',
    icon: '\u2191',
  },
  RETURN: {
    label: 'Return',
    description: 'L-shaped benchtop turning a corner',
    colour: '#F59E0B',
    icon: '\u21B0',
  },
  WINDOW_SILL: {
    label: 'Window Sill',
    description: 'Sill piece at window opening',
    colour: '#8B5CF6',
    icon: '\u229E',
  },
  MITRE_JOIN: {
    label: 'Mitre Join',
    description: 'Two pieces joined at 45\u00B0 for seamless look',
    colour: '#EF4444',
    icon: '\u25FF',
  },
  BUTT_JOIN: {
    label: 'Butt Join',
    description: 'Two pieces joined with visible seam',
    colour: '#6B7280',
    icon: '|',
  },
};
