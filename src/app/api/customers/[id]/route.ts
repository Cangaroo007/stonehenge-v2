import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const customer = await prisma.customers.findUnique({
      where: { id: parseInt(id) },
      include: {
        client_types: true,
        client_tiers: true,
        price_books: true,
        _count: {
          select: {
            quotes: true,
            users: true,
          },
        },
      },
    });

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    return NextResponse.json(customer);
  } catch (error) {
    console.error('Error fetching customer:', error);
    return NextResponse.json({ error: 'Failed to fetch customer' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await request.json();

    const customer = await prisma.customers.update({
      where: { id: parseInt(id) },
      data: {
        name: data.name,
        company: data.company || null,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
        notes: data.notes || null,
        clientTypeId: data.clientTypeId || null,
        clientTierId: data.clientTierId || null,
        defaultPriceBookId: data.defaultPriceBookId || null,
      },
      include: {
        client_types: true,
        client_tiers: true,
        price_books: true,
      },
    });

    return NextResponse.json(customer);
  } catch (error) {
    console.error('Error updating customer:', error);
    return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.customers.delete({
      where: { id: parseInt(id) },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting customer:', error);
    return NextResponse.json({ error: 'Failed to delete customer' }, { status: 500 });
  }
}
