import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Machine-to-Operation Default Assignments
 * From Machine Logic doc — Section 1.1
 *
 * Each fabrication operation maps to a default machine type.
 * kerf_width_mm is Int in schema, so 3.5mm rounds to 4mm (conservative).
 */
const DEFAULTS = [
  { operationType: 'INITIAL_CUT' as const,    machineName: 'CNC Bridge Saw',    kerfMm: 4 },
  { operationType: 'EDGE_POLISHING' as const,  machineName: 'Edge Polisher',     kerfMm: 0 },
  { operationType: 'MITRING' as const,         machineName: '5-Axis Saw',        kerfMm: 4 },
  { operationType: 'LAMINATION' as const,      machineName: 'Manual/Hand Tools', kerfMm: 0 },
  { operationType: 'CUTOUT' as const,          machineName: 'Waterjet / CNC',    kerfMm: 1 },
];

async function main() {
  console.log('🌱 Seeding machine-operation defaults...');

  for (const def of DEFAULTS) {
    // Find existing machine by name, or create it
    let machine = await prisma.machine_profiles.findFirst({
      where: { name: def.machineName },
    });

    if (!machine) {
      machine = await prisma.machine_profiles.create({
        data: {
          id: `machine-${def.machineName.toLowerCase().replace(/[\s/]+/g, '-')}`,
          name: def.machineName,
          kerf_width_mm: def.kerfMm,
          is_active: true,
          is_default: def.operationType === 'INITIAL_CUT',
          updated_at: new Date(),
        },
      });
      console.log(`  ✅ Created machine: ${def.machineName} (kerf: ${def.kerfMm}mm)`);
    } else {
      console.log(`  ℹ️  Found existing machine: ${def.machineName} (kerf: ${machine.kerf_width_mm}mm)`);
    }

    // Upsert the operation→machine default mapping
    await prisma.machine_operation_defaults.upsert({
      where: { operation_type: def.operationType },
      update: {
        machine_id: machine.id,
        updated_at: new Date(),
      },
      create: {
        operation_type: def.operationType,
        machine_id: machine.id,
        is_default: true,
        updated_at: new Date(),
      },
    });
    console.log(`  🔗 ${def.operationType} → ${machine.name} (kerf: ${machine.kerf_width_mm}mm)`);
  }

  console.log('\n🎉 Machine-operation defaults seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
