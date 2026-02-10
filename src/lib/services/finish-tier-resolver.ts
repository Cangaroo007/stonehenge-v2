/**
 * Finish Tier Resolver Service
 *
 * Resolves material assignments for a specific template + finish level + colour scheme.
 * Called during bulk quote generation to determine which materials to use for each role.
 *
 * Also provides project-level readiness checking: how many units have complete
 * finish tier mappings and are ready for quote generation.
 */

import prisma from '@/lib/db';
import type { MaterialRole, TemplateData, MaterialAssignments } from '@/lib/types/unit-templates';

export interface ResolvedMapping {
  materialRole: MaterialRole;
  materialId: number;
  materialName: string;
  edgeProfileOverride: string | null;
}

export interface ResolutionResult {
  mappings: ResolvedMapping[];
  unmappedRoles: MaterialRole[];
  isComplete: boolean;
}

export interface MappingReadiness {
  totalUnits: number;
  fullyMapped: number;
  partiallyMapped: number;
  unmapped: number;
  missingMappings: Array<{
    unitTypeCode: string;
    finishLevel: string;
    colourScheme: string | null;
    missingRoles: string[];
    unitCount: number;
  }>;
}

/**
 * Extract all unique material roles used in a template's rooms/pieces.
 */
function extractRolesFromTemplate(templateData: TemplateData): MaterialRole[] {
  const roles = new Set<MaterialRole>();
  for (const room of templateData.rooms) {
    for (const piece of room.pieces) {
      roles.add(piece.materialRole);
    }
  }
  return Array.from(roles);
}

/**
 * Resolve material assignments for a specific template + finish level + colour scheme.
 *
 * Resolution strategy:
 * 1. Try exact match: templateId + finishLevel + colourScheme
 * 2. Fall back to: templateId + finishLevel (colourScheme=null)
 * 3. If no match, return empty with all roles as unmapped
 */
export async function resolveFinishTierMappings(
  templateId: number,
  finishLevel: string,
  colourScheme: string | null
): Promise<ResolutionResult> {
  // 1. Load the template to get all material roles used
  const template = await prisma.unit_type_templates.findUnique({
    where: { id: templateId },
  });

  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  const templateData = template.templateData as unknown as TemplateData;
  const rolesArray = extractRolesFromTemplate(templateData);

  // 2. Load finish_tier_mapping matching templateId + finishLevel + colourScheme
  // Try exact match first
  let mapping = colourScheme
    ? await prisma.finish_tier_mappings.findFirst({
        where: {
          templateId,
          finishLevel,
          colourScheme,
          isActive: true,
        },
      })
    : null;

  // Fall back to finishLevel-only match (colourScheme=null)
  if (!mapping) {
    mapping = await prisma.finish_tier_mappings.findFirst({
      where: {
        templateId,
        finishLevel,
        colourScheme: null,
        isActive: true,
      },
    });
  }

  if (!mapping) {
    return {
      mappings: [],
      unmappedRoles: rolesArray,
      isComplete: false,
    };
  }

  const assignments = mapping.materialAssignments as unknown as MaterialAssignments;
  const edgeOverrides = mapping.edgeOverrides as unknown as Record<string, { edges?: Record<string, { profileType?: string }> }> | null;

  // 3. Resolve material names for all assigned IDs
  const materialIds = Array.from(new Set(Object.values(assignments)));
  const materials = materialIds.length > 0
    ? await prisma.materials.findMany({
        where: { id: { in: materialIds } },
        select: { id: true, name: true },
      })
    : [];
  const materialMap = new Map<number, string>();
  for (const mat of materials) {
    materialMap.set(mat.id, mat.name);
  }

  // 4. For each role in the template, find the corresponding mapping
  const resolvedMappings: ResolvedMapping[] = [];
  const unmappedRoles: MaterialRole[] = [];

  for (const role of rolesArray) {
    const materialId = assignments[role];
    if (materialId !== undefined && materialId !== null) {
      // Determine edge profile override if one exists
      let edgeProfileOverride: string | null = null;
      if (edgeOverrides?.[role]?.edges) {
        const edges = edgeOverrides[role].edges;
        if (edges) {
          const edgeValues = Object.values(edges);
          for (let i = 0; i < edgeValues.length; i++) {
            const edgeData = edgeValues[i];
            if (edgeData?.profileType) {
              edgeProfileOverride = edgeData.profileType;
              break;
            }
          }
        }
      }

      resolvedMappings.push({
        materialRole: role,
        materialId,
        materialName: materialMap.get(materialId) || 'Unknown',
        edgeProfileOverride,
      });
    } else {
      unmappedRoles.push(role);
    }
  }

  return {
    mappings: resolvedMappings,
    unmappedRoles,
    isComplete: unmappedRoles.length === 0,
  };
}

interface UnitGroup {
  unitTypeCode: string | null;
  finishLevel: string | null;
  colourScheme: string | null;
  unitCount: number;
}

interface TemplateInfo {
  id: number;
  unitTypeCode: string;
  templateData: unknown;
}

/**
 * Check readiness for a project — how many units have complete mappings.
 *
 * Groups units by (unitTypeCode, finishLevel, colourScheme) and checks
 * whether complete finish tier mappings exist for each group.
 */
