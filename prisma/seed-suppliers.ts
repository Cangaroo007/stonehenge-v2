import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding suppliers...');

  // Find the company (Northcoast Stone)
  const company = await prisma.companies.findFirst();
  if (!company) {
    console.log('No company found — skipping supplier seed');
    return;
  }

  const suppliers = [
    {
      name: 'Caesarstone',
      website: 'https://www.caesarstone.com.au',
      default_margin_percent: 30,
      default_slab_length_mm: 3050,
      default_slab_width_mm: 1440,
      default_thickness_mm: 20,
      notes: 'CSF range uses 3050x1440. Grande uses 3200x1640.',
    },
    {
      name: 'YDL Stone',
      website: 'https://www.ydlstone.com.au',
      default_margin_percent: 30,
      default_slab_length_mm: 3230,
      default_slab_width_mm: 1630,
      default_thickness_mm: 20,
      notes: 'Mineral range. Under 1% crystalline silica.',
    },
    {
      name: 'Quantum Zero',
      website: 'https://www.quantumzero.com.au',
      default_margin_percent: 30,
      default_slab_length_mm: 3210,
      default_slab_width_mm: 1610,
      default_thickness_mm: 20,
      notes: 'Recycled surfaces. VIP pricing applied.',
    },
    {
      name: 'Zenith (Stone Ambassador)',
      website: 'https://www.stoneambassador.com.au',
      default_margin_percent: 30,
      default_slab_length_mm: 3210,
      default_slab_width_mm: 1610,
      default_thickness_mm: 20,
      notes: 'Effective Feb 2026 - Jun 2026 pricing.',
    },
  ];

  for (const supplier of suppliers) {
    await prisma.suppliers.upsert({
      where: {
        company_id_name: { company_id: company.id, name: supplier.name },
      },
      update: supplier,
      create: { ...supplier, company_id: company.id },
    });
    console.log(`  Supplier: ${supplier.name}`);
  }

  console.log('Suppliers seeded');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
