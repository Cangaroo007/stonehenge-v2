import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/auth';

type TransactionClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const priceBook = await prisma.price_books.findUnique({
      where: { id },
      include: {
        price_book_rules: {
          include: {
            pricing_rules_engine: true,
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
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const data = await request.json();

    // Update the price book and its rules in a transaction
    const priceBook = await prisma.$transaction(async (tx: TransactionClient) => {
      // First, delete existing rules
      await tx.price_book_rules.deleteMany({
        where: { price_book_id: id },
      });

      // Update the price book and create new rules
      return tx.price_books.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description || null,
          category: data.category || 'general',
          defaultThickness: data.defaultThickness || 20,
          isDefault: data.isDefault || false,
          sortOrder: data.sortOrder || 0,
          isActive: data.isActive ?? true,
          updatedAt: new Date(),
          price_book_rules: data.ruleIds && data.ruleIds.length > 0 ? {
            create: data.ruleIds.map((ruleId: string, index: number) => ({
              id: crypto.randomUUID(),
              pricing_rule_id: ruleId,
              sortOrder: index,
            })),
          } : undefined,
        },
        include: {
          price_book_rules: {
            include: {
              pricing_rules_engine: true,
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
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;

    // Soft delete by setting isActive to false
    await prisma.price_books.update({
      where: { id },
      data: { isActive: false, updatedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting price book:', error);
    return NextResponse.json({ error: 'Failed to delete price book' }, { status: 500 });
  }
}
