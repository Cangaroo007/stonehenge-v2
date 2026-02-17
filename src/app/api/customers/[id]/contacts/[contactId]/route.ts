import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getContact, updateContact, deleteContact } from '@/lib/services/customer-contact-service';
import type { ContactRole } from '@prisma/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { contactId } = await params;
    const contactIdNum = parseInt(contactId);
    if (isNaN(contactIdNum)) {
      return NextResponse.json({ error: 'Invalid contact ID' }, { status: 400 });
    }

    const contact = await getContact(contactIdNum);
    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    return NextResponse.json(contact);
  } catch (error) {
    console.error('Error fetching contact:', error);
    return NextResponse.json({ error: 'Failed to fetch contact' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { contactId } = await params;
    const contactIdNum = parseInt(contactId);
    if (isNaN(contactIdNum)) {
      return NextResponse.json({ error: 'Invalid contact ID' }, { status: 400 });
    }

    const body = await request.json();

    const contact = await updateContact(contactIdNum, {
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

    return NextResponse.json(contact);
  } catch (error) {
    console.error('Error updating contact:', error);
    return NextResponse.json({ error: 'Failed to update contact' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { contactId } = await params;
    const contactIdNum = parseInt(contactId);
    if (isNaN(contactIdNum)) {
      return NextResponse.json({ error: 'Invalid contact ID' }, { status: 400 });
    }

    await deleteContact(contactIdNum);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting contact:', error);
    return NextResponse.json({ error: 'Failed to delete contact' }, { status: 500 });
  }
}
