import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';

/**
 * GET /api/quote-templates/[id]
 * Fetch a single quote template. Verifies company_id matches the authenticated user.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { user } = authResult;
    const { id } = await params;

    try {
      const template = await prisma.quote_templates.findUnique({
        where: { id },
      });

      if (!template || template.company_id !== user.companyId) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }

      return NextResponse.json(template);
    } catch (dbError: unknown) {
      // Rule 48: If table doesn't exist yet, return 404
      if (
        dbError &&
        typeof dbError === 'object' &&
        'code' in dbError &&
        (dbError as { code: string }).code === 'P2021'
      ) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }
      throw dbError;
    }
  } catch (error) {
    console.error('Error fetching quote template:', error);
    return NextResponse.json({ error: 'Failed to fetch quote template' }, { status: 500 });
  }
}

/**
 * PUT /api/quote-templates/[id]
 * Update a quote template. Verifies ownership. Handles default toggling.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { user } = authResult;
    const { id } = await params;
    const body = await request.json();

    // Verify template exists and belongs to this company
    const existing = await prisma.quote_templates.findUnique({
      where: { id },
    });

    if (!existing || existing.company_id !== user.companyId) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    if (body.name !== undefined && (typeof body.name !== 'string' || body.name.trim().length === 0)) {
      return NextResponse.json({ error: 'Template name cannot be empty' }, { status: 400 });
    }

    // Build update data from provided fields only
    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      'name', 'description', 'format_type', 'is_default', 'is_active',
      'sections_config',
      'company_name', 'company_abn', 'company_phone', 'company_email', 'company_address', 'logo_url',
      'show_logo',
      'show_piece_breakdown', 'show_edge_details', 'show_cutout_details', 'show_material_per_piece',
      'show_room_totals', 'show_itemised_breakdown', 'show_slab_count', 'show_piece_descriptions',
      'pricing_mode', 'show_gst', 'gst_label', 'currency_symbol',
      'custom_intro_text', 'terms_and_conditions', 'footer_text',
      'custom_primary_colour', 'custom_accent_colour',
      'validity_days',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = field === 'name' ? (body[field] as string).trim() : body[field];
      }
    }

    const template = await prisma.$transaction(async (tx) => {
      // If setting as default, unset other defaults first
      if (body.is_default === true) {
        await tx.quote_templates.updateMany({
          where: {
            company_id: user.companyId,
            is_default: true,
            id: { not: id },
          },
          data: { is_default: false },
        });
      }

      return tx.quote_templates.update({
        where: { id },
        data: updateData,
      });
    });

    return NextResponse.json(template);
  } catch (error) {
    console.error('Error updating quote template:', error);
    return NextResponse.json({ error: 'Failed to update quote template' }, { status: 500 });
  }
}

/**
 * DELETE /api/quote-templates/[id]
 * Delete a quote template. Verifies ownership.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { user } = authResult;
    const { id } = await params;

    const existing = await prisma.quote_templates.findUnique({
      where: { id },
    });

    if (!existing || existing.company_id !== user.companyId) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    await prisma.quote_templates.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting quote template:', error);
    return NextResponse.json({ error: 'Failed to delete quote template' }, { status: 500 });
  }
}
