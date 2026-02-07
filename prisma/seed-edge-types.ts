import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function seedEdgeTypes() {
  console.log('🌱 Seeding EdgeTypes with thickness variants...');

  // Note: These rates are ADDITIONAL to the base polishing rate
  // Base polishing: $45/Lm (20mm), $115/Lm (40mm)
  const edgeTypes = [
    {
      name: 'Pencil Round',
      code: 'PR',
      description: 'Standard pencil round edge - included in base polishing',
      category: 'polish',
      baseRate: 45.00,     // Legacy field
      rate20mm: 0.00,      // No additional charge for standard
      rate40mm: 0.00,      // No additional charge for standard
      minimumCharge: null,
      minimumLength: null,
      isCurved: false,
      sortOrder: 1,
      isActive: true
    },
    {
      name: 'Bullnose',
      code: 'BN',
      description: 'Full bullnose profile',
      category: 'polish',
      baseRate: 55.00,     // Legacy field
      rate20mm: 10.00,     // $10/Lm extra over base polishing
      rate40mm: 10.00,     // $10/Lm extra over base polishing
      minimumCharge: null,
      minimumLength: null,
      isCurved: false,
      sortOrder: 2,
      isActive: true
    },
    {
      name: 'Ogee',
      code: 'OG',
      description: 'Decorative ogee profile',
      category: 'polish',
      baseRate: 65.00,     // Legacy field
      rate20mm: 20.00,     // $20/Lm extra over base polishing
      rate40mm: 25.00,     // $25/Lm extra over base polishing
      minimumCharge: null,
      minimumLength: null,
      isCurved: false,
      sortOrder: 3,
      isActive: true
    },
    {
      name: 'Beveled',
      code: 'BV',
      description: 'Beveled edge profile',
      category: 'polish',
      baseRate: 50.00,     // Legacy field
      rate20mm: 5.00,      // $5/Lm extra over base polishing
      rate40mm: 5.00,      // $5/Lm extra over base polishing
      minimumCharge: null,
      minimumLength: null,
      isCurved: false,
      sortOrder: 4,
      isActive: true
    },
    {
      name: 'Curved Finished Edge',
      code: 'CF',
      description: 'Curved/radius edge - premium rate with 1m minimum',
      category: 'polish',
      baseRate: 300.00,    // Legacy field (total for 20mm)
      rate20mm: 255.00,    // $300 total - $45 base = $255 extra
      rate40mm: 535.00,    // $650 total - $115 base = $535 extra
      minimumCharge: 300.00,  // Minimum $300 charge for 20mm
      minimumLength: 1.0,  // 1 meter minimum
      isCurved: true,
      sortOrder: 5,
      isActive: true
    }
  ] as const;

  for (const edgeType of edgeTypes) {
    const existing = await prisma.edge_types.findUnique({
      where: { name: edgeType.name }
    });

    if (existing) {
      await prisma.edge_types.update({
        where: { name: edgeType.name },
        data: {
          code: edgeType.code,
          description: edgeType.description,
          category: edgeType.category,
          baseRate: edgeType.baseRate,
          rate20mm: edgeType.rate20mm,
          rate40mm: edgeType.rate40mm,
          minimumCharge: edgeType.minimumCharge,
          minimumLength: edgeType.minimumLength,
          isCurved: edgeType.isCurved,
          sortOrder: edgeType.sortOrder,
          isActive: edgeType.isActive
        }
      });
      console.log(`  ✅ Updated: ${edgeType.name} (${edgeType.code})`);
    } else {
      // Create new edge type
      await prisma.edge_types.create({
        data: edgeType
      });
      console.log(`  ✅ Created: ${edgeType.name} (${edgeType.code})`);
    }
  }

  console.log('✅ EdgeTypes seeded successfully\n');
}

seedEdgeTypes()
  .catch((e) => {
    console.error('❌ Error seeding edge types:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
