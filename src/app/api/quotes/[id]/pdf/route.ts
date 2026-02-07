import { NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont, RGB } from 'pdf-lib';
import prisma from '@/lib/db';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

async function getQuote(id: number) {
  return prisma.quotes.findUnique({
    where: { id },
    include: {
      customer: true,
      rooms: {
        orderBy: { sortOrder: 'asc' },
        include: {
          pieces: {
            orderBy: { sortOrder: 'asc' },
            include: {
              piece_features: true,
              materials: true,
            },
          },
        },
      },
    },
  });
}

function formatCurrency(value: number | { toString(): string }): string {
  const num = typeof value === 'number' ? value : parseFloat(value.toString());
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(num);
}

function formatDate(date: Date): string {
  return format(new Date(date), 'dd/MM/yyyy');
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const quote = await getQuote(parseInt(id));

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Fetch company settings from database (with fallbacks to env vars)
    const companyData = await prisma.companies.findFirst();
    
    const company = {
      name: companyData?.name || process.env.COMPANY_NAME || 'Northcoast Stone Pty Ltd',
      abn: companyData?.abn || process.env.COMPANY_ABN || '57 120 880 355',
      address: companyData?.address || process.env.COMPANY_ADDRESS || '20 Hitech Drive, KUNDA PARK Queensland 4556, Australia',
      phone: companyData?.phone || process.env.COMPANY_PHONE || '0754767636',
      fax: companyData?.fax || process.env.COMPANY_FAX || '0754768636',
      email: companyData?.email || process.env.COMPANY_EMAIL || 'admin@northcoaststone.com.au',
    };

    // Quote template settings (with defaults)
    const settings = {
      introText1: companyData?.quoteIntroText1 || 'Please see below for our price breakdown for your quotation as per the plans supplied. Any differences in stonework at measure and fabrication stage will be charged accordingly.',
      introText2: companyData?.quoteIntroText2 || 'This quote is for supply, fabrication and local installation of stonework.',
      introText3: companyData?.quoteIntroText3 || 'Thank you for the opportunity in submitting this quotation. We look forward to working with you.',
      pleaseNote: companyData?.quotePleaseNote || 'This Quote is based on the proviso that all stonework is the same colour and fabricated and installed at the same time. Any variation from this assumption will require re-quoting.',
      termsText1: companyData?.quoteTermsText1 || `Upon acceptance of this quotation I hereby certify that the above information is true and correct. I have read and understand the TERMS AND CONDITIONS OF TRADE OF ${company.name.toUpperCase()} which forms part of, and is intended to read in conjunction with this quotation. I agree to be bound by these conditions. I authorise the use of my personal information as detailed in the Privacy Act Clause therein. I agree that if I am a Director or a shareholder (owning at least 15% of the shares) of the client I shall be personally liable for the performance of the client's obligations under this act.`,
      termsText2: companyData?.quoteTermsText2 || `Please read this quote carefully for all details regarding edge thickness, stone colour and work description. We require a ${companyData?.depositPercent || 50}% deposit and completed purchase order upon acceptance of this quote.`,
      termsText3: companyData?.quoteTermsText3 || `Please contact our office via email ${company.email} if you wish to proceed.`,
      termsText4: companyData?.quoteTermsText4 || `This quote is valid for ${companyData?.quoteValidityDays || 30} days, on the exception of being signed off as a job, where it will be valid for a 3 month period.`,
      signatureName: companyData?.signatureName || 'Beau Kavanagh',
      signatureTitle: companyData?.signatureTitle || null,
      depositPercent: companyData?.depositPercent || 50,
      validityDays: companyData?.quoteValidityDays || 30,
    };

    // Parse decimal values
    const subtotal = parseFloat(quote.subtotal.toString());
    const taxAmount = parseFloat(quote.tax_amount.toString());
    const total = parseFloat(quote.total.toString());
    const taxRate = parseFloat(quote.tax_rate.toString());

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    
    // Embed fonts
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Colors
    const black = rgb(0, 0, 0);
    const gray = rgb(0.4, 0.4, 0.4);
    const darkGray = rgb(0.2, 0.2, 0.2);
    const blue = rgb(0.145, 0.388, 0.922);
    const lightGray = rgb(0.95, 0.95, 0.96);
    const noteYellow = rgb(0.996, 0.953, 0.78);
    const lineGray = rgb(0.8, 0.8, 0.8);

    // Page dimensions
    const pageWidth = 595.28; // A4
    const pageHeight = 841.89;
    const margin = 40;
    const contentWidth = pageWidth - (margin * 2);

    // Helper to draw wrapped text (arrow function for strict mode compatibility)
    const drawWrappedText = (
      page: PDFPage,
      text: string,
      x: number,
      y: number,
      maxWidth: number,
      font: PDFFont,
      fontSize: number,
      color: RGB,
      lineHeight: number = 1.2
    ): number => {
      const words = text.split(' ');
      let line = '';
      let currentY = y;
      
      for (const word of words) {
        const testLine = line + (line ? ' ' : '') + word;
        const testWidth = font.widthOfTextAtSize(testLine, fontSize);
        
        if (testWidth > maxWidth && line) {
          page.drawText(line, { x, y: currentY, size: fontSize, font, color });
          line = word;
          currentY -= fontSize * lineHeight;
        } else {
          line = testLine;
        }
      }
      
      if (line) {
        page.drawText(line, { x, y: currentY, size: fontSize, font, color });
        currentY -= fontSize * lineHeight;
      }
      
      return currentY;
    };

    // ========== PAGE 1 - COVER ==========
    const page1 = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    // Header - Company name
    page1.drawText(company.name, {
      x: margin,
      y: y - 24,
      size: 24,
      font: helveticaBold,
      color: black,
    });
    y -= 50;

    // ABN
    page1.drawText(`ABN: ${company.abn}`, {
      x: margin,
      y,
      size: 9,
      font: helvetica,
      color: gray,
    });
    y -= 15;

    // Address
    page1.drawText(company.address, {
      x: margin,
      y,
      size: 9,
      font: helvetica,
      color: darkGray,
    });
    y -= 12;

    // Phone/Fax
    page1.drawText(`Phone: ${company.phone} | Fax: ${company.fax}`, {
      x: margin,
      y,
      size: 9,
      font: helvetica,
      color: darkGray,
    });
    y -= 25;

    // Divider line
    page1.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 1,
      color: lineGray,
    });
    y -= 25;

    // Quote Title
    const quoteTitle = `Quote - ${quote.quote_number} - ${quote.project_name || 'Untitled Project'}`;
    page1.drawText(quoteTitle, {
      x: margin,
      y,
      size: 18,
      font: helveticaBold,
      color: blue,
    });
    
    // Date on right
    page1.drawText(`Date: ${formatDate(quote.createdAt)}`, {
      x: pageWidth - margin - 100,
      y,
      size: 10,
      font: helvetica,
      color: darkGray,
    });
    y -= 20;

    // Revision
    page1.drawText(`Revision ${quote.revision}`, {
      x: margin,
      y,
      size: 10,
      font: helvetica,
      color: gray,
    });
    y -= 35;

    // Customer section
    page1.drawText('For:', {
      x: margin,
      y,
      size: 10,
      font: helveticaBold,
      color: black,
    });
    y -= 15;

    const customerText = `${quote.customer?.name || 'No customer specified'}${quote.customer?.company ? ` - ${quote.customer.company}` : ''}`;
    page1.drawText(customerText, {
      x: margin,
      y,
      size: 12,
      font: helvetica,
      color: darkGray,
    });
    y -= 35;

    // Introduction paragraphs
    y = drawWrappedText(
      page1,
      settings.introText1,
      margin, y, contentWidth, helvetica, 10, darkGray
    );
    y -= 10;

    y = drawWrappedText(
      page1,
      settings.introText2,
      margin, y, contentWidth, helvetica, 10, darkGray
    );
    y -= 10;

    y = drawWrappedText(
      page1,
      settings.introText3,
      margin, y, contentWidth, helvetica, 10, darkGray
    );
    y -= 25;

    // Please Note box
    const noteBoxHeight = 55;
    page1.drawRectangle({
      x: margin,
      y: y - noteBoxHeight,
      width: contentWidth,
      height: noteBoxHeight,
      color: noteYellow,
    });

    page1.drawText('PLEASE NOTE:', {
      x: margin + 10,
      y: y - 15,
      size: 10,
      font: helveticaBold,
      color: black,
    });

    drawWrappedText(
      page1,
      settings.pleaseNote,
      margin + 10, y - 30, contentWidth - 20, helveticaBold, 9, darkGray
    );
    y -= noteBoxHeight + 20;

    // Totals section
    page1.drawText('Cost:', { x: margin, y, size: 10, font: helvetica, color: darkGray });
    page1.drawText(formatCurrency(subtotal), { x: margin + 80, y, size: 10, font: helveticaBold, color: darkGray });
    y -= 18;

    page1.drawText('GST:', { x: margin, y, size: 10, font: helvetica, color: darkGray });
    page1.drawText(formatCurrency(taxAmount), { x: margin + 80, y, size: 10, font: helveticaBold, color: darkGray });
    y -= 25;

    page1.drawText('Total Including GST:', { x: margin, y, size: 12, font: helveticaBold, color: darkGray });
    page1.drawText(formatCurrency(total), { x: margin + 140, y, size: 12, font: helveticaBold, color: blue });
    y -= 35;

    // Terms paragraphs
    y = drawWrappedText(
      page1,
      settings.termsText1,
      margin, y, contentWidth, helvetica, 8, gray
    );
    y -= 15;

    y = drawWrappedText(
      page1,
      settings.termsText2,
      margin, y, contentWidth, helvetica, 8, gray
    );
    y -= 15;

    y = drawWrappedText(
      page1,
      settings.termsText3,
      margin, y, contentWidth, helvetica, 8, gray
    );
    y -= 15;

    y = drawWrappedText(
      page1,
      settings.termsText4,
      margin, y, contentWidth, helvetica, 8, gray
    );
    y -= 35;

    // Signature
    page1.drawText('Yours Sincerely', { x: margin, y, size: 10, font: helvetica, color: black });
    y -= 40;
    page1.drawText(settings.signatureName, { x: margin, y, size: 10, font: helveticaBold, color: black });
    y -= 15;
    if (settings.signatureTitle) {
      page1.drawText(settings.signatureTitle, { x: margin, y, size: 10, font: helvetica, color: gray });
      y -= 15;
    }
    page1.drawText(company.name, { x: margin, y, size: 10, font: helvetica, color: gray });

    // Page 1 footer
    page1.drawText('Page 1 of 2', { x: pageWidth - margin - 50, y: 30, size: 9, font: helvetica, color: gray });

    // ========== PAGE 2 - BREAKDOWN ==========
    let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
    let pageNum = 2;
    y = pageHeight - margin;

    // Breakdown title
    currentPage.drawText(`${quote.project_name || 'Project'} Breakdown`, {
      x: margin,
      y: y - 14,
      size: 14,
      font: helveticaBold,
      color: black,
    });
    y -= 40;

    // Helper to check if we need a new page (arrow function)
    const checkNewPage = (neededSpace: number): boolean => {
      if (y < neededSpace + 50) {
        // Add page footer
        currentPage.drawText(`Page ${pageNum} of ${pageNum}`, { 
          x: pageWidth - margin - 50, y: 30, size: 9, font: helvetica, color: gray 
        });
        
        currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
        pageNum++;
        y = pageHeight - margin;
        return true;
      }
      return false;
    };

    // Rooms and pieces
    for (const room of quote.rooms) {
      checkNewPage(100);

      // Room header
      currentPage.drawRectangle({
        x: margin,
        y: y - 18,
        width: contentWidth,
        height: 22,
        color: lightGray,
      });

      currentPage.drawText(quote_rooms.name.toUpperCase(), {
        x: margin + 6,
        y: y - 12,
        size: 11,
        font: helveticaBold,
        color: black,
      });
      y -= 30;

      for (const piece of quote_rooms.pieces) {
        checkNewPage(80);

        const pieceTotal = parseFloat(piece.totalCost.toString());
        const areaSqm = parseFloat(piece.areaSqm.toString());

        // Piece description
        currentPage.drawText(piece.description || 'Stone piece', {
          x: margin + 6,
          y,
          size: 10,
          font: helveticaBold,
          color: black,
        });
        y -= 14;

        // Dimensions
        currentPage.drawText(
          `${piece.lengthMm} x ${piece.widthMm} x ${piece.thicknessMm}mm (${areaSqm.toFixed(2)} m²)`,
          { x: margin + 6, y, size: 9, font: helvetica, color: gray }
        );
        y -= 12;

        // Material
        if (piece.materialName) {
          currentPage.drawText(`Material: ${piece.materialName}`, {
            x: margin + 6,
            y,
            size: 9,
            font: helvetica,
            color: darkGray,
          });
          y -= 12;
        }

        // Features
        for (const feature of piece.features) {
          currentPage.drawText(`- ${feature.quantity}x ${feature.name}`, {
            x: margin + 16,
            y,
            size: 8,
            font: helvetica,
            color: gray,
          });
          y -= 10;
        }

        // Price (right-aligned)
        const priceText = formatCurrency(pieceTotal);
        const priceWidth = helveticaBold.widthOfTextAtSize(priceText, 10);
        currentPage.drawText(priceText, {
          x: pageWidth - margin - priceWidth,
          y: y + 10,
          size: 10,
          font: helveticaBold,
          color: black,
        });

        // Divider line
        y -= 5;
        currentPage.drawLine({
          start: { x: margin + 6, y },
          end: { x: pageWidth - margin, y },
          thickness: 0.5,
          color: rgb(0.9, 0.9, 0.91),
        });
        y -= 10;
      }

      y -= 10;
    }

    // Notes section
    if (quote.notes) {
      checkNewPage(80);
      
      currentPage.drawText('Notes:', {
        x: margin,
        y,
        size: 10,
        font: helveticaBold,
        color: black,
      });
      y -= 15;

      y = drawWrappedText(currentPage, quote.notes, margin, y, contentWidth, helvetica, 9, gray);
      y -= 20;
    }

    // Final totals
    checkNewPage(80);
    
    currentPage.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 1,
      color: lineGray,
    });
    y -= 20;

    currentPage.drawText('Total Excl. GST', { x: margin, y, size: 10, font: helvetica, color: darkGray });
    currentPage.drawText(formatCurrency(subtotal), { x: margin + 110, y, size: 10, font: helveticaBold, color: darkGray });
    y -= 18;

    currentPage.drawText(`GST (${taxRate}%)`, { x: margin, y, size: 10, font: helvetica, color: darkGray });
    currentPage.drawText(formatCurrency(taxAmount), { x: margin + 110, y, size: 10, font: helveticaBold, color: darkGray });
    y -= 22;

    currentPage.drawText('Total Incl. GST', { x: margin, y, size: 12, font: helveticaBold, color: darkGray });
    currentPage.drawText(formatCurrency(total), { x: margin + 110, y, size: 12, font: helveticaBold, color: blue });

    // Final page footer - update all page numbers
    const totalPages = pdfDoc.getPageCount();
    for (let i = 1; i < totalPages; i++) {
      const pg = pdfDoc.getPage(i);
      // Clear old footer by drawing white rectangle (optional, but cleaner)
      pg.drawText(`Page ${i + 1} of ${totalPages}`, { 
        x: pageWidth - margin - 50, y: 30, size: 9, font: helvetica, color: gray 
      });
    }

    // Generate PDF bytes and convert to Buffer for Response compatibility
    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${quote.quote_number}.pdf"`,
      },
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
