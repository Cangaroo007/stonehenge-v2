import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET() {
  try {
    const priceBooks = await prisma.price_books.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        rules: {
          include: {
            pricingRule: true,
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
    const data = await request.json();

    const priceBook = await prisma.price_books.create({
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

    return NextResponse.json(priceBook, { status: 201 });
  } catch (error) {
    console.error('Error creating price book:', error);
    return NextResponse.json({ error: 'Failed to create price book' }, { status: 500 });
  }
}
