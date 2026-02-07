import prisma from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { generateQuoteNumber } from '@/lib/utils';
import QuoteForm from '@/components/QuoteForm';

export const dynamic = 'force-dynamic';

async function getData() {
  const [customers, materials, pricingRules, edgeTypes, lastQuote] = await Promise.all([
    prisma.customers.findMany({
      orderBy: { name: 'asc' },
      include: {
        clientTier: true,
        clientType: true,
      },
    }),
    prisma.materials.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.featurePricing.findMany({ where: { isActive: true }, orderBy: { category: 'asc' } }),
    prisma.edgeType.findMany({
      where: { isActive: { not: false } }, // Include true and null (treat null as active)
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.quotes.findFirst({ orderBy: { quoteNumber: 'desc' } }),
  ]);

  const nextQuoteNumber = generateQuoteNumber(lastQuote?.quoteNumber || null);

  // Serialize Prisma Decimal types to JSON-safe values
  const serialized = JSON.parse(JSON.stringify({ customers, materials, pricingRules, edgeTypes }));

  return { ...serialized, nextQuoteNumber };
}

export default async function NewQuotePage() {
  const [data, user] = await Promise.all([getData(), getCurrentUser()]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">New Quote</h1>
      </div>

      <QuoteForm
        customers={data.customers}
        materials={data.materials}
        pricingRules={data.pricingRules}
        edgeTypes={data.edgeTypes}
        nextQuoteNumber={data.nextQuoteNumber}
        userId={user?.id}
      />
    </div>
  );
}
