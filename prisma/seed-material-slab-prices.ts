import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding materials with slab pricing and dimensions...');

  // Standard slab dimensions: 3200mm x 1600mm = 5.12 sqm
  // Slab price = price_per_sqm × slab area (5.12 sqm)
  const SLAB_LENGTH_MM = 3200;
  const SLAB_WIDTH_MM = 1600;
  const SLAB_AREA_SQM = (SLAB_LENGTH_MM * SLAB_WIDTH_MM) / 1_000_000; // 5.12

  const materials = [
    { name: 'Alpha Zero', collection: 'Classic Collection', pricePerSqm: 450 },
    { name: 'Calacatta Nuvo', collection: 'Premium Collection', pricePerSqm: 650 },
    { name: 'Statuario Maximus', collection: 'Premium Collection', pricePerSqm: 720 },
    { name: 'Pure White', collection: 'Classic Collection', pricePerSqm: 380 },
    { name: 'Jet Black', collection: 'Classic Collection', pricePerSqm: 420 },
    { name: 'Empira White', collection: 'Designer Collection', pricePerSqm: 550 },
    { name: 'Empira Black', collection: 'Designer Collection', pricePerSqm: 550 },
    { name: 'Turbine Grey', collection: 'Industrial Collection', pricePerSqm: 480 },
    { name: 'Concrete', collection: 'Industrial Collection', pricePerSqm: 420 },
    { name: 'Cloudburst Concrete', collection: 'Industrial Collection', pricePerSqm: 460 },
  ];

  for (const mat of materials) {
    const slabPrice = Math.round(mat.pricePerSqm * SLAB_AREA_SQM);

    // Check if material already exists
    const existing = await prisma.materials.findFirst({
      where: { name: mat.name },
    });

    if (existing) {
      await prisma.materials.update({
        where: { id: existing.id },
        data: {
          price_per_sqm: mat.pricePerSqm,
          price_per_slab: slabPrice,
          price_per_square_metre: mat.pricePerSqm,
          slab_length_mm: SLAB_LENGTH_MM,
          slab_width_mm: SLAB_WIDTH_MM,
          updated_at: new Date(),
        },
      });
      console.log(`  ✅ Updated: ${mat.name}: $${mat.pricePerSqm}/sqm → $${slabPrice}/slab`);
    } else {
      await prisma.materials.create({
        data: {
          name: mat.name,
          collection: mat.collection,
          price_per_sqm: mat.pricePerSqm,
          price_per_slab: slabPrice,
          price_per_square_metre: mat.pricePerSqm,
          slab_length_mm: SLAB_LENGTH_MM,
          slab_width_mm: SLAB_WIDTH_MM,
          updated_at: new Date(),
        },
      });
      console.log(`  ✅ Created: ${mat.name}: $${mat.pricePerSqm}/sqm → $${slabPrice}/slab`);
    }
  }

  console.log('🎉 Material slab pricing seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
