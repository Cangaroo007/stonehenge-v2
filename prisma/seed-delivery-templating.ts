import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function seedDeliveryAndTemplating() {
  console.log('🌱 Seeding Company, Delivery Zones and Templating Rates...\n');

  // Create default company (Northcoast Stone)
  console.log('🏢 Creating default company...');
  const company = await prisma.company.upsert({
    where: { id: 1 },
    update: {
      name: 'Northcoast Stone Pty Ltd',
      abn: '57 120 880 355',
      address: '20 Hitech Drive, KUNDA PARK Queensland 4556, Australia',
      workshopAddress: '20 Hitech Drive, Kunda Park, Queensland 4556, Australia',
      phone: '0754767636',
      fax: '0754768636',
      email: 'admin@northcoaststone.com.au',
      defaultTaxRate: 10,
      currency: 'AUD',
      isActive: true
    },
    create: {
      name: 'Northcoast Stone Pty Ltd',
      abn: '57 120 880 355',
      address: '20 Hitech Drive, KUNDA PARK Queensland 4556, Australia',
      workshopAddress: '20 Hitech Drive, Kunda Park, Queensland 4556, Australia',
      phone: '0754767636',
      fax: '0754768636',
      email: 'admin@northcoaststone.com.au',
      defaultTaxRate: 10,
      currency: 'AUD',
      isActive: true
    }
  });
  console.log(`  ✅ Company: ${company.name}`);
  console.log(`  📍 Workshop: ${company.workshopAddress}\n`);

  // Delivery Zones
  console.log('📦 Seeding Delivery Zones...');
  const deliveryZones = [
    {
      name: 'Local',
      maxDistanceKm: 30,
      ratePerKm: 2.50,
      baseCharge: 50.00,
      isActive: true,
      companyId: company.id
    },
    {
      name: 'Regional',
      maxDistanceKm: 100,
      ratePerKm: 3.00,
      baseCharge: 75.00,
      isActive: true,
      companyId: company.id
    },
    {
      name: 'Remote',
      maxDistanceKm: 500,
      ratePerKm: 3.50,
      baseCharge: 100.00,
      isActive: true,
      companyId: company.id
    }
  ];

  for (const zone of deliveryZones) {
    await prisma.deliveryZone.upsert({
      where: { 
        companyId_name: { 
          companyId: company.id, 
          name: zone.name 
        } 
      },
      update: zone,
      create: zone
    });
    console.log(`  ✅ ${zone.name} Zone: 0-${zone.maxDistanceKm}km @ $${zone.baseCharge} + $${zone.ratePerKm}/km`);
  }

  // Templating Rate
  console.log('\n📐 Seeding Templating Rate...');
  await prisma.templatingRate.upsert({
    where: { id: 1 },
    update: {
      name: 'Standard Templating',
      baseCharge: 150.00,
      ratePerKm: 2.00,
      isActive: true,
      companyId: company.id
    },
    create: {
      name: 'Standard Templating',
      baseCharge: 150.00,
      ratePerKm: 2.00,
      isActive: true,
      companyId: company.id
    }
  });
  console.log('  ✅ Standard Templating: $150 base + $2.00/km');

  console.log('\n✅ Company, Delivery and Templating seeded successfully\n');
}

seedDeliveryAndTemplating()
  .catch((e) => {
    console.error('❌ Error seeding delivery and templating:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
