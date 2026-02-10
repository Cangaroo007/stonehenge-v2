import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding machine profiles...');

  const machines = [
    {
      id: 'machine-gmm-bridge-saw',
      name: 'GMM Bridge Saw',
      kerf_width_mm: 8,
      max_slab_length_mm: 3200,
      max_slab_width_mm: 1600,
      is_default: true,
      is_active: true,
      updated_at: new Date(),
    },
    {
      id: 'machine-breton-cnc',
      name: 'Breton CNC',
      kerf_width_mm: 5,
      max_slab_length_mm: 3200,
      max_slab_width_mm: 1600,
      is_default: false,
      is_active: true,
      updated_at: new Date(),
    },
  ];

  for (const machine of machines) {
    await prisma.machine_profiles.upsert({
      where: { name: machine.name },
      update: {
        kerf_width_mm: machine.kerf_width_mm,
        max_slab_length_mm: machine.max_slab_length_mm,
        max_slab_width_mm: machine.max_slab_width_mm,
        is_default: machine.is_default,
        is_active: machine.is_active,
        updated_at: new Date(),
      },
      create: machine,
    });
    console.log(`  ✅ ${machine.name}: kerf=${machine.kerf_width_mm}mm, default=${machine.is_default}`);
  }

  console.log('🎉 Machine profiles seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
