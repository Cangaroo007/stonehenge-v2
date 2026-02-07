import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { createInitialVersion } from '@/lib/services/quote-version-service';

interface RoomData {
  name: string;
  sortOrder: number;
  pieces: PieceData[];
}

interface PieceData {
  description: string;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  materialId: number | null;
  materialName: string | null;
  areaSqm: number;
  materialCost: number;
  featuresCost: number;
  totalCost: number;
  sortOrder: number;
  edgeTop: string | null;
  edgeBottom: string | null;
  edgeLeft: string | null;
  edgeRight: string | null;
  features: FeatureData[];
}

interface FeatureData {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface DrawingAnalysisData {
  filename: string;
  analyzedAt: string;
  drawingType: string;
  rawResults: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
}

interface QuoteCreateData {
  quoteNumber: string;
  customerId: number | null;
  projectName: string | null;
  projectAddress: string | null;
  status?: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  notes: string | null;
  createdBy: number | null;
  rooms: RoomData[];
  drawingAnalysis?: DrawingAnalysisData | null;
  // Delivery & Templating
  deliveryAddress?: string | null;
  deliveryDistanceKm?: number | null;
  deliveryZoneId?: number | null;
  deliveryCost?: number | null;
  overrideDeliveryCost?: number | null;
  templatingRequired?: boolean;
  templatingDistanceKm?: number | null;
  templatingCost?: number | null;
  overrideTemplatingCost?: number | null;
}

export async function GET() {
  try {
    const quotes = await prisma.quotes.findMany({
      orderBy: { createdAt: 'desc' },
      include: { customer: true },
    });
    return NextResponse.json(quotes);
  } catch (error) {
    console.error('Error fetching quotes:', error);
    return NextResponse.json({ error: 'Failed to fetch quotes' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data: QuoteCreateData = await request.json();

    // Create the quote with rooms and pieces
    const quote = await prisma.quotes.create({
      data: {
        quoteNumber: data.quoteNumber,
        customerId: data.customerId,
        projectName: data.projectName,
        projectAddress: data.projectAddress,
        status: data.status || 'draft',
        subtotal: data.subtotal,
        taxRate: data.taxRate,
        taxAmount: data.taxAmount,
        total: data.total,
        notes: data.notes,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        createdBy: data.createdBy,
        // Delivery & Templating
        deliveryAddress: data.deliveryAddress,
        deliveryDistanceKm: data.deliveryDistanceKm,
        deliveryZoneId: data.deliveryZoneId,
        deliveryCost: data.deliveryCost,
        overrideDeliveryCost: data.overrideDeliveryCost,
        templatingRequired: data.templatingRequired || false,
        templatingDistanceKm: data.templatingDistanceKm,
        templatingCost: data.templatingCost,
        overrideTemplatingCost: data.overrideTemplatingCost,
        rooms: {
          create: data.rooms.map((room: RoomData) => ({
            name: room.name,
            sortOrder: room.sortOrder,
            pieces: {
              create: room.pieces.map((piece: PieceData) => ({
                description: piece.description,
                lengthMm: piece.lengthMm,
                widthMm: piece.widthMm,
                thicknessMm: piece.thicknessMm,
                materialId: piece.materialId,
                materialName: piece.materialName,
                areaSqm: piece.areaSqm,
                materialCost: piece.materialCost,
                featuresCost: piece.featuresCost,
                totalCost: piece.totalCost,
                sortOrder: piece.sortOrder,
                edgeTop: piece.edgeTop,
                edgeBottom: piece.edgeBottom,
                edgeLeft: piece.edgeLeft,
                edgeRight: piece.edgeRight,
                features: {
                  create: piece.features.map((feature: FeatureData) => ({
                    name: feature.name,
                    quantity: feature.quantity,
                    unitPrice: feature.unitPrice,
                    totalPrice: feature.totalPrice,
                  })),
                },
              })),
            },
          })),
        },
        // Create drawing analysis if provided
        ...(data.drawingAnalysis && {
          drawingAnalysis: {
            create: {
              filename: data.drawingAnalysis.filename,
              analyzedAt: new Date(data.drawingAnalysis.analyzedAt),
              drawingType: data.drawingAnalysis.drawingType,
              rawResults: data.drawingAnalysis.rawResults as unknown as Prisma.InputJsonValue,
              metadata: data.drawingAnalysis.metadata as unknown as Prisma.InputJsonValue,
              importedPieces: [],
            },
          },
        }),
      },
    });

    // Create initial version for version history
    try {
      const authResult = await requireAuth();
      const userId = 'error' in authResult ? (data.createdBy ?? 1) : authResult.user.id;
      await createInitialVersion(quote.id, userId);
    } catch (versionError) {
      console.error('Error creating initial version (non-blocking):', versionError);
    }

    return NextResponse.json(quote, { status: 201 });
  } catch (error) {
    console.error('Error creating quote:', error);
    return NextResponse.json({ error: 'Failed to create quote' }, { status: 500 });
  }
}
