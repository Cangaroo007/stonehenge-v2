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
        abn: true,
        address: true,
        phone: true,
        fax: true,
        email: true,
        website: true,
        workshopAddress: true,
        logoUrl: true,
        logoStorageKey: true,
        primaryColor: true,
        quoteIntroText1: true,
        quoteIntroText2: true,
        quoteIntroText3: true,
        quotePleaseNote: true,
        quoteTermsText1: true,
        quoteTermsText2: true,
        quoteTermsText3: true,
        quoteTermsText4: true,
        quoteValidityDays: true,
        depositPercent: true,
        termsUrl: true,
        signatureName: true,
        signatureTitle: true,
        defaultTaxRate: true,
        currency: true,
        defaultUnitSystem: true,
        updatedAt: true,
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
        abn: body.abn,
        address: body.address,
        phone: body.phone,
        fax: body.fax,
        email: body.email,
        website: body.website,
        workshopAddress: body.workshopAddress,
        primaryColor: body.primaryColor,
        quoteIntroText1: body.quoteIntroText1,
        quoteIntroText2: body.quoteIntroText2,
        quoteIntroText3: body.quoteIntroText3,
        quotePleaseNote: body.quotePleaseNote,
        quoteTermsText1: body.quoteTermsText1,
        quoteTermsText2: body.quoteTermsText2,
        quoteTermsText3: body.quoteTermsText3,
        quoteTermsText4: body.quoteTermsText4,
        quoteValidityDays: body.quoteValidityDays,
        depositPercent: body.depositPercent,
        termsUrl: body.termsUrl,
        signatureName: body.signatureName,
        signatureTitle: body.signatureTitle,
        defaultUnitSystem: body.defaultUnitSystem,
      },
      select: {
        id: true,
        name: true,
        abn: true,
        address: true,
        phone: true,
        fax: true,
        email: true,
        website: true,
        workshopAddress: true,
        logoUrl: true,
        logoStorageKey: true,
        primaryColor: true,
        quoteIntroText1: true,
        quoteIntroText2: true,
        quoteIntroText3: true,
        quotePleaseNote: true,
        quoteTermsText1: true,
        quoteTermsText2: true,
        quoteTermsText3: true,
        quoteTermsText4: true,
        quoteValidityDays: true,
        depositPercent: true,
        termsUrl: true,
        signatureName: true,
        signatureTitle: true,
        defaultTaxRate: true,
        currency: true,
        defaultUnitSystem: true,
        updatedAt: true,
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
