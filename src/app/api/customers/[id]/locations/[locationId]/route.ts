import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getLocation, updateLocation, deleteLocation } from '@/lib/services/customer-location-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; locationId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { locationId } = await params;
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
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { locationId } = await params;
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
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { locationId } = await params;
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
