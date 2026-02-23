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
    grain_matching_surcharge_percent: 15.0,
    updated_at: new Date(),
  };

  const settings = await prisma.pricing_settings.upsert({
    where: { id: 'ps-org-1' },
    update: {
      organisation_id: 'company-1',
      ...settingsData,
    },
    create: {
      id: 'ps-org-1',
      organisation_id: 'company-1',
      ...settingsData,
    },
  });

  console.log(`  ✅ Pricing settings: ${settings.id}`);

  // Service rates (base rates for ENGINEERED — other categories get multipliers)
  const serviceRates = [
    { serviceType: 'CUTTING',       name: 'Cutting',       description: 'Stone cutting per lineal metre',    rate20mm: 17.50,  rate40mm: 45.00,  minimumCharge: 50.00  },
    { serviceType: 'POLISHING',     name: 'Polishing',     description: 'Edge polishing per lineal metre',   rate20mm: 45.00,  rate40mm: 115.00, minimumCharge: 50.00  },
    { serviceType: 'INSTALLATION',  name: 'Installation',  description: 'Installation per square metre',     rate20mm: 140.00, rate40mm: 170.00, minimumCharge: 200.00 },
    { serviceType: 'WATERFALL_END', name: 'Waterfall End', description: 'Waterfall end return',              rate20mm: 300.00, rate40mm: 650.00, minimumCharge: 300.00 },
    { serviceType: 'TEMPLATING',    name: 'Templating',    description: 'On-site templating',                rate20mm: 180.00, rate40mm: 180.00, minimumCharge: 180.00 },
    { serviceType: 'DELIVERY',      name: 'Delivery',      description: 'Delivery per trip',                 rate20mm: 150.00, rate40mm: 150.00, minimumCharge: 100.00 },
    { serviceType: 'JOIN',          name: 'Join',          description: 'Join fabrication per lineal metre',  rate20mm: 80.00,  rate40mm: 80.00,  minimumCharge: 50.00  },
  ];

  // Material complexity multipliers relative to ENGINEERED baseline
  const categoryMultipliers = {
    ENGINEERED:      1.00,
    NATURAL_HARD:    1.15,
    NATURAL_SOFT:    1.10,
    NATURAL_PREMIUM: 1.30,
    SINTERED:        1.30,
  };
  const categories = Object.keys(categoryMultipliers);

  let rateCount = 0;
  for (const rate of serviceRates) {
    for (const category of categories) {
      const multiplier = categoryMultipliers[category];
      const r20 = Math.round(rate.rate20mm * multiplier * 100) / 100;
      const r40 = Math.round(rate.rate40mm * multiplier * 100) / 100;
      const minCharge = Math.round(rate.minimumCharge * multiplier * 100) / 100;
      const rateId = `sr-${rate.serviceType.toLowerCase()}-${category.toLowerCase()}`;

      await prisma.service_rates.upsert({
        where: {
          pricing_settings_id_serviceType_fabricationCategory: {
            pricing_settings_id: settings.id,
            serviceType: rate.serviceType,
            fabricationCategory: category,
          },
        },
        update: {
          name: rate.name,
          description: rate.description,
          rate20mm: r20,
          rate40mm: r40,
          minimumCharge: minCharge,
          isActive: true,
          updated_at: new Date(),
        },
        create: {
          id: rateId,
          pricing_settings_id: settings.id,
          serviceType: rate.serviceType,
          fabricationCategory: category,
          name: rate.name,
          description: rate.description,
          rate20mm: r20,
          rate40mm: r40,
          minimumCharge: minCharge,
          isActive: true,
          updated_at: new Date(),
        },
      });
      rateCount++;
    }
  }
  console.log(`  ✅ Service rates: ${rateCount} rows (${serviceRates.length} types × ${categories.length} categories)`);

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

