import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/company/settings - Fetch company settings
export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the first company (single-tenant for now)
    const company = await prisma.companies.findFirst({
      select: {
        id: true,
        name: true,
        website: true,
        logo_storage_key: true,
        primary_color: true,
        quote_intro_text_1: true,
        quote_intro_text_2: true,
        quote_intro_text_3: true,
        quote_please_note: true,
        quote_terms_text_1: true,
        quote_terms_text_2: true,
        quote_terms_text_3: true,
        quote_terms_text_4: true,
        quote_validity_days: true,
        deposit_percent: true,
        terms_url: true,
        signature_name: true,
        signature_title: true,
        default_unit_system: true,
        updated_at: true,
      },
    });

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    return NextResponse.json(company);
  } catch (error) {
    console.error('Error fetching company settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch company settings' },
      { status: 500 }
    );
  }
}

// PUT /api/company/settings - Update company settings
export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has permission (ADMIN or MANAGE_SETTINGS)
    // For now, we'll allow all authenticated users
    // TODO: Add proper permission checking

    const body = await request.json();

    // Get the first company
    const company = await prisma.companies.findFirst();

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Update company settings
    const updatedCompany = await prisma.companies.update({
      where: { id: company.id },
      data: {
        name: body.name,
        website: body.website,
        primary_color: body.primary_color ?? body.primaryColor,
        quote_intro_text_1: body.quote_intro_text_1 ?? body.quoteIntroText1,
        quote_intro_text_2: body.quote_intro_text_2 ?? body.quoteIntroText2,
        quote_intro_text_3: body.quote_intro_text_3 ?? body.quoteIntroText3,
        quote_please_note: body.quote_please_note ?? body.quotePleaseNote,
        quote_terms_text_1: body.quote_terms_text_1 ?? body.quoteTermsText1,
        quote_terms_text_2: body.quote_terms_text_2 ?? body.quoteTermsText2,
        quote_terms_text_3: body.quote_terms_text_3 ?? body.quoteTermsText3,
        quote_terms_text_4: body.quote_terms_text_4 ?? body.quoteTermsText4,
        quote_validity_days: body.quote_validity_days ?? body.quoteValidityDays,
        deposit_percent: body.deposit_percent ?? body.depositPercent,
        terms_url: body.terms_url ?? body.termsUrl,
        signature_name: body.signature_name ?? body.signatureName,
        signature_title: body.signature_title ?? body.signatureTitle,
        default_unit_system: body.default_unit_system ?? body.defaultUnitSystem,
      },
      select: {
        id: true,
        name: true,
        website: true,
        logo_storage_key: true,
        primary_color: true,
        quote_intro_text_1: true,
        quote_intro_text_2: true,
        quote_intro_text_3: true,
        quote_please_note: true,
        quote_terms_text_1: true,
        quote_terms_text_2: true,
        quote_terms_text_3: true,
        quote_terms_text_4: true,
        quote_validity_days: true,
        deposit_percent: true,
        terms_url: true,
        signature_name: true,
        signature_title: true,
        default_unit_system: true,
        updated_at: true,
      },
    });

    return NextResponse.json(updatedCompany);
  } catch (error) {
    console.error('Error updating company settings:', error);
    return NextResponse.json(
      { error: 'Failed to update company settings' },
      { status: 500 }
    );
  }
}
