import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import bcrypt from 'bcryptjs';
import { UserRole, CustomerUserRole } from '@prisma/client';

/**
 * Generate a random temporary password
 */
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export async function GET() {
  try {
    const customers = await prisma.customer.findMany({
      orderBy: { name: 'asc' },
      include: {
        clientType: true,
        clientTier: true,
        defaultPriceBook: true,
      },
    });
    return NextResponse.json(customers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    // Validate email if creating portal user
    if (data.createPortalUser && !data.email) {
      return NextResponse.json(
        { error: 'Email is required to create a portal user' },
        { status: 400 }
      );
    }

    // Check if email already exists (if creating portal user)
    if (data.createPortalUser && data.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email: data.email },
      });
      if (existingUser) {
        return NextResponse.json(
          { error: 'A user with this email already exists' },
          { status: 400 }
        );
      }
    }

    // Create customer and optional portal user in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create customer
      const customer = await tx.customer.create({
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
          clientType: true,
          clientTier: true,
          defaultPriceBook: true,
        },
      });

      let portalUser = null;
      let tempPassword = null;

      // Create portal user if requested
      if (data.createPortalUser && data.email) {
        tempPassword = generateTempPassword();
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        portalUser = await tx.user.create({
          data: {
            email: data.email,
            passwordHash: hashedPassword,
            name: data.name,
            role: UserRole.CUSTOMER,
            customerUserRole: data.customerUserRole as CustomerUserRole || CustomerUserRole.CUSTOMER_ADMIN,
            customerId: customer.id,
            isActive: true,
          },
        });
      }

      return { customer, portalUser, tempPassword };
    });

    // Prepare response
    const response: any = result.customer;
    if (result.portalUser && result.tempPassword) {
      response.portalUser = {
        id: result.portalUser.id,
        email: result.portalUser.email,
        role: result.portalUser.customerUserRole,
      };
    }

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('Error creating customer:', error);
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 });
  }
}
