import { PrismaClient, CutoutCategory } from '@prisma/client';
const prisma = new PrismaClient();

async function seedCutoutTypes() {
  console.log('🌱 Seeding CutoutTypes with categories...');

  const cutoutTypes = [
    // STANDARD - $65 each
    {
      name: 'Hotplate Cutout',
      code: 'HP',
      description: 'Standard hotplate cutout',
      category: CutoutCategory.STANDARD,
      baseRate: 65.00,
      minimumCharge: null,
      sortOrder: 1,
      isActive: true
    },
    {
      name: 'GPO (Power Outlet)',
      code: 'GPO',
      description: 'General power outlet cutout',
      category: CutoutCategory.STANDARD,
      baseRate: 65.00,
      minimumCharge: null,
      sortOrder: 2,
      isActive: true
    },
    {
      name: 'Tap Hole',
      code: 'TAP',
      description: 'Tap hole cutout',
      category: CutoutCategory.STANDARD,
      baseRate: 65.00,
      minimumCharge: null,
      sortOrder: 3,
      isActive: true
    },
    {
      name: 'Drop-in Sink',
      code: 'DIS',
      description: 'Drop-in sink cutout',
      category: CutoutCategory.STANDARD,
      baseRate: 65.00,
      minimumCharge: null,
      sortOrder: 4,
      isActive: true
    },
    
    // UNDERMOUNT_SINK - $300 each
    {
      name: 'Undermount Sink',
      code: 'UMS',
      description: 'Undermount sink cutout',
      category: CutoutCategory.UNDERMOUNT_SINK,
      baseRate: 300.00,
      minimumCharge: null,
      sortOrder: 5,
      isActive: true
    },
    
    // FLUSH_COOKTOP - $450 each
    {
      name: 'Flush Mount Cooktop',
      code: 'FMC',
      description: 'Flush mount cooktop cutout',
      category: CutoutCategory.FLUSH_COOKTOP,
      baseRate: 450.00,
      minimumCharge: null,
      sortOrder: 6,
      isActive: true
    },
    
    // DRAINER_GROOVE - $150 each
    {
      name: 'Drainer Groove',
      code: 'DRG',
      description: 'Drainer groove',
      category: CutoutCategory.DRAINER_GROOVE,
      baseRate: 150.00,
      minimumCharge: null,
      sortOrder: 7,
      isActive: true
    }
  ] as const;

  for (const cutoutType of cutoutTypes) {
    // Use name for lookup since it's guaranteed to exist
    const existing = await prisma.cutoutType.findUnique({
      where: { name: cutoutType.name }
    });

    if (existing) {
      // Update existing cutout type
      await prisma.cutoutType.update({
        where: { name: cutoutType.name },
        data: {
          code: cutoutType.code,
          description: cutoutType.description,
          category: cutoutType.category,
          baseRate: cutoutType.baseRate,
          minimumCharge: cutoutType.minimumCharge,
          sortOrder: cutoutType.sortOrder,
          isActive: cutoutType.isActive
        }
      });
      console.log(`  ✅ Updated: ${cutoutType.name} (${cutoutType.code}) - $${cutoutType.baseRate}`);
    } else {
      // Create new cutout type
      await prisma.cutoutType.create({
        data: cutoutType
      });
      console.log(`  ✅ Created: ${cutoutType.name} (${cutoutType.code}) - $${cutoutType.baseRate}`);
    }
  }

  console.log('✅ CutoutTypes seeded successfully\n');
}

seedCutoutTypes()
  .catch((e) => {
    console.error('❌ Error seeding cutout types:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
