/**
 * Piece grouping types for the Complete Job View.
 *
 * These types define how pieces relate to each other spatially,
 * enabling mini-diagrams that show waterfalls adjacent to benchtops,
 * splashbacks behind them, mitre joins connected, etc.
 */

/**
 * Relationship types between pieces in a job.
 * Used by the Complete Job View to create spatial mini-diagrams.
 */
export type PieceRelationType =
  | 'WATERFALL'      // Vertical piece hanging off the side of a benchtop
  | 'SPLASHBACK'     // Piece behind/above a benchtop
  | 'RETURN_END'     // Short piece wrapping around a corner
  | 'WINDOW_SILL'    // Piece below a window, often connects to benchtop run
  | 'ISLAND'         // Standalone benchtop, may have waterfalls on ends
  | 'MITRE_JOIN'     // Two pieces joined at 45-degree angle
  | 'BUTT_JOIN'      // Two pieces butted end-to-end
  | 'LAMINATION'     // Edge build-up strip (related to parent piece)
  | 'STANDALONE';    // No relationship to other pieces

/**
 * A group of related pieces that should be shown together
 * in a mini spatial diagram.
 */
export interface PieceGroup {
  id: string;
  label: string;              // e.g. "Kitchen Run A", "Island", "Bathroom Vanity"
  room: string;               // Room name
  primaryPiece: GroupedPiece;  // The main benchtop/vanity piece
  relatedPieces: GroupedPiece[]; // Waterfalls, splashbacks, returns, etc.
  totalArea: number;           // Combined area of all pieces in group (m2)
  totalCost: number;           // Combined cost of all pieces in group
}

/**
 * A piece with its relationship context within a group.
 */
export interface GroupedPiece {
  pieceId: number;
  pieceName: string;
  relationship: PieceRelationType;
  position: SpatialPosition;   // Where to render in the mini diagram
  dimensions: {
    lengthMm: number;
    widthMm: number;
    thicknessMm: number;
  };
  edges: {
    top: string | null;
    bottom: string | null;
    left: string | null;
    right: string | null;
  };
  material: {
    id: number | null;
    name: string | null;
  };
  areaSqm: number;
  cost: number;
}

/**
 * Spatial position for mini diagram rendering.
 * Uses relative positioning -- the primary piece is always at (0,0).
 */
export interface SpatialPosition {
  x: number;         // Relative X offset (0 = aligned with primary)
  y: number;         // Relative Y offset (0 = aligned with primary)
  rotation: number;  // Degrees: 0 = horizontal, 90 = vertical (waterfalls)
  side: 'top' | 'bottom' | 'left' | 'right' | 'centre' | null;
}

/**
 * Input piece shape expected by the grouping service.
 * Matches the camelCase shape returned by the quote API.
 */
export interface QuotePieceInput {
  id: number;
  name: string;
  room_id: number;
  length_mm: number;
  width_mm: number;
  thickness_mm: number;
  area_sqm: number | { toNumber(): number };
  /** @deprecated Unreliable — use quotes.calculation_breakdown for piece pricing */
  material_cost: number | { toNumber(): number };
  features_cost: number | { toNumber(): number };
  /** @deprecated Unreliable — use quotes.calculation_breakdown for piece pricing */
  total_cost: number | { toNumber(): number };
  edge_top: string | null;
  edge_bottom: string | null;
  edge_left: string | null;
  edge_right: string | null;
  material_id: number | null;
  material_name: string | null;
  lamination_method: string;
  waterfall_height_mm: number | null;
  sort_order: number;
  sourceRelationships?: PieceRelationshipRecord[];
  targetRelationships?: PieceRelationshipRecord[];
}

/**
 * A piece relationship record as stored in the database.
 */
export interface PieceRelationshipRecord {
  id: number;
  sourcePieceId: number;
  targetPieceId: number;
  relationType: string;
  side: string | null;
}

/**
 * Room input shape for the grouping service.
 */
export interface RoomInput {
  id: number;
  name: string;
  sort_order: number;
}
