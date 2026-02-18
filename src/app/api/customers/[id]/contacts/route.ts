import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, verifyCustomerOwnership } from '@/lib/auth';
import { getContactsForCustomer, createContact } from '@/lib/services/customer-contact-service';
import type { ContactRole } from '@prisma/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { companyId } = auth.user;

    const { id } = await params;
    const customerId = parseInt(id);
    if (isNaN(customerId)) {
      return NextResponse.json({ error: 'Invalid customer ID' }, { status: 400 });
    }

    const ownerCheck = await verifyCustomerOwnership(customerId, companyId);
    if (!ownerCheck) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const contacts = await getContactsForCustomer(customerId);
    return NextResponse.json(contacts);
  } catch (error) {
    console.error('Error fetching contacts:', error);
    return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { companyId } = auth.user;

    const { id } = await params;
    const customerId = parseInt(id);
    if (isNaN(customerId)) {
      return NextResponse.json({ error: 'Invalid customer ID' }, { status: 400 });
    }

    const ownerCheck = await verifyCustomerOwnership(customerId, companyId);
    if (!ownerCheck) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const body = await request.json();

    if (!body.firstName || !body.lastName) {
      return NextResponse.json(
        { error: 'firstName and lastName are required' },
        { status: 400 }
      );
    }

    const contact = await createContact({
      customerId,
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      phone: body.phone,
      mobile: body.mobile,
      role: body.role as ContactRole | undefined,
      roleTitle: body.roleTitle,
      isPrimary: body.isPrimary,
      notes: body.notes,
      hasPortalAccess: body.hasPortalAccess,
    });

    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    console.error('Error creating contact:', error);
    return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 });
  }
}
