/**
 * Server-side PDF Thumbnail Generation
 *
 * Converts the first page of a PDF into a PNG thumbnail image.
 * Uses pdf-to-img for rendering and sharp for optimization.
 */

import sharp from 'sharp';
import { uploadToR2, getFromR2 } from '@/lib/storage/r2';
import prisma from '@/lib/db';

const THUMBNAIL_WIDTH = 400;
const THUMBNAIL_QUALITY = 80;

/**
 * Generate a PNG thumbnail from a PDF buffer.
 * Renders the first page and optimizes with sharp.
 */
export async function generatePdfThumbnailBuffer(
  pdfBuffer: Buffer
): Promise<Buffer> {
  // Dynamic import because pdf-to-img is ESM-only
  const { pdf } = await import('pdf-to-img');

  const doc = await pdf(pdfBuffer, { scale: 2.0 });

  let firstPageImage: Buffer | null = null;
  for await (const page of doc) {
    firstPageImage = Buffer.from(page);
    break; // Only need the first page
  }

  if (!firstPageImage) {
    throw new Error('Failed to render PDF page');
  }

  // Optimize with sharp: resize and convert to PNG
  const thumbnail = await sharp(firstPageImage)
    .resize(THUMBNAIL_WIDTH, undefined, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png({ quality: THUMBNAIL_QUALITY, compressionLevel: 8 })
    .toBuffer();

  return thumbnail;
}

/**
 * Generate a thumbnail for a PDF drawing and upload to R2.
 * Updates the drawing record with the thumbnail storage key.
 *
 * @param drawingId - The drawing database ID
 * @param pdfBuffer - The PDF file buffer
 * @param storageKey - The original file storage key (used to derive thumbnail key)
 * @returns The thumbnail storage key
 */
export async function generateAndStoreThumbnail(
  drawingId: string,
  pdfBuffer: Buffer,
  storageKey: string
): Promise<string> {
  const thumbnailKey = storageKey.replace(/\.pdf$/i, '_thumb.png');

  try {
    const thumbnail = await generatePdfThumbnailBuffer(pdfBuffer);

    await uploadToR2(thumbnailKey, thumbnail, 'image/png');

    await prisma.drawing.update({
      where: { id: drawingId },
      data: { thumbnailKey },
    });

    console.log(
      `[PDF Thumbnail] Generated thumbnail for drawing ${drawingId}: ${thumbnailKey} (${thumbnail.length} bytes)`
    );

    return thumbnailKey;
  } catch (error) {
    console.error(
      `[PDF Thumbnail] Failed to generate thumbnail for drawing ${drawingId}:`,
      error
    );
    throw error;
  }
}

/**
 * Get the thumbnail buffer for a drawing.
 * Returns the thumbnail from R2, or null if not available.
 */
export async function getThumbnailBuffer(
  thumbnailKey: string
): Promise<Buffer | null> {
  return getFromR2(thumbnailKey);
}
