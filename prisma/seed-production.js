// Plain JavaScript seed - crash-proof, critical items first
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function seedSection(name, fn) {
  try {
    await fn();
    console.log('OK:', name);
  } catch (e) {
    console.error('SKIP:', name, '-', e.message);
  }
}

async function main() {
  console.log('Seeding database...');

  // =============================================
  // CRITICAL: These must succeed for login to work
  // =============================================

  // 1. Create company FIRST
  const company = await prisma.company.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: 'Northcoast Stone Pty Ltd',
      abn: '57 120 880 355',
      address: '20 Hitech Drive, KUNDA PARK Queensland 4556, Australia',
      phone: '0754767636',
      fax: '0754768636',
      email: 'admin@northcoaststone.com.au',
      workshopAddress: '20 Hitech Drive, Kunda Park, Queensland 4556, Australia',
      defaultTaxRate: 10.00,
      currency: 'AUD',
      isActive: true,
    },
  });
  console.log('OK: Company created');

  // 2. Create admin user AND assign to company
  const passwordHash = await bcrypt.hash('demo1234', 10);
  const user = await prisma.user.upsert({
    where: { email: 'admin@northcoaststone.com.au' },
    update: { companyId: company.id },
    create: {
      email: 'admin@northcoaststone.com.au',
      passwordHash,
      name: 'Admin User',
      companyId: company.id,
    },
  });
  console.log('OK: User created and assigned to company:', user.email);

  // =============================================
  // NON-CRITICAL: Each section wrapped in try/catch
  // =============================================

  await seedSection('materials', async () => {
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
      await prisma.material.upsert({ where: { id: materials.indexOf(mat) + 1 }, update: mat, create: mat });
    }
  });

  await seedSection('edge types', async () => {
    const edgeTypes = [
      { name: 'Pencil Round', description: 'Standard pencil round edge', category: 'polish', baseRate: 35, rate20mm: 0, rate40mm: 0, sortOrder: 1, isActive: true },
      { name: 'Bullnose', description: 'Full bullnose edge', category: 'polish', baseRate: 45, rate20mm: 10, rate40mm: 10, sortOrder: 2, isActive: true },
      { name: 'Arriss', description: 'Slight ease/chamfer on edge', category: 'polish', baseRate: 25, rate20mm: 0, rate40mm: 0, sortOrder: 3, isActive: true },
      { name: 'Beveled', description: '45 degree bevel', category: 'polish', baseRate: 40, rate20mm: 5, rate40mm: 5, sortOrder: 4, isActive: true },
      { name: 'Ogee', description: 'Decorative ogee profile', category: 'polish', baseRate: 65, rate20mm: 20, rate40mm: 25, sortOrder: 5, isActive: true },
      { name: 'Square/Eased', description: 'Square edge with slight ease', category: 'polish', baseRate: 30, rate20mm: 0, rate40mm: 0, sortOrder: 6, isActive: true },
      { name: 'Mitered', description: 'Mitered edge for thick appearance', category: 'polish', baseRate: 85, rate20mm: 40, rate40mm: 40, sortOrder: 7, isActive: true },
      { name: 'Waterfall', description: 'Waterfall edge return', category: 'waterfall', baseRate: 120, rate20mm: 75, rate40mm: 75, sortOrder: 8, isActive: true },
    ];
    for (const e of edgeTypes) {
      await prisma.edgeType.upsert({ where: { name: e.name }, update: e, create: e });
    }
  });

  await seedSection('cutout types', async () => {
    const cutoutTypes = [
      { name: 'Undermount Sink', description: 'Cutout for undermount sink', baseRate: 180, sortOrder: 1, isActive: true },
      { name: 'Drop-in Sink', description: 'Cutout for drop-in sink', baseRate: 120, sortOrder: 2, isActive: true },
      { name: 'Cooktop/Hotplate', description: 'Cutout for cooktop or hotplate', baseRate: 150, sortOrder: 3, isActive: true },
      { name: 'Basin', description: 'Cutout for basin', baseRate: 95, sortOrder: 4, isActive: true },
      { name: 'Tap Hole', description: 'Single tap hole', baseRate: 35, sortOrder: 5, isActive: true },
      { name: 'GPO/Powerpoint', description: 'Cutout for electrical outlet', baseRate: 45, sortOrder: 6, isActive: true },
    ];
    for (const c of cutoutTypes) {
      await prisma.cutoutType.upsert({ where: { name: c.name }, update: c, create: c });
    }
  });

  await seedSection('thickness options', async () => {
    const opts = [
      { name: '20mm', value: 20, multiplier: 1.00, isDefault: true, sortOrder: 1, isActive: true },
      { name: '40mm', value: 40, multiplier: 1.30, isDefault: false, sortOrder: 2, isActive: true },
    ];
    for (const o of opts) {
      await prisma.thicknessOption.upsert({ where: { name: o.name }, update: o, create: o });
    }
  });

  await seedSection('client types', async () => {
    const types = [
      { name: 'Cabinet Maker', description: 'Kitchen and joinery manufacturers', sortOrder: 1, isActive: true },
      { name: 'Builder', description: 'Residential and commercial builders', sortOrder: 2, isActive: true },
      { name: 'Direct Consumer', description: 'Homeowners and end consumers', sortOrder: 3, isActive: true },
      { name: 'Designer/Architect', description: 'Interior designers and architects', sortOrder: 4, isActive: true },
    ];
    for (const t of types) {
      await prisma.clientType.upsert({ where: { name: t.name }, update: t, create: t });
    }
  });

  await seedSection('client tiers', async () => {
    const tiers = [
      { name: 'Tier 1', description: 'Premium partners - best pricing', priority: 100, sortOrder: 1, isActive: true },
      { name: 'Tier 2', description: 'Regular clients - standard discounts', priority: 50, sortOrder: 2, isActive: true },
      { name: 'Tier 3', description: 'New clients - standard pricing', priority: 0, isDefault: true, sortOrder: 3, isActive: true },
    ];
    for (const t of tiers) {
      await prisma.clientTier.upsert({ where: { name: t.name }, update: t, create: t });
    }
  });

  await seedSection('price book', async () => {
    await prisma.priceBook.upsert({ where: { name: 'Retail Price List' }, update: {}, create: { name: 'Retail Price List', description: 'Standard retail pricing', category: 'retail', defaultThickness: 20, isDefault: true, isActive: true } });
  });

  await seedSection('customers', async () => {
    const customers = [
      { name: 'Gem Life', company: 'GemLife Highfields Heights', email: 'projects@gemlife.com.au', phone: '07 5555 1234', address: 'Highfields Heights, QLD' },
      { name: 'John Smith', company: 'Smith Building Co', email: 'john@smithbuilding.com.au', phone: '0412 345 678', address: '123 Main St, Brisbane QLD 4000' },
      { name: 'Sarah Johnson', company: null, email: 'sarah.j@email.com', phone: '0423 456 789', address: '45 Ocean View Dr, Sunshine Coast QLD 4556' },
    ];
    for (const c of customers) {
      await prisma.customer.upsert({ where: { id: customers.indexOf(c) + 1 }, update: c, create: c });
    }
  });

  await seedSection('delivery zones', async () => {
    const zones = [
      { name: 'Local', maxDistanceKm: 30, ratePerKm: 2.50, baseCharge: 50.00, companyId: company.id, isActive: true },
      { name: 'Regional', maxDistanceKm: 100, ratePerKm: 3.00, baseCharge: 75.00, companyId: company.id, isActive: true },
      { name: 'Remote', maxDistanceKm: 500, ratePerKm: 3.50, baseCharge: 100.00, companyId: company.id, isActive: true },
    ];
    for (const z of zones) {
      await prisma.deliveryZone.upsert({ where: { companyId_name: { companyId: company.id, name: z.name } }, update: z, create: z });
    }
  });

  await seedSection('settings', async () => {
    const settings = [
      { key: 'quote_prefix', value: 'Q-' },
      { key: 'quote_validity_days', value: '30' },
      { key: 'deposit_percentage', value: '50' },
      { key: 'default_tax_rate', value: '10' },
    ];
    for (const s of settings) {
      await prisma.setting.upsert({ where: { key: s.key }, update: s, create: s });
    }
  });

  console.log('Seeding complete! Login: admin@northcoaststone.com.au / demo1234');
}

main()
  .catch((e) => console.error('Seed error:', e.message))
  .finally(() => prisma.$disconnect());
