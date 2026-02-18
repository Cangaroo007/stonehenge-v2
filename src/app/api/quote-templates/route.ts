import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';

/**
 * GET /api/quote-templates
 * List all quote templates for the authenticated user's company.
 * Rule 48: returns [] if the table doesn't exist yet (migration not applied).
 */
export async function GET() {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { user } = authResult;

    try {
      const templates = await prisma.quote_templates.findMany({
        where: { company_id: user.companyId },
        orderBy: [{ is_default: 'desc' }, { created_at: 'desc' }],
      });

      return NextResponse.json(templates);
    } catch (dbError: unknown) {
      // Rule 48: If table doesn't exist yet, return empty array
      if (
        dbError &&
        typeof dbError === 'object' &&
        'code' in dbError &&
        (dbError as { code: string }).code === 'P2021'
      ) {
        return NextResponse.json([]);
      }
      throw dbError;
    }
  } catch (error) {
    console.error('Error fetching quote templates:', error);
    return NextResponse.json({ error: 'Failed to fetch quote templates' }, { status: 500 });
  }
}

/**
 * POST /api/quote-templates
 * Create a new quote template for the authenticated user's company.
 * If is_default is true, unsets default on all other templates for this company.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { user } = authResult;
    const body = await request.json();

    if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
      return NextResponse.json({ error: 'Template name is required' }, { status: 400 });
    }

    // If setting as default, unset other defaults in a transaction
    const template = await prisma.$transaction(async (tx) => {
      if (body.is_default) {
        await tx.quote_templates.updateMany({
          where: { company_id: user.companyId, is_default: true },
          data: { is_default: false },
        });
      }

      return tx.quote_templates.create({
        data: {
          company_id: user.companyId,
          name: body.name.trim(),
          is_default: body.is_default ?? false,

          // Header
          company_name: body.company_name ?? null,
          company_abn: body.company_abn ?? null,
          company_phone: body.company_phone ?? null,
          company_email: body.company_email ?? null,
          company_address: body.company_address ?? null,
          logo_url: body.logo_url ?? null,

          // Display settings
          show_piece_breakdown: body.show_piece_breakdown ?? true,
          show_edge_details: body.show_edge_details ?? true,
          show_cutout_details: body.show_cutout_details ?? true,
          show_material_per_piece: body.show_material_per_piece ?? false,
          show_room_totals: body.show_room_totals ?? true,
          show_itemised_breakdown: body.show_itemised_breakdown ?? false,
          show_slab_count: body.show_slab_count ?? false,
          show_piece_descriptions: body.show_piece_descriptions ?? true,

          // Pricing display
          pricing_mode: body.pricing_mode ?? 'room_total',
          show_gst: body.show_gst ?? true,
          gst_label: body.gst_label ?? 'GST (10%)',
          currency_symbol: body.currency_symbol ?? '$',

          // Footer
          terms_and_conditions: body.terms_and_conditions ?? null,
          validity_days: body.validity_days ?? 30,
          footer_text: body.footer_text ?? null,
        },
      });
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error('Error creating quote template:', error);
    return NextResponse.json({ error: 'Failed to create quote template' }, { status: 500 });
  }
}
