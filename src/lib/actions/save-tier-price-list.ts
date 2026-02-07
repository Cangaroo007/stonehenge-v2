'use server';

import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import type { TierPriceMapping } from '@/lib/types/price-interpreter';

/**
 * Save the confirmed AI-interpreted price mapping to a tier's customPriceList JSON field.
 *
 * @param tierId - The ID of the ClientTier to update
 * @param finalMapping - The confirmed TierPriceMapping array from the verification UI
 * @returns The updated ClientTier record
 */
export async function saveTierPriceList(
  tierId: string,
  finalMapping: TierPriceMapping[]
) {
  if (!tierId) {
    throw new Error('tierId is required');
  }

  if (!finalMapping || !Array.isArray(finalMapping)) {
    throw new Error('finalMapping must be a non-empty array');
  }

  // Verify the tier exists
  const existing = await prisma.client_tiers.findUnique({
    where: { id: tierId },
  });

  if (!existing) {
    throw new Error(`Client tier not found: ${tierId}`);
  }

  // Railway-safe double-cast pattern for Prisma JSON field
  const customPriceListData = finalMapping as unknown as Prisma.InputJsonValue;

  const updatedTier = await prisma.client_tiers.update({
    where: { id: tierId },
    data: {
      customPriceList: customPriceListData,
    },
  });

  return updatedTier;
}
