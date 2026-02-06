import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Seed PricingSettings, ServiceRates, and CutoutRates
 * for Northcoast Stone (default organisation).
 */
async function seedPricingSettings() {
  console.log('Seeding pricing settings for Northcoast Stone...')

  // Create or update PricingSettings for the default organisation
  const settings = await prisma.pricingSettings.upsert({
    where: { organisationId: '1' },
    update: {
      materialPricingBasis: 'PER_SLAB',
      cuttingUnit: 'LINEAR_METRE',
      polishingUnit: 'LINEAR_METRE',
      installationUnit: 'SQUARE_METRE',
      unitSystem: 'METRIC',
      currency: 'AUD',
      gstRate: new Prisma.Decimal(0.10),
    },
    create: {
      organisationId: '1',
      materialPricingBasis: 'PER_SLAB',
      cuttingUnit: 'LINEAR_METRE',
      polishingUnit: 'LINEAR_METRE',
      installationUnit: 'SQUARE_METRE',
      unitSystem: 'METRIC',
      currency: 'AUD',
      gstRate: new Prisma.Decimal(0.10),
    },
  })

  console.log(`  PricingSettings created: ${settings.id} (org: ${settings.organisationId})`)

  // Seed ServiceRates linked to PricingSettings
  const serviceRates = [
    {
      serviceType: 'CUTTING' as const,
      name: 'Cutting',
      description: 'CNC and manual cutting of stone slabs',
      rate20mm: new Prisma.Decimal(17.50),
      rate40mm: new Prisma.Decimal(45.00),
      minimumCharge: new Prisma.Decimal(50.00),
    },
    {
      serviceType: 'POLISHING' as const,
      name: 'Polishing',
      description: 'Edge polishing and finishing',
      rate20mm: new Prisma.Decimal(45.00),
      rate40mm: new Prisma.Decimal(115.00),
      minimumCharge: new Prisma.Decimal(50.00),
    },
    {
      serviceType: 'INSTALLATION' as const,
      name: 'Installation',
      description: 'On-site installation of stone benchtops',
      rate20mm: new Prisma.Decimal(140.00),
      rate40mm: new Prisma.Decimal(170.00),
      minimumCharge: new Prisma.Decimal(200.00),
    },
    {
      serviceType: 'WATERFALL_END' as const,
      name: 'Waterfall End',
      description: 'Waterfall end return fabrication',
      rate20mm: new Prisma.Decimal(300.00),
      rate40mm: new Prisma.Decimal(650.00),
      minimumCharge: null,
    },
    {
      serviceType: 'TEMPLATING' as const,
      name: 'Templating',
      description: 'On-site templating and measurement',
      rate20mm: new Prisma.Decimal(150.00),
      rate40mm: new Prisma.Decimal(150.00),
      minimumCharge: new Prisma.Decimal(150.00),
    },
    {
      serviceType: 'DELIVERY' as const,
      name: 'Delivery',
      description: 'Delivery to site',
      rate20mm: new Prisma.Decimal(2.50),
      rate40mm: new Prisma.Decimal(2.50),
      minimumCharge: new Prisma.Decimal(100.00),
    },
  ]

  for (const rate of serviceRates) {
    await prisma.serviceRate.upsert({
      where: {
        pricingSettingsId_serviceType: {
          pricingSettingsId: settings.id,
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
      },
      create: {
        pricingSettingsId: settings.id,
        serviceType: rate.serviceType,
        name: rate.name,
        description: rate.description,
        rate20mm: rate.rate20mm,
        rate40mm: rate.rate40mm,
        minimumCharge: rate.minimumCharge,
        isActive: true,
      },
    })
  }
  console.log(`  Seeded ${serviceRates.length} service rates`)

  // Seed CutoutRates linked to PricingSettings
  const cutoutRates = [
    {
      cutoutType: 'HOTPLATE' as const,
      name: 'Hotplate Cutout',
      description: 'Standard hotplate/cooktop cutout',
      rate: new Prisma.Decimal(180.00),
    },
    {
      cutoutType: 'GPO' as const,
      name: 'GPO (Powerpoint)',
      description: 'General power outlet cutout',
      rate: new Prisma.Decimal(65.00),
    },
    {
      cutoutType: 'TAP_HOLE' as const,
      name: 'Tap Hole',
      description: 'Single tap hole drilling',
      rate: new Prisma.Decimal(45.00),
    },
    {
      cutoutType: 'DROP_IN_SINK' as const,
      name: 'Drop-in Sink',
      description: 'Drop-in/top-mount sink cutout',
      rate: new Prisma.Decimal(180.00),
    },
    {
      cutoutType: 'UNDERMOUNT_SINK' as const,
      name: 'Undermount Sink',
      description: 'Undermount sink cutout with polished edge',
      rate: new Prisma.Decimal(220.00),
    },
    {
      cutoutType: 'FLUSH_COOKTOP' as const,
      name: 'Flush Cooktop',
      description: 'Flush-mount cooktop cutout with rebate',
      rate: new Prisma.Decimal(280.00),
    },
    {
      cutoutType: 'BASIN' as const,
      name: 'Basin',
      description: 'Basin cutout for vanity tops',
      rate: new Prisma.Decimal(180.00),
    },
    {
      cutoutType: 'DRAINER_GROOVES' as const,
      name: 'Drainer Grooves',
      description: 'Set of drainer grooves',
      rate: new Prisma.Decimal(250.00),
    },
  ]

  for (const cutout of cutoutRates) {
    await prisma.cutoutRate.upsert({
      where: {
        pricingSettingsId_cutoutType: {
          pricingSettingsId: settings.id,
          cutoutType: cutout.cutoutType,
        },
      },
      update: {
        name: cutout.name,
        description: cutout.description,
        rate: cutout.rate,
        isActive: true,
      },
      create: {
        pricingSettingsId: settings.id,
        cutoutType: cutout.cutoutType,
        name: cutout.name,
        description: cutout.description,
        rate: cutout.rate,
        isActive: true,
      },
    })
  }
  console.log(`  Seeded ${cutoutRates.length} cutout rates`)

  console.log('Pricing settings seeded successfully!')
}

seedPricingSettings()
  .catch((e) => {
    console.error('Error seeding pricing settings:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
