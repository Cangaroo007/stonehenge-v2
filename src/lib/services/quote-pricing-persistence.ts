import { Prisma } from '@prisma/client';
import type { CalculationResult } from '@/lib/types/pricing';

function toPercentRate(decimalRate: number): number {
  return Math.round(decimalRate * 10000) / 100;
}

export function buildQuotePricingUpdate(result: CalculationResult): Prisma.quotesUpdateInput {
  return {
    subtotal: result.subtotal,
    tax_rate: toPercentRate(result.gstRate),
    tax_amount: result.gstAmount,
    total: result.totalIncGst,
    calculated_total: result.totalIncGst,
    calculated_at: new Date(),
    calculation_breakdown: result as unknown as Prisma.InputJsonValue,
  };
}
