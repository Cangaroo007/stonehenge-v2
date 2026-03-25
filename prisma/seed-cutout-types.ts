import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function seedCutoutTypes() {
  console.log('🌱 Seeding Cutout Types...');

  // Canonical cutout type list - single source of truth
  // Names are consistent, clear, and prevent duplicates
  const cutoutTypes = [
    { name: 'Cooktop Cutout', description: 'Cutout for cooktop or hotplate', baseRate: 150.00, sortOrder: 1 },
    { name: 'Flush Mount Cooktop', description: 'Flush mount cooktop cutout', baseRate: 450.00, sortOrder: 2 },
    { name: 'Undermount Sink', description: 'Cutout for undermount sink', baseRate: 180.00, sortOrder: 3 },
    { name: 'Drop-in Sink', description: 'Cutout for drop-in sink', baseRate: 120.00, sortOrder: 4 },
    { name: 'Drop-in Basin', description: 'Drop-in basin cutout', baseRate: 95.00, sortOrder: 5 },
    { name: 'Basin', description: 'Basin cutout', baseRate: 95.00, sortOrder: 6 },
    { name: 'Tap Hole', description: 'Single tap hole', baseRate: 35.00, sortOrder: 7 },
    { name: 'GPO / Powerpoint', description: 'Cutout for electrical outlet', baseRate: 45.00, sortOrder: 8 },
    { name: 'Drainer Grooves', description: 'Drainer grooves', baseRate: 150.00, sortOrder: 9 }
  ];

  for (const cutoutType of cutoutTypes) {
    // Use upsert to prevent duplicates: if name exists, update; otherwise create
    const result = await prisma.cutout_types.upsert({
      where: { name: cutoutType.name },
      update: {
        description: cutoutType.description,
        baseRate: cutoutType.baseRate,
        sortOrder: cutoutType.sortOrder,
        isActive: true,
        updatedAt: new Date()
      },
      create: {
        id: crypto.randomUUID(),
        name: cutoutType.name,
        description: cutoutType.description,
        baseRate: cutoutType.baseRate,
        sortOrder: cutoutType.sortOrder,
        isActive: true,
        updatedAt: new Date()
      }
    });
    console.log(`  ✅ Upserted: ${cutoutType.name} - $${cutoutType.baseRate}`);
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
