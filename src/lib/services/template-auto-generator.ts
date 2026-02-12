/**
 * Template Auto-Generator Service (Series 9.15)
 *
 * Takes parsed schedule specs (from the ScheduleUploader) and automatically
 * creates unit_type_templates with sensible defaults for dimensions, edges,
 * cutouts, and material roles.
 */

import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import type {
  TemplateData,
  TemplateRoom,
  TemplatePiece,
  TemplateEdge,
  TemplateCutout,
  MaterialRole,
} from '@/lib/types/unit-templates';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface ScheduleSpecInput {
  room: string;        // "KITCHEN", "BATHROOM", "ENSUITE_(WHERE_APPLICABLE)", etc.
  application: string; // "BENCHTOP", "VANITY", "SPLASHBACK", "SHOWER_SHELF"
  thickness: string;   // "20mm"
  edge: string;        // "2mm arris edge", "40mm apron mitred", "Bullnose", "—"
}

export interface AutoGenerateInput {
  projectId: number;
  specs: ScheduleSpecInput[];
  unitTypeCodes: string[]; // e.g. ["A", "B", "C"]
}

export interface AutoGenerateResult {
  templates: Array<{
    templateId: number;
    templateName: string;
    unitTypeCode: string;
    roomCount: number;
    pieceCount: number;
    linkedUnitCount: number;
  }>;
  totalUnitsLinked: number;
}

// ---------------------------------------------------------------------------
// Room-name normalisation
// ---------------------------------------------------------------------------

const ROOM_NAME_MAP: Record<string, string> = {
  KITCHEN: 'Kitchen',
  BATHROOM: 'Bathroom',
  ENSUITE: 'Ensuite',
  'ENSUITE_(WHERE_APPLICABLE)': 'Ensuite',
  LAUNDRY: 'Laundry',
  STUDY: 'Study',
  'STUDY_(WHERE_APPLICABLE)': 'Study',
  WALK_IN_PANTRY: 'Walk-in Pantry',
  PANTRY: 'Pantry',
};

function normaliseRoomName(raw: string): string {
  const key = raw.trim().toUpperCase().replace(/\s+/g, '_');
  return ROOM_NAME_MAP[key] ?? titleCase(key);
}

function titleCase(input: string): string {
  return input
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\(.*?\)/g, '') // strip parenthesised qualifiers
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Derive a roomType key from the normalised name */
function roomTypeFromName(name: string): string {
  return name.toUpperCase().replace(/[- ]/g, '_');
}

// ---------------------------------------------------------------------------
// Material role mapping
// ---------------------------------------------------------------------------

function resolveMaterialRole(room: string, application: string): MaterialRole {
  const r = room.toUpperCase().replace(/[_ ]/g, '');
  const a = application.toUpperCase().replace(/[_ ]/g, '');

  if (r === 'KITCHEN' && (a === 'BENCHTOP' || a === 'ISLAND'))
    return 'PRIMARY_BENCHTOP';
  if (r === 'KITCHEN' && a === 'SPLASHBACK') return 'SPLASHBACK';
  if ((r === 'STUDY' || r === 'WALKINPANTRY' || r === 'PANTRY') && a === 'BENCHTOP')
    return 'SECONDARY_BENCHTOP';
  if ((r === 'BATHROOM' || r === 'ENSUITE') && a === 'VANITY') return 'VANITY';
  if ((r === 'BATHROOM' || r === 'ENSUITE') && a === 'SHOWERSHELF')
    return 'SHOWER_SHELF';
  if (r === 'LAUNDRY' && a === 'BENCHTOP') return 'LAUNDRY';

  return 'PRIMARY_BENCHTOP'; // fallback
}

// ---------------------------------------------------------------------------
// Default dimensions  (length × width in mm)
// ---------------------------------------------------------------------------

function defaultDimensions(
  room: string,
  application: string
): { length_mm: number; width_mm: number } {
  const r = room.toUpperCase().replace(/[_ ]/g, '');
  const a = application.toUpperCase().replace(/[_ ]/g, '');

  if (a === 'ISLAND') return { length_mm: 1800, width_mm: 900 };
  if (a === 'SPLASHBACK') return { length_mm: 2400, width_mm: 600 };
  if (a === 'SHOWERSHELF') return { length_mm: 300, width_mm: 150 };

  if (a === 'VANITY') {
    if (r === 'ENSUITE') return { length_mm: 900, width_mm: 500 };
    return { length_mm: 1200, width_mm: 500 }; // Bathroom default
  }

  if (a === 'BENCHTOP') {
    if (r === 'KITCHEN') return { length_mm: 2400, width_mm: 600 };
    if (r === 'STUDY' || r === 'WALKINPANTRY' || r === 'PANTRY')
      return { length_mm: 1500, width_mm: 600 };
    if (r === 'LAUNDRY') return { length_mm: 1200, width_mm: 600 };
    return { length_mm: 2400, width_mm: 600 }; // fallback
  }

  return { length_mm: 2400, width_mm: 600 }; // generic fallback
}

// ---------------------------------------------------------------------------
// Thickness parsing
// ---------------------------------------------------------------------------

function parseThickness(raw: string | null | undefined): number {
  if (!raw) return 20;
  const match = raw.match(/(\d+)\s*mm/i);
  return match ? parseInt(match[1], 10) : 20;
}

// ---------------------------------------------------------------------------
// Edge parsing
// ---------------------------------------------------------------------------

const RAW_EDGE: TemplateEdge = { finish: 'RAW' };

