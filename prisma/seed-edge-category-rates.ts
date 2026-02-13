import { PrismaClient, FabricationCategory } from '@prisma/client';
const prisma = new PrismaClient();

const CATEGORY_MULTIPLIERS: Record<FabricationCategory, number> = {
  ENGINEERED: 1.0,
  NATURAL_SOFT: 1.1,
  NATURAL_HARD: 1.15,
  SINTERED: 1.4,
  NATURAL_PREMIUM: 1.5,
};

async function seedEdgeCategoryRates() {
  console.log('Seeding edge_type_category_rates...');

  // 1. Load all edge types
  const edgeTypes = await prisma.edge_types.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });

  if (edgeTypes.length === 0) {
    throw new Error('No edge_types found. Seed edge types first.');
  }

  console.log(`  Found ${edgeTypes.length} edge types`);

  // 2. Load pricing settings (single-tenant)
  const pricingSettings = await prisma.pricing_settings.findFirst();

  if (!pricingSettings) {
    throw new Error('No pricing_settings found. Run seed-pricing-settings.ts first.');
  }

  console.log(`  Using pricing settings: ${pricingSettings.id}`);

  // 3. For each edge type × each fabrication category, upsert a row
  const categories = Object.keys(CATEGORY_MULTIPLIERS) as FabricationCategory[];
  let upsertCount = 0;

  for (const edgeType of edgeTypes) {
    const isPencilRound = edgeType.name.toLowerCase().includes('pencil');
    const baseRate20mm = Number(edgeType.rate20mm ?? edgeType.baseRate);
    const baseRate40mm = Number(edgeType.rate40mm ?? edgeType.baseRate);

    for (const category of categories) {
      const multiplier = CATEGORY_MULTIPLIERS[category];

      // Pencil Round remains $0 across ALL categories (standard included finish)
      const rate20mm = isPencilRound ? 0 : Math.round(baseRate20mm * multiplier * 100) / 100;
      const rate40mm = isPencilRound ? 0 : Math.round(baseRate40mm * multiplier * 100) / 100;

      await prisma.edge_type_category_rates.upsert({
        where: {
          edgeTypeId_fabricationCategory_pricingSettingsId: {
            edgeTypeId: edgeType.id,
            fabricationCategory: category,
            pricingSettingsId: pricingSettings.id,
          },
        },
        update: { rate20mm, rate40mm },
        create: {
          edgeTypeId: edgeType.id,
          fabricationCategory: category,
          rate20mm,
          rate40mm,
          pricingSettingsId: pricingSettings.id,
        },
      });

      upsertCount++;
      console.log(
        `  ${edgeType.name} / ${category}: 20mm=$${baseRate20mm} x ${multiplier} = $${rate20mm}, 40mm=$${baseRate40mm} x ${multiplier} = $${rate40mm}`
      );
    }
  }

  console.log(`\nSeeded ${upsertCount} edge_type_category_rates rows successfully`);
}

seedEdgeCategoryRates()
  .catch((e) => {
    console.error('Error seeding edge category rates:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
