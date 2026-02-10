/**
 * Bulk Quote Generator Service
 *
 * Generates quotes for all (or selected) units in a unit block project.
 * For each unit:
 *   1. Find its template (via unitTypeCode)
 *   2. Check finish tier mappings are complete
 *   3. Clone template → quote with assigned materials (via template-cloner)
 *   4. Pricing calculator runs inside the clone step
 *   5. Link quote to the unit_block_unit record
 *
 * Then at project level:
 *   6. Calculate total area across all quotes
 *   7. Apply volume discount tier
 *   8. Store project-level totals
 *
 * Error isolation: if one unit fails, all other units still generate fine.
 */

import prisma from '@/lib/db';
import { Decimal } from '@prisma/client/runtime/library';
import type { Prisma } from '@prisma/client';
import { cloneTemplateToQuote } from '@/lib/services/template-cloner';
import { resolveFinishTierMappings } from '@/lib/services/finish-tier-resolver';
import type { MaterialAssignments, EdgeOverrides, TemplateData } from '@/lib/types/unit-templates';

// ============================================================================
// Types
// ============================================================================

export interface GenerationUnit {
  unitId: number;
  unitNumber: string;
  unitTypeCode: string;
  finishLevel: string;
  colourScheme: string | null;
  templateId: number;
}

export interface GenerationResult {
  unitId: number;
  unitNumber: string;
  status: 'SUCCESS' | 'SKIPPED' | 'ERROR';
  quoteId?: number;
  quoteNumber?: string;
  quoteTotal?: number;
  error?: string;
}

export interface BulkGenerationResult {
  totalProcessed: number;
  successful: number;
  skipped: number;
  failed: number;
  results: GenerationResult[];
  projectTotals: {
    totalArea_sqm: number;
    volumeTier: string;
    volumeDiscount: number;
    subtotalBeforeDiscount: number;
    discountAmount: number;
    subtotalAfterDiscount: number;
    gst: number;
    grandTotal: number;
  };
}

export interface DryRunResult {
  ready: GenerationUnit[];
  notReady: Array<{
    unitId: number;
    unitNumber: string;
    reason: string;
  }>;
}

// ============================================================================
// Volume Tier Configuration (matches calculate/route.ts)
// ============================================================================

const VOLUME_TIERS = [
  { tierId: 'SMALL', name: 'Small Project', min: 0, max: 50, discountPercent: 0 },
  { tierId: 'MEDIUM', name: 'Medium Project', min: 50, max: 150, discountPercent: 5 },
  { tierId: 'LARGE', name: 'Large Project', min: 150, max: 500, discountPercent: 10 },
  { tierId: 'ENTERPRISE', name: 'Enterprise', min: 500, max: null as number | null, discountPercent: 15 },
];

function determineVolumeTier(totalAreaSqm: number) {
  for (const tier of VOLUME_TIERS) {
    const aboveMin = totalAreaSqm >= tier.min;
    const belowMax = tier.max === null || totalAreaSqm < tier.max;
    if (aboveMin && belowMax) {
      return tier;
    }
  }
  return VOLUME_TIERS[VOLUME_TIERS.length - 1];
}

// ============================================================================
// Dry Run — Check which units are ready for generation
// ============================================================================

/**
 * Dry run — check which units are ready for generation.
 * No quotes are created.
 */
