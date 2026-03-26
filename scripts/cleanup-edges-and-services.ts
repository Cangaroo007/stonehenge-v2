/**
 * cleanup-edges-and-services.ts
 *
 * Populates ALL edge rates from northcoast_pricing_rates_v2.xlsx (Jay's rate card):
 *   - Arris + Pencil Round → Ogee rates (per Sean's instruction)
 *   - Beveled → exact spreadsheet values
 *   - Mitered → exact spreadsheet values
 * Deactivates: Mitred Panel, Bullnose, Ogee, Square/Eased, Waterfall, Curved Finished Edge
 *
 * Run: npx tsx scripts/cleanup-edges-and-services.ts
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ──────────────────────────────────────────────
// All rates from northcoast_pricing_rates_v2.xlsx → Edge Profiles sheet
// SINT 40mm = same as N.PRM 40mm (per spreadsheet note)
// ──────────────────────────────────────────────

const EDGE_RATES: Record<string, Record<string, { rate20mm: number; rate40mm: number }>> = {
  // Arris → Ogee rates (Sean: "make Arris and Pencil Round the same prices as Ogee")
  'Arris': {
    ENGINEERED:      { rate20mm: 25,   rate40mm: 25 },
    NATURAL_HARD:    { rate20mm: 30,   rate40mm: 30 },
    NATURAL_SOFT:    { rate20mm: 27,   rate40mm: 27 },
    NATURAL_PREMIUM: { rate20mm: 40,   rate40mm: 40 },
    SINTERED:        { rate20mm: 35,   rate40mm: 40 },   // 40mm = N.PRM
  },
  // Pencil Round → Ogee rates (same as Arris)
  'Pencil Round': {
    ENGINEERED:      { rate20mm: 25,   rate40mm: 25 },
    NATURAL_HARD:    { rate20mm: 30,   rate40mm: 30 },
    NATURAL_SOFT:    { rate20mm: 27,   rate40mm: 27 },
    NATURAL_PREMIUM: { rate20mm: 40,   rate40mm: 40 },
    SINTERED:        { rate20mm: 35,   rate40mm: 40 },
  },
  // Beveled — exact from spreadsheet
  'Beveled': {
    ENGINEERED:      { rate20mm: 5,    rate40mm: 5 },
    NATURAL_HARD:    { rate20mm: 5.75, rate40mm: 5.75 },
    NATURAL_SOFT:    { rate20mm: 5.50, rate40mm: 5.50 },
    NATURAL_PREMIUM: { rate20mm: 7.50, rate40mm: 7.50 },
    SINTERED:        { rate20mm: 7.00, rate40mm: 7.50 },  // 40mm = N.PRM
  },
  // Mitered — exact from spreadsheet
  'Mitered': {
    ENGINEERED:      { rate20mm: 40,   rate40mm: 40 },
    NATURAL_HARD:    { rate20mm: 46,   rate40mm: 46 },
    NATURAL_SOFT:    { rate20mm: 44,   rate40mm: 44 },
    NATURAL_PREMIUM: { rate20mm: 60,   rate40mm: 60 },
    SINTERED:        { rate20mm: 56,   rate40mm: 60 },    // 40mm = N.PRM
  },
};

// Edge types to deactivate (not in Jay's limited rate card)
const DEACTIVATE_NAMES = [
  'Mitred Panel',
  'Bullnose',
  'Ogee',
  'Square/Eased',
  'Waterfall',
  'Curved Finished Edge',
];

async function main() {
  console.log('Starting edge cleanup + full rate population...\n');

  // 1. Find all edge types
  const allEdges = await prisma.edge_types.findMany({
    select: { id: true, name: true, isActive: true },
  });
  console.log(`Found ${allEdges.length} edge types total\n`);

  // 2. Populate ALL rates for the 4 active edge types
  console.log('=== POPULATING ALL EDGE RATES FROM RATE CARD ===');
  for (const [edgeName, categories] of Object.entries(EDGE_RATES)) {
    const edge = allEdges.find((e: any) => e.name === edgeName);
    if (!edge) {
      console.log(`  ⚠ "${edgeName}" not found in DB — skipping`);
      continue;
    }

    let updated = 0;
    for (const [category, rates] of Object.entries(categories)) {
      await prisma.edge_type_category_rates.upsert({
        where: {
          edgeTypeId_fabricationCategory_pricingSettingsId: {
            edgeTypeId: edge.id,
            fabricationCategory: category,
            pricingSettingsId: 'ps-org-1',
          },
        },
        update: {
          rate20mm: rates.rate20mm,
          rate40mm: rates.rate40mm,
        },
        create: {
          edgeTypeId: edge.id,
          fabricationCategory: category,
          pricingSettingsId: 'ps-org-1',
          rate20mm: rates.rate20mm,
          rate40mm: rates.rate40mm,
        },
      });
      updated++;
    }
    console.log(`  ✓ ${edgeName}: ${updated} categories populated`);
    for (const [cat, rates] of Object.entries(categories)) {
      const label = { ENGINEERED: 'Zero Silica', NATURAL_HARD: 'Granite', NATURAL_SOFT: 'Marble', NATURAL_PREMIUM: 'Quartzite', SINTERED: 'Porcelain' }[cat] || cat;
      console.log(`      ${label}: $${rates.rate20mm}/$${rates.rate40mm}`);
    }
  }

  // 3. Deactivate edge types not in Jay's rate card
  console.log('\n=== DEACTIVATING STALE EDGE TYPES ===');
  for (const name of DEACTIVATE_NAMES) {
    const edge = allEdges.find((e: any) => e.name === name);
    if (!edge) {
      console.log(`  ⚠ "${name}" not found — skipping`);
      continue;
    }
    if (!edge.isActive) {
      console.log(`  - "${name}" already inactive`);
      continue;
    }
    await prisma.edge_types.update({
      where: { id: edge.id },
      data: { isActive: false },
    });
    console.log(`  ✓ Deactivated: ${name}`);
  }

  // 4. Deactivate POLISHING, CURVED_POLISHING, and WATERFALL_END service rates
  console.log('\n=== DEACTIVATING SERVICE RATES ===');
  const SERVICE_TYPES_TO_DEACTIVATE = ['POLISHING', 'CURVED_POLISHING', 'WATERFALL_END'];
  for (const serviceType of SERVICE_TYPES_TO_DEACTIVATE) {
    const result = await prisma.service_rates.updateMany({
      where: { serviceType, isActive: true },
      data: { isActive: false },
    });
    if (result.count > 0) {
      console.log(`  ✓ Deactivated ${result.count} ${serviceType} rate(s)`);
    } else {
      console.log(`  - ${serviceType} already inactive (or not found)`);
    }
  }

  // 6. Summary
  const activeEdges = await prisma.edge_types.findMany({
    where: { isActive: true },
    select: { name: true },
    orderBy: { name: 'asc' },
  });
  console.log(`\n=== REMAINING ACTIVE EDGE TYPES (${activeEdges.length}) ===`);
  for (const e of activeEdges) {
    console.log(`  • ${e.name}`);
  }

  // 7. Verify all rates populated
  console.log('\n=== VERIFY: All active edge rates ===');
  for (const e of activeEdges) {
    const edge = allEdges.find((a: any) => a.name === e.name);
    if (!edge) continue;
    const rates = await prisma.edge_type_category_rates.findMany({
      where: { edgeTypeId: edge.id },
      select: { fabricationCategory: true, rate20mm: true, rate40mm: true },
      orderBy: { fabricationCategory: 'asc' },
    });
    console.log(`\n  ${e.name}:`);
    for (const r of rates) {
      const label = { ENGINEERED: 'Zero Silica', NATURAL_HARD: 'Granite', NATURAL_SOFT: 'Marble', NATURAL_PREMIUM: 'Quartzite', SINTERED: 'Porcelain' }[r.fabricationCategory] || r.fabricationCategory;
      console.log(`    ${label}: $${Number(r.rate20mm)}/$${Number(r.rate40mm)}`);
    }
  }

  console.log('\nDone!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
