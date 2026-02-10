// seed-production.js — Combined seed for Railway production deploys
// Runs automatically on every deploy via railway.toml startCommand.
// All operations are idempotent (safe to run multiple times).

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function seedPricingSettings() {
  console.log('🌱 Seeding pricing settings, service rates, and cutout rates...');

  const settingsData = {
    material_pricing_basis: 'PER_SLAB',
    cutting_unit: 'LINEAR_METRE',
    polishing_unit: 'LINEAR_METRE',
    installation_unit: 'SQUARE_METRE',
    unit_system: 'METRIC',
    currency: 'AUD',
    gst_rate: 0.10,
    laminated_multiplier: 1.30,
    mitred_multiplier: 1.50,
    waste_factor_percent: 15.0,
    updated_at: new Date(),
  };

  const settings = await prisma.pricing_settings.upsert({
    where: { organisation_id: '1' },
    update: settingsData,
    create: {
      id: 'ps-org-1',
      organisation_id: '1',
      ...settingsData,
    },
  });

  console.log(`  ✅ Pricing settings: ${settings.id}`);

  // Service rates
  const serviceRates = [
    { id: 'sr-cutting', serviceType: 'CUTTING', name: 'Cutting', description: 'Stone cutting per lineal metre', rate20mm: 17.50, rate40mm: 45.00, minimumCharge: 50.00 },
    { id: 'sr-polishing', serviceType: 'POLISHING', name: 'Polishing', description: 'Edge polishing per lineal metre', rate20mm: 45.00, rate40mm: 115.00, minimumCharge: 50.00 },
    { id: 'sr-installation', serviceType: 'INSTALLATION', name: 'Installation', description: 'Installation per square metre', rate20mm: 140.00, rate40mm: 170.00, minimumCharge: 200.00 },
    { id: 'sr-waterfall-end', serviceType: 'WATERFALL_END', name: 'Waterfall End', description: 'Waterfall end return', rate20mm: 300.00, rate40mm: 650.00, minimumCharge: 300.00 },
    { id: 'sr-templating', serviceType: 'TEMPLATING', name: 'Templating', description: 'On-site templating', rate20mm: 180.00, rate40mm: 180.00, minimumCharge: 180.00 },
    { id: 'sr-delivery', serviceType: 'DELIVERY', name: 'Delivery', description: 'Delivery per trip', rate20mm: 150.00, rate40mm: 150.00, minimumCharge: 100.00 },
  ];

  for (const rate of serviceRates) {
    await prisma.service_rates.upsert({
      where: {
        pricing_settings_id_serviceType: {
          pricing_settings_id: settings.id,
          serviceType: rate.serviceType,
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
        name: rate.name,
        description: rate.description,
        rate20mm: rate.rate20mm,
        rate40mm: rate.rate40mm,
        minimumCharge: rate.minimumCharge,
        isActive: true,
        updated_at: new Date(),
      },
    });
  }
  console.log(`  ✅ Service rates: ${serviceRates.length} rows`);

  // Cutout rates
  const cutoutRates = [
    { id: 'cr-hotplate', cutout_type: 'HOTPLATE', name: 'Hotplate Cutout', rate: 65.00 },
    { id: 'cr-gpo', cutout_type: 'GPO', name: 'GPO (Power Outlet)', rate: 25.00 },
    { id: 'cr-tap-hole', cutout_type: 'TAP_HOLE', name: 'Tap Hole', rate: 25.00 },
    { id: 'cr-drop-in-sink', cutout_type: 'DROP_IN_SINK', name: 'Drop-in Sink Cutout', rate: 65.00 },
    { id: 'cr-undermount-sink', cutout_type: 'UNDERMOUNT_SINK', name: 'Undermount Sink Cutout', rate: 300.00 },
    { id: 'cr-flush-cooktop', cutout_type: 'FLUSH_COOKTOP', name: 'Flush Mount Cooktop', rate: 450.00 },
    { id: 'cr-basin', cutout_type: 'BASIN', name: 'Basin Cutout', rate: 90.00 },
    { id: 'cr-drainer-grooves', cutout_type: 'DRAINER_GROOVES', name: 'Drainer Grooves', rate: 150.00 },
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
  }
  console.log(`  ✅ Cutout rates: ${cutoutRates.length} rows`);
}

async function seedMachineProfiles() {
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
  }
  console.log(`  ✅ Machine profiles: ${machines.length} rows`);
}

async function seedMaterialSlabPrices() {
  console.log('🌱 Seeding materials with slab pricing...');

  const SLAB_LENGTH_MM = 3000;
  const SLAB_WIDTH_MM = 1400;
  const SLAB_AREA_SQM = (SLAB_LENGTH_MM * SLAB_WIDTH_MM) / 1_000_000; // 4.2

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
    }
  }
  console.log(`  ✅ Materials: ${materials.length} rows`);
}

async function main() {
  console.log('🚀 Running production seed...');
  await seedPricingSettings();
  await seedMachineProfiles();
  await seedMaterialSlabPrices();
  console.log('🎉 Production seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Production seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
