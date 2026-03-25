import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { createInitialVersion } from '@/lib/services/quote-version-service';

/**
 * POST /api/quotes/create-draft
 *
 * Creates a draft quote. Two modes:
 *
 * 1. JSON body with { projectName, rooms } — BlankQuoteBuilder deferred save.
 *    Rooms may contain nested pieces with edge profiles and dimensions.
 *
 * 2. Query params only (no body / empty body) — existing wizard flow.
 *    Creates a minimal draft with one default room.
 *
 * Query params (both modes):
 *   - customerId (optional): Pre-assign a customer
 *   - contactId (optional): Pre-assign a contact
 *   - projectName (optional): Set project name (query param fallback for mode 2)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    const { searchParams } = new URL(request.url);
    const customerIdParam = searchParams.get('customerId');
    const contactIdParam = searchParams.get('contactId');
    const projectNameParam = searchParams.get('projectName');

    const customerId = customerIdParam ? parseInt(customerIdParam, 10) : null;
    const contactId = contactIdParam ? parseInt(contactIdParam, 10) : null;

    // Try to parse JSON body — may be empty for legacy query-param mode
    let body: { projectName?: string | null; rooms?: Array<{
      name: string;
      sortOrder: number;
      pieces: Array<{
        description: string;
        lengthMm: number;
        widthMm: number;
        thicknessMm: number;
        sortOrder: number;
        edgeTop: string | null;
        edgeBottom: string | null;
        edgeLeft: string | null;
        edgeRight: string | null;
      }>;
    }> } | null = null;
    try {
      body = await request.json();
    } catch {
      // No JSON body — use query-param mode
    }

    const hasBodyRooms = body?.rooms && Array.isArray(body.rooms);

    // quote_number left null — assigned when user clicks "Save Quote"

    // Build room creation data
    const roomsCreate = hasBodyRooms && body!.rooms!.length > 0
      ? body!.rooms!.map((room) => ({
          name: room.name || 'Kitchen',
          sort_order: room.sortOrder ?? 0,
          quote_pieces: {
            create: (room.pieces ?? []).map((piece) => ({
              name: piece.description || 'Piece',
              description: piece.description || null,
              length_mm: piece.lengthMm || 0,
              width_mm: piece.widthMm || 0,
              thickness_mm: piece.thicknessMm || 20,
              area_sqm: ((piece.lengthMm || 0) * (piece.widthMm || 0)) / 1_000_000,
              material_cost: 0,
              features_cost: 0,
              total_cost: 0,
              material_id: null,
              material_name: null,
              sort_order: piece.sortOrder ?? 0,
              edge_top: piece.edgeTop || null,
              edge_bottom: piece.edgeBottom || null,
              edge_left: piece.edgeLeft || null,
              edge_right: piece.edgeRight || null,
            })),
          },
        }))
      : [];

    const quote = await prisma.quotes.create({
      data: {
        quote_number: null,
        company_id: user.companyId,
        customer_id: customerId && !isNaN(customerId) ? customerId : null,
        contact_id: contactId && !isNaN(contactId) ? contactId : null,
        project_name: (hasBodyRooms ? body?.projectName : projectNameParam) || 'Untitled Quote',
        status: 'draft',
        subtotal: 0,
        tax_rate: 10,
        tax_amount: 0,
        total: 0,
        valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        created_by: user.id,
        updated_at: new Date(),
        quote_rooms: {
          create: roomsCreate,
        },
      },
    });

    // Create initial version for version history (non-blocking)
    try {
      await createInitialVersion(quote.id, user.id);
    } catch {
      // Non-blocking — version history is not critical for draft creation
    }

    return NextResponse.json({ id: quote.id, quoteId: quote.id, quoteNumber: quote.quote_number }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create draft quote';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
