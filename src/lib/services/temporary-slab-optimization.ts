import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';

/**
 * Run a temporary calculation without the quote's saved optimiser result.
 *
 * Some comparison/option flows temporarily mutate quote pieces, run the normal
 * calculator, then restore the pieces. A saved slab_optimizations row belongs to
 * the real quote, not the temporary scenario, so leaving it in place can leak the
 * base quote slab count into the temporary total.
 */
export async function withoutSavedSlabOptimizations<T>(
  quoteId: number,
  fn: () => Promise<T>
): Promise<T> {
  const existing = await prisma.slab_optimizations.findMany({
    where: { quoteId },
    orderBy: { createdAt: 'asc' },
  });

  if (existing.length === 0) {
    return fn();
  }

  await prisma.slab_optimizations.deleteMany({
    where: { quoteId },
  });

  try {
    return await fn();
  } finally {
    await prisma.slab_optimizations.deleteMany({
      where: { quoteId },
    });

    await prisma.slab_optimizations.createMany({
      data: existing.map((opt) => ({
        id: opt.id,
        quoteId: opt.quoteId,
        slabWidth: opt.slabWidth,
        slabHeight: opt.slabHeight,
        kerfWidth: opt.kerfWidth,
        totalSlabs: opt.totalSlabs,
        totalWaste: opt.totalWaste,
        wastePercent: opt.wastePercent,
        placements: opt.placements as Prisma.InputJsonValue,
        createdAt: opt.createdAt,
        updatedAt: opt.updatedAt,
        laminationSummary: opt.laminationSummary === null
          ? Prisma.JsonNull
          : opt.laminationSummary as Prisma.InputJsonValue,
      })),
    });
  }
}
