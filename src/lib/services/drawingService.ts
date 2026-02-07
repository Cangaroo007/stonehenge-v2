import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { deleteFromR2 } from '@/lib/storage/r2';

export interface CreateDrawingInput {
  filename: string;
  storageKey: string;
  mimeType: string;
  fileSize: number;
  quoteId: number;
  customerId: number;
  analysisData?: Record<string, unknown>;
  isPrimary?: boolean;
  notes?: string;
}

export async function createDrawing(input: CreateDrawingInput) {
  // If this is marked as primary, unset any existing primary for this quote
  if (input.isPrimary) {
    await prisma.drawings.updateMany({
      where: { quoteId: input.quoteId, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  return prisma.drawings.create({
    data: {
      filename: input.filename,
      storageKey: input.storageKey,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      quoteId: input.quoteId,
      customerId: input.customerId,
      analysisData: input.analysisData
        ? (input.analysisData as unknown as Prisma.InputJsonValue)
        : undefined,
      isPrimary: input.isPrimary ?? false,
      notes: input.notes,
    },
  });
}

export async function getDrawingsForQuote(quoteId: number) {
  return prisma.drawings.findMany({
    where: { quoteId },
    orderBy: [{ isPrimary: 'desc' }, { uploadedAt: 'desc' }],
  });
}

export async function getDrawingsForCustomer(customerId: number) {
  return prisma.drawings.findMany({
    where: { customerId },
    orderBy: { uploadedAt: 'desc' },
    include: {
      quote: {
        select: {
          id: true,
          quoteNumber: true,
          status: true,
        },
      },
    },
  });
}

export async function getPrimaryDrawing(quoteId: number) {
  return prisma.drawings.findFirst({
    where: { quoteId, isPrimary: true },
  });
}

export async function setDrawingAsPrimary(drawingId: string, quoteId: number) {
  // Unset existing primary
  await prisma.drawings.updateMany({
    where: { quoteId, isPrimary: true },
    data: { isPrimary: false },
  });

  // Set new primary
  return prisma.drawings.update({
    where: { id: drawingId },
    data: { isPrimary: true },
  });
}

export async function deleteDrawing(drawingId: string) {
  const drawing = await prisma.drawings.findUnique({
    where: { id: drawingId },
    select: { storageKey: true },
  });

  if (!drawing) {
    throw new Error('Drawing not found');
  }

  // Delete from R2
  await deleteFromR2(drawing.storageKey);

  // Delete from database
  return prisma.drawings.delete({
    where: { id: drawingId },
  });
}

export async function updateDrawingNotes(drawingId: string, notes: string) {
  return prisma.drawings.update({
    where: { id: drawingId },
    data: { notes },
  });
}

export async function updateDrawingAnalysis(
  drawingId: string,
  analysisData: Record<string, unknown>
) {
  return prisma.drawings.update({
    where: { id: drawingId },
    data: {
      analysisData: analysisData as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function getDrawingById(drawingId: string) {
  return prisma.drawings.findUnique({
    where: { id: drawingId },
    include: {
      quote: {
        select: {
          id: true,
          quoteNumber: true,
          status: true,
          customerId: true,
        },
      },
      customer: {
        select: {
          id: true,
          name: true,
          company: true,
        },
      },
    },
  });
}