async function seedEdgeTypes() {
  console.log('🌱 Seeding edge types...');

  const edgeTypes = [
    {
      id: 'et-arris',
      name: 'Arris',
      code: 'AR',
      description: 'Standard arris (eased) edge — no surcharge',
      category: 'polish',
      baseRate: 0.00,
      rate20mm: 0.00,
      rate40mm: 0.00,
      minimumCharge: null,
      minimumLength: null,
      isCurved: false,
      sortOrder: 1,
      isActive: true,
    },
    {
      id: 'et-pencil-round',
      name: 'Pencil Round',
      code: 'PR',
      description: 'Standard pencil round edge — no surcharge',
      category: 'polish',
      baseRate: 45.00,
      rate20mm: 0.00,
      rate40mm: 0.00,
      minimumCharge: null,
      minimumLength: null,
      isCurved: false,
      sortOrder: 2,
      isActive: true,
    },
    {
      id: 'et-bullnose',
      name: 'Bullnose',
      code: 'BN',
      description: 'Full bullnose profile',
      category: 'polish',
      baseRate: 55.00,
      rate20mm: 15.00,
      rate40mm: 35.00,
      minimumCharge: null,
      minimumLength: null,
      isCurved: false,
      sortOrder: 3,
      isActive: true,
    },
    {
      id: 'et-ogee',
      name: 'Ogee',
      code: 'OG',
      description: 'Decorative ogee profile',
      category: 'polish',
      baseRate: 65.00,
      rate20mm: 25.00,
      rate40mm: 25.00,
      minimumCharge: null,
      minimumLength: null,
      isCurved: false,
      sortOrder: 4,
      isActive: true,
    },
    {
      id: 'et-waterfall',
      name: 'Waterfall',
      code: 'WF',
      description: 'Waterfall return — no edge surcharge (priced via Waterfall End service)',
      category: 'polish',
      baseRate: 0.00,
      rate20mm: 0.00,
      rate40mm: 0.00,
      minimumCharge: null,
      minimumLength: null,
      isCurved: false,
      sortOrder: 5,
      isActive: true,
    },
    {
      id: 'et-beveled',
      name: 'Beveled',
      code: 'BEV',
      description: 'Beveled edge profile',
      category: 'polish',
      baseRate: 50.00,
      rate20mm: 5.00,
      rate40mm: 5.00,
      minimumCharge: null,
      minimumLength: null,
      isCurved: false,
      sortOrder: 6,
      isActive: true,
    },
    {
      id: 'et-curved-finished',
      name: 'Curved Finished Edge',
      code: 'CF',
      description: 'Curved/radius edge — premium rate with 1m minimum',
      category: 'polish',
      baseRate: 300.00,
      rate20mm: 255.00,
      rate40mm: 535.00,
      minimumCharge: 300.00,
      minimumLength: 1.0,
      isCurved: true,
      sortOrder: 7,
      isActive: true,
    },
  ];

  for (const edgeType of edgeTypes) {
    const existing = await prisma.edge_types.findUnique({
      where: { name: edgeType.name },
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
          isActive: edgeType.isActive,
          updatedAt: new Date(),
        },
      });
    } else {
      await prisma.edge_types.create({
        data: {
          ...edgeType,
          updatedAt: new Date(),
        },
      });
    }
  }
  console.log(`  ✅ Edge types: ${edgeTypes.length} rows`);
}

