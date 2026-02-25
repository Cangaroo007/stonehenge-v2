/**
 * Unit Type Template Types
 *
 * Templates define stone pieces for a unit type ONCE, then generate quotes
 * for every apartment of that type. The material is NOT baked into the template —
 * that comes from finish tier mapping (9.3).
 */

export interface TemplateData {
  rooms: TemplateRoom[];
  totalPieces: number;
  estimatedArea_sqm: number;
}

export interface TemplateRoom {
  name: string;           // "Kitchen", "Bathroom", "Ensuite", "Laundry"
  roomType: string;       // KITCHEN, BATHROOM, ENSUITE, LAUNDRY, OTHER
  pieces: TemplatePiece[];
}

export interface TemplatePiece {
  label: string;          // "Main Benchtop", "Island", "Splashback", "Vanity Top"
  length_mm: number;
  width_mm: number;
  thickness_mm: number;   // usually 20mm, but template can specify 40mm

  // Edges — which sides are finished
  edges: {
    top: TemplateEdge;
    bottom: TemplateEdge;
    left: TemplateEdge;
    right: TemplateEdge;
  };

  // Cutouts
  cutouts: TemplateCutout[];

  // Material placeholder — NOT a specific material, but a ROLE
  materialRole: MaterialRole;

  notes?: string;
}

export type MaterialRole =
  | 'PRIMARY_BENCHTOP'
  | 'SECONDARY_BENCHTOP'
  | 'SPLASHBACK'
  | 'VANITY'
  | 'LAUNDRY'
  | 'SHOWER_SHELF'
  | 'FEATURE_PANEL'
  | 'WINDOW_SILL'
  | 'CUSTOM';

export interface TemplateEdge {
  finish: 'RAW' | 'ARRIS' | 'POLISHED' | 'LAMINATED' | 'MITRED';
  profileType?: string;   // 'PENCIL_ROUND', 'BULLNOSE', 'ARRIS_2MM', etc.
}

export interface TemplateCutout {
  type: string;           // 'UNDERMOUNT_SINK', 'COOKTOP', 'TAP_HOLE', 'GPO', etc.
  quantity: number;
}

// -- Finish Tier Mapping Types (9.3) --

export interface MaterialAssignments {
  [materialRole: string]: number; // materialRole → materialId
}

export interface EdgeOverrides {
  [materialRole: string]: {
    edges: Partial<{
      top: TemplateEdge;
      bottom: TemplateEdge;
      left: TemplateEdge;
      right: TemplateEdge;
    }>;
  };
}

export interface FinishTierMapping {
  id: number;
  templateId: number;
  finishLevel: string;
  colourScheme: string | null;
  materialAssignments: MaterialAssignments;
  edgeOverrides: EdgeOverrides | null;
  description: string | null;
  isActive: boolean;
}

// -- Buyer Change Tracking Types (9.6) --

export interface BuyerChange {
  id: string;               // UUID for each change record
  unitId: number;
  unitNumber: string;
  changeType: 'MATERIAL_UPGRADE' | 'EDGE_CHANGE' | 'LAYOUT_CHANGE' | 'CUTOUT_CHANGE' | 'THICKNESS_CHANGE' | 'OTHER';
  description: string;      // Human-readable description
  originalValue: string;    // What it was before
  newValue: string;         // What it is now
  costImpact: number;       // Positive = more expensive, negative = saving
  timestamp: string;        // ISO date string
  recordedBy?: string;      // Who recorded this change
}

export interface QuoteSnapshot {
  snapshotDate: string;     // ISO date
  subtotalExGst: number;
  gstAmount: number;
  grandTotal: number;
  pieces: Array<{
    label: string;
    material: string;
    dimensions: string;
    edges: string;
    cutouts: string[];
    lineTotal: number;
  }>;
}

// -- Clone Options --

export interface CloneByMaterialOptions {
  templateId: number;
  customerId: number;
  unitNumber: string;
  projectName?: string;
  materialAssignments: MaterialAssignments;
  edgeOverrides?: EdgeOverrides;
}

export interface CloneByFinishOptions {
  templateId: number;
  customerId: number;
  unitNumber: string;
  projectName?: string;
  finishLevel: string;
  colourScheme?: string;
}
