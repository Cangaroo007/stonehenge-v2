/**
 * One-time migration script to generate thumbnails for existing drawings.
 *
 * Finds all Drawing records with thumbnailKey = null,
 * downloads from R2, generates a thumbnail, uploads, and updates the record.
 *
 * Processes in batches of 5 to avoid memory issues.
 *
 * Usage:
 *   npx tsx scripts/generate-thumbnails.ts
 *   npx tsx scripts/generate-thumbnails.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';

const BATCH_SIZE = 5;
const isDryRun = process.argv.includes('--dry-run');

async function main() {
  const prisma = new PrismaClient();

  try {
    // Find all drawings without thumbnails (both PDFs and images)
    const drawings = await prisma.drawings.findMany({
      where: {
        thumbnailKey: null,
        mimeType: 'application/pdf',
      },
      select: {
        id: true,
        filename: true,
        storageKey: true,
        mimeType: true,
      },
      orderBy: { uploadedAt: 'desc' },
    });

    console.log(`Found ${drawings.length} PDF drawings without thumbnails`);

    if (isDryRun) {
      console.log('\n[DRY RUN] Would process:');
      for (const d of drawings) {
        console.log(`  - ${d.filename} (${d.id})`);
      }
      return;
    }

    let succeeded = 0;
    let failed = 0;

    // Process in batches
    for (let i = 0; i < drawings.length; i += BATCH_SIZE) {
      const batch = drawings.slice(i, i + BATCH_SIZE);
      console.log(`\nProcessing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(drawings.length / BATCH_SIZE)}...`);

      for (const drawing of batch) {
        try {
          console.log(`  Processing: ${drawing.filename} (${drawing.id})`);

          // Dynamic imports to handle ESM modules
          const { getFromR2 } = await import('../src/lib/storage/r2');
          const { generateAndStoreThumbnail } = await import('../src/lib/services/pdfThumbnail');

          const pdfBuffer = await getFromR2(drawing.storageKey);
          if (!pdfBuffer) {
            console.log(`    SKIP: File not found in storage`);
            failed++;
            continue;
          }

          const thumbnailKey = await generateAndStoreThumbnail(
            drawing.id,
            pdfBuffer,
            drawing.storageKey
          );

          console.log(`    OK: ${thumbnailKey}`);
          succeeded++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.log(`    FAIL: ${message}`);
          failed++;
        }
      }
    }

    console.log(`\nComplete: ${succeeded} succeeded, ${failed} failed out of ${drawings.length} total`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
