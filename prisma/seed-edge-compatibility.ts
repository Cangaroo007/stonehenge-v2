import { PrismaClient, FabricationCategory } from '@prisma/client';
const prisma = new PrismaClient();

async function seedEdgeCompatibility() {
  console.log('Seeding material_edge_compatibility...');

  // 1. Load pricing settings (single-tenant)
  const pricingSettings = await prisma.pricing_settings.findFirst();

  if (!pricingSettings) {
    throw new Error('No pricing_settings found. Run seed-pricing-settings.ts first.');
  }

  console.log(`  Using pricing settings: ${pricingSettings.id}`);

  // 2. Look up edge types by name
  const ogee = await prisma.edge_types.findFirst({
    where: { name: { contains: 'Ogee', mode: 'insensitive' } },
  });

  const bullnose = await prisma.edge_types.findFirst({
    where: { name: { contains: 'Bullnose', mode: 'insensitive' } },
  });

  let upsertCount = 0;

  // 3. Ogee on SINTERED — blocked
  if (ogee) {
    await prisma.material_edge_compatibility.upsert({
      where: {
        fabricationCategory_edgeTypeId_pricingSettingsId: {
          fabricationCategory: FabricationCategory.SINTERED,
          edgeTypeId: ogee.id,
          pricingSettingsId: pricingSettings.id,
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
        pricingSettingsId: pricingSettings.id,
      },
    });
    upsertCount++;
    console.log(`  SINTERED + Ogee (${ogee.id}): BLOCKED`);
  } else {
    console.warn('  ⚠ Ogee edge type not found — skipping');
  }

  // 4. Bullnose on SINTERED — allowed with warning
  if (bullnose) {
    await prisma.material_edge_compatibility.upsert({
      where: {
        fabricationCategory_edgeTypeId_pricingSettingsId: {
          fabricationCategory: FabricationCategory.SINTERED,
          edgeTypeId: bullnose.id,
          pricingSettingsId: pricingSettings.id,
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
        pricingSettingsId: pricingSettings.id,
      },
    });
    upsertCount++;
    console.log(`  SINTERED + Bullnose (${bullnose.id}): WARNING`);
  } else {
    console.warn('  ⚠ Bullnose edge type not found — skipping');
  }

  console.log(`\nSeeded ${upsertCount} material_edge_compatibility rows successfully`);
}

seedEdgeCompatibility()
  .catch((e) => {
    console.error('Error seeding edge compatibility:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
