import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, verifyCustomerOwnership } from '@/lib/auth';
import { getLocation, updateLocation, deleteLocation } from '@/lib/services/customer-location-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; locationId: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { companyId } = auth.user;

    const { id, locationId } = await params;
    const customerId = parseInt(id);
    if (isNaN(customerId)) {
      return NextResponse.json({ error: 'Invalid customer ID' }, { status: 400 });
    }

    const ownerCheck = await verifyCustomerOwnership(customerId, companyId);
    if (!ownerCheck) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const locationIdNum = parseInt(locationId);
    if (isNaN(locationIdNum)) {
      return NextResponse.json({ error: 'Invalid location ID' }, { status: 400 });
    }

    const location = await getLocation(locationIdNum);
    if (!location) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 });
    }

    return NextResponse.json(location);
  } catch (error) {
    console.error('Error fetching location:', error);
    return NextResponse.json({ error: 'Failed to fetch location' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; locationId: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { companyId } = auth.user;

    const { id, locationId } = await params;
    const customerId = parseInt(id);
    if (isNaN(customerId)) {
      return NextResponse.json({ error: 'Invalid customer ID' }, { status: 400 });
    }

    const ownerCheck = await verifyCustomerOwnership(customerId, companyId);
    if (!ownerCheck) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const locationIdNum = parseInt(locationId);
    if (isNaN(locationIdNum)) {
      return NextResponse.json({ error: 'Invalid location ID' }, { status: 400 });
    }

    const body = await request.json();

    const location = await updateLocation(locationIdNum, {
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

    return NextResponse.json(location);
  } catch (error) {
    console.error('Error updating location:', error);
    return NextResponse.json({ error: 'Failed to update location' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; locationId: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { companyId } = auth.user;

    const { id, locationId } = await params;
    const customerId = parseInt(id);
    if (isNaN(customerId)) {
      return NextResponse.json({ error: 'Invalid customer ID' }, { status: 400 });
    }

    const ownerCheck = await verifyCustomerOwnership(customerId, companyId);
    if (!ownerCheck) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const locationIdNum = parseInt(locationId);
    if (isNaN(locationIdNum)) {
      return NextResponse.json({ error: 'Invalid location ID' }, { status: 400 });
    }

    await deleteLocation(locationIdNum);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting location:', error);
    return NextResponse.json({ error: 'Failed to delete location' }, { status: 500 });
  }
}
