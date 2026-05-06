import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { getCurrentUser } from '@/lib/auth';
import { uploadToR2, isR2Configured } from '@/lib/storage/r2';
import { classifyDrawing } from '@/lib/services/drawing-classifier';
import { logger } from '@/lib/logger';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const ALLOWED_MIME_TYPES = new Set<string>([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/heic',
  'application/dxf',
  'image/vnd.dxf',
  'application/acad',
  'image/vnd.dwg',
  'application/x-step',
  'model/ifc',
]);

const ALLOWED_EXTENSIONS = new Set<string>([
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'heic',
  'dxf',
  'dwg',
  'ifc',
]);

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return '';
  return filename.slice(dot + 1).toLowerCase();
}

function sanitiseFilename(filename: string): string {
  // Strip directory components and replace anything outside [A-Za-z0-9._-] with _.
  const base = filename.split(/[\\/]/).pop() ?? filename;
  return base.replace(/[^A-Za-z0-9._-]/g, '_');
}

interface PdfMetadata {
  pageCount: number | null;
  pdfProducer: string | null;
  hasTextLayer: boolean | null;
}

async function extractPdfMetadata(buffer: Buffer): Promise<PdfMetadata> {
  try {
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const pageCount = doc.getPageCount();
    const producer = doc.getProducer() ?? null;
    // TODO: hasTextLayer detection — pdf-lib does not expose page text. Adding
    // pdfjs-dist text extraction is a non-trivial worker setup and is out of
    // scope for this sprint. Leave null; classifier defaults to B_SHOP_DRAWING
    // when text-layer signal is unknown.
    return { pageCount, pdfProducer: producer, hasTextLayer: null };
  } catch (err) {
    logger.warn('[Drawing upload] Failed to parse PDF metadata:', err);
    return { pageCount: null, pdfProducer: null, hasTextLayer: null };
  }
}

/**
 * POST /api/drawings/upload
 *
 * Multipart form upload for a drawing file. Stores the file in R2, runs the
 * mechanical classifier, and creates a `drawing_imports` record.
 *
 * Form fields:
 *   - file:    File (required)
 *   - quoteId: string (optional) — links the drawing to a quote
 */
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
    const companyId = currentUser.companyId;
    if (!companyId) {
      return NextResponse.json(
        { error: 'No company associated with user' },
        { status: 403 },
      );
    }

    if (!isR2Configured() && process.env.NODE_ENV === 'production') {
      logger.error('[Drawing upload] R2 storage not configured in production');
      return NextResponse.json(
        { error: 'File storage not configured. Please contact support.' },
        { status: 503 },
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const quoteIdRaw = formData.get('quoteId');

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const ext = getExtension(file.name);
    const mime = (file.type ?? '').toLowerCase();
    const mimeAllowed = mime !== '' && ALLOWED_MIME_TYPES.has(mime);
    const extAllowed = ext !== '' && ALLOWED_EXTENSIONS.has(ext);

    // Accept the file when EITHER mime or extension matches — generic mimes
    // (e.g. application/octet-stream) are common for DWG / DXF / IFC.
    if (!mimeAllowed && !extAllowed) {
      return NextResponse.json(
        {
          error:
            'Invalid file type. Allowed: PDF, JPG, JPEG, PNG, HEIC, DXF, DWG, IFC',
        },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 50MB' },
        { status: 400 },
      );
    }

    let quoteId: number | null = null;
    if (typeof quoteIdRaw === 'string' && quoteIdRaw.trim() !== '') {
      const parsed = Number(quoteIdRaw);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return NextResponse.json(
          { error: 'quoteId must be a positive integer' },
          { status: 400 },
        );
      }
      quoteId = parsed;
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName = sanitiseFilename(file.name);
    const storageKey = `drawings/${companyId}/${Date.now()}-${safeName}`;
    const contentType = mimeAllowed ? mime : 'application/octet-stream';

    try {
      await uploadToR2(storageKey, buffer, contentType);
    } catch (err) {
      logger.error('[Drawing upload] R2 upload failed:', err);
      const message = err instanceof Error ? err.message : 'R2 upload failed';
      return NextResponse.json(
        { error: `Storage upload failed: ${message}` },
        { status: 500 },
      );
    }

    const isPdf = mime === 'application/pdf' || ext === 'pdf';
    const pdfMeta: PdfMetadata = isPdf
      ? await extractPdfMetadata(buffer)
      : { pageCount: null, pdfProducer: null, hasTextLayer: null };

    const classification = classifyDrawing({
      filename: file.name,
      mimeType: mime,
      fileSize: file.size,
      pageCount: pdfMeta.pageCount,
      hasTextLayer: pdfMeta.hasTextLayer,
      pdfProducer: pdfMeta.pdfProducer,
    });

    const drawing = await prisma.drawing_imports.create({
      data: {
        companyId,
        quoteId,
        originalUrl: storageKey,
        filename: file.name,
        mimeType: contentType,
        pageCount: pdfMeta.pageCount,
        drawingClass: classification.drawingClass,
        drawingFormat: classification.drawingFormat,
        metadata: {
          classification: {
            confidence: classification.confidence,
            signals: classification.signals,
          },
          pdf: isPdf
            ? {
                producer: pdfMeta.pdfProducer,
                hasTextLayer: pdfMeta.hasTextLayer,
              }
            : null,
        },
      },
    });

    return NextResponse.json({ drawing, classification }, { status: 201 });
  } catch (err) {
    logger.error('[Drawing upload] Unexpected error:', err);
    const message = err instanceof Error ? err.message : 'Failed to upload drawing';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
