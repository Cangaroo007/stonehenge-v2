import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { generateQuoteNumber } from '@/lib/utils';
import { createInitialVersion } from '@/lib/services/quote-version-service';
import { calculateQuotePrice } from '@/lib/services/pricing-calculator-v2';
import { getPieceDefaults } from '@/lib/services/quote-setup-defaults';

// --- Request body interfaces ---

interface BatchCutoutInput {
  name: string;
  quantity?: number;
}

interface BatchPieceInput {
  name: string;
  description?: string | null;
  lengthMm?: number;
  widthMm?: number;
  thicknessMm?: number;
  materialId?: number | null;
  materialName?: string | null;
  edgeTop?: string | null;
  edgeBottom?: string | null;
  edgeLeft?: string | null;
  edgeRight?: string | null;
  cutouts?: BatchCutoutInput[];
}

interface BatchRoomInput {
  name: string;
  pieces: BatchPieceInput[];
}

interface BatchCreateBody {
  customerId?: number | null;
  projectName?: string | null;
  projectAddress?: string | null;
  notes?: string | null;
  rooms: BatchRoomInput[];
}

// --- Helpers ---

function calculateArea(lengthMm: number, widthMm: number): number {
  return (lengthMm * widthMm) / 1_000_000;
}

function validateBody(body: unknown): { valid: true; data: BatchCreateBody } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const data = body as BatchCreateBody;

  if (!Array.isArray(data.rooms) || data.rooms.length === 0) {
    return { valid: false, error: 'At least one room is required' };
  }

  for (let ri = 0; ri < data.rooms.length; ri++) {
    const room = data.rooms[ri];
    if (!room || typeof room.name !== 'string' || room.name.trim().length === 0) {
      return { valid: false, error: `Room at index ${ri} must have a name` };
    }
    if (!Array.isArray(room.pieces) || room.pieces.length === 0) {
      return { valid: false, error: `Room "${room.name}" must have at least one piece` };
    }
    for (let pi = 0; pi < room.pieces.length; pi++) {
      const piece = room.pieces[pi];
      if (!piece || typeof piece.name !== 'string' || piece.name.trim().length === 0) {
        return { valid: false, error: `Piece at index ${pi} in room "${room.name}" must have a name` };
      }
    }
  }

  return { valid: true, data };
}

// --- Route handler ---

export async function POST(request: NextRequest) {
  try {
    // 1. Auth — copied from existing quotes route pattern
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }
    const userId = authResult.user.id;

    // 2. Parse + validate body
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const validation = validateBody(rawBody);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }
    const body = validation.data;

    // 3. Generate quote number using existing pattern
    const lastQuote = await prisma.quotes.findFirst({
      orderBy: { id: 'desc' },
      select: { quote_number: true },
    });
    const quoteNumber = generateQuoteNumber(lastQuote?.quote_number ?? null);

    // 4. Build the nested create data for prisma.$transaction
    const roomsCreateData = body.rooms.map((room: BatchRoomInput, roomIndex: number) => {
      const piecesCreateData = room.pieces.map((piece: BatchPieceInput, pieceIndex: number) => {
        // Apply smart defaults based on piece name
        const defaults = getPieceDefaults(piece.name);

        const lengthMm = piece.lengthMm ?? 1000;
        const widthMm = piece.widthMm ?? defaults.width_mm;
        const thicknessMm = piece.thicknessMm ?? 20;
        const areaSqm = calculateArea(lengthMm, widthMm);

        // Edges: use provided values or fall back to smart defaults
        const edgeTop = piece.edgeTop ?? defaults.edges.top;
        const edgeBottom = piece.edgeBottom ?? defaults.edges.bottom;
        const edgeLeft = piece.edgeLeft ?? defaults.edges.left;
        const edgeRight = piece.edgeRight ?? defaults.edges.right;

        // Cutouts as JSON — use provided or empty
        const cutouts = Array.isArray(piece.cutouts)
          ? piece.cutouts.map((c: BatchCutoutInput) => ({
              name: c.name,
              quantity: c.quantity ?? 1,
            }))
          : [];

        return {
          name: piece.name.trim(),
          description: piece.description ?? piece.name.trim(),
          length_mm: lengthMm,
          width_mm: widthMm,
          thickness_mm: thicknessMm,
          material_id: piece.materialId ?? null,
          material_name: piece.materialName ?? null,
          area_sqm: areaSqm,
          material_cost: 0,
          features_cost: 0,
          total_cost: 0,
          sort_order: pieceIndex,
          edge_top: edgeTop,
          edge_bottom: edgeBottom,
          edge_left: edgeLeft,
          edge_right: edgeRight,
          cutouts: cutouts as unknown as Prisma.InputJsonValue,
        };
      });

      return {
        name: room.name.trim(),
        sort_order: roomIndex,
        quote_pieces: {
          create: piecesCreateData,
        },
      };
    });

    // 5. Create quote + all rooms + all pieces atomically
    const quote = await prisma.$transaction(async (tx) => {
      const newQuote = await tx.quotes.create({
        data: {
          quote_number: quoteNumber,
          customer_id: body.customerId ?? null,
          project_name: body.projectName ?? null,
          project_address: body.projectAddress ?? null,
          status: 'draft',
          subtotal: 0,
          tax_rate: 10,
          tax_amount: 0,
          total: 0,
          notes: body.notes ?? null,
          valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          created_by: userId,
          updated_at: new Date(),
          quote_rooms: {
            create: roomsCreateData,
          },
        },
        include: {
          quote_rooms: {
            include: {
              quote_pieces: true,
            },
          },
        },
      });

      return newQuote;
    });

    // 6. Create initial version (non-blocking)
    try {
      await createInitialVersion(quote.id, userId);
    } catch {
      // Non-blocking — version creation failure should not fail the batch create
    }

    // 7. Trigger pricing calculation (non-blocking)
    try {
      await calculateQuotePrice(String(quote.id), { forceRecalculate: true });
    } catch {
      // Non-blocking — pricing may fail if no price book is configured yet
    }

    // 8. Calculate counts for response
    const roomCount = quote.quote_rooms.length;
    let pieceCount = 0;
    for (const room of quote.quote_rooms) {
      pieceCount += room.quote_pieces.length;
    }

    return NextResponse.json({
      quoteId: quote.id,
      quoteNumber: quote.quote_number,
      roomCount,
      pieceCount,
      redirectUrl: `/quotes/${quote.id}`,
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to create quote', details: message },
      { status: 500 }
    );
  }
}
