import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function seedCutoutTypes() {
  console.log('🌱 Seeding Cutout Types...');

  const cutoutTypes = [
    { name: 'Hotplate Cutout', description: 'Standard hotplate cutout', baseRate: 65.00, sortOrder: 1 },
    { name: 'GPO (Power Outlet)', description: 'General power outlet cutout', baseRate: 65.00, sortOrder: 2 },
    { name: 'Tap Hole', description: 'Tap hole cutout', baseRate: 65.00, sortOrder: 3 },
    { name: 'Drop-in Sink', description: 'Drop-in sink cutout', baseRate: 65.00, sortOrder: 4 },
    { name: 'Undermount Sink', description: 'Undermount sink cutout', baseRate: 300.00, sortOrder: 5 },
    { name: 'Flush Mount Cooktop', description: 'Flush mount cooktop cutout', baseRate: 450.00, sortOrder: 6 },
    { name: 'Drainer Groove', description: 'Drainer groove', baseRate: 150.00, sortOrder: 7 },
    { name: 'Basin', description: 'Basin cutout', baseRate: 65.00, sortOrder: 8 },
    { name: 'Other', description: 'Other cutout type', baseRate: 65.00, sortOrder: 9 }
  ];

  for (const cutoutType of cutoutTypes) {
    const existing = await prisma.cutout_types.findUnique({
      where: { name: cutoutType.name }
    });

    if (existing) {
      await prisma.cutout_types.update({
        where: { name: cutoutType.name },
        data: {
          description: cutoutType.description,
          baseRate: cutoutType.baseRate,
          sortOrder: cutoutType.sortOrder
        }
      });
      console.log(`  ✅ Updated: ${cutoutType.name} - $${cutoutType.baseRate}`);
    } else {
      await prisma.cutout_types.create({
        data: {
          id: `ct-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          ...cutoutType,
          updatedAt: new Date()
        }
      });
      console.log(`  ✅ Created: ${cutoutType.name} - $${cutoutType.baseRate}`);
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
