/**
 * Bulk Quote Generation Service
 *
 * Takes a project with N units (each tagged with unitTypeCode + finishLevel),
 * and generates quotes for all of them in one go. Each quote is cloned from
 * the matching template with materials resolved from the finish tier mapping.
 *
 * Sequential processing to avoid DB contention. Error-isolated so one failed
 * unit doesn't stop the batch.
 */

import prisma from '@/lib/db';
import { Decimal } from '@prisma/client/runtime/library';
import { cloneTemplateToQuoteByFinish } from '@/lib/services/template-cloner';

// ============================================================================
// Types
// ============================================================================

export interface GenerationOptions {
  projectId: number;
  unitIds?: number[];        // specific units, or ALL if omitted
  overwriteExisting?: boolean; // re-generate units that already have quotes
  dryRun?: boolean;          // preview without creating
}

export interface UnitGenerationResult {
  unitId: number;
  unitNumber: string;
  status: 'created' | 'skipped' | 'failed';
  quoteId?: number;
  totalExGst?: number;
  error?: string;
}

export interface BulkGenerationResult {
  totalUnits: number;
  quotesCreated: number;
  quotesSkipped: number;
  quotesFailed: number;
  results: UnitGenerationResult[];
  errors: Array<{ unitNumber: string; error: string }>;

  // Project-level totals (after volume discount)
  totalArea_sqm: number;
  volumeTier: string;
  volumeDiscount: number;
  subtotalExGst: number;
  discountAmount: number;
  gstAmount: number;
  grandTotal: number;
}

// ============================================================================
// Volume Tier Configuration (matches calculate endpoint)
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
// Main Function
// ============================================================================