export async function checkProjectMappingReadiness(
  projectId: number
): Promise<MappingReadiness> {
  // 1. Load all units for the project
  const units = await prisma.unit_block_units.findMany({
    where: { projectId },
    select: {
      id: true,
      unitNumber: true,
      unitTypeCode: true,
      finishLevel: true,
      colourScheme: true,
    },
  });

  if (units.length === 0) {
    return {
      totalUnits: 0,
      fullyMapped: 0,
      partiallyMapped: 0,
      unmapped: 0,
      missingMappings: [],
    };
  }

  // 2. Group units by unique (unitTypeCode, finishLevel, colourScheme)
  const groupKey = (u: { unitTypeCode: string | null; finishLevel: string | null; colourScheme: string | null }) =>
    `${u.unitTypeCode || ''}|${u.finishLevel || ''}|${u.colourScheme || ''}`;

  const groups = new Map<string, UnitGroup>();
  for (const unit of units) {
    const key = groupKey(unit);
    const existing = groups.get(key);
    if (existing) {
      existing.unitCount++;
    } else {
      groups.set(key, {
        unitTypeCode: unit.unitTypeCode,
        finishLevel: unit.finishLevel,
        colourScheme: unit.colourScheme,
        unitCount: 1,
      });
    }
  }

  // 3. Load all templates for this project
  const templates: TemplateInfo[] = await prisma.unit_type_templates.findMany({
    where: { projectId },
    select: {
      id: true,
      unitTypeCode: true,
      templateData: true,
    },
  });
  const templateByCode = new Map<string, TemplateInfo>();
  for (const t of templates) {
    templateByCode.set(t.unitTypeCode, t);
  }

  // 4. Load all finish tier mappings for these templates
  const templateIds = templates.map((t: TemplateInfo) => t.id);
  const allMappings = templateIds.length > 0
    ? await prisma.finish_tier_mappings.findMany({
        where: {
          templateId: { in: templateIds },
          isActive: true,
        },
        select: {
          templateId: true,
          finishLevel: true,
          colourScheme: true,
          materialAssignments: true,
        },
      })
    : [];

  // Index mappings by templateId + finishLevel + colourScheme
  const mappingIndex = new Map<string, MaterialAssignments>();
  for (const m of allMappings) {
    const key = `${m.templateId}|${m.finishLevel}|${m.colourScheme || ''}`;
    mappingIndex.set(key, m.materialAssignments as unknown as MaterialAssignments);
    // Also index without colourScheme as fallback
    if (!m.colourScheme) {
      const fallbackKey = `${m.templateId}|${m.finishLevel}|`;
      if (!mappingIndex.has(fallbackKey)) {
        mappingIndex.set(fallbackKey, m.materialAssignments as unknown as MaterialAssignments);
      }
    }
  }

  let fullyMapped = 0;
  let partiallyMapped = 0;
  let unmapped = 0;
  const missingMappings: MappingReadiness['missingMappings'] = [];

  // 5. For each group, check mapping completeness
  const groupEntries = Array.from(groups.values());
  for (const group of groupEntries) {
    const { unitTypeCode, finishLevel, colourScheme, unitCount } = group;

    // No unit type code or no finish level means we can't map
    if (!unitTypeCode || !finishLevel) {
      unmapped += unitCount;
      missingMappings.push({
        unitTypeCode: unitTypeCode || 'UNKNOWN',
        finishLevel: finishLevel || 'UNKNOWN',
        colourScheme,
        missingRoles: unitTypeCode ? [] : ['NO_TEMPLATE'],
        unitCount,
      });
      continue;
    }

    const template = templateByCode.get(unitTypeCode);
    if (!template) {
      unmapped += unitCount;
      missingMappings.push({
        unitTypeCode,
        finishLevel,
        colourScheme,
        missingRoles: ['NO_TEMPLATE'],
        unitCount,
      });
      continue;
    }

    // Get roles from template
    const templateData = template.templateData as unknown as TemplateData;
    const roles = extractRolesFromTemplate(templateData);

    // Find mapping (exact match first, then fallback)
    const exactKey = `${template.id}|${finishLevel}|${colourScheme || ''}`;
    const fallbackKey = `${template.id}|${finishLevel}|`;
    const assignments = mappingIndex.get(exactKey) || mappingIndex.get(fallbackKey);

    if (!assignments) {
      unmapped += unitCount;
      missingMappings.push({
        unitTypeCode,
        finishLevel,
        colourScheme,
        missingRoles: roles as string[],
        unitCount,
      });
      continue;
    }

    // Check which roles are mapped
    const missingRoles: string[] = [];
    for (const role of roles) {
      if (assignments[role] === undefined || assignments[role] === null) {
        missingRoles.push(role);
      }
    }

    if (missingRoles.length === 0) {
      fullyMapped += unitCount;
    } else if (missingRoles.length < roles.length) {
      partiallyMapped += unitCount;
      missingMappings.push({
        unitTypeCode,
        finishLevel,
        colourScheme,
        missingRoles,
        unitCount,
      });
    } else {
      unmapped += unitCount;
      missingMappings.push({
        unitTypeCode,
        finishLevel,
        colourScheme,
        missingRoles,
        unitCount,
      });
    }
  }

  return {
    totalUnits: units.length,
    fullyMapped,
    partiallyMapped,
    unmapped,
    missingMappings,
  };
}
