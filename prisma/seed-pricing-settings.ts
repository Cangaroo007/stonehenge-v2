import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding pricing settings, service rates, and cutout rates...');

  // ============================================
  // 1. UPSERT PRICING SETTINGS (company-1)
  // ============================================
  const settingsData = {
    material_pricing_basis: 'PER_SLAB' as const,
    cutting_unit: 'LINEAR_METRE' as const,
    polishing_unit: 'LINEAR_METRE' as const,
    installation_unit: 'SQUARE_METRE' as const,
    unit_system: 'METRIC' as const,
    currency: 'AUD',
    gst_rate: 0.10,
    laminated_multiplier: 1.30,
    mitred_multiplier: 1.50,
    waste_factor_percent: 15.0,
    grain_matching_surcharge_percent: 15.0,
    updated_at: new Date(),
  };

  const settings = await prisma.pricing_settings.upsert({
    where: { organisation_id: 'company-1' },
    update: settingsData,
    create: {
      id: 'ps-org-1',
      organisation_id: 'company-1',
      ...settingsData,
    },
  });

  console.log(`✅ Pricing settings created/updated: ${settings.id}`);

  // ============================================
  // 2. UPSERT SERVICE RATES (6 rows)
  // ============================================
  const serviceRates = [
    { id: 'sr-cutting', serviceType: 'CUTTING' as const, name: 'Cutting', description: 'Stone cutting per lineal metre', rate20mm: 17.50, rate40mm: 45.00, minimumCharge: 50.00 },
    { id: 'sr-polishing', serviceType: 'POLISHING' as const, name: 'Polishing', description: 'Edge polishing per lineal metre', rate20mm: 45.00, rate40mm: 115.00, minimumCharge: 50.00 },
    { id: 'sr-installation', serviceType: 'INSTALLATION' as const, name: 'Installation', description: 'Installation per square metre', rate20mm: 140.00, rate40mm: 170.00, minimumCharge: 200.00 },
    { id: 'sr-waterfall-end', serviceType: 'WATERFALL_END' as const, name: 'Waterfall End', description: 'Waterfall end return — fixed price', rate20mm: 300.00, rate40mm: 650.00, minimumCharge: 300.00 },
    { id: 'sr-templating', serviceType: 'TEMPLATING' as const, name: 'Templating', description: 'On-site templating — fixed price', rate20mm: 180.00, rate40mm: 180.00, minimumCharge: 180.00 },
    { id: 'sr-delivery', serviceType: 'DELIVERY' as const, name: 'Delivery', description: 'Delivery per trip', rate20mm: 150.00, rate40mm: 150.00, minimumCharge: 100.00 },
  ];

  for (const rate of serviceRates) {
    await prisma.service_rates.upsert({
      where: {
        pricing_settings_id_serviceType_fabricationCategory: {
          pricing_settings_id: settings.id,
          serviceType: rate.serviceType,
          fabricationCategory: 'ENGINEERED',
        },
      },
      update: {
        name: rate.name,
        description: rate.description,
        rate20mm: rate.rate20mm,
        rate40mm: rate.rate40mm,
        minimumCharge: rate.minimumCharge,
        isActive: true,
        updated_at: new Date(),
      },
      create: {
        id: rate.id,
        pricing_settings_id: settings.id,
        serviceType: rate.serviceType,
        fabricationCategory: 'ENGINEERED',
        name: rate.name,
        description: rate.description,
        rate20mm: rate.rate20mm,
        rate40mm: rate.rate40mm,
        minimumCharge: rate.minimumCharge,
        isActive: true,
        updated_at: new Date(),
      },
    });
    console.log(`  ✅ ${rate.name}: $${rate.rate20mm} / $${rate.rate40mm} (min $${rate.minimumCharge})`);
  }

  // ============================================
  // 3. UPSERT CUTOUT RATES (8 rows)
  // ============================================
  const cutoutRates = [
    { id: 'cr-hotplate', cutout_type: 'HOTPLATE' as const, name: 'Hotplate Cutout', rate: 65.00 },
    { id: 'cr-gpo', cutout_type: 'GPO' as const, name: 'GPO (Power Outlet)', rate: 25.00 },
    { id: 'cr-tap-hole', cutout_type: 'TAP_HOLE' as const, name: 'Tap Hole', rate: 25.00 },
    { id: 'cr-drop-in-sink', cutout_type: 'DROP_IN_SINK' as const, name: 'Drop-in Sink Cutout', rate: 65.00 },
    { id: 'cr-undermount-sink', cutout_type: 'UNDERMOUNT_SINK' as const, name: 'Undermount Sink Cutout', rate: 300.00 },
    { id: 'cr-flush-cooktop', cutout_type: 'FLUSH_COOKTOP' as const, name: 'Flush Mount Cooktop', rate: 450.00 },
    { id: 'cr-basin', cutout_type: 'BASIN' as const, name: 'Basin Cutout', rate: 90.00 },
    { id: 'cr-drainer-grooves', cutout_type: 'DRAINER_GROOVES' as const, name: 'Drainer Grooves', rate: 150.00 },
  ];

  for (const cutout of cutoutRates) {
    await prisma.cutout_rates.upsert({
      where: {
        pricing_settings_id_cutout_type: {
          pricing_settings_id: settings.id,
          cutout_type: cutout.cutout_type,
        },
      },
      update: {
        name: cutout.name,
        rate: cutout.rate,
        isActive: true,
        updated_at: new Date(),
      },
      create: {
        id: cutout.id,
        pricing_settings_id: settings.id,
        cutout_type: cutout.cutout_type,
        name: cutout.name,
        rate: cutout.rate,
        isActive: true,
        updated_at: new Date(),
      },
    });
    console.log(`  ✅ ${cutout.name}: $${cutout.rate}`);
  }

  console.log('🎉 Pricing settings seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
