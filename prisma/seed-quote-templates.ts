import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const NORTHCOAST_TEMPLATE_ID = 'northcoast-default-quote-template';

const TERMS_AND_CONDITIONS = `1. A 50% deposit is required upon acceptance of this quotation.
2. Balance payment is due upon completion of installation.
3. Estimated lead time is 2–3 weeks from deposit and template/measure.
4. Colours and patterns in natural and engineered stone may vary from samples displayed. Variation in veining, colour, and pattern is inherent to the product and is not considered a defect.
5. This quotation is based on measurements provided or estimated. Final pricing may vary following on-site template/measure.
6. Any additional works or variations requested after acceptance will be quoted separately.
7. Northcoast Stone Pty Ltd is not responsible for plumbing, electrical, or carpentry works unless explicitly included.
8. All materials remain the property of Northcoast Stone Pty Ltd until full payment is received.`;

export async function seedQuoteTemplates() {
  // Verify company exists
  const company = await prisma.companies.findUnique({ where: { id: 1 } });
  if (!company) {
    console.warn('Company id=1 not found — skipping quote template seeding');
    return;
  }

  // Upsert by known ID for idempotency
  await prisma.quote_templates.upsert({
    where: { id: NORTHCOAST_TEMPLATE_ID },
    create: {
      id: NORTHCOAST_TEMPLATE_ID,
      company_id: 1,
      name: 'Northcoast Stone — Default',
      is_default: true,

      // Header
      company_name: 'Northcoast Stone Pty Ltd',
      company_abn: null,
      company_phone: null,
      company_email: null,
      company_address: null,
      logo_url: null,

      // Display settings — Northcoast shows room totals, hides internal breakdown
      show_piece_breakdown: true,
      show_edge_details: true,
      show_cutout_details: true,
      show_material_per_piece: false,
      show_room_totals: true,
      show_itemised_breakdown: false,
      show_slab_count: false,
      show_piece_descriptions: true,

      // Pricing — room total mode, GST at 10%
      pricing_mode: 'room_total',
      show_gst: true,
      gst_label: 'GST (10%)',
      currency_symbol: '$',

      // Footer
      terms_and_conditions: TERMS_AND_CONDITIONS,
      validity_days: 30,
      footer_text: null,
    },
    update: {
      name: 'Northcoast Stone — Default',
      is_default: true,
      company_name: 'Northcoast Stone Pty Ltd',
      show_room_totals: true,
      show_itemised_breakdown: false,
      pricing_mode: 'room_total',
      show_gst: true,
      gst_label: 'GST (10%)',
      currency_symbol: '$',
      terms_and_conditions: TERMS_AND_CONDITIONS,
      validity_days: 30,
    },
  });

  console.log('✅ Quote templates: 1 row (Northcoast default)');

  // Seed additional format-typed templates (PDF1c)
  await seedFormatTemplates(company.id);
}

// ── PDF1c: Format-typed templates (Builder Detail + Client Summary) ──────────

const COMPREHENSIVE_SECTIONS = {
  coverPage: true,
  companyLogo: true,
  customerDetails: true,
  projectReference: true,
  introductionText: true,
  roomBreakdown: true,
  pieceDetails: true,
  pieceDimensions: true,
  edgeProfiles: true,
  cutoutDetails: true,
  perPiecePricing: false,
  roomSubtotals: true,
  fabricationBreakdown: true,
  materialCosts: true,
  materialNames: true,
  deliveryLine: true,
  installationLine: true,
  templatingLine: false,
  slabSummary: false,
  machineOperations: false,
  subtotalExGst: true,
  gstLine: true,
  grandTotal: true,
  volumeDiscount: true,
  termsAndConditions: true,
  validityPeriod: true,
  signatureBlock: true,
  depositRequirement: true,
};

const SUMMARY_SECTIONS = {
  ...COMPREHENSIVE_SECTIONS,
  pieceDetails: false,
  pieceDimensions: false,
  edgeProfiles: false,
  cutoutDetails: false,
  perPiecePricing: false,
  fabricationBreakdown: false,
  slabSummary: false,
  machineOperations: false,
};

async function seedFormatTemplates(companyId: number) {
  // Builder Detail (COMPREHENSIVE)
  const existingBuilder = await prisma.quote_templates.findFirst({
    where: { company_id: companyId, name: 'Builder Detail' },
  });

  if (!existingBuilder) {
    await prisma.quote_templates.create({
      data: {
        company_id: companyId,
        name: 'Builder Detail',
        description: 'Comprehensive quote with full piece breakdown, dimensions, and cost details',
        format_type: 'COMPREHENSIVE',
        is_default: false,
        is_active: true,
        sections_config: COMPREHENSIVE_SECTIONS,
        show_logo: true,
      },
    });
    console.log('  ✅ Created: Builder Detail (COMPREHENSIVE)');
  } else {
    console.log('  ⏭  Exists: Builder Detail — skipping');
  }

  // Client Summary (SUMMARY)
  const existingSummary = await prisma.quote_templates.findFirst({
    where: { company_id: companyId, name: 'Client Summary' },
  });

  if (!existingSummary) {
    await prisma.quote_templates.create({
      data: {
        company_id: companyId,
        name: 'Client Summary',
        description: 'Clean summary with room totals and material names — no technical details',
        format_type: 'SUMMARY',
        is_default: false,
        is_active: true,
        sections_config: SUMMARY_SECTIONS,
        show_logo: true,
      },
    });
    console.log('  ✅ Created: Client Summary (SUMMARY)');
  } else {
    console.log('  ⏭  Exists: Client Summary — skipping');
  }
}

async function main() {
  await seedQuoteTemplates();
}

if (require.main === module) {
  main()
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error(e);
      prisma.$disconnect();
      process.exit(1);
    });
}
