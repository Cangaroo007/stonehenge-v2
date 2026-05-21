import { NextResponse } from 'next/server';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';
import prisma from '@/lib/db';
import { calculateQuotePrice, isQuotePricingBlockedError } from '@/lib/services/pricing-calculator-v2';
import { buildQuotePricingUpdate } from '@/lib/services/quote-pricing-persistence';
import { assembleQuotePdfData } from '@/lib/services/quote-pdf-service';
import { renderQuotePdf } from '@/lib/services/quote-pdf-renderer';
import type { PdfTemplateSettings } from '@/lib/services/quote-pdf-renderer';
import { getDownloadUrl } from '@/lib/storage/r2';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
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

    // Verify quote belongs to user's company
    const quoteCheck = await verifyQuoteOwnership(quoteId, authResult.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    try {
      const pricingResult = await calculateQuotePrice(String(quoteId), { forceRecalculate: true });
      await prisma.quotes.update({
        where: { id: quoteId },
        data: buildQuotePricingUpdate(pricingResult),
      });
    } catch (pricingError) {
      if (isQuotePricingBlockedError(pricingError)) {
        return NextResponse.json(
          {
            error: pricingError.message,
            code: pricingError.code,
            missingRates: pricingError.missingRates,
          },
          { status: 409 }
        );
      }
      throw pricingError;
    }

    // Assemble PDF data only after server-side pricing readiness passes.
    let data;
    try {
      data = await assembleQuotePdfData(quoteId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg === 'QUOTE_NOT_FOUND') {
        return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
      }
      throw err;
    }

    // Load default template settings for this company, plus the company row
    // (signature_name / signature_title for cover-page signoff).
    const [template, company] = await Promise.all([
      prisma.quote_templates.findFirst({
        where: {
          company_id: authResult.user.companyId,
          is_default: true,
        },
      }),
      prisma.companies.findUnique({
        where: { id: authResult.user.companyId },
        select: { signature_name: true, signature_title: true, logo_storage_key: true },
      }),
    ]);

    // Fall back to companies.logo_storage_key when the template doesn't carry
    // a logo_url — getDownloadUrl returns an absolute presigned R2 URL that
    // react-pdf can fetch server-side.
    const fallbackLogoUrl = company?.logo_storage_key
      ? await getDownloadUrl(company.logo_storage_key, 3600)
      : null;

    // Build template settings from DB template (with Northcoast defaults)
    let templateSettings: Partial<PdfTemplateSettings> | undefined;
    if (template) {
      templateSettings = {
        companyName: template.company_name || undefined,
        companyAbn: template.company_abn,
        companyPhone: template.company_phone,
        companyEmail: template.company_email,
        companyAddress: template.company_address,
        companyLogoUrl: template.logo_url ?? fallbackLogoUrl,
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
        signoffName: company?.signature_name ?? null,
        signoffTitle: company?.signature_title ?? null,
      };
    } else if (fallbackLogoUrl || company?.signature_name || company?.signature_title) {
      // No template row, but we still have logo / signoff to surface.
      templateSettings = {
        companyLogoUrl: fallbackLogoUrl,
        signoffName: company?.signature_name ?? null,
        signoffTitle: company?.signature_title ?? null,
      };
    }

    // Parse sections config from template (defaults applied by renderer)
    const sectionsConfig = template?.sections_config
      ? (template.sections_config as Record<string, boolean>)
      : undefined;

    const pdfView = new URL(request.url).searchParams.get('view');
    if (pdfView === 'summary') {
      templateSettings = {
        ...templateSettings,
        showPieceBreakdown: false,
        showRoomTotals: true,
        pricingMode: 'room_total',
        showItemisedBreakdown: false,
      };
    } else if (pdfView === 'piece-totals' || pdfView === 'pieceTotals') {
      templateSettings = {
        ...templateSettings,
        showPieceBreakdown: true,
        showRoomTotals: true,
        pricingMode: 'itemised',
        showItemisedBreakdown: false,
      };
    } else if (pdfView === 'detailed' || pdfView === 'calculations') {
      templateSettings = {
        ...templateSettings,
        showPieceBreakdown: true,
        showRoomTotals: true,
        pricingMode: 'itemised',
        showItemisedBreakdown: true,
        showEdgeDetails: true,
        showCutoutDetails: true,
      };
    }

    // Render PDF
    const pdfBuffer = await renderQuotePdf(data, templateSettings, sectionsConfig);

    // Filename pattern: "{quoteNumber} - {customer} - {project} rev{N}.pdf"
    // (e.g. "Q22338 - Glover - Buderim rev2.pdf"). Customer and project segments
    // are skipped when missing; "Untitled Quote" is treated as a placeholder and
    // falls back to the project address.
    const quotePart = data.quoteNumber ?? `Q-${quoteId}-DRAFT`;
    const customerPart = data.customer?.name?.trim() || null;
    const projectName = data.projectName?.trim();
    const projectPart =
      projectName && projectName !== 'Untitled Quote'
        ? projectName
        : data.projectAddress?.trim() || null;
    const revPart = `rev${data.revision}`;
    const segments = [quotePart, customerPart, projectPart].filter(Boolean);
    // Strip filesystem-unsafe characters (and the double quote that would break
    // the Content-Disposition header) and collapse runs of whitespace.
    const filename = `${segments.join(' - ')} ${revPart}.pdf`
      .replace(/[/\\:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
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
