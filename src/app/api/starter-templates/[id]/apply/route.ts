import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { applyTemplateToQuote } from '@/lib/services/template-applier';
import { calculateQuotePrice } from '@/lib/services/pricing-calculator-v2';
import { buildQuotePricingUpdate } from '@/lib/services/quote-pricing-persistence';
import type { MaterialRole } from '@/lib/types/starter-templates';

async function recalculateQuote(quoteId: number) {
  const calcResult = await calculateQuotePrice(String(quoteId), { forceRecalculate: true });
  await prisma.quotes.update({
    where: { id: quoteId },
    data: buildQuotePricingUpdate(calcResult),
  });
}

// POST — Apply this template to a quote (create pieces from template)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { id } = await params;

    // Verify template exists and is accessible
    const template = await prisma.starter_templates.findUnique({
      where: { id, companyId: authResult.user.companyId },
    });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const body = await request.json();
    const { materialAssignments, quoteId, customerId, contactId, projectName } = body;

    // materialAssignments is optional — pieces created without material if not provided
    const resolvedAssignments = (materialAssignments && typeof materialAssignments === 'object')
      ? materialAssignments
      : {};

    const assignmentMaterialIds = Array.from(
      new Set(
        Object.values(resolvedAssignments)
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0)
      )
    );
    if (assignmentMaterialIds.length > 0) {
      const ownedMaterialCount = await prisma.materials.count({
        where: {
          id: { in: assignmentMaterialIds },
          company_id: authResult.user.companyId,
        },
      });
      if (ownedMaterialCount !== assignmentMaterialIds.length) {
        return NextResponse.json({ error: 'Material not found' }, { status: 404 });
      }
    }

    // If quoteId provided, verify it exists
    if (quoteId) {
      const quote = await prisma.quotes.findUnique({
        where: { id: Number(quoteId), company_id: authResult.user.companyId },
      });
      if (!quote) {
        return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
      }
    }

    let resolvedCustomerId = customerId ? Number(customerId) : undefined;
    const resolvedContactId = contactId ? Number(contactId) : undefined;

    if (resolvedCustomerId) {
      const customer = await prisma.customers.findFirst({
        where: {
          id: resolvedCustomerId,
          company_id: authResult.user.companyId,
        },
        select: { id: true },
      });
      if (!customer) {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
      }
    }

    if (resolvedContactId) {
      const contact = await prisma.customer_contacts.findFirst({
        where: {
          id: resolvedContactId,
          customer: {
            company_id: authResult.user.companyId,
            ...(resolvedCustomerId ? { id: resolvedCustomerId } : {}),
          },
        },
        select: { id: true, customer_id: true },
      });
      if (!contact) {
        return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
      }
      resolvedCustomerId = resolvedCustomerId ?? contact.customer_id;
    }

    const result = await applyTemplateToQuote({
      templateId: id,
      materialAssignments: resolvedAssignments as Record<MaterialRole, number>,
      quoteId: quoteId ? Number(quoteId) : undefined,
      customerId: resolvedCustomerId,
      contactId: resolvedContactId,
      projectName,
    });

    await prisma.slab_optimizations.deleteMany({
      where: { quoteId: result.quoteId },
    });
    await recalculateQuote(result.quoteId);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to apply template';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
