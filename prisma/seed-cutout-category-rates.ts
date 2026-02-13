import { PrismaClient, FabricationCategory } from '@prisma/client';
const prisma = new PrismaClient();

const CATEGORY_MULTIPLIERS: Record<FabricationCategory, number> = {
  ENGINEERED: 1.0,
  NATURAL_SOFT: 1.1,
  NATURAL_HARD: 1.15,
  SINTERED: 1.4,
  NATURAL_PREMIUM: 1.5,
};

async function seedCutoutCategoryRates() {
  console.log('Seeding cutout_category_rates...');

  // 1. Load all cutout types
  const cutoutTypes = await prisma.cutout_types.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });

  if (cutoutTypes.length === 0) {
    throw new Error('No cutout_types found. Run seed-cutout-types.ts first.');
  }

  console.log(`  Found ${cutoutTypes.length} cutout types`);

  // 2. Load pricing settings (single-tenant: ps-org-1)
  const pricingSettings = await prisma.pricing_settings.findFirst();

  if (!pricingSettings) {
    throw new Error('No pricing_settings found. Run seed-pricing-settings.ts first.');
  }

  console.log(`  Using pricing settings: ${pricingSettings.id}`);

  // 3. For each cutout type x each fabrication category, upsert a row
  const categories = Object.keys(CATEGORY_MULTIPLIERS) as FabricationCategory[];
  let upsertCount = 0;

  for (const cutoutType of cutoutTypes) {
    const baseRate = Number(cutoutType.baseRate);

    for (const category of categories) {
      const multiplier = CATEGORY_MULTIPLIERS[category];
      const rate = Math.round(baseRate * multiplier * 100) / 100; // round to 2 decimals

      await prisma.cutout_category_rates.upsert({
        where: {
          cutoutTypeId_fabricationCategory_pricingSettingsId: {
            cutoutTypeId: cutoutType.id,
            fabricationCategory: category,
            pricingSettingsId: pricingSettings.id,
          },
        },
        update: { rate },
        create: {
          cutoutTypeId: cutoutType.id,
          fabricationCategory: category,
          rate,
          pricingSettingsId: pricingSettings.id,
        },
      });

      upsertCount++;
      console.log(
        `  ${cutoutType.name} / ${category}: $${baseRate} x ${multiplier} = $${rate}`
      );
    }
  }

  console.log(`\nSeeded ${upsertCount} cutout_category_rates rows successfully`);
}

seedCutoutCategoryRates()
  .catch((e) => {
    console.error('Error seeding cutout category rates:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
