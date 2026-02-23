import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, verifyCustomerOwnership } from '@/lib/auth';
import { getLocationsForCustomer, createLocation } from '@/lib/services/customer-location-service';

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

    const locations = await getLocationsForCustomer(customerId);
    return NextResponse.json(locations);
  } catch (error) {
    console.error('Error fetching locations:', error);
    return NextResponse.json({ error: 'Failed to fetch locations' }, { status: 500 });
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

    if (!body.addressLine1 || !body.suburb || !body.state || !body.postcode) {
      return NextResponse.json(
        { error: 'addressLine1, suburb, state, and postcode are required' },
        { status: 400 }
      );
    }

    const location = await createLocation({
      customerId,
      label: body.label,
      addressLine1: body.addressLine1,
      addressLine2: body.addressLine2,
      suburb: body.suburb,
      state: body.state,
      postcode: body.postcode,
      country: body.country,
      isDefault: body.isDefault,
      notes: body.notes,
    });

    return NextResponse.json(location, { status: 201 });
  } catch (error) {
    console.error('Error creating location:', error);
    return NextResponse.json({ error: 'Failed to create location' }, { status: 500 });
  }
}
