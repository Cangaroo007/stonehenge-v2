import { PrismaClient, FabricationCategory } from '@prisma/client';

const CATEGORY_MULTIPLIERS: Record<FabricationCategory, number> = {
  ENGINEERED: 1.0,
  NATURAL_SOFT: 1.1,
  NATURAL_HARD: 1.15,
  SINTERED: 1.4,
  NATURAL_PREMIUM: 1.5,
};

const categories = Object.keys(CATEGORY_MULTIPLIERS) as FabricationCategory[];

/**
 * Seeds cutout_category_rates: one row per cutout type × fabrication category.
 * Rate = cutout type's baseRate × category multiplier.
 */
async function seedCutoutCategoryRates(prisma: PrismaClient, pricingSettingsId: string) {
  console.log('Seeding cutout_category_rates...');

  const cutoutTypes = await prisma.cutout_types.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });

  if (cutoutTypes.length === 0) {
    console.warn('  ⚠ No cutout_types found — skipping cutout category rates');
    return 0;
  }

  let count = 0;

  for (const cutoutType of cutoutTypes) {
    const baseRate = Number(cutoutType.baseRate);

    for (const category of categories) {
      const multiplier = CATEGORY_MULTIPLIERS[category];
      const rate = Math.round(baseRate * multiplier * 100) / 100;

      await prisma.cutout_category_rates.upsert({
        where: {
          cutoutTypeId_fabricationCategory_pricingSettingsId: {
            cutoutTypeId: cutoutType.id,
            fabricationCategory: category,
            pricingSettingsId,
          },
        },
        update: { rate },
        create: {
          cutoutTypeId: cutoutType.id,
          fabricationCategory: category,
          rate,
          pricingSettingsId,
        },
      });
      count++;
    }
  }

  console.log(`✅ Cutout category rates: ${count} rows`);
  return count;
}

/**
 * Seeds edge_type_category_rates: one row per edge type × fabrication category.
 * Rates = edge type's rate20mm/rate40mm × category multiplier.
 * Pencil Round stays $0 across all categories (standard included finish).
 */
async function seedEdgeCategoryRates(prisma: PrismaClient, pricingSettingsId: string) {
  console.log('Seeding edge_type_category_rates...');

  const edgeTypes = await prisma.edge_types.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });

  if (edgeTypes.length === 0) {
    console.warn('  ⚠ No edge_types found — skipping edge category rates');
    return 0;
  }

  let count = 0;

  for (const edgeType of edgeTypes) {
    const isPencilRound = edgeType.name.toLowerCase().includes('pencil');
    const baseRate20mm = Number(edgeType.rate20mm ?? edgeType.baseRate);
    const baseRate40mm = Number(edgeType.rate40mm ?? edgeType.baseRate);

    for (const category of categories) {
      const multiplier = CATEGORY_MULTIPLIERS[category];

      const rate20mm = isPencilRound ? 0 : Math.round(baseRate20mm * multiplier * 100) / 100;
      const rate40mm = isPencilRound ? 0 : Math.round(baseRate40mm * multiplier * 100) / 100;

      await prisma.edge_type_category_rates.upsert({
        where: {
          edgeTypeId_fabricationCategory_pricingSettingsId: {
            edgeTypeId: edgeType.id,
            fabricationCategory: category,
            pricingSettingsId,
          },
        },
        update: { rate20mm, rate40mm },
        create: {
          edgeTypeId: edgeType.id,
          fabricationCategory: category,
          rate20mm,
          rate40mm,
          pricingSettingsId,
        },
      });
      count++;
    }
  }

  console.log(`✅ Edge type category rates: ${count} rows`);
  return count;
}

/**
 * Seeds material_edge_compatibility:
 *  - SINTERED + Ogee  → BLOCKED (isAllowed=false)
 *  - SINTERED + Bullnose → WARNING (isAllowed=true, warningMessage set)
 */
async function seedEdgeCompatibility(prisma: PrismaClient, pricingSettingsId: string) {
  console.log('Seeding material_edge_compatibility...');

  const ogee = await prisma.edge_types.findFirst({
    where: { name: { contains: 'Ogee', mode: 'insensitive' } },
  });

  const bullnose = await prisma.edge_types.findFirst({
    where: { name: { contains: 'Bullnose', mode: 'insensitive' } },
  });

  let count = 0;

  if (ogee) {
    await prisma.material_edge_compatibility.upsert({
      where: {
        fabricationCategory_edgeTypeId_pricingSettingsId: {
          fabricationCategory: FabricationCategory.SINTERED,
          edgeTypeId: ogee.id,
          pricingSettingsId,
        },
      },
      update: {
        isAllowed: false,
        warningMessage: 'Ogee not available for sintered materials — high chip risk',
      },
      create: {
        fabricationCategory: FabricationCategory.SINTERED,
        edgeTypeId: ogee.id,
        isAllowed: false,
        warningMessage: 'Ogee not available for sintered materials — high chip risk',
        pricingSettingsId,
      },
    });
    count++;
    console.log(`  SINTERED + Ogee: BLOCKED`);
  } else {
    console.warn('  ⚠ Ogee edge type not found — skipping');
  }

  if (bullnose) {
    await prisma.material_edge_compatibility.upsert({
      where: {
        fabricationCategory_edgeTypeId_pricingSettingsId: {
          fabricationCategory: FabricationCategory.SINTERED,
          edgeTypeId: bullnose.id,
          pricingSettingsId,
        },
      },
      update: {
        isAllowed: true,
        warningMessage: 'Bullnose on sintered materials carries higher chip risk. Proceed with caution.',
      },
      create: {
        fabricationCategory: FabricationCategory.SINTERED,
        edgeTypeId: bullnose.id,
        isAllowed: true,
        warningMessage: 'Bullnose on sintered materials carries higher chip risk. Proceed with caution.',
        pricingSettingsId,
      },
    });
    count++;
    console.log(`  SINTERED + Bullnose: WARNING`);
  } else {
    console.warn('  ⚠ Bullnose edge type not found — skipping');
  }

  console.log(`✅ Material edge compatibility: ${count} rows`);
  return count;
}

/**
 * Main entry point — seeds all three category-aware pricing tables.
 * Accepts an optional PrismaClient for use when called from seed.ts.
 */
export async function seedCategoryRates(prismaArg?: PrismaClient) {
  const prisma = prismaArg ?? new PrismaClient();

  try {
    console.log('\n🌱 Seeding category-aware pricing tables...\n');

    const pricingSettings = await prisma.pricing_settings.findFirst();

    if (!pricingSettings) {
      console.warn('⚠ No pricing_settings found. Run seed-pricing-settings.ts first.');
      console.warn('  Skipping category rate seeding.');
      return;
    }

    const psId = pricingSettings.id;
    console.log(`Using pricing settings: ${psId}\n`);

    await seedCutoutCategoryRates(prisma, psId);
    await seedEdgeCategoryRates(prisma, psId);
    await seedEdgeCompatibility(prisma, psId);

    console.log('\n🎉 Category rate seeding complete!');
  } finally {
    if (!prismaArg) {
      await prisma.$disconnect();
    }
  }
}

// Standalone execution
if (require.main === module) {
  seedCategoryRates().catch((e) => {
    console.error('❌ Category rate seeding failed:', e);
    process.exit(1);
  });
}
