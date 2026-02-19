/**
 * Emergency backfill: pricing_settings organisation_id
 *
 * Root cause: Seed data created pricing_settings with organisation_id = '1'
 * or 'default-org'. The pricing calculator (pricing-calculator-v2.ts) constructs
 * organisationId = 'company-${quote.company_id}' (e.g. 'company-1').
 *
 * If the migration 20260303000000_add_company_id_to_core_tables hasn't been
 * applied, or if seed was re-run after migration, the organisation_id is '1'
 * while the code expects 'company-1' — causing "Pricing settings not configured"
 * errors on every quote.
 *
 * This script:
 * 1. Finds all companies
 * 2. For each company, ensures pricing_settings exists with organisation_id = 'company-{id}'
 * 3. Updates legacy organisation_id values ('1', 'default-org') to the correct pattern
 * 4. Re-links service_rates and cutout_rates to the correct pricing_settings record
 *
 * Usage: npx tsx prisma/fix-pricing-settings-company.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Emergency Pricing Settings Backfill ===\n');

  // 1. Find all companies
  const companies = await prisma.companies.findMany({
    orderBy: { id: 'asc' },
  });

  if (companies.length === 0) {
    console.error('No companies found in database');
    process.exit(1);
  }

  console.log(`Found ${companies.length} company/companies:`);
  for (const c of companies) {
    console.log(`  - ${c.name} (ID: ${c.id})`);
  }
  console.log();

  // 2. Find all existing pricing_settings records
  const allSettings = await prisma.pricing_settings.findMany();
  console.log(`Found ${allSettings.length} pricing_settings record(s):`);
  for (const s of allSettings) {
    console.log(`  - id=${s.id}, organisation_id='${s.organisation_id}'`);
  }
  console.log();

  // 3. For each company, ensure pricing_settings with correct organisation_id
  for (const company of companies) {
    const correctOrgId = `company-${company.id}`;

    // Check if correct record already exists
    const existing = await prisma.pricing_settings.findUnique({
      where: { organisation_id: correctOrgId },
    });

    if (existing) {
      console.log(`Company ${company.id} (${company.name}): pricing_settings already correct (organisation_id='${correctOrgId}')`);
      continue;
    }

    // Try to find a legacy record to update
    // Priority: exact company id string, then 'default-org', then any first record
    const legacyPatterns = [
      String(company.id),     // e.g. '1'
      'default-org',
      `org-${company.id}`,
    ];

    let updated = false;
    for (const legacy of legacyPatterns) {
      const legacyRecord = await prisma.pricing_settings.findUnique({
        where: { organisation_id: legacy },
      });

      if (legacyRecord) {
        await prisma.pricing_settings.update({
          where: { id: legacyRecord.id },
          data: {
            organisation_id: correctOrgId,
            updated_at: new Date(),
          },
        });
        console.log(`Company ${company.id} (${company.name}): updated organisation_id '${legacy}' -> '${correctOrgId}'`);
        updated = true;
        break;
      }
    }

    if (!updated) {
      // No existing record found — check if there's any unassigned record
      const unassigned = await prisma.pricing_settings.findFirst({
        where: {
          NOT: {
            organisation_id: { startsWith: 'company-' },
          },
        },
      });

      if (unassigned) {
        await prisma.pricing_settings.update({
          where: { id: unassigned.id },
          data: {
            organisation_id: correctOrgId,
            updated_at: new Date(),
          },
        });
        console.log(`Company ${company.id} (${company.name}): updated unassigned record '${unassigned.organisation_id}' -> '${correctOrgId}'`);
      } else {
        console.warn(`Company ${company.id} (${company.name}): no pricing_settings record found to update. Admin must configure via Pricing Admin.`);
      }
    }
  }

  console.log();

  // 4. Verify final state
  const finalSettings = await prisma.pricing_settings.findMany();
  console.log('=== Final State ===');
  for (const s of finalSettings) {
    console.log(`  - id=${s.id}, organisation_id='${s.organisation_id}'`);
  }

  // 5. Verify for company 1 specifically (most common case)
  const company1Settings = await prisma.pricing_settings.findUnique({
    where: { organisation_id: 'company-1' },
  });

  if (company1Settings) {
    console.log('\nVerification: pricing_settings for company-1 found');

    const serviceRateCount = await prisma.service_rates.count({
      where: { pricing_settings_id: company1Settings.id },
    });
    console.log(`  Service rates linked: ${serviceRateCount}`);

    const cutoutRateCount = await prisma.cutout_rates.count({
      where: { pricing_settings_id: company1Settings.id },
    });
    console.log(`  Cutout rates linked: ${cutoutRateCount}`);
  } else {
    console.error('\nVerification FAILED: no pricing_settings for company-1');
  }

  console.log('\nBackfill complete.');
}

main()
  .catch((e) => {
    console.error('Backfill failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