async function seedCutoutTypes() {
  console.log('🌱 Seeding cutout types...');

  const cutoutTypes = [
    { id: 'ct-hotplate',       name: 'Hotplate',         baseRate: 65.00,  sortOrder: 1 },
    { id: 'ct-gpo',            name: 'GPO',              baseRate: 25.00,  sortOrder: 2 },
    { id: 'ct-tap-hole',       name: 'Tap Hole',         baseRate: 25.00,  sortOrder: 3 },
    { id: 'ct-drop-in-sink',   name: 'Drop-in Sink',     baseRate: 65.00,  sortOrder: 4 },
    { id: 'ct-undermount-sink',name: 'Undermount Sink',  baseRate: 300.00, sortOrder: 5 },
    { id: 'ct-flush-cooktop',  name: 'Flush Cooktop',    baseRate: 450.00, sortOrder: 6 },
    { id: 'ct-basin',          name: 'Basin',            baseRate: 90.00,  sortOrder: 7 },
    { id: 'ct-drainer-grooves',name: 'Drainer Grooves',  baseRate: 150.00, sortOrder: 8 },
    // Legacy types kept for backward compatibility with existing piece data
    { id: 'ct-powerpoint',     name: 'Powerpoint Cutout',baseRate: 25.00,  sortOrder: 9 },
    { id: 'ct-cooktop',        name: 'Cooktop Cutout',   baseRate: 450.00, sortOrder: 10 },
  ];

  for (const cutout of cutoutTypes) {
    // 1. Try canonical ID first (idempotent re-runs)
    const byId = await prisma.cutout_types.findUnique({ where: { id: cutout.id } });
    if (byId) {
      await prisma.cutout_types.update({
        where: { id: cutout.id },
        data: { baseRate: cutout.baseRate, sortOrder: cutout.sortOrder, isActive: true, updatedAt: new Date() },
      });
      continue;
    }

    // 2. Fall back to name match — update rate on the existing record
    const byName = await prisma.cutout_types.findUnique({ where: { name: cutout.name } });
    if (byName) {
      await prisma.cutout_types.update({
        where: { id: byName.id },
        data: { baseRate: cutout.baseRate, sortOrder: cutout.sortOrder, isActive: true, updatedAt: new Date() },
      });
      continue;
    }

    // 3. Neither exists — create with canonical ID
    await prisma.cutout_types.create({
      data: { ...cutout, isActive: true, updatedAt: new Date() },
    });
  }
  console.log(`  ✅ Cutout types: ${cutoutTypes.length} rows`);
}

async function seedThicknessOptions() {
  console.log('🌱 Seeding thickness options...');

  const thicknessOptions = [
    { id: 'to-20mm', name: '20mm', value: 20, multiplier: 1.00, isDefault: true, sortOrder: 1 },
    { id: 'to-40mm', name: '40mm', value: 40, multiplier: 1.30, isDefault: false, sortOrder: 2 },
  ];

  for (const thickness of thicknessOptions) {
    const existing = await prisma.thickness_options.findUnique({
      where: { name: thickness.name },
    });

    if (existing) {
      await prisma.thickness_options.update({
        where: { name: thickness.name },
        data: {
          value: thickness.value,
          multiplier: thickness.multiplier,
          isDefault: thickness.isDefault,
          sortOrder: thickness.sortOrder,
          isActive: true,
          updatedAt: new Date(),
        },
      });
    } else {
      await prisma.thickness_options.create({
        data: {
          ...thickness,
          isActive: true,
          updatedAt: new Date(),
        },
      });
    }
  }
  console.log(`  ✅ Thickness options: ${thicknessOptions.length} rows`);
}

async function seedClientTypes() {
  console.log('🌱 Seeding client types...');

  const clientTypes = [
    { id: 'ctype-cabinet-maker', name: 'Cabinet Maker', description: 'Kitchen and joinery manufacturers', sortOrder: 1 },
    { id: 'ctype-builder', name: 'Builder', description: 'Residential and commercial builders', sortOrder: 2 },
    { id: 'ctype-direct-consumer', name: 'Direct Consumer', description: 'Homeowners and end consumers', sortOrder: 3 },
    { id: 'ctype-designer-architect', name: 'Designer/Architect', description: 'Interior designers and architects', sortOrder: 4 },
  ];

  for (const clientType of clientTypes) {
    const existing = await prisma.client_types.findUnique({
      where: { name: clientType.name },
    });

    if (existing) {
      await prisma.client_types.update({
        where: { name: clientType.name },
        data: {
          description: clientType.description,
          sortOrder: clientType.sortOrder,
          isActive: true,
          updatedAt: new Date(),
        },
      });
    } else {
      await prisma.client_types.create({
        data: {
          ...clientType,
          isActive: true,
          updatedAt: new Date(),
        },
      });
    }
  }
  console.log(`  ✅ Client types: ${clientTypes.length} rows`);
}

