import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/db';
import { assembleQuotePdfData } from '@/lib/services/quote-pdf-service';
import { renderQuotePdf } from '@/lib/services/quote-pdf-renderer';
import type { PdfTemplateSettings } from '@/lib/services/quote-pdf-renderer';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth check
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { id } = await params;
    const quoteId = parseInt(id, 10);

    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    // Assemble PDF data (validates quote exists and has pricing)
    let data;
    try {
      data = await assembleQuotePdfData(quoteId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg === 'QUOTE_NOT_FOUND') {
        return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
      }
      if (msg.startsWith('PRICING_MISSING')) {
        return NextResponse.json(
          { error: msg.replace('PRICING_MISSING: ', '') },
          { status: 400 },
        );
      }
      throw err;
    }

    // Load default template settings for this company
    const template = await prisma.quote_templates.findFirst({
      where: {
        company_id: authResult.user.companyId,
        is_default: true,
      },
    });

    // Build template settings from DB template (with Northcoast defaults)
    let templateSettings: Partial<PdfTemplateSettings> | undefined;
    if (template) {
      templateSettings = {
        companyName: template.company_name || undefined,
        companyAbn: template.company_abn,
        companyPhone: template.company_phone,
        companyEmail: template.company_email,
        companyAddress: template.company_address,
        showPieceBreakdown: template.show_piece_breakdown,
        showEdgeDetails: template.show_edge_details,
        showCutoutDetails: template.show_cutout_details,
        showMaterialPerPiece: template.show_material_per_piece,
        showRoomTotals: template.show_room_totals,
        showItemisedBreakdown: template.show_itemised_breakdown,
        showPieceDescriptions: template.show_piece_descriptions,
        pricingMode: template.pricing_mode as 'room_total' | 'itemised' | 'total_only',
        showGst: template.show_gst,
        gstLabel: template.gst_label,
        currencySymbol: template.currency_symbol,
        termsAndConditions: template.terms_and_conditions,
        validityDays: template.validity_days,
        footerText: template.footer_text,
      };
    }

    // Render PDF
    const pdfBuffer = await renderQuotePdf(data, templateSettings);

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${data.quoteNumber}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate PDF',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
