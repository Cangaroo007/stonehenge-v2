import { PrismaClient, FabricationCategory, ServiceType } from '@prisma/client';

const prisma = new PrismaClient();

// Curved / radius service rates — Northcoast Stone base rates (ENGINEERED)
// Other categories get the same multipliers as straight service rates
const BASE_RATES: Record<string, { rate20mm: number; rate40mm: number; name: string; description: string; minimumCharge: number }> = {
  CURVED_CUTTING:   { rate20mm: 35.00,  rate40mm: 90.00,  name: 'Curved Cutting',   description: 'Curved stone cutting per lineal metre',   minimumCharge: 80.00  },
  CURVED_POLISHING: { rate20mm: 90.00,  rate40mm: 230.00, name: 'Curved Polishing', description: 'Curved edge polishing per lineal metre',  minimumCharge: 80.00  },
  RADIUS_SETUP:     { rate20mm: 150.00, rate40mm: 150.00, name: 'Radius Setup',     description: 'One-off radius template/jig setup fee',  minimumCharge: 150.00 },
  CURVED_MIN_LM:    { rate20mm: 0.60,   rate40mm: 0.60,   name: 'Curved Min LM',    description: 'Minimum lineal metres charged for curves', minimumCharge: 0.00   },
};

// Material complexity multipliers relative to ENGINEERED baseline
// Same multipliers as straight service rates
const CATEGORY_MULTIPLIERS: Record<FabricationCategory, number> = {
  ENGINEERED:      1.00,
  NATURAL_HARD:    1.15,
  NATURAL_SOFT:    1.10,
  NATURAL_PREMIUM: 1.30,
  SINTERED:        1.30,
};

const CATEGORY_LABELS: Record<FabricationCategory, string> = {
  ENGINEERED:      'Engineered Quartz',
  NATURAL_HARD:    'Natural Hard (Granite)',
  NATURAL_SOFT:    'Natural Soft (Marble)',
  NATURAL_PREMIUM: 'Natural Premium (Quartzite)',
  SINTERED:        'Sintered / Porcelain',
};

async function main() {
  const settings = await prisma.pricing_settings.findFirst();
  if (!settings) throw new Error('No pricing_settings row found — run base seed first.');
  const PRICING_SETTINGS_ID = settings.id;

  const categories = Object.values(FabricationCategory);
  const serviceTypes = Object.keys(BASE_RATES) as ServiceType[];

  console.log('Seeding curved service rates...\n');

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
            pricing_settings_id: PRICING_SETTINGS_ID,
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
          pricing_settings_id: PRICING_SETTINGS_ID,
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

  console.log(`Done! ${count} curved service rates seeded.`);
  console.log('NOTE: CURVED_MIN_LM rate = minimum LM threshold, not a dollar rate.');
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