async function seedClientTiers() {
  console.log('🌱 Seeding client tiers...');

  const clientTiers = [
    { id: 'ctier-1', name: 'Tier 1', description: 'Premium partners - best pricing', priority: 100, sortOrder: 1 },
    { id: 'ctier-2', name: 'Tier 2', description: 'Regular clients - standard discounts', priority: 50, sortOrder: 2 },
    { id: 'ctier-3', name: 'Tier 3', description: 'New clients - standard pricing', priority: 0, isDefault: true, sortOrder: 3 },
  ];

  for (const tier of clientTiers) {
    const existing = await prisma.client_tiers.findUnique({
      where: { name: tier.name },
    });

    if (existing) {
      await prisma.client_tiers.update({
        where: { name: tier.name },
        data: {
          description: tier.description,
          priority: tier.priority,
          isDefault: tier.isDefault || false,
          sortOrder: tier.sortOrder,
          isActive: true,
          updatedAt: new Date(),
        },
      });
    } else {
      await prisma.client_tiers.create({
        data: {
          ...tier,
          isDefault: tier.isDefault || false,
          isActive: true,
          updatedAt: new Date(),
        },
      });
    }
  }
  console.log(`  ✅ Client tiers: ${clientTiers.length} rows`);
}

async function seedMachineOperationDefaults() {
  console.log('🌱 Seeding machine-operation defaults...');

  const DEFAULTS = [
    { operationType: 'INITIAL_CUT',    machineName: 'CNC Bridge Saw',    kerfMm: 4 },
    { operationType: 'EDGE_POLISHING', machineName: 'Edge Polisher',     kerfMm: 0 },
    { operationType: 'MITRING',        machineName: '5-Axis Saw',        kerfMm: 4 },
    { operationType: 'LAMINATION',     machineName: 'Manual/Hand Tools', kerfMm: 0 },
    { operationType: 'CUTOUT',         machineName: 'Waterjet / CNC',    kerfMm: 1 },
  ];

  for (const def of DEFAULTS) {
    // Find or create machine profile (idempotent via upsert on id)
    const machineId = `machine-${def.machineName.toLowerCase().replace(/[\s/]+/g, '-')}`;
    const machine = await prisma.machine_profiles.upsert({
      where: { name: def.machineName },
      update: {
        kerf_width_mm: def.kerfMm,
        is_active: true,
        updated_at: new Date(),
      },
      create: {
        id: machineId,
        name: def.machineName,
        kerf_width_mm: def.kerfMm,
        is_active: true,
        is_default: def.operationType === 'INITIAL_CUT',
        updated_at: new Date(),
      },
    });

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
  }
  console.log(`  ✅ Machine-operation defaults: ${DEFAULTS.length} rows`);
}