export async function generateProjectQuotes(
  options: GenerationOptions
): Promise<BulkGenerationResult> {
  const { projectId, unitIds, overwriteExisting = false, dryRun = false } = options;

  // 1. Load project with all units
  const project = await prisma.unit_block_projects.findUnique({
    where: { id: projectId },
    include: {
      units: {
        orderBy: { unitNumber: 'asc' },
        include: {
          quote: {
            select: { id: true, quote_number: true },
          },
        },
      },
    },
  });

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  if (!project.customerId) {
    throw new Error('Project has no customer assigned. A customer is required for quote generation.');
  }

  const customerId = project.customerId;

  // Filter to specific units if requested
  let units = project.units;
  if (unitIds && unitIds.length > 0) {
    const unitIdSet = new Set(unitIds);
    units = units.filter(u => unitIdSet.has(u.id));
  }

  // 2. Load all templates for this project's unit type codes
  const unitTypeCodes = Array.from(
    new Set(units.map(u => u.unitTypeCode).filter((c): c is string => c !== null))
  );

  // Look up templates: project-specific first, then global (projectId=null)
  const templates = await prisma.unit_type_templates.findMany({
    where: {
      unitTypeCode: { in: unitTypeCodes },
      isActive: true,
      OR: [
        { projectId: projectId },
        { projectId: null },
      ],
    },
    include: {
      finishMappings: {
        where: { isActive: true },
      },
    },
  });

  // Build a lookup: unitTypeCode → template (prefer project-specific)
  const templateMap = new Map<string, typeof templates[number]>();
  for (const template of templates) {
    const existing = templateMap.get(template.unitTypeCode);
    // Prefer project-specific over global
    if (!existing || (template.projectId === projectId && existing.projectId !== projectId)) {
      templateMap.set(template.unitTypeCode, template);
    }
  }

  // 3. Pre-flight validation
  const results: UnitGenerationResult[] = [];

  for (const unit of units) {
    // a. Has a unitTypeCode?
    if (!unit.unitTypeCode) {
      results.push({
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        status: 'failed',
        error: 'No unit type assigned',
      });
      continue;
    }

    // b. Has a matching template?
    const template = templateMap.get(unit.unitTypeCode);
    if (!template) {
      results.push({
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        status: 'failed',
        error: `No template for type ${unit.unitTypeCode}`,
      });
      continue;
    }

    // c. Has finishLevel?
    if (!unit.finishLevel) {
      results.push({
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        status: 'failed',
        error: 'No finish level assigned',
      });
      continue;
    }

    // d. Has a finish tier mapping for template + finishLevel?
    const hasMapping = template.finishMappings.some(m => {
      const levelMatch = m.finishLevel === unit.finishLevel;
      // Match on colourScheme if specified, or accept null colourScheme as wildcard
      const schemeMatch = !unit.colourScheme || m.colourScheme === unit.colourScheme || m.colourScheme === null;
      return levelMatch && schemeMatch;
    });

    if (!hasMapping) {
      results.push({
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        status: 'failed',
        error: `No finish mapping for type ${unit.unitTypeCode} + ${unit.finishLevel}${unit.colourScheme ? ` (${unit.colourScheme})` : ''}`,
      });
      continue;
    }

    // e. Already has a quote AND overwriteExisting=false?
    if (unit.quoteId && !overwriteExisting) {
      results.push({
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        status: 'skipped',
        quoteId: unit.quoteId,
      });
      continue;
    }

    // Ready for generation
    results.push({
      unitId: unit.id,
      unitNumber: unit.unitNumber,
      status: 'created', // will be created (or this is the dry-run preview)
    });
  }

  // 4. If dryRun, return the pre-flight results without creating quotes
  if (dryRun) {
    return buildResult(results, 0, '', 0, 0, 0, 0, 0);
  }

  // 5. For each ready unit (sequentially), generate quotes
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status !== 'created') continue;

    const unit = units.find(u => u.id === result.unitId)!;
    const template = templateMap.get(unit.unitTypeCode!)!;

    try {
      // If overwriting, delete old quote first
      if (unit.quoteId && overwriteExisting) {
        // Unlink unit from old quote
        await prisma.unit_block_units.update({
          where: { id: unit.id },
          data: { quoteId: null },
        });
        // Delete old quote (cascade deletes rooms/pieces)
        await prisma.quotes.delete({
          where: { id: unit.quoteId },
        });
      }

      // Clone template to quote by finish
      const cloneResult = await cloneTemplateToQuoteByFinish({
        templateId: template.id,
        customerId,
        unitNumber: unit.unitNumber,
        projectName: project.name,
        finishLevel: unit.finishLevel!,
        colourScheme: unit.colourScheme ?? undefined,
      });

      // Link the created quote to the unit
      await prisma.unit_block_units.update({
        where: { id: unit.id },
        data: {
          quoteId: cloneResult.quoteId,
          templateId: template.id,
          status: 'QUOTED',
        },
      });

      results[i] = {
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        status: 'created',
        quoteId: cloneResult.quoteId,
        totalExGst: cloneResult.totalExGst,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      results[i] = {
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        status: 'failed',
        error: errorMessage,
      };
    }
  }

  // 6. Calculate project-level volume pricing
  // Re-load project with updated quotes
  const updatedProject = await prisma.unit_block_projects.findUnique({
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

  let totalAreaSqm = new Decimal(0);
  let subtotalExGst = new Decimal(0);

  if (updatedProject) {
    for (const unit of updatedProject.units) {
      if (unit.quote) {
        for (const room of unit.quote.quote_rooms) {
          for (const piece of room.quote_pieces) {
            totalAreaSqm = totalAreaSqm.plus(piece.area_sqm);
          }
        }
        subtotalExGst = subtotalExGst.plus(unit.quote.subtotal);
      }
    }
  }

  const totalAreaNum = totalAreaSqm.toNumber();
  const tier = determineVolumeTier(totalAreaNum);
  const discountPercent = new Decimal(tier.discountPercent);
  const discountAmount = subtotalExGst.times(discountPercent).dividedBy(100);
  const afterDiscount = subtotalExGst.minus(discountAmount);
  const gstRate = new Decimal('0.10');
  const gstAmount = afterDiscount.times(gstRate);
  const grandTotal = afterDiscount.plus(gstAmount);

  // Update project with calculated values
  await prisma.unit_block_projects.update({
    where: { id: projectId },
    data: {
      status: 'QUOTED',
      totalArea_sqm: new Decimal(totalAreaSqm.toFixed(4)),
      volumeTier: tier.tierId,
      volumeDiscount: new Decimal(discountPercent.toFixed(2)),
      subtotalExGst: new Decimal(subtotalExGst.toFixed(2)),
      discountAmount: new Decimal(discountAmount.toFixed(2)),
      gstAmount: new Decimal(gstAmount.toFixed(2)),
      grandTotal: new Decimal(grandTotal.toFixed(2)),
    },
  });

  return buildResult(
    results,
    totalAreaNum,
    tier.tierId,
    tier.discountPercent,
    parseFloat(subtotalExGst.toFixed(2)),
    parseFloat(discountAmount.toFixed(2)),
    parseFloat(gstAmount.toFixed(2)),
    parseFloat(grandTotal.toFixed(2))
  );
}

// ============================================================================
// Helpers
// ============================================================================

function buildResult(
  results: UnitGenerationResult[],
  totalArea_sqm: number,
  volumeTier: string,
  volumeDiscount: number,
  subtotalExGst: number,
  discountAmount: number,
  gstAmount: number,
  grandTotal: number
): BulkGenerationResult {
  const quotesCreated = results.filter(r => r.status === 'created').length;
  const quotesSkipped = results.filter(r => r.status === 'skipped').length;
  const quotesFailed = results.filter(r => r.status === 'failed').length;
  const errors = results
    .filter(r => r.status === 'failed' && r.error)
    .map(r => ({ unitNumber: r.unitNumber, error: r.error! }));

  return {
    totalUnits: results.length,
    quotesCreated,
    quotesSkipped,
    quotesFailed,
    results,
    errors,
    totalArea_sqm,
    volumeTier,
    volumeDiscount,
    subtotalExGst,
    discountAmount,
    gstAmount,
    grandTotal,
  };
}
