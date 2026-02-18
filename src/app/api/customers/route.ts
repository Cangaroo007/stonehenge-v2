import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import bcrypt from 'bcryptjs';
import { UserRole, CustomerUserRole } from '@prisma/client';
import { requireAuth } from '@/lib/auth';

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
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { companyId } = auth.user;

    const customers = await prisma.customers.findMany({
      where: { company_id: companyId },
      orderBy: { name: 'asc' },
      include: {
        client_types: true,
        client_tiers: true,
        price_books: true,
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
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { companyId } = auth.user;

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
      const customer = await tx.customers.create({
        data: {
          name: data.name,
          company_id: companyId,
          company: data.company || null,
          email: data.email || null,
          phone: data.phone || null,
          address: data.address || null,
          notes: data.notes || null,
          client_type_id: data.clientTypeId || null,
          client_tier_id: data.clientTierId || null,
          default_price_book_id: data.defaultPriceBookId || null,
          updated_at: new Date(),
        },
        include: {
          client_types: true,
          client_tiers: true,
          price_books: true,
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
            password_hash: hashedPassword,
            name: data.name,
            role: UserRole.CUSTOMER,
            customer_user_role: data.customerUserRole as CustomerUserRole || CustomerUserRole.CUSTOMER_ADMIN,
            customer_id: customer.id,
            is_active: true,
            updated_at: new Date(),
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
        role: result.portalUser.customer_user_role,
      };
    }

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('Error creating customer:', error);
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 });
  }
}