export async function dryRunGeneration(
  projectId: number,
  options?: { forceRegenerate?: boolean }
): Promise<DryRunResult> {
  const forceRegenerate = options?.forceRegenerate ?? false;

  // 1. Load all units for the project
  const units = await prisma.unit_block_units.findMany({
    where: { projectId },
    orderBy: { unitNumber: 'asc' },
    select: {
      id: true,
      unitNumber: true,
      unitTypeCode: true,
      finishLevel: true,
      colourScheme: true,
      quoteId: true,
      templateId: true,
    },
  });

  // 2. Load all templates for the project
  const templates = await prisma.unit_type_templates.findMany({
    where: { projectId, isActive: true },
    select: {
      id: true,
      unitTypeCode: true,
      templateData: true,
    },
  });
  const templateByCode = new Map<string, typeof templates[number]>();
  for (const t of templates) {
    templateByCode.set(t.unitTypeCode, t);
  }

  // 3. Load all finish tier mappings for these templates
  const templateIds = templates.map(t => t.id);
  const allMappings = templateIds.length > 0
    ? await prisma.finish_tier_mappings.findMany({
        where: { templateId: { in: templateIds }, isActive: true },
        select: {
          templateId: true,
          finishLevel: true,
          colourScheme: true,
          materialAssignments: true,
        },
      })
    : [];

  // Index mappings for quick lookup
  const mappingIndex = new Map<string, unknown>();
  for (const m of allMappings) {
    const exactKey = `${m.templateId}|${m.finishLevel}|${m.colourScheme || ''}`;
    mappingIndex.set(exactKey, m.materialAssignments);
    if (!m.colourScheme) {
      const fallbackKey = `${m.templateId}|${m.finishLevel}|`;
      if (!mappingIndex.has(fallbackKey)) {
        mappingIndex.set(fallbackKey, m.materialAssignments);
      }
    }
  }

  const ready: GenerationUnit[] = [];
  const notReady: DryRunResult['notReady'] = [];

  for (const unit of units) {
    // Check if unit already has a quote
    if (unit.quoteId && !forceRegenerate) {
      notReady.push({
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        reason: 'Already has a quote (use force regenerate to overwrite)',
      });
      continue;
    }

    // Check for unit type code
    if (!unit.unitTypeCode) {
      notReady.push({
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        reason: 'No unit type code assigned',
      });
      continue;
    }

    // Check for finish level
    if (!unit.finishLevel) {
      notReady.push({
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        reason: 'No finish level assigned',
      });
      continue;
    }

    // Find template
    const template = templateByCode.get(unit.unitTypeCode);
    if (!template) {
      notReady.push({
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        reason: `No template for Type ${unit.unitTypeCode}`,
      });
      continue;
    }

    // Check finish tier mapping
    const exactKey = `${template.id}|${unit.finishLevel}|${unit.colourScheme || ''}`;
    const fallbackKey = `${template.id}|${unit.finishLevel}|`;
    const hasMapping = mappingIndex.has(exactKey) || mappingIndex.has(fallbackKey);

    if (!hasMapping) {
      notReady.push({
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        reason: `Missing finish tier mapping for Type ${unit.unitTypeCode} × ${unit.finishLevel}${unit.colourScheme ? ` × ${unit.colourScheme}` : ''}`,
      });
      continue;
    }

    // Check that all roles in template have material assignments
    const assignments = (mappingIndex.get(exactKey) || mappingIndex.get(fallbackKey)) as MaterialAssignments;
    const templateData = template.templateData as unknown as TemplateData;
    const missingRoles: string[] = [];
    const seenRoles = new Set<string>();
    for (const room of templateData.rooms) {
      for (const piece of room.pieces) {
        if (seenRoles.has(piece.materialRole)) continue;
        seenRoles.add(piece.materialRole);
        if (assignments[piece.materialRole] === undefined || assignments[piece.materialRole] === null) {
          missingRoles.push(piece.materialRole);
        }
      }
    }

    if (missingRoles.length > 0) {
      notReady.push({
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        reason: `Missing material mapping for: ${missingRoles.join(', ')}`,
      });
      continue;
    }

    ready.push({
      unitId: unit.id,
      unitNumber: unit.unitNumber,
      unitTypeCode: unit.unitTypeCode,
      finishLevel: unit.finishLevel,
      colourScheme: unit.colourScheme,
      templateId: unit.templateId ?? template.id,
    });
  }

  return { ready, notReady };
}

// ============================================================================
// Generate Quotes
// ============================================================================

/**
 * Generate quotes for all ready units in a project.
 * Processes sequentially to avoid DB contention.
 */