async function seedCutoutCategoryRates() {
  console.log('🌱 Seeding cutout category rates...');

  const pricingSettings = await prisma.pricing_settings.findFirst();
  if (!pricingSettings) {
    console.warn('  ⚠ No pricing_settings found — skipping cutout category rates');
    return;
  }

  const cutoutTypes = await prisma.cutout_types.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });

  if (cutoutTypes.length === 0) {
    console.warn('  ⚠ No cutout_types found — skipping cutout category rates');
    return;
  }

  const categoryMultipliers = {
    ENGINEERED: 1.0,
    NATURAL_SOFT: 1.1,
    NATURAL_HARD: 1.15,
    SINTERED: 1.4,
    NATURAL_PREMIUM: 1.5,
  };
  const categories = Object.keys(categoryMultipliers);

  let count = 0;
  for (const cutoutType of cutoutTypes) {
    const baseRate = Number(cutoutType.baseRate);
    for (const category of categories) {
      const rate = Math.round(baseRate * categoryMultipliers[category] * 100) / 100;
      await prisma.cutout_category_rates.upsert({
        where: {
          cutoutTypeId_fabricationCategory_pricingSettingsId: {
            cutoutTypeId: cutoutType.id,
            fabricationCategory: category,
            pricingSettingsId: pricingSettings.id,
          },
        },
        update: { rate },
        create: {
          cutoutTypeId: cutoutType.id,
          fabricationCategory: category,
          rate,
          pricingSettingsId: pricingSettings.id,
        },
      });
      count++;
    }
  }
  console.log(`  ✅ Cutout category rates: ${count} rows (${cutoutTypes.length} types × ${categories.length} categories)`);
}

async function seedEdgeCategoryRates() {
  console.log('🌱 Seeding edge category rates...');

  const pricingSettings = await prisma.pricing_settings.findFirst();
  if (!pricingSettings) {
    console.warn('  ⚠ No pricing_settings found — skipping edge category rates');
    return;
  }

  const edgeTypes = await prisma.edge_types.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });

  if (edgeTypes.length === 0) {
    console.warn('  ⚠ No edge_types found — skipping edge category rates');
    return;
  }

  // Specific rates per edge profile name per fabrication category (AUD per lineal metre).
  // Keys are normalised edge type names (lowercase). Each category entry has [rate20mm, rate40mm].
  const edgeCategoryRateTable = {
    'arris': {
      ENGINEERED: [0, 0], NATURAL_HARD: [0, 0], NATURAL_SOFT: [0, 0], NATURAL_PREMIUM: [0, 0], SINTERED: [0, 0],
    },
    'pencil round': {
      ENGINEERED: [0, 0], NATURAL_HARD: [0, 0], NATURAL_SOFT: [0, 0], NATURAL_PREMIUM: [0, 0], SINTERED: [0, 0],
    },
    'bullnose': {
      ENGINEERED:      [15, 35],
      NATURAL_HARD:    [18, 42],
      NATURAL_SOFT:    [16, 38],
      NATURAL_PREMIUM: [25, 58],
      SINTERED:        [22, 50],
    },
    'ogee': {
      ENGINEERED:      [25, 25],
      NATURAL_HARD:    [30, 30],
      NATURAL_SOFT:    [27, 27],
      NATURAL_PREMIUM: [40, 40],
      SINTERED:        [35, 35],
    },
    'waterfall': {
      ENGINEERED: [0, 0], NATURAL_HARD: [0, 0], NATURAL_SOFT: [0, 0], NATURAL_PREMIUM: [0, 0], SINTERED: [0, 0],
    },
  };

  const categories = ['ENGINEERED', 'NATURAL_HARD', 'NATURAL_SOFT', 'NATURAL_PREMIUM', 'SINTERED'];
  // Category multipliers used as fallback for edge types not in the explicit table above
  const categoryMultipliers = {
    ENGINEERED: 1.0, NATURAL_HARD: 1.15, NATURAL_SOFT: 1.10, NATURAL_PREMIUM: 1.50, SINTERED: 1.40,
  };

  let count = 0;
  for (const edgeType of edgeTypes) {
    const nameKey = edgeType.name.toLowerCase();
    const explicitRates = edgeCategoryRateTable[nameKey];

    for (const category of categories) {
      let rate20mm, rate40mm;

      if (explicitRates && explicitRates[category]) {
        [rate20mm, rate40mm] = explicitRates[category];
      } else {
        // Fallback: derive from edge_types base rates with category multiplier
        const isZeroProfile = nameKey.includes('pencil') ||
                              nameKey.includes('arris') ||
                              nameKey.includes('waterfall') ||
                              nameKey.includes('square') ||
                              nameKey.includes('eased');
        if (isZeroProfile) {
          rate20mm = 0;
          rate40mm = 0;
        } else {
          const multiplier = categoryMultipliers[category] || 1.0;
          rate20mm = Math.round(Number(edgeType.rate20mm ?? edgeType.baseRate) * multiplier * 100) / 100;
          rate40mm = Math.round(Number(edgeType.rate40mm ?? edgeType.baseRate) * multiplier * 100) / 100;
        }
      }

      await prisma.edge_type_category_rates.upsert({
        where: {
          edgeTypeId_fabricationCategory_pricingSettingsId: {
            edgeTypeId: edgeType.id,
            fabricationCategory: category,
            pricingSettingsId: pricingSettings.id,
          },
        },
        update: { rate20mm, rate40mm },
        create: {
          edgeTypeId: edgeType.id,
          fabricationCategory: category,
          rate20mm,
          rate40mm,
          pricingSettingsId: pricingSettings.id,
        },
      });
      count++;
    }
  }
  console.log(`  ✅ Edge category rates: ${count} rows (${edgeTypes.length} types × ${categories.length} categories)`);
}

