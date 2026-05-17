import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';
import { getMockLidarScan, listMockLidarScans } from '@/lib/lidar/mock-scans';
import { convertLidarScanToQuotePieces, toPrismaJson } from '@/lib/services/lidar-scan-converter';
import { calculateQuotePrice } from '@/lib/services/pricing-calculator-v2';
import { buildQuotePricingUpdate } from '@/lib/services/quote-pricing-persistence';

async function recalculateQuote(quoteId: number) {
  const calcResult = await calculateQuotePrice(String(quoteId), { forceRecalculate: true });
  await prisma.quotes.update({
    where: { id: quoteId },
    data: buildQuotePricingUpdate(calcResult),
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const quoteId = parseInt(id, 10);
  if (isNaN(quoteId)) {
    return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
  }

  const quoteCheck = await verifyQuoteOwnership(quoteId, auth.user.companyId);
  if (!quoteCheck) {
    return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
  }

  return NextResponse.json({
    mode: 'mock-lidar-prototype-bridge',
    scans: listMockLidarScans(),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const quoteId = parseInt(id, 10);
    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    const quoteCheck = await verifyQuoteOwnership(quoteId, auth.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const body = await request.json();
    const scanId = typeof body.scanId === 'string' ? body.scanId : '';
    const materialId = body.materialId ? Number(body.materialId) : null;
    const replaceExisting = Boolean(body.replaceExisting);

    const scan = getMockLidarScan(scanId);
    if (!scan) {
      return NextResponse.json({ error: 'Unknown LiDAR scan fixture' }, { status: 404 });
    }

    const material = materialId
      ? await prisma.materials.findFirst({
          where: { id: materialId, company_id: auth.user.companyId },
          select: { id: true, name: true },
        })
      : null;

    if (materialId && !material) {
      return NextResponse.json({ error: 'Material not found' }, { status: 404 });
    }

    const defaultEdgeType = await prisma.edge_types.findFirst({
      where: { isActive: true, category: 'polish' },
      orderBy: { sortOrder: 'asc' },
      select: { id: true },
    });

    const conversion = convertLidarScanToQuotePieces(scan);

    const imported = await prisma.$transaction(async (tx) => {
      if (replaceExisting) {
        const existingRooms = await tx.quote_rooms.findMany({
          where: { quote_id: quoteId },
          select: { id: true },
        });
        const existingRoomIds = existingRooms.map(room => room.id);
        if (existingRoomIds.length > 0) {
          await tx.quote_pieces.deleteMany({
            where: { room_id: { in: existingRoomIds } },
          });
          await tx.quote_rooms.deleteMany({
            where: { quote_id: quoteId },
          });
        }
      }

      const createdPieces: Array<{ id: number; name: string; roomName: string }> = [];

      for (const draft of conversion.pieces) {
        let room = await tx.quote_rooms.findFirst({
          where: {
            quote_id: quoteId,
            name: draft.roomName,
          },
        });

        if (!room) {
          const maxRoom = await tx.quote_rooms.findFirst({
            where: { quote_id: quoteId },
            orderBy: { sort_order: 'desc' },
            select: { sort_order: true },
          });

          room = await tx.quote_rooms.create({
            data: {
              quote_id: quoteId,
              name: draft.roomName,
              sort_order: (maxRoom?.sort_order ?? -1) + 1,
            },
          });
        }

        const maxPiece = await tx.quote_pieces.findFirst({
          where: { room_id: room.id },
          orderBy: { sort_order: 'desc' },
          select: { sort_order: true },
        });

        const noStrip = new Set(draft.noStripEdges);
        const polishedEdgeId = defaultEdgeType?.id ?? null;
        const edgeFor = (side: 'top' | 'bottom' | 'left' | 'right') =>
          noStrip.has(side) ? null : polishedEdgeId;

        const piece = await tx.quote_pieces.create({
          data: {
            room_id: room.id,
            name: draft.name,
            description: `Imported from LiDAR prototype scan ${scan.scanId}`,
            length_mm: draft.lengthMm,
            width_mm: draft.widthMm,
            thickness_mm: draft.thicknessMm,
            area_sqm: draft.areaSqm,
            material_id: material?.id ?? null,
            material_name: material?.name ?? null,
            material_cost: 0,
            features_cost: 0,
            total_cost: 0,
            sort_order: (maxPiece?.sort_order ?? -1) + 1,
            cutouts: toPrismaJson(draft.cutouts),
            edge_top: edgeFor('top'),
            edge_bottom: edgeFor('bottom'),
            edge_left: edgeFor('left'),
            edge_right: edgeFor('right'),
            no_strip_edges: toPrismaJson(draft.noStripEdges),
            shape_type: draft.shapeType,
            shape_config: draft.shapeConfig ? toPrismaJson(draft.shapeConfig) : undefined,
          },
        });

        createdPieces.push({
          id: piece.id,
          name: piece.name,
          roomName: room.name,
        });
      }

      return createdPieces;
    });

    await prisma.slab_optimizations.deleteMany({
      where: { quoteId },
    });
    await recalculateQuote(quoteId);

    return NextResponse.json({
      success: true,
      scanId,
      imported,
      warnings: conversion.warnings,
    });
  } catch (error) {
    console.error('Error importing LiDAR scan:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import LiDAR scan' },
      { status: 500 }
    );
  }
}
