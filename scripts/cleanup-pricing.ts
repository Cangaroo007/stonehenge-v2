/**
 * Cleanup script: Deactivate polishing service rates and duplicate cutouts
 *
 * Run: npx tsx scripts/cleanup-pricing.ts
 *
 * Polishing is bypassed in the pricing engine (hardcoded $0 since March 2026).
 * Having isActive: true on polishing rates causes confusion in the admin UI.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting pricing cleanup...\n');

  // 1. Deactivate polishing service rates (engine bypasses them anyway)
  console.log('=== DEACTIVATING POLISHING SERVICE RATES ===');
  const polishingRates = await prisma.service_rates.findMany({
    where: { serviceType: 'POLISHING', isActive: true },
    select: { id: true, name: true, fabricationCategory: true },
  });

  for (const sr of polishingRates) {
    await prisma.service_rates.update({
      where: { id: sr.id },
      data: { isActive: false, updated_at: new Date() },
    });
    console.log(`  Deactivated: ${sr.name} (${sr.fabricationCategory})`);
  }

  if (polishingRates.length === 0) {
    console.log('  Already all inactive.');
  }

  // 2. Deactivate "Cooktop / Hotplate" (ct-hotplate) — duplicate of "Cooktop Cutout" (ct-cooktop)
  console.log('\n=== DEACTIVATING DUPLICATE COOKTOP ENTRY ===');
  const ctHotplate = await prisma.cutout_types.findUnique({
    where: { id: 'ct-hotplate' },
    select: { name: true, isActive: true },
  });
  if (ctHotplate && ctHotplate.isActive) {
    await prisma.cutout_types.update({
      where: { id: 'ct-hotplate' },
      data: { isActive: false },
    });
    console.log(`  Deactivated: "${ctHotplate.name}" (ct-hotplate) — use "Cooktop Cutout" (ct-cooktop) instead`);
  } else if (ctHotplate) {
    console.log(`  Already inactive: "${ctHotplate.name}"`);
  } else {
    console.log('  ct-hotplate not found');
  }

  // 3. Summary
  console.log('\n=== ACTIVE COUNTS ===');
  const activeEdges = await prisma.edge_types.count({ where: { isActive: true } });
  const activeCutouts = await prisma.cutout_types.count({ where: { isActive: true } });
  const activeServices = await prisma.service_rates.count({ where: { isActive: true } });
  console.log(`  Edge types: ${activeEdges} active`);
  console.log(`  Cutout types: ${activeCutouts} active`);
  console.log(`  Service rates: ${activeServices} active`);

  console.log('\nDone!');
}

main()
  .catch((e) => { console.error('ERROR:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
