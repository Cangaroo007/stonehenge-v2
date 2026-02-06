import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';

type TransactionClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const priceBook = await prisma.priceBook.findUnique({
      where: { id },
      include: {
        rules: {
          include: {
            pricingRule: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!priceBook) {
      return NextResponse.json({ error: 'Price book not found' }, { status: 404 });
    }

    return NextResponse.json(priceBook);
  } catch (error) {
    console.error('Error fetching price book:', error);
    return NextResponse.json({ error: 'Failed to fetch price book' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await request.json();

    // Update the price book and its rules in a transaction
    const priceBook = await prisma.$transaction(async (tx: TransactionClient) => {
      // First, delete existing rules
      await tx.priceBookRule.deleteMany({
        where: { priceBookId: id },
      });

      // Update the price book and create new rules
      return tx.priceBook.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description || null,
          category: data.category || 'general',
          defaultThickness: data.defaultThickness || 20,
          isDefault: data.isDefault || false,
          sortOrder: data.sortOrder || 0,
          isActive: data.isActive ?? true,
          rules: data.ruleIds && data.ruleIds.length > 0 ? {
            create: data.ruleIds.map((ruleId: string, index: number) => ({
              pricingRuleId: ruleId,
              sortOrder: index,
            })),
          } : undefined,
        },
        include: {
          rules: {
            include: {
              pricingRule: true,
            },
          },
        },
      });
    });

    return NextResponse.json(priceBook);
  } catch (error) {
    console.error('Error updating price book:', error);
    return NextResponse.json({ error: 'Failed to update price book' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Soft delete by setting isActive to false
    await prisma.priceBook.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting price book:', error);
    return NextResponse.json({ error: 'Failed to delete price book' }, { status: 500 });
  }
}