async function seedEdgeCompatibility() {
  console.log('🌱 Seeding material-edge compatibility...');

  const pricingSettings = await prisma.pricing_settings.findFirst();
  if (!pricingSettings) {
    console.warn('  ⚠ No pricing_settings found — skipping edge compatibility');
    return;
  }

  const ogee = await prisma.edge_types.findFirst({
    where: { name: { contains: 'Ogee', mode: 'insensitive' } },
  });

  const bullnose = await prisma.edge_types.findFirst({
    where: { name: { contains: 'Bullnose', mode: 'insensitive' } },
  });

  let count = 0;

  if (ogee) {
    await prisma.material_edge_compatibility.upsert({
      where: {
        fabricationCategory_edgeTypeId_pricingSettingsId: {
          fabricationCategory: 'SINTERED',
          edgeTypeId: ogee.id,
          pricingSettingsId: pricingSettings.id,
        },
      },
      update: {
        isAllowed: false,
        warningMessage: 'Ogee not available for sintered materials — high chip risk',
      },
      create: {
        fabricationCategory: 'SINTERED',
        edgeTypeId: ogee.id,
        isAllowed: false,
        warningMessage: 'Ogee not available for sintered materials — high chip risk',
        pricingSettingsId: pricingSettings.id,
      },
    });
    count++;
  }

  if (bullnose) {
    await prisma.material_edge_compatibility.upsert({
      where: {
        fabricationCategory_edgeTypeId_pricingSettingsId: {
          fabricationCategory: 'SINTERED',
          edgeTypeId: bullnose.id,
          pricingSettingsId: pricingSettings.id,
        },
      },
      update: {
        isAllowed: true,
        warningMessage: 'Bullnose on sintered materials carries higher chip risk. Proceed with caution.',
      },
      create: {
        fabricationCategory: 'SINTERED',
        edgeTypeId: bullnose.id,
        isAllowed: true,
        warningMessage: 'Bullnose on sintered materials carries higher chip risk. Proceed with caution.',
        pricingSettingsId: pricingSettings.id,
      },
    });
    count++;
  }

  console.log(`  ✅ Material-edge compatibility: ${count} rows`);
}

async function main() {
  console.log('🚀 Running production seed...');
  await seedPricingSettings();
  await seedMachineProfiles();
  await seedMachineOperationDefaults();
  await seedMaterialSlabPrices();
  await seedEdgeTypes();
  await seedCutoutTypes();
  await seedThicknessOptions();
  await seedClientTypes();
  await seedClientTiers();
  await seedCutoutCategoryRates();
  await seedEdgeCategoryRates();
  await seedEdgeCompatibility();
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
