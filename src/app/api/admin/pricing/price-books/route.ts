import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET() {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const priceBooks = await prisma.price_books.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        price_book_rules: {
          include: {
            pricing_rules_engine: true,
          },
        },
      },
    });
    return NextResponse.json(priceBooks);
  } catch (error) {
    console.error('Error fetching price books:', error);
    return NextResponse.json({ error: 'Failed to fetch price books' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const data = await request.json();

    const priceBook = await prisma.price_books.create({
      data: {
        id: crypto.randomUUID(),
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

    return NextResponse.json(priceBook, { status: 201 });
  } catch (error) {
    console.error('Error creating price book:', error);
    return NextResponse.json({ error: 'Failed to create price book' }, { status: 500 });
  }
}
