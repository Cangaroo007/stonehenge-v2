import { PrismaClient, FabricationCategory } from '@prisma/client';

/**
 * Northcoast Stone category-aware rates (AUD, ex GST).
 *
 * These are explicit dollar amounts — NOT multiplied from base rates.
 * Jay can adjust via Pricing Admin after initial seed.
 */

const CATEGORIES: FabricationCategory[] = [
  'ENGINEERED',
  'NATURAL_SOFT',
  'NATURAL_HARD',
  'NATURAL_PREMIUM',
  'SINTERED',
];

// ── Cutout Category Rates ─────────────────────────────────────────────
// Key: search pattern (case-insensitive) matched against cutout_types.name
// Values: rate per fabrication category (AUD, ex GST)
const CUTOUT_RATES: Record<string, Record<FabricationCategory, number>> = {
  Hotplate: {
    ENGINEERED: 65,
    NATURAL_SOFT: 65,
    NATURAL_HARD: 85,
    NATURAL_PREMIUM: 95,
    SINTERED: 120,
  },
  GPO: {
    ENGINEERED: 25,
    NATURAL_SOFT: 25,
    NATURAL_HARD: 35,
    NATURAL_PREMIUM: 40,
    SINTERED: 50,
  },
  'Tap Hole': {
    ENGINEERED: 25,
    NATURAL_SOFT: 25,
    NATURAL_HARD: 35,
    NATURAL_PREMIUM: 40,
    SINTERED: 50,
  },
  'Drop-in Sink': {
    ENGINEERED: 65,
    NATURAL_SOFT: 65,
    NATURAL_HARD: 85,
    NATURAL_PREMIUM: 95,
    SINTERED: 120,
  },
  Undermount: {
    ENGINEERED: 300,
    NATURAL_SOFT: 300,
    NATURAL_HARD: 400,
    NATURAL_PREMIUM: 450,
    SINTERED: 550,
  },
  Flush: {
    ENGINEERED: 450,
    NATURAL_SOFT: 450,
    NATURAL_HARD: 550,
    NATURAL_PREMIUM: 600,
    SINTERED: 700,
  },
  Basin: {
    ENGINEERED: 90,
    NATURAL_SOFT: 90,
    NATURAL_HARD: 120,
    NATURAL_PREMIUM: 140,
    SINTERED: 170,
  },
  Drainer: {
    ENGINEERED: 150,
    NATURAL_SOFT: 150,
    NATURAL_HARD: 200,
    NATURAL_PREMIUM: 225,
    SINTERED: 275,
  },
};

// ── Edge Type Category Rates ──────────────────────────────────────────
// Key: search pattern (case-insensitive) matched against edge_types.name
// Values: surcharge rate per Lm per category (AUD, ex GST)
// Arris = $0 (included in cutting). Used for both rate20mm and rate40mm.
const EDGE_RATES: Record<string, Record<FabricationCategory, number>> = {
  Arris: {
    ENGINEERED: 0,
    NATURAL_SOFT: 0,
    NATURAL_HARD: 0,
    NATURAL_PREMIUM: 0,
    SINTERED: 0,
  },
  Pencil: {
    ENGINEERED: 15,
    NATURAL_SOFT: 15,
    NATURAL_HARD: 20,
    NATURAL_PREMIUM: 25,
    SINTERED: 30,
  },
  Bullnose: {
    ENGINEERED: 25,
    NATURAL_SOFT: 25,
    NATURAL_HARD: 35,
    NATURAL_PREMIUM: 40,
    SINTERED: 50,
  },
  Bevel: {
    ENGINEERED: 20,
    NATURAL_SOFT: 20,
    NATURAL_HARD: 30,
    NATURAL_PREMIUM: 35,
    SINTERED: 45,
  },
  Ogee: {
    ENGINEERED: 35,
    NATURAL_SOFT: 35,
    NATURAL_HARD: 45,
    NATURAL_PREMIUM: 50,
    SINTERED: 60,
  },
  Mitr: {
    ENGINEERED: 30,
    NATURAL_SOFT: 30,
    NATURAL_HARD: 40,
    NATURAL_PREMIUM: 45,
    SINTERED: 55,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────

function findByName<T extends { name: string }>(
  items: T[],
  pattern: string,
): T | undefined {
  const lower = pattern.toLowerCase();
  return items.find((item) => item.name.toLowerCase().includes(lower));
}

// ── Seed functions ────────────────────────────────────────────────────

async function seedCutoutCategoryRates(
  prisma: PrismaClient,
  pricingSettingsId: string,
) {
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

  for (const [searchKey, categoryRates] of Object.entries(CUTOUT_RATES)) {
    const cutoutType = findByName(cutoutTypes, searchKey);

    if (!cutoutType) {
      console.warn(`  ⚠ Cutout type matching "${searchKey}" not found — skipping`);
      continue;
    }

    for (const category of CATEGORIES) {
      const rate = categoryRates[category];

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
      console.log(`  ${cutoutType.name} / ${category}: $${rate}`);
    }
  }

  console.log(`✅ Cutout category rates: ${count} rows`);
  return count;
}

async function seedEdgeCategoryRates(
  prisma: PrismaClient,
  pricingSettingsId: string,
) {
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

  for (const [searchKey, categoryRates] of Object.entries(EDGE_RATES)) {
    const edgeType = findByName(edgeTypes, searchKey);

    if (!edgeType) {
      console.warn(`  ⚠ Edge type matching "${searchKey}" not found — skipping`);
      continue;
    }

    for (const category of CATEGORIES) {
      const rate = categoryRates[category];

      await prisma.edge_type_category_rates.upsert({
        where: {
          edgeTypeId_fabricationCategory_pricingSettingsId: {
            edgeTypeId: edgeType.id,
            fabricationCategory: category,
            pricingSettingsId,
          },
        },
        update: { rate20mm: rate, rate40mm: rate },
        create: {
          edgeTypeId: edgeType.id,
          fabricationCategory: category,
          rate20mm: rate,
          rate40mm: rate,
          pricingSettingsId,
        },
      });

      count++;
      console.log(`  ${edgeType.name} / ${category}: $${rate}/Lm`);
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
async function seedEdgeCompatibility(
  prisma: PrismaClient,
  pricingSettingsId: string,
) {
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
        warningMessage:
          'Ogee not available for sintered materials — high chip risk',
      },
      create: {
        fabricationCategory: FabricationCategory.SINTERED,
        edgeTypeId: ogee.id,
        isAllowed: false,
        warningMessage:
          'Ogee not available for sintered materials — high chip risk',
        pricingSettingsId,
      },
    });
    count++;
    console.log('  SINTERED + Ogee: BLOCKED');
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
        warningMessage:
          'Bullnose on sintered materials carries higher chip risk. Proceed with caution.',
      },
      create: {
        fabricationCategory: FabricationCategory.SINTERED,
        edgeTypeId: bullnose.id,
        isAllowed: true,
        warningMessage:
          'Bullnose on sintered materials carries higher chip risk. Proceed with caution.',
        pricingSettingsId,
      },
    });
    count++;
    console.log('  SINTERED + Bullnose: WARNING');
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
    console.log('\n🌱 Seeding category-aware pricing tables (Northcoast Stone rates)...\n');

    const pricingSettings = await prisma.pricing_settings.findFirst();

    if (!pricingSettings) {
      console.warn(
        '⚠ No pricing_settings found. Run seed-pricing-settings.ts first.',
      );
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
