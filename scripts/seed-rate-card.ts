/**
 * Seed script: Populate DB with Jay's rate card data (March 2026)
 *
 * Run from repo root:
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/seed-rate-card.ts
 *
 * Or via node after build:
 *   npx tsx scripts/seed-rate-card.ts
 *
 * This script:
 * 1. Upserts edge_type_category_rates for Arris, Pencil Round, Mitred Panel
 * 2. Upserts cutout_category_rates for 9 cutout types
 * 3. Updates service_rates with per-category 20mm/40mm rates
 * 4. Deactivates duplicate/obsolete cutout types
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PRICING_SETTINGS_ID = 'ps-org-1';

const CATEGORIES = ['ENGINEERED', 'NATURAL_HARD', 'NATURAL_SOFT', 'NATURAL_PREMIUM', 'SINTERED'] as const;

// ─── EDGE TYPE RATES (from Jay's rate card) ───────────────────────────
// Rates are total $/Lm — no separate polishing charge
const EDGE_RATES: Record<string, Record<string, { rate20mm: number; rate40mm: number }>> = {
  'cmlar3etm0002znat72h7jnx0': { // Arris
    ENGINEERED:      { rate20mm: 30, rate40mm: 48 },
    NATURAL_HARD:    { rate20mm: 35, rate40mm: 55 },
    NATURAL_SOFT:    { rate20mm: 33, rate40mm: 52 },
    NATURAL_PREMIUM: { rate20mm: 40, rate40mm: 65 },
    SINTERED:        { rate20mm: 38, rate40mm: 60 },
  },
  'cmlar3etc0000znatkbilb48y': { // Pencil Round
    ENGINEERED:      { rate20mm: 45, rate40mm: 72 },
    NATURAL_HARD:    { rate20mm: 50, rate40mm: 80 },
    NATURAL_SOFT:    { rate20mm: 48, rate40mm: 77 },
    NATURAL_PREMIUM: { rate20mm: 60, rate40mm: 95 },
    SINTERED:        { rate20mm: 55, rate40mm: 88 },
  },
  'cmlar3etp0003znat3ru2w1hc': { // Mitred Panel
    ENGINEERED:      { rate20mm: 52, rate40mm: 85 },
    NATURAL_HARD:    { rate20mm: 58, rate40mm: 95 },
    NATURAL_SOFT:    { rate20mm: 56, rate40mm: 90 },
    NATURAL_PREMIUM: { rate20mm: 70, rate40mm: 115 },
    SINTERED:        { rate20mm: 64, rate40mm: 105 },
  },
};

// ─── CUTOUT RATES (from Jay's rate card) ──────────────────────────────
// Single rate per category ($/each)
const CUTOUT_RATES: Record<string, Record<string, number>> = {
  'ct-cooktop': { // Cooktop Cutout
    ENGINEERED: 65, NATURAL_HARD: 75, NATURAL_SOFT: 72, NATURAL_PREMIUM: 88, SINTERED: 80,
  },
  'ct-flush-cooktop': { // Flush Mount Cooktop
    ENGINEERED: 450, NATURAL_HARD: 500, NATURAL_SOFT: 485, NATURAL_PREMIUM: 608, SINTERED: 555,
  },
  'cmlbfxugk0008fonb7q8pk8qd': { // Undermount Sink
    ENGINEERED: 300, NATURAL_HARD: 335, NATURAL_SOFT: 325, NATURAL_PREMIUM: 405, SINTERED: 370,
  },
  'cmlbfxuvb0009fonblvzxxyyb': { // Drop-in Sink
    ENGINEERED: 55, NATURAL_HARD: 62, NATURAL_SOFT: 60, NATURAL_PREMIUM: 75, SINTERED: 68,
  },
  'ct-basin': { // Basin (Undermount)
    ENGINEERED: 90, NATURAL_HARD: 100, NATURAL_SOFT: 97, NATURAL_PREMIUM: 122, SINTERED: 110,
  },
  'ct-tap-hole': { // Tap Hole
    ENGINEERED: 25, NATURAL_HARD: 28, NATURAL_SOFT: 27, NATURAL_PREMIUM: 34, SINTERED: 30,
  },
  'ct-gpo': { // GPO / Powerpoint
    ENGINEERED: 25, NATURAL_HARD: 28, NATURAL_SOFT: 27, NATURAL_PREMIUM: 34, SINTERED: 30,
  },
  'ct-powerpoint': { // Powerpoint Cutout (same rates as GPO)
    ENGINEERED: 25, NATURAL_HARD: 28, NATURAL_SOFT: 27, NATURAL_PREMIUM: 34, SINTERED: 30,
  },
  'ct-drainer-grooves': { // Drainer Grooves (per set)
    ENGINEERED: 150, NATURAL_HARD: 168, NATURAL_SOFT: 162, NATURAL_PREMIUM: 203, SINTERED: 185,
  },
};

// ─── SERVICE RATES (from Jay's rate card) ─────────────────────────────
// Keyed by service_rate ID
const SERVICE_RATE_UPDATES: Record<string, { rate20mm: number; rate40mm: number }> = {
  // Cutting
  'sr-cutting':                  { rate20mm: 17.50, rate40mm: 45 },
  'sr-cutting-natural_hard':     { rate20mm: 21,    rate40mm: 54 },
  'sr-cutting-natural_soft':     { rate20mm: 19,    rate40mm: 49 },
  'sr-cutting-natural_premium':  { rate20mm: 28,    rate40mm: 72 },
  'sr-cutting-sintered':         { rate20mm: 25,    rate40mm: 63 },
  // Installation
  'sr-installation':                 { rate20mm: 140, rate40mm: 170 },
  'sr-installation-natural_hard':    { rate20mm: 165, rate40mm: 198 },
  'sr-installation-natural_soft':    { rate20mm: 155, rate40mm: 186 },
  'sr-installation-natural_premium': { rate20mm: 200, rate40mm: 240 },
  'sr-installation-sintered':        { rate20mm: 185, rate40mm: 222 },
  // Waterfall End
  'sr-waterfall-end':                    { rate20mm: 300, rate40mm: 650 },
  'sr-waterfall_end-natural_hard':       { rate20mm: 360, rate40mm: 780 },
  'sr-waterfall_end-natural_soft':       { rate20mm: 330, rate40mm: 715 },
  'sr-waterfall_end-natural_premium':    { rate20mm: 440, rate40mm: 955 },
  'sr-waterfall_end-sintered':           { rate20mm: 400, rate40mm: 870 },
  // Join Fabrication (same 20mm and 40mm per rate card)
  '52a6b6db-bb36-427e-a03d-4e24da8486d2': { rate20mm: 80,  rate40mm: 80 },
  'sr-join-natural_hard':                  { rate20mm: 96,  rate40mm: 96 },
  'sr-join-natural_soft':                  { rate20mm: 88,  rate40mm: 88 },
  'sr-join-natural_premium':               { rate20mm: 115, rate40mm: 115 },
  'sr-join-sintered':                      { rate20mm: 105, rate40mm: 105 },
  // Templating (flat rate regardless of category)
  'sr-templating':                 { rate20mm: 180, rate40mm: 180 },
  'sr-templating-natural_hard':    { rate20mm: 180, rate40mm: 180 },
  'sr-templating-natural_soft':    { rate20mm: 180, rate40mm: 180 },
  'sr-templating-natural_premium': { rate20mm: 180, rate40mm: 180 },
  'sr-templating-sintered':        { rate20mm: 180, rate40mm: 180 },
  // Delivery (flat rate regardless of category)
  'sr-delivery':                 { rate20mm: 150, rate40mm: 150 },
  'sr-delivery-natural_hard':    { rate20mm: 150, rate40mm: 150 },
  'sr-delivery-natural_soft':    { rate20mm: 150, rate40mm: 150 },
  'sr-delivery-natural_premium': { rate20mm: 150, rate40mm: 150 },
  'sr-delivery-sintered':        { rate20mm: 150, rate40mm: 150 },
};

// ─── DUPLICATE CUTOUT IDs TO DEACTIVATE ───────────────────────────────
const DEACTIVATE_CUTOUT_IDS = [
  'b8f1f3db-2207-41b5-9aa6-4c93716531ff', // "Cooktop/Hot plate" (duplicate)
  'cmlbfxv2v000afonbrq9gv4yq',             // "Cooktop/Hotplate" (duplicate)
  'cmlbfxvak000bfonb5zcg38n3',             // " Drop in Basin" (leading space, duplicate)
  'cmlbfxvhv000cfonb4ha1bujt',             // "Drop in Basin" (duplicate)
  'c1ba5fbc-f5c7-4649-bcc8-484d6182b3ba', // "Drop-in Sink " (trailing space, duplicate)
  'cmlbfxvpa000dfonbue8gw0k3',             // "GPO/Powerpoint" (duplicate of ct-gpo)
];

async function main() {
  console.log('Starting rate card seed...\n');

  // 1. Upsert edge type category rates
  console.log('=== EDGE TYPE CATEGORY RATES ===');
  for (const [edgeTypeId, categories] of Object.entries(EDGE_RATES)) {
    const edgeType = await prisma.edge_types.findUnique({ where: { id: edgeTypeId }, select: { name: true } });
    console.log(`  ${edgeType?.name} (${edgeTypeId}):`);

    for (const [category, rates] of Object.entries(categories)) {
      await prisma.edge_type_category_rates.upsert({
        where: {
          edgeTypeId_fabricationCategory_pricingSettingsId: {
            edgeTypeId,
            fabricationCategory: category,
            pricingSettingsId: PRICING_SETTINGS_ID,
          },
        },
        update: { rate20mm: rates.rate20mm, rate40mm: rates.rate40mm },
        create: {
          edgeTypeId,
          fabricationCategory: category as any,
          rate20mm: rates.rate20mm,
          rate40mm: rates.rate40mm,
          pricingSettingsId: PRICING_SETTINGS_ID,
        },
      });
      console.log(`    ${category}: 20mm=$${rates.rate20mm}, 40mm=$${rates.rate40mm}`);
    }
  }

  // 2. Upsert cutout category rates
  console.log('\n=== CUTOUT CATEGORY RATES ===');
  for (const [cutoutTypeId, categories] of Object.entries(CUTOUT_RATES)) {
    const cutoutType = await prisma.cutout_types.findUnique({ where: { id: cutoutTypeId }, select: { name: true } });
    console.log(`  ${cutoutType?.name} (${cutoutTypeId}):`);

    for (const [category, rate] of Object.entries(categories)) {
      await prisma.cutout_category_rates.upsert({
        where: {
          cutoutTypeId_fabricationCategory_pricingSettingsId: {
            cutoutTypeId,
            fabricationCategory: category,
            pricingSettingsId: PRICING_SETTINGS_ID,
          },
        },
        update: { rate },
        create: {
          cutoutTypeId,
          fabricationCategory: category as any,
          rate,
          pricingSettingsId: PRICING_SETTINGS_ID,
        },
      });
      console.log(`    ${category}: $${rate}`);
    }
  }

  // 3. Update service rates
  console.log('\n=== SERVICE RATES ===');
  for (const [id, rates] of Object.entries(SERVICE_RATE_UPDATES)) {
    const existing = await prisma.service_rates.findUnique({ where: { id }, select: { name: true, serviceType: true, fabricationCategory: true } });
    if (!existing) {
      console.log(`  SKIP: ${id} not found in DB`);
      continue;
    }
    await prisma.service_rates.update({
      where: { id },
      data: { rate20mm: rates.rate20mm, rate40mm: rates.rate40mm, updated_at: new Date() },
    });
    console.log(`  ${existing.name} (${existing.fabricationCategory}): 20mm=$${rates.rate20mm}, 40mm=$${rates.rate40mm}`);
  }

  // 4. Deactivate duplicate cutout types
  console.log('\n=== DEACTIVATING DUPLICATE CUTOUTS ===');
  for (const id of DEACTIVATE_CUTOUT_IDS) {
    const ct = await prisma.cutout_types.findUnique({ where: { id }, select: { name: true, isActive: true } });
    if (!ct) continue;
    if (!ct.isActive) {
      console.log(`  Already inactive: "${ct.name}" (${id})`);
      continue;
    }
    await prisma.cutout_types.update({ where: { id }, data: { isActive: false } });
    console.log(`  Deactivated: "${ct.name}" (${id})`);
  }

  console.log('\nDone! Rate card data seeded successfully.');
}

main()
  .catch((e) => { console.error('ERROR:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
