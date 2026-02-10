import { PrismaClient, FabricationCategory, ServiceType } from '@prisma/client';

const prisma = new PrismaClient();

// Base rates (ENGINEERED) — these are Northcoast Stone's existing rates
// Other categories get multipliers applied
const BASE_RATES: Record<string, { rate20mm: number; rate40mm: number; name: string; description: string; minimumCharge: number }> = {
  CUTTING:       { rate20mm: 17.50,  rate40mm: 45.00,  name: 'Cutting',       description: 'Stone cutting per lineal metre',            minimumCharge: 50.00  },
  POLISHING:     { rate20mm: 45.00,  rate40mm: 115.00, name: 'Polishing',     description: 'Edge polishing per lineal metre',           minimumCharge: 50.00  },
  INSTALLATION:  { rate20mm: 140.00, rate40mm: 170.00, name: 'Installation',  description: 'Installation per square metre',             minimumCharge: 200.00 },
  WATERFALL_END: { rate20mm: 300.00, rate40mm: 650.00, name: 'Waterfall End', description: 'Waterfall end return — fixed price',        minimumCharge: 300.00 },
  TEMPLATING:    { rate20mm: 180.00, rate40mm: 180.00, name: 'Templating',    description: 'On-site templating — fixed price',          minimumCharge: 180.00 },
  DELIVERY:      { rate20mm: 150.00, rate40mm: 150.00, name: 'Delivery',      description: 'Delivery per trip',                         minimumCharge: 100.00 },
};

// Material complexity multipliers relative to ENGINEERED baseline
// These come from "Rules for Quote Calculation" doc
const CATEGORY_MULTIPLIERS: Record<FabricationCategory, number> = {
  ENGINEERED:      1.00,  // baseline
  NATURAL_HARD:    1.15,  // granite — harder but predictable
  NATURAL_SOFT:    1.10,  // marble — softer but chips
  NATURAL_PREMIUM: 1.30,  // quartzite — extreme hardness, high blade wear
  SINTERED:        1.30,  // porcelain — high tension, specialised blades
};

const CATEGORY_LABELS: Record<FabricationCategory, string> = {
  ENGINEERED:      'Engineered Quartz',
  NATURAL_HARD:    'Natural Hard (Granite)',
  NATURAL_SOFT:    'Natural Soft (Marble)',
  NATURAL_PREMIUM: 'Natural Premium (Quartzite)',
  SINTERED:        'Sintered / Porcelain',
};

async function main() {
  // Find pricing settings (org '1')
  const settings = await prisma.pricing_settings.findFirst({
    where: { organisation_id: '1' },
  });

  if (!settings) {
    console.error('No pricing settings found for organisation "1". Run seed-pricing-settings.ts first.');
    process.exit(1);
  }

  const categories = Object.values(FabricationCategory);
  const serviceTypes = Object.keys(BASE_RATES) as ServiceType[];

  console.log('Seeding category-specific service rates...\n');

  let count = 0;

  for (const serviceType of serviceTypes) {
    const base = BASE_RATES[serviceType];

    for (const category of categories) {
      const multiplier = CATEGORY_MULTIPLIERS[category];
      const rate20mm = Math.round(base.rate20mm * multiplier * 100) / 100;
      const rate40mm = Math.round(base.rate40mm * multiplier * 100) / 100;
      const minimumCharge = Math.round(base.minimumCharge * multiplier * 100) / 100;

      await prisma.service_rates.upsert({
        where: {
          pricing_settings_id_serviceType_fabricationCategory: {
            pricing_settings_id: settings.id,
            serviceType,
            fabricationCategory: category,
          },
        },
        update: {
          rate20mm,
          rate40mm,
          minimumCharge,
          updated_at: new Date(),
        },
        create: {
          id: crypto.randomUUID(),
          pricing_settings_id: settings.id,
          serviceType,
          fabricationCategory: category,
          name: base.name,
          description: base.description,
          rate20mm,
          rate40mm,
          minimumCharge,
          isActive: true,
          updated_at: new Date(),
        },
      });

      console.log(`  ${base.name} x ${CATEGORY_LABELS[category]}: $${rate20mm} / $${rate40mm} (x${multiplier})`);
      count++;
    }
    console.log('');
  }

  console.log(`Done! ${count} category-specific service rates seeded.`);
  console.log('NOTE: These are calculated from base rates x multipliers.');
  console.log('Admins should review and adjust in Pricing Admin > Service Rates.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
