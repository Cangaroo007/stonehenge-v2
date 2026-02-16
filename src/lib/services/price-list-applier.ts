import prisma from '@/lib/db';
import type { materials } from '@prisma/client';
import { ParsedMaterial, PriceListParseResult } from './price-list-parser';

export interface MaterialMatchResult {
  parsed: ParsedMaterial;
  existingMaterialId: number | null;
  matchType: 'exact_code' | 'name_match' | 'new';
  action: 'create' | 'update' | 'skip';
  priceChange: {
    oldCostPrice: number | null;
    newCostPrice: number;
    oldWholesalePrice: number | null;
    newWholesalePrice: number;
    percentChange: number | null;
  } | null;
}

export interface ApplyResult {
  created: number;
  updated: number;
  discontinued: number;
  skipped: number;
  details: MaterialMatchResult[];
}

/**
 * Match parsed materials against existing materials in the database.
 * Returns a preview — does NOT write to database.
 */
export async function previewPriceListUpdate(
  companyId: number,
  supplierId: string,
  parseResult: PriceListParseResult,
): Promise<MaterialMatchResult[]> {
  // Verify supplier belongs to company
  const supplier = await prisma.suppliers.findFirst({
    where: { id: supplierId, company_id: companyId },
  });

  if (!supplier) {
    throw new Error('Supplier not found or does not belong to this company');
  }

  // Load existing materials for this supplier
  const existingMaterials = await prisma.materials.findMany({
    where: { supplier_id: supplierId },
  });

  const results: MaterialMatchResult[] = [];

  for (const parsed of parseResult.materials) {
    // Try matching by product code first (most reliable)
    let existing: materials | null | undefined = parsed.productCode
      ? existingMaterials.find((m: materials) => m.product_code === parsed.productCode)
      : null;

    let matchType: MaterialMatchResult['matchType'] = 'new';

    if (existing) {
      matchType = 'exact_code';
    } else {
      // Try matching by name (normalise case and whitespace)
      const normName = parsed.name.toLowerCase().trim();
      existing = existingMaterials.find(
        (m: materials) => m.name.toLowerCase().trim() === normName
      );
      if (existing) matchType = 'name_match';
    }

    const oldCost = existing
      ? Number(existing.price_per_slab ?? 0)
      : null;
    const oldWholesale = existing
      ? Number(existing.wholesale_price ?? 0)
      : null;

    results.push({
      parsed,
      existingMaterialId: existing?.id ?? null,
      matchType,
      action: existing ? 'update' : 'create',
      priceChange: {
        oldCostPrice: oldCost,
        newCostPrice: parsed.costPrice,
        oldWholesalePrice: oldWholesale,
        newWholesalePrice: parsed.wholesalePrice,
        percentChange:
          oldCost && oldCost > 0
            ? ((parsed.costPrice - oldCost) / oldCost) * 100
            : null,
      },
    });
  }

  return results;
}

/**
 * Calculate price per square metre from slab price and dimensions.
 */
function calculatePricePerSqm(
  slabPrice: number,
  lengthMm: number,
  widthMm: number
): number {
  const areaSqm = (lengthMm * widthMm) / 1_000_000;
  if (areaSqm <= 0) return 0;
  return Math.round((slabPrice / areaSqm) * 100) / 100;
}

/**
 * Apply confirmed price list update to database.
 */
export async function applyPriceListUpdate(
  companyId: number,
  supplierId: string,
  priceListUploadId: string,
  matches: MaterialMatchResult[],
  fabricationCategory: 'ENGINEERED' | 'NATURAL_HARD' | 'NATURAL_SOFT' | 'NATURAL_PREMIUM' | 'SINTERED' = 'ENGINEERED',
): Promise<ApplyResult> {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const match of matches) {
    if (match.action === 'skip') {
      skipped++;
      continue;
    }

    if (match.action === 'create') {
      const pricePerSqm = calculatePricePerSqm(
        match.parsed.costPrice,
        match.parsed.slabLengthMm,
        match.parsed.slabWidthMm
      );

      await prisma.materials.create({
        data: {
          name: match.parsed.name,
          supplier_id: supplierId,
          product_code: match.parsed.productCode,
          supplier_range: match.parsed.range,
          surface_finish: match.parsed.surfaceFinish,
          wholesale_price: match.parsed.wholesalePrice,
          price_per_slab: match.parsed.costPrice,
          price_per_sqm: pricePerSqm,
          price_per_square_metre: pricePerSqm,
          slab_length_mm: match.parsed.slabLengthMm,
          slab_width_mm: match.parsed.slabWidthMm,
          is_discontinued: match.parsed.isDiscontinued,
          fabrication_category: fabricationCategory,
          is_active: !match.parsed.isDiscontinued,
          updated_at: new Date(),
        },
      });
      created++;
    }

    if (match.action === 'update' && match.existingMaterialId) {
      const pricePerSqm = calculatePricePerSqm(
        match.parsed.costPrice,
        match.parsed.slabLengthMm,
        match.parsed.slabWidthMm
      );

      await prisma.materials.update({
        where: { id: match.existingMaterialId },
        data: {
          wholesale_price: match.parsed.wholesalePrice,
          price_per_slab: match.parsed.costPrice,
          price_per_sqm: pricePerSqm,
          price_per_square_metre: pricePerSqm,
          supplier_range: match.parsed.range,
          surface_finish: match.parsed.surfaceFinish,
          slab_length_mm: match.parsed.slabLengthMm,
          slab_width_mm: match.parsed.slabWidthMm,
          is_discontinued: match.parsed.isDiscontinued,
          discontinued_at: match.parsed.isDiscontinued ? new Date() : null,
          is_active: !match.parsed.isDiscontinued,
          updated_at: new Date(),
        },
      });
      updated++;
    }
  }

  // Count materials NOT in the new list that might be discontinued
  const parsedCodes = matches
    .filter((m) => m.parsed.productCode)
    .map((m) => m.parsed.productCode!);

  const discontinued = parsedCodes.length > 0
    ? await prisma.materials.count({
        where: {
          supplier_id: supplierId,
          product_code: { notIn: parsedCodes },
          is_discontinued: false,
        },
      })
    : 0;

  // Update the PriceListUpload record
  await prisma.price_list_uploads.update({
    where: { id: priceListUploadId },
    data: {
      status: 'APPLIED',
      processed_at: new Date(),
      materials_created: created,
      materials_updated: updated,
      materials_discontinued: discontinued,
      materials_skipped: skipped,
    },
  });

  return { created, updated, discontinued, skipped, details: matches };
}
