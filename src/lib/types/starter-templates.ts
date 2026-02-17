/**
 * Starter Template Types
 *
 * Types for the starter template system — pre-built piece configurations
 * that can be applied to quotes. Templates store material ROLES (not IDs),
 * so the same template can create quotes with different stone products.
 *
 * IMPORTANT: These types match the actual seed data structure in
 * prisma/data/piece-starter-templates.json
 */

// -- Material Roles --

export type MaterialRole =
  | 'PRIMARY_BENCHTOP'
  | 'SECONDARY_BENCHTOP'
  | 'ISLAND'
  | 'SPLASHBACK'
  | 'VANITY'
  | 'LAUNDRY'
  | 'WINDOWSILL'
  | 'FEATURE_WALL';

// Human-readable labels for material roles
export const MATERIAL_ROLE_LABELS: Record<MaterialRole, string> = {
  PRIMARY_BENCHTOP: 'Primary Benchtop',
  SECONDARY_BENCHTOP: 'Secondary Benchtop',
  ISLAND: 'Island',
  SPLASHBACK: 'Splashback',
  VANITY: 'Vanity',
  LAUNDRY: 'Laundry',
  WINDOWSILL: 'Window Sill',
  FEATURE_WALL: 'Feature Wall',
};

// -- Template Data (stored in templateData JSON column) --

/**
 * The full JSON structure stored in starter_templates.templateData.
 * Note: The seed script stores the entire template JSON object (including
 * name, description, etc.) in templateData, so this matches that shape.
 */
export interface StarterTemplateData {
  name: string;
  description: string;
  category: string;
  isBuiltIn: boolean;
  rooms: StarterTemplateRoom[];
}

export interface StarterTemplateRoom {
  name: string;           // "Kitchen", "Bathroom", "Ensuite", "Laundry"
  pieces: StarterTemplatePiece[];
}

/**
 * Piece definition within a starter template.
 * Edge values are simple strings matching the seed data format:
 * "polished", "raw", "bullnose", "pencil_round", etc.
 */
export interface StarterTemplatePiece {
  name: string;           // "Main Benchtop", "Island", "Splashback", "Vanity Top"
  pieceType: string;      // BENCHTOP, ISLAND, SPLASHBACK, VANITY, WATERFALL, etc.
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;    // usually 20

  edges: {
    top: string;          // "polished", "raw", "bullnose", "pencil_round"
    bottom: string;
    left: string;
    right: string;
  };

  cutouts: StarterTemplateCutout[];

  /** Optional relationship to another piece (e.g. splashback → benchtop) */
  relatedTo?: {
    pieceName: string;
    relationType: string; // SPLASHBACK, WATERFALL, RETURN_END, etc.
  };

  /** Material role — inferred when saving from quote, used when applying */
  materialRole?: MaterialRole;

  notes?: string;
}

export interface StarterTemplateCutout {
  type: string;           // "Undermount Sink", "Cooktop/Hotplate", "Tap Hole", "GPO/Powerpoint", etc.
  quantity: number;
}

// -- Apply Template Request/Response --

/** What the user provides when applying a template to a quote */
export interface ApplyTemplateRequest {
  templateId: string;
  materialAssignments: Record<MaterialRole, number>;  // role -> materialId
  quoteId?: number;       // Apply to existing quote (adds pieces), or omit to create new
  customerId?: number;    // Required if creating new quote
  projectName?: string;   // Optional for new quote
}

export interface ApplyTemplateResult {
  quoteId: number;
  piecesCreated: number;
  roomsCreated: number;
  totalAreaSqm: number;
}

// -- Save As Template Request/Response --

/** What gets sent when saving a quote as a template */
export interface SaveAsTemplateRequest {
  quoteId: number;
  name: string;
  description?: string;
  category?: string;      // kitchen, bathroom, laundry, multi-room
}

// -- Material Role Inference --

/**
 * Infer the material role for a piece based on its type and room context.
 * Used when saving a quote as a template.
 */
export function inferMaterialRole(roomName: string, pieceType: string): MaterialRole {
  const upperPieceType = pieceType.toUpperCase();
  const upperRoom = roomName.toUpperCase();

  if (upperPieceType === 'ISLAND') return 'ISLAND';
  if (upperPieceType === 'SPLASHBACK') return 'SPLASHBACK';
  if (upperPieceType === 'WINDOWSILL') return 'WINDOWSILL';
  if (upperPieceType === 'VANITY') return 'VANITY';

  if (upperRoom.includes('BATHROOM') || upperRoom.includes('ENSUITE')) return 'VANITY';
  if (upperRoom.includes('LAUNDRY')) return 'LAUNDRY';

  return 'PRIMARY_BENCHTOP';
}
