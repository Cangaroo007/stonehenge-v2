/**
 * Types for unit type templates and finish tier mappings.
 * Used by the template cloner and bulk generation systems.
 */

// -- Template Edge Types --

export interface TemplateEdge {
  finish: string; // e.g. "POLISHED", "MITRED", "ARRIS"
  thickness?: number;
}

export interface TemplatePieceEdges {
  top?: TemplateEdge;
  bottom?: TemplateEdge;
  left?: TemplateEdge;
  right?: TemplateEdge;
}

// -- Template Piece & Room Types --

export interface TemplateCutout {
  type: string; // e.g. "SINK", "COOKTOP", "TAP_HOLE"
  quantity: number;
}

export interface TemplatePiece {
  name: string;
  materialRole: string; // e.g. "PRIMARY_BENCHTOP", "VANITY", "LAUNDRY"
  length_mm: number;
  width_mm: number;
  thickness_mm: number;
  edges: TemplatePieceEdges;
  cutouts: TemplateCutout[];
  laminationMethod?: string;
}

export interface TemplateRoom {
  name: string;
  pieces: TemplatePiece[];
}

export interface TemplateData {
  rooms: TemplateRoom[];
}

// -- Finish Tier Mapping Types --

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