function parseEdges(edgeStr: string | null | undefined): {
  top: TemplateEdge;
  bottom: TemplateEdge;
  left: TemplateEdge;
  right: TemplateEdge;
} {
  const allRaw = { top: RAW_EDGE, bottom: RAW_EDGE, left: RAW_EDGE, right: RAW_EDGE };

  if (!edgeStr || edgeStr.trim() === '' || edgeStr.trim() === '—' || edgeStr.trim() === '-') {
    return allRaw;
  }

  const lower = edgeStr.toLowerCase();

  let frontEdge: TemplateEdge;

  if (lower.includes('arris')) {
    frontEdge = { finish: 'POLISHED', profileType: 'ARRIS_2MM' };
  } else if (lower.includes('mitred') || lower.includes('apron')) {
    frontEdge = { finish: 'MITRED', profileType: 'PENCIL_ROUND' };
  } else if (lower.includes('bullnose')) {
    frontEdge = { finish: 'POLISHED', profileType: 'BULLNOSE' };
  } else if (lower.includes('pencil')) {
    frontEdge = { finish: 'POLISHED', profileType: 'PENCIL_ROUND' };
  } else {
    return allRaw;
  }

  return {
    top: frontEdge,   // "front" edge → top
    bottom: RAW_EDGE,
    left: RAW_EDGE,
    right: RAW_EDGE,
  };
}

// ---------------------------------------------------------------------------
// Default cutouts
// ---------------------------------------------------------------------------

function defaultCutouts(room: string, application: string): TemplateCutout[] {
  const r = room.toUpperCase().replace(/[_ ]/g, '');
  const a = application.toUpperCase().replace(/[_ ]/g, '');

  if (r === 'KITCHEN' && a === 'BENCHTOP') {
    return [
      { type: 'UNDERMOUNT_SINK', quantity: 1 },
      { type: 'TAP_HOLE', quantity: 1 },
    ];
  }

  if ((r === 'BATHROOM' || r === 'ENSUITE') && a === 'VANITY') {
    return [
      { type: 'BASIN', quantity: 1 },
      { type: 'TAP_HOLE', quantity: 1 },
    ];
  }

  if (r === 'LAUNDRY' && a === 'BENCHTOP') {
    return [
      { type: 'DROP_IN_SINK', quantity: 1 },
      { type: 'TAP_HOLE', quantity: 1 },
    ];
  }

  return [];
}

// ---------------------------------------------------------------------------
// Build TemplateData from specs
// ---------------------------------------------------------------------------

function buildTemplateData(specs: ScheduleSpecInput[]): TemplateData {
  // Group specs by normalised room name
  const roomMap = new Map<string, { roomType: string; pieces: TemplatePiece[] }>();

  for (const spec of specs) {
    const roomName = normaliseRoomName(spec.room);
    const roomType = roomTypeFromName(roomName);
    const appNorm = spec.application.toUpperCase().replace(/\s+/g, '_');

    if (!roomMap.has(roomName)) {
      roomMap.set(roomName, { roomType, pieces: [] });
    }

    const dims = defaultDimensions(roomType, appNorm);
    const label = `${roomName} ${titleCase(appNorm)}`;

    const piece: TemplatePiece = {
      label,
      length_mm: dims.length_mm,
      width_mm: dims.width_mm,
      thickness_mm: parseThickness(spec.thickness),
      edges: parseEdges(spec.edge),
      cutouts: defaultCutouts(roomType, appNorm),
      materialRole: resolveMaterialRole(roomType, appNorm),
    };

    roomMap.get(roomName)!.pieces.push(piece);
  }

  const rooms: TemplateRoom[] = Array.from(roomMap.entries()).map(
    ([name, { roomType, pieces }]) => ({
      name,
      roomType,
      pieces,
    })
  );

  const totalPieces = rooms.reduce((sum, r) => sum + r.pieces.length, 0);
  const estimatedArea_sqm = rooms.reduce(
    (sum, r) =>
      sum +
      r.pieces.reduce(
        (s, p) => s + (p.length_mm * p.width_mm) / 1_000_000,
        0
      ),
    0
  );

  return {
    rooms,
    totalPieces,
    estimatedArea_sqm: Math.round(estimatedArea_sqm * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function autoGenerateTemplates(
  input: AutoGenerateInput
): Promise<AutoGenerateResult> {
  const { projectId, specs, unitTypeCodes } = input;

  const templateData = buildTemplateData(specs);

  const results: AutoGenerateResult['templates'] = [];
  let totalUnitsLinked = 0;

  for (const unitTypeCode of unitTypeCodes) {
    const template = await prisma.unit_type_templates.upsert({
      where: {
        unitTypeCode_projectId: { unitTypeCode, projectId },
      },
      create: {
        name: `Type ${unitTypeCode} \u2014 Kitchen & Wet Areas`,
        unitTypeCode,
        projectId,
        templateData: templateData as unknown as Prisma.InputJsonValue,
        version: 1,
        isActive: true,
      },
      update: {
        templateData: templateData as unknown as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });

    // Auto-link units that don't already have a template
    const linked = await prisma.unit_block_units.updateMany({
      where: {
        projectId,
        unitTypeCode,
        templateId: null,
      },
      data: { templateId: template.id },
    });

    results.push({
      templateId: template.id,
      templateName: template.name,
      unitTypeCode,
      roomCount: templateData.rooms.length,
      pieceCount: templateData.totalPieces,
      linkedUnitCount: linked.count,
    });

    totalUnitsLinked += linked.count;
  }

  return { templates: results, totalUnitsLinked };
}
