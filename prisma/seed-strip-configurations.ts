import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function seedStripConfigurations() {
  console.log('🌱 Seeding Strip Configurations...\n');

  // Get or create default company (Northcoast Stone)
  let company = await prisma.company.findFirst({
    where: { id: 1 }
  });

  if (!company) {
    console.log('⚠️  No company found, creating default company first...');
    company = await prisma.company.create({
      data: {
        name: 'Northcoast Stone Pty Ltd',
        abn: '57 120 880 355',
        address: '20 Hitech Drive, KUNDA PARK Queensland 4556, Australia',
        workshopAddress: '20 Hitech Drive, Kunda Park, Queensland 4556, Australia',
        phone: '0754767636',
        email: 'admin@northcoaststone.com.au',
        defaultTaxRate: 10,
        currency: 'AUD',
      }
    });
    console.log(`  ✅ Company created: ${company.name}\n`);
  }

  console.log('🔧 Seeding Strip Configurations...');
  
  const configurations = [
    {
      name: 'Standard 40mm Edge',
      description: 'Simple 40mm edge buildup - single lamination strip',
      finalThickness: 40,
      primaryStripWidth: null,
      laminationStripWidth: 40,
      kerfAllowance: 8,
      totalMaterialWidth: 48, // 0 + 40 + 8
      usageType: 'EDGE_LAMINATION' as const,
      applicableEdgeTypes: ['40MM_PENCIL', '40MM_BULLNOSE', '40MM_BEVEL'],
      isDefault: true,
      isActive: true,
      sortOrder: 1,
      companyId: company.id,
    },
    {
      name: 'Standard Island Edge (108mm)',
      description: 'Island bench front edge - 60mm apron + 40mm lamination',
      finalThickness: 40,
      primaryStripWidth: 60,
      laminationStripWidth: 40,
      kerfAllowance: 8,
      totalMaterialWidth: 108, // 60 + 40 + 8
      usageType: 'APRON' as const,
      applicableEdgeTypes: ['ISLAND_APRON'],
      isDefault: true,
      isActive: true,
      sortOrder: 2,
      companyId: company.id,
    },
    {
      name: 'Standard Waterfall (348mm)',
      description: 'Waterfall end - 300mm drop + 40mm lamination',
      finalThickness: 40,
      primaryStripWidth: 300,
      laminationStripWidth: 40,
      kerfAllowance: 8,
      totalMaterialWidth: 348, // 300 + 40 + 8
      usageType: 'WATERFALL_STANDARD' as const,
      applicableEdgeTypes: ['WATERFALL'],
      isDefault: true,
      isActive: true,
      sortOrder: 3,
      companyId: company.id,
    },
    {
      name: 'Extended Waterfall (448mm)',
      description: 'Extended waterfall - 400mm drop + 40mm lamination',
      finalThickness: 40,
      primaryStripWidth: 400,
      laminationStripWidth: 40,
      kerfAllowance: 8,
      totalMaterialWidth: 448, // 400 + 40 + 8
      usageType: 'WATERFALL_EXTENDED' as const,
      applicableEdgeTypes: [],
      isDefault: true,
      isActive: true,
      sortOrder: 4,
      companyId: company.id,
    },
    {
      name: '60mm Edge Buildup',
      description: 'Thicker 60mm edge appearance',
      finalThickness: 60,
      primaryStripWidth: null,
      laminationStripWidth: 60,
      kerfAllowance: 8,
      totalMaterialWidth: 68, // 0 + 60 + 8
      usageType: 'EDGE_LAMINATION' as const,
      applicableEdgeTypes: ['60MM_PENCIL', '60MM_BULLNOSE'],
      isDefault: false,
      isActive: true,
      sortOrder: 5,
      companyId: company.id,
    },
  ];

  for (const config of configurations) {
    await prisma.stripConfiguration.upsert({
      where: {
        companyId_name: {
          companyId: company.id,
          name: config.name,
        },
      },
      update: {
        description: config.description,
        finalThickness: config.finalThickness,
        primaryStripWidth: config.primaryStripWidth,
        laminationStripWidth: config.laminationStripWidth,
        kerfAllowance: config.kerfAllowance,
        totalMaterialWidth: config.totalMaterialWidth,
        usageType: config.usageType,
        applicableEdgeTypes: config.applicableEdgeTypes,
        isDefault: config.isDefault,
        isActive: config.isActive,
        sortOrder: config.sortOrder,
      },
      create: config,
    });
    
    const parts = [];
    if (config.primaryStripWidth) {
      parts.push(`${config.primaryStripWidth}mm primary`);
    }
    parts.push(`${config.laminationStripWidth}mm lam`);
    parts.push(`${config.kerfAllowance}mm kerf`);
    
    console.log(`  ✅ ${config.name}: ${config.totalMaterialWidth}mm total (${parts.join(' + ')})`);
  }

  console.log('\n✅ Strip Configurations seeded successfully\n');
}

seedStripConfigurations()
  .catch((e) => {
    console.error('❌ Error seeding strip configurations:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
