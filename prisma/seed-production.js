// Plain JavaScript seed - no TypeScript needed at runtime
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const passwordHash = await bcrypt.hash('demo1234', 10);

  const user = await prisma.user.upsert({
    where: { email: 'admin@northcoaststone.com.au' },
    update: {},
    create: {
      email: 'admin@northcoaststone.com.au',
      passwordHash,
      name: 'Admin User',
    },
  });
  console.log('Created user:', user.email);

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
    await prisma.material.upsert({
      where: { id: materials.indexOf(mat) + 1 },
      update: mat,
      create: mat,
    });
  }
  console.log('Created', materials.length, 'materials');

  const featurePricing = [
    { category: 'thickness', name: '20mm', price: 1.0, priceType: 'multiplier', description: 'Standard 20mm thickness' },
    { category: 'thickness', name: '30mm', price: 1.3, priceType: 'multiplier', description: '30mm thickness' },
    { category: 'thickness', name: '40mm', price: 1.5, priceType: 'multiplier', description: '40mm thickness (mitered)' },
    { category: 'edge', name: 'Pencil Round', price: 0, priceType: 'per_meter', description: 'Standard pencil round edge' },
    { category: 'edge', name: 'Bullnose', price: 45, priceType: 'per_meter', description: 'Full bullnose edge' },
    { category: 'edge', name: 'Beveled', price: 35, priceType: 'per_meter', description: '45 degree bevel' },
    { category: 'edge', name: 'Ogee', price: 65, priceType: 'per_meter', description: 'Decorative ogee profile' },
    { category: 'edge', name: 'Square/Eased', price: 0, priceType: 'per_meter', description: 'Square edge with slight ease' },
    { category: 'edge', name: 'Mitered', price: 85, priceType: 'per_meter', description: 'Mitered edge for thick appearance' },
    { category: 'cutout', name: 'Undermount Sink Cutout', price: 180, priceType: 'fixed', description: 'Cutout for undermount sink' },
    { category: 'cutout', name: 'Drop-in Sink Cutout', price: 120, priceType: 'fixed', description: 'Cutout for drop-in sink' },
    { category: 'cutout', name: 'Cooktop/Hotplate Cutout', price: 150, priceType: 'fixed', description: 'Cutout for cooktop or hotplate' },
    { category: 'cutout', name: 'Basin Cutout', price: 95, priceType: 'fixed', description: 'Cutout for basin' },
    { category: 'cutout', name: 'Tap Hole', price: 35, priceType: 'fixed', description: 'Single tap hole' },
    { category: 'cutout', name: 'GPO/Powerpoint Cutout', price: 45, priceType: 'fixed', description: 'Cutout for electrical outlet' },
    { category: 'feature', name: 'Waterfall End', price: 350, priceType: 'fixed', description: 'Waterfall return on island end' },
    { category: 'feature', name: 'Splashback (per sqm)', price: 380, priceType: 'per_sqm', description: 'Matching stone splashback' },
    { category: 'feature', name: 'Undermount Sink Polish', price: 85, priceType: 'fixed', description: 'Polish undermount sink cutout' },
    { category: 'feature', name: 'Corner Join', price: 120, priceType: 'fixed', description: 'L-shaped corner join' },
    { category: 'feature', name: 'Radius Corner', price: 65, priceType: 'fixed', description: 'Rounded corner' },
  ];

  for (const pricing of featurePricing) {
    await prisma.featurePricing.upsert({
      where: { id: featurePricing.indexOf(pricing) + 1 },
      update: pricing,
      create: pricing,
    });
  }
  console.log('Created', featurePricing.length, 'feature pricing entries');

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

  for (const edgeType of edgeTypes) {
    await prisma.edgeType.upsert({ where: { name: edgeType.name }, update: edgeType, create: edgeType });
  }
  console.log('Created', edgeTypes.length, 'edge types');

  const cutoutTypes = [
    { name: 'Undermount Sink', description: 'Cutout for undermount sink', baseRate: 180, sortOrder: 1, isActive: true },
    { name: 'Drop-in Sink', description: 'Cutout for drop-in sink', baseRate: 120, sortOrder: 2, isActive: true },
    { name: 'Cooktop/Hotplate', description: 'Cutout for cooktop or hotplate', baseRate: 150, sortOrder: 3, isActive: true },
    { name: 'Basin', description: 'Cutout for basin', baseRate: 95, sortOrder: 4, isActive: true },
    { name: 'Tap Hole', description: 'Single tap hole', baseRate: 35, sortOrder: 5, isActive: true },
    { name: 'GPO/Powerpoint', description: 'Cutout for electrical outlet', baseRate: 45, sortOrder: 6, isActive: true },
  ];

  for (const cutoutType of cutoutTypes) {
    await prisma.cutoutType.upsert({ where: { name: cutoutType.name }, update: cutoutType, create: cutoutType });
  }
  console.log('Created', cutoutTypes.length, 'cutout types');

  const thicknessOptions = [
    { name: '20mm', value: 20, multiplier: 1.00, isDefault: true, sortOrder: 1, isActive: true },
    { name: '40mm', value: 40, multiplier: 1.30, isDefault: false, sortOrder: 2, isActive: true },
  ];

  for (const thickness of thicknessOptions) {
    await prisma.thicknessOption.upsert({ where: { name: thickness.name }, update: thickness, create: thickness });
  }
  console.log('Created', thicknessOptions.length, 'thickness options');

  const clientTypes = [
    { name: 'Cabinet Maker', description: 'Kitchen and joinery manufacturers', sortOrder: 1, isActive: true },
    { name: 'Builder', description: 'Residential and commercial builders', sortOrder: 2, isActive: true },
    { name: 'Direct Consumer', description: 'Homeowners and end consumers', sortOrder: 3, isActive: true },
    { name: 'Designer/Architect', description: 'Interior designers and architects', sortOrder: 4, isActive: true },
  ];

  for (const clientType of clientTypes) {
    await prisma.clientType.upsert({ where: { name: clientType.name }, update: clientType, create: clientType });
  }
  console.log('Created', clientTypes.length, 'client types');

  const clientTiers = [
    { name: 'Tier 1', description: 'Premium partners - best pricing', priority: 100, sortOrder: 1, isActive: true },
    { name: 'Tier 2', description: 'Regular clients - standard discounts', priority: 50, sortOrder: 2, isActive: true },
    { name: 'Tier 3', description: 'New clients - standard pricing', priority: 0, isDefault: true, sortOrder: 3, isActive: true },
  ];

  for (const tier of clientTiers) {
    await prisma.clientTier.upsert({ where: { name: tier.name }, update: tier, create: tier });
  }
  console.log('Created', clientTiers.length, 'client tiers');

  // Pricing rules
  const tier1 = await prisma.clientTier.findFirst({ where: { name: 'Tier 1' } });
  const tier2 = await prisma.clientTier.findFirst({ where: { name: 'Tier 2' } });
  const cabinetMaker = await prisma.clientType.findFirst({ where: { name: 'Cabinet Maker' } });
  const builder = await prisma.clientType.findFirst({ where: { name: 'Builder' } });

  if (tier1) {
    await prisma.pricingRule.upsert({ where: { id: 'rule-tier1-materials' }, update: {}, create: { id: 'rule-tier1-materials', name: 'Tier 1 - Material Discount', description: 'Premium partners receive 15% off all materials', priority: 100, clientTierId: tier1.id, adjustmentType: 'percentage', adjustmentValue: -15, appliesTo: 'materials', isActive: true } });
    await prisma.pricingRule.upsert({ where: { id: 'rule-tier1-edges' }, update: {}, create: { id: 'rule-tier1-edges', name: 'Tier 1 - Edge Discount', description: 'Premium partners receive 10% off edge polishing', priority: 100, clientTierId: tier1.id, adjustmentType: 'percentage', adjustmentValue: -10, appliesTo: 'edges', isActive: true } });
  }
  if (tier2) {
    await prisma.pricingRule.upsert({ where: { id: 'rule-tier2-materials' }, update: {}, create: { id: 'rule-tier2-materials', name: 'Tier 2 - Material Discount', description: 'Regular clients receive 10% off all materials', priority: 75, clientTierId: tier2.id, adjustmentType: 'percentage', adjustmentValue: -10, appliesTo: 'materials', isActive: true } });
  }
  if (cabinetMaker) {
    await prisma.pricingRule.upsert({ where: { id: 'rule-cabinetmaker-all' }, update: {}, create: { id: 'rule-cabinetmaker-all', name: 'Cabinet Maker Discount', description: 'Cabinet makers receive 5% trade discount', priority: 50, clientTypeId: cabinetMaker.id, adjustmentType: 'percentage', adjustmentValue: -5, appliesTo: 'all', isActive: true } });
  }
  if (builder) {
    await prisma.pricingRule.upsert({ where: { id: 'rule-builder-all' }, update: {}, create: { id: 'rule-builder-all', name: 'Builder Discount', description: 'Builders receive 5% trade discount', priority: 50, clientTypeId: builder.id, adjustmentType: 'percentage', adjustmentValue: -5, appliesTo: 'all', isActive: true } });
  }
  await prisma.pricingRule.upsert({ where: { id: 'rule-volume-10k' }, update: {}, create: { id: 'rule-volume-10k', name: 'Large Order Discount', description: 'Orders over $10,000 receive 3% discount', priority: 25, minQuoteValue: 10000, adjustmentType: 'percentage', adjustmentValue: -3, appliesTo: 'all', isActive: true } });
  console.log('Created pricing rules');

  await prisma.priceBook.upsert({ where: { name: 'Retail Price List' }, update: {}, create: { name: 'Retail Price List', description: 'Standard retail pricing - no discounts', category: 'retail', defaultThickness: 20, isDefault: true, isActive: true } });
  console.log('Created default price book');

  const customers = [
    { name: 'Gem Life', company: 'GemLife Highfields Heights', email: 'projects@gemlife.com.au', phone: '07 5555 1234', address: 'Highfields Heights, QLD' },
    { name: 'John Smith', company: 'Smith Building Co', email: 'john@smithbuilding.com.au', phone: '0412 345 678', address: '123 Main St, Brisbane QLD 4000' },
    { name: 'Sarah Johnson', company: null, email: 'sarah.j@email.com', phone: '0423 456 789', address: '45 Ocean View Dr, Sunshine Coast QLD 4556' },
  ];

  for (const cust of customers) {
    await prisma.customer.upsert({ where: { id: customers.indexOf(cust) + 1 }, update: cust, create: cust });
  }
  console.log('Created', customers.length, 'customers');

  // Company
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
  console.log('Created company');

  // Assign user to company - CRITICAL for login to work
  await prisma.user.update({
    where: { id: user.id },
    data: { companyId: company.id },
  });
  console.log('Assigned user to company');

  // Delivery zones
  const deliveryZones = [
    { name: 'Local', maxDistanceKm: 30, ratePerKm: 2.50, baseCharge: 50.00, companyId: company.id, isActive: true },
    { name: 'Regional', maxDistanceKm: 100, ratePerKm: 3.00, baseCharge: 75.00, companyId: company.id, isActive: true },
    { name: 'Remote', maxDistanceKm: 500, ratePerKm: 3.50, baseCharge: 100.00, companyId: company.id, isActive: true },
  ];

  for (const zone of deliveryZones) {
    await prisma.deliveryZone.upsert({ where: { companyId_name: { companyId: company.id, name: zone.name } }, update: zone, create: zone });
  }
  console.log('Created delivery zones');

  await prisma.templatingRate.upsert({ where: { id: 1 }, update: {}, create: { name: 'Standard Templating', baseCharge: 150.00, ratePerKm: 2.00, companyId: company.id, isActive: true } });

  const settings = [
    { key: 'quote_prefix', value: 'Q-' },
    { key: 'quote_validity_days', value: '30' },
    { key: 'deposit_percentage', value: '50' },
    { key: 'default_tax_rate', value: '10' },
  ];

  for (const setting of settings) {
    await prisma.setting.upsert({ where: { key: setting.key }, update: setting, create: setting });
  }
  console.log('Created settings');

  console.log('');
  console.log('Seeding complete!');
  console.log('Login: admin@northcoaststone.com.au / demo1234');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
