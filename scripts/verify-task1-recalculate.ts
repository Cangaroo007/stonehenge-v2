import { calculateQuotePrice } from '../src/lib/services/pricing-calculator-v2';
import { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const result = await calculateQuotePrice('55', { forceRecalculate: true });
  await prisma.quotes.update({
    where: { id: 55 },
    data: {
      subtotal: result.subtotal,
      tax_amount: result.gstAmount,
      total: result.totalIncGst,
      calculated_at: new Date(),
      calculation_breakdown: result as unknown as Prisma.InputJsonValue,
    },
  });
  console.log('Recalculation complete. Subtotal:', result.subtotal);
  await prisma.$disconnect();
}

run().catch(console.error);