export async function generateQuotes(
  projectId: number,
  options: {
    unitIds?: number[];
    forceRegenerate?: boolean;
    customerId?: number;
    onProgress?: (current: number, total: number, unitNumber: string) => void;
  }
): Promise<BulkGenerationResult> {
  const { unitIds, forceRegenerate = false, customerId, onProgress } = options;

  // 1. Run dry run to get ready units
  const dryRun = await dryRunGeneration(projectId, { forceRegenerate });
  let readyUnits = dryRun.ready;

  // 2. Filter by unitIds if specified
  if (unitIds && unitIds.length > 0) {
    const unitIdSet = new Set(unitIds);
    readyUnits = readyUnits.filter(u => unitIdSet.has(u.unitId));
  }

  // Load project to get customer info
  const project = await prisma.unit_block_projects.findUnique({
    where: { id: projectId },
    select: { customerId: true, name: true },
  });

  const effectiveCustomerId = customerId ?? project?.customerId ?? undefined;

  const results: GenerationResult[] = [];
  let successful = 0;
  let skipped = 0;
  let failed = 0;

  // 3. Process each unit sequentially
  for (let i = 0; i < readyUnits.length; i++) {
    const unit = readyUnits[i];

    // Report progress
    if (onProgress) {
      onProgress(i + 1, readyUnits.length, unit.unitNumber);
    }

    try {
      // a. Resolve finish tier mappings → material assignments
      const resolution = await resolveFinishTierMappings(
        unit.templateId,
        unit.finishLevel,
        unit.colourScheme
      );

      if (!resolution.isComplete) {
        results.push({
          unitId: unit.unitId,
          unitNumber: unit.unitNumber,
          status: 'ERROR',
          error: `Incomplete mapping: missing ${resolution.unmappedRoles.join(', ')}`,
        });
        failed++;
        continue;
      }

      // Build material assignments from resolved mappings
      const materialAssignments: Record<string, number> = {};
      for (const mapping of resolution.mappings) {
        materialAssignments[mapping.materialRole] = mapping.materialId;
      }

      // If forceRegenerate and unit has existing quote, delete it first
      if (forceRegenerate) {
        const existingUnit = await prisma.unit_block_units.findUnique({
          where: { id: unit.unitId },
          select: { quoteId: true },
        });

        if (existingUnit?.quoteId) {
          // Unlink quote from unit first
          await prisma.unit_block_units.update({
            where: { id: unit.unitId },
            data: { quoteId: null },
          });
        }
      }

      // b. Clone template → quote with assigned materials
      const cloneResult = await cloneTemplateToQuote({
        templateId: unit.templateId,
        customerId: effectiveCustomerId ?? 0,
        unitNumber: unit.unitNumber,
        projectName: project?.name,
        materialAssignments,
      });

      // c. Link quote to unit_block_unit record
      await prisma.unit_block_units.update({
        where: { id: unit.unitId },
        data: {
          quoteId: cloneResult.quoteId,
          status: 'QUOTED',
          templateId: unit.templateId,
        },
      });

      // Get quote number for result
      const quote = await prisma.quotes.findUnique({
        where: { id: cloneResult.quoteId },
        select: { quote_number: true },
      });

      results.push({
        unitId: unit.unitId,
        unitNumber: unit.unitNumber,
        status: 'SUCCESS',
        quoteId: cloneResult.quoteId,
        quoteNumber: quote?.quote_number ?? undefined,
        quoteTotal: cloneResult.totalIncGst,
      });
      successful++;
    } catch (err) {
      // Error isolation: log it, continue to next unit
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Bulk generation: failed for unit ${unit.unitNumber}:`, err);

      results.push({
        unitId: unit.unitId,
        unitNumber: unit.unitNumber,
        status: 'ERROR',
        error: errorMessage,
      });
      failed++;
    }
  }

  // Add skipped results for not-ready units that were requested
  if (unitIds && unitIds.length > 0) {
    const unitIdSet = new Set(unitIds);
    for (const nr of dryRun.notReady) {
      if (unitIdSet.has(nr.unitId)) {
        results.push({
          unitId: nr.unitId,
          unitNumber: nr.unitNumber,
          status: 'SKIPPED',
          error: nr.reason,
        });
        skipped++;
      }
    }
  }

  // 4. Calculate project totals
  const projectTotals = await calculateProjectTotals(projectId);

  return {
    totalProcessed: successful + skipped + failed,
    successful,
    skipped,
    failed,
    results,
    projectTotals,
  };
}

// ============================================================================
// Project Totals Calculation
// ============================================================================

/**
 * Calculate and store project-level totals.
 * Sums area and subtotals from all linked quotes,
 * determines volume tier, and applies discount.
 */
async function calculateProjectTotals(projectId: number): Promise<BulkGenerationResult['projectTotals']> {
  const project = await prisma.unit_block_projects.findUnique({
    where: { id: projectId },
    include: {
      units: {
        include: {
          quote: {
            include: {
              quote_rooms: {
                include: {
                  quote_pieces: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  // Sum area and subtotals from all linked quotes
  let totalAreaSqm = new Decimal(0);
  let subtotalExGst = new Decimal(0);

  for (const unit of project.units) {
    if (unit.quote) {
      for (const room of unit.quote.quote_rooms) {
        for (const piece of room.quote_pieces) {
          totalAreaSqm = totalAreaSqm.plus(piece.area_sqm);
        }
      }
      subtotalExGst = subtotalExGst.plus(unit.quote.subtotal);
    }
  }

  // Determine volume tier
  const totalAreaNum = totalAreaSqm.toNumber();
  const tier = determineVolumeTier(totalAreaNum);

  // Calculate discount
  const discountPercent = new Decimal(tier.discountPercent);
  const discountAmount = subtotalExGst.times(discountPercent).dividedBy(100);
  const afterDiscount = subtotalExGst.minus(discountAmount);

  // GST at 10%
  const gstRate = new Decimal('0.10');
  const gstAmount = afterDiscount.times(gstRate);
  const grandTotal = afterDiscount.plus(gstAmount);

  // Update project with calculated values
  await prisma.unit_block_projects.update({
    where: { id: projectId },
    data: {
      totalArea_sqm: new Decimal(totalAreaSqm.toFixed(4)),
      volumeTier: tier.tierId,
      volumeDiscount: new Decimal(discountPercent.toFixed(2)),
      subtotalExGst: new Decimal(subtotalExGst.toFixed(2)),
      discountAmount: new Decimal(discountAmount.toFixed(2)),
      gstAmount: new Decimal(gstAmount.toFixed(2)),
      grandTotal: new Decimal(grandTotal.toFixed(2)),
      status: 'QUOTED',
    },
  });

  return {
    totalArea_sqm: parseFloat(totalAreaSqm.toFixed(4)),
    volumeTier: tier.name,
    volumeDiscount: tier.discountPercent,
    subtotalBeforeDiscount: parseFloat(subtotalExGst.toFixed(2)),
    discountAmount: parseFloat(discountAmount.toFixed(2)),
    subtotalAfterDiscount: parseFloat(afterDiscount.toFixed(2)),
    gst: parseFloat(gstAmount.toFixed(2)),
    grandTotal: parseFloat(grandTotal.toFixed(2)),
  };
}
