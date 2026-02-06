/**
 * Data Migration Script: Seed Company Settings from Environment Variables
 * 
 * Run this script to populate the company table with default values from .env
 * 
 * Usage:
 *   npx tsx prisma/seed-company-settings.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting company settings migration...');

  // Check if company already exists
  const existingCompany = await prisma.company.findFirst();

  if (existingCompany) {
    console.log('✅ Company already exists (ID:', existingCompany.id, ')');
    console.log('📝 Updating with default text values if missing...');

    // Update only the new text fields if they're null
    const updated = await prisma.company.update({
      where: { id: existingCompany.id },
      data: {
        // Update website if not set
        website: existingCompany.website || null,
        
        // Set signature name from env or default
        signatureName: existingCompany.signatureName || process.env.SIGNATURE_NAME || 'Beau Kavanagh',
        
        // Default quote intro text (only if null)
        quoteIntroText1: existingCompany.quoteIntroText1 || 'Please see below for our price breakdown for your quotation as per the plans supplied. Any differences in stonework at measure and fabrication stage will be charged accordingly.',
        quoteIntroText2: existingCompany.quoteIntroText2 || 'This quote is for supply, fabrication and local installation of stonework.',
        quoteIntroText3: existingCompany.quoteIntroText3 || 'Thank you for the opportunity in submitting this quotation. We look forward to working with you.',
        
        // Default please note text
        quotePleaseNote: existingCompany.quotePleaseNote || 'This Quote is based on the proviso that all stonework is the same colour and fabricated and installed at the same time. Any variation from this assumption will require re-quoting.',
        
        // Default terms text
        quoteTermsText1: existingCompany.quoteTermsText1 || `Upon acceptance of this quotation I hereby certify that the above information is true and correct. I have read and understand the TERMS AND CONDITIONS OF TRADE OF ${existingCompany.name.toUpperCase()} which forms part of, and is intended to read in conjunction with this quotation. I agree to be bound by these conditions. I authorise the use of my personal information as detailed in the Privacy Act Clause therein. I agree that if I am a Director or a shareholder (owning at least 15% of the shares) of the client I shall be personally liable for the performance of the client's obligations under this act.`,
        quoteTermsText2: existingCompany.quoteTermsText2 || 'Please read this quote carefully for all details regarding edge thickness, stone colour and work description. We require a 50% deposit and completed purchase order upon acceptance of this quote.',
        quoteTermsText3: existingCompany.quoteTermsText3 || `Please contact our office via email ${existingCompany.email || 'admin@northcoaststone.com.au'} if you wish to proceed.`,
        quoteTermsText4: existingCompany.quoteTermsText4 || 'This quote is valid for 30 days, on the exception of being signed off as a job, where it will be valid for a 3 month period.',
        
        // Terms URL
        termsUrl: existingCompany.termsUrl || process.env.TERMS_URL || 'https://northcoaststone.com.au/terms-of-trade/',
      },
    });

    console.log('✅ Company settings updated successfully!');
    console.log('📋 Company:', updated.name);
  } else {
    console.log('📝 No company found. Creating new company from environment variables...');

    // Create new company from environment variables
    const company = await prisma.company.create({
      data: {
        name: process.env.COMPANY_NAME || 'Northcoast Stone Pty Ltd',
        abn: process.env.COMPANY_ABN || '57 120 880 355',
        address: process.env.COMPANY_ADDRESS || '20 Hitech Drive, KUNDA PARK Queensland 4556, Australia',
        phone: process.env.COMPANY_PHONE || '0754767636',
        fax: process.env.COMPANY_FAX || '0754768636',
        email: process.env.COMPANY_EMAIL || 'admin@northcoaststone.com.au',
        website: process.env.COMPANY_WEBSITE || null,
        workshopAddress: process.env.COMPANY_ADDRESS || '20 Hitech Drive, Kunda Park, Queensland 4556, Australia',
        
        // Branding
        primaryColor: '#1e40af',
        
        // Quote template defaults
        quoteIntroText1: 'Please see below for our price breakdown for your quotation as per the plans supplied. Any differences in stonework at measure and fabrication stage will be charged accordingly.',
        quoteIntroText2: 'This quote is for supply, fabrication and local installation of stonework.',
        quoteIntroText3: 'Thank you for the opportunity in submitting this quotation. We look forward to working with you.',
        quotePleaseNote: 'This Quote is based on the proviso that all stonework is the same colour and fabricated and installed at the same time. Any variation from this assumption will require re-quoting.',
        quoteTermsText1: `Upon acceptance of this quotation I hereby certify that the above information is true and correct. I have read and understand the TERMS AND CONDITIONS OF TRADE OF ${(process.env.COMPANY_NAME || 'NORTHCOAST STONE PTY LTD').toUpperCase()} which forms part of, and is intended to read in conjunction with this quotation. I agree to be bound by these conditions. I authorise the use of my personal information as detailed in the Privacy Act Clause therein. I agree that if I am a Director or a shareholder (owning at least 15% of the shares) of the client I shall be personally liable for the performance of the client's obligations under this act.`,
        quoteTermsText2: 'Please read this quote carefully for all details regarding edge thickness, stone colour and work description. We require a 50% deposit and completed purchase order upon acceptance of this quote.',
        quoteTermsText3: `Please contact our office via email ${process.env.COMPANY_EMAIL || 'admin@northcoaststone.com.au'} if you wish to proceed.`,
        quoteTermsText4: 'This quote is valid for 30 days, on the exception of being signed off as a job, where it will be valid for a 3 month period.',
        
        quoteValidityDays: 30,
        depositPercent: 50,
        termsUrl: process.env.TERMS_URL || 'https://northcoaststone.com.au/terms-of-trade/',
        
        // Signature
        signatureName: process.env.SIGNATURE_NAME || 'Beau Kavanagh',
        
        // Settings
        defaultUnitSystem: 'METRIC',
      },
    });

    console.log('✅ Company created successfully!');
    console.log('📋 Company:', company.name);
    console.log('🆔 Company ID:', company.id);
  }

  console.log('');
  console.log('🎉 Migration completed successfully!');
  console.log('');
  console.log('Next steps:');
  console.log('1. Visit /settings/company to customize your settings');
  console.log('2. Upload your company logo');
  console.log('3. Customize quote template text');
}

main()
  .catch((e) => {
    console.error('❌ Error during migration:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
