import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import prisma from '@/lib/db';
import { getDownloadUrl } from '@/lib/storage/r2';
import DrawingFullView from './DrawingFullView';

export const dynamic = 'force-dynamic';

export default async function DrawingViewPage({
  params,
}: {
  params: Promise<{ id: string; drawingId: string }>;
}) {
  const { id, drawingId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const drawing = await prisma.drawings.findUnique({
    where: { id: drawingId },
    include: {
      quotes: {
        select: {
          id: true,
          quote_number: true,
          project_name: true,
        },
      },
    },
  });

  if (!drawing || drawing.quoteId !== parseInt(id, 10)) {
    notFound();
  }

  const url = await getDownloadUrl(drawing.storageKey, 3600);

  const drawingData = {
    id: drawing.id,
    filename: drawing.filename,
    mimeType: drawing.mimeType,
    fileSize: drawing.fileSize,
    uploadedAt: drawing.uploadedAt.toISOString(),
    isPrimary: drawing.isPrimary,
    notes: drawing.notes,
    url,
    quote: {
      id: drawing.quotes.id,
      quoteNumber: drawing.quotes.quote_number,
      projectName: drawing.quotes.project_name,
    },
  };

  return <DrawingFullView drawing={drawingData} />;
}
