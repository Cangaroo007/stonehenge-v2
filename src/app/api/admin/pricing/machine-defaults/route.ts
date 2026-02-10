import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const VALID_OPERATION_TYPES = [
  'INITIAL_CUT',
  'EDGE_POLISHING',
  'MITRING',
  'LAMINATION',
  'CUTOUT',
] as const;

type OperationTypeValue = (typeof VALID_OPERATION_TYPES)[number];

/**
 * GET /api/admin/pricing/machine-defaults
 * Returns all operation→machine default mappings with machine details.
 */
export async function GET() {
  try {
    const defaults = await prisma.machine_operation_defaults.findMany({
      include: {
        machine: true,
      },
      orderBy: { operation_type: 'asc' },
    });

    // Transform to camelCase for frontend
    const transformed = defaults.map((d) => ({
      id: d.id,
      operationType: d.operation_type,
      machineId: d.machine_id,
      isDefault: d.is_default,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
      machine: {
        id: d.machine.id,
        name: d.machine.name,
        kerfWidthMm: d.machine.kerf_width_mm,
        maxSlabLengthMm: d.machine.max_slab_length_mm,
        maxSlabWidthMm: d.machine.max_slab_width_mm,
        isDefault: d.machine.is_default,
        isActive: d.machine.is_active,
      },
    }));

    return NextResponse.json(transformed);
  } catch (error) {
    console.error('Error fetching machine-operation defaults:', error);
    return NextResponse.json(
      { error: 'Failed to fetch machine-operation defaults' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/pricing/machine-defaults
 * Updates the default machine for a specific operation type.
 * Body: { operationType: string, machineId: string }
 */
export async function PUT(request: Request) {
  try {
    const data = await request.json();

    // Validate operationType
    if (
      !data.operationType ||
      !VALID_OPERATION_TYPES.includes(data.operationType as OperationTypeValue)
    ) {
      return NextResponse.json(
        {
          error: `Invalid operationType. Must be one of: ${VALID_OPERATION_TYPES.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Validate machineId
    if (!data.machineId || typeof data.machineId !== 'string') {
      return NextResponse.json(
        { error: 'machineId is required' },
        { status: 400 }
      );
    }

    // Verify the machine exists and is active
    const machine = await prisma.machine_profiles.findUnique({
      where: { id: data.machineId },
    });

    if (!machine) {
      return NextResponse.json(
        { error: 'Machine profile not found' },
        { status: 404 }
      );
    }

    if (!machine.is_active) {
      return NextResponse.json(
        { error: 'Cannot assign an inactive machine as default' },
        { status: 400 }
      );
    }

    // Upsert the default mapping
    const result = await prisma.machine_operation_defaults.upsert({
      where: {
        operation_type: data.operationType as OperationTypeValue,
      },
      update: {
        machine_id: data.machineId,
        updated_at: new Date(),
      },
      create: {
        operation_type: data.operationType as OperationTypeValue,
        machine_id: data.machineId,
        is_default: true,
        updated_at: new Date(),
      },
      include: {
        machine: true,
      },
    });

    return NextResponse.json({
      id: result.id,
      operationType: result.operation_type,
      machineId: result.machine_id,
      isDefault: result.is_default,
      machine: {
        id: result.machine.id,
        name: result.machine.name,
        kerfWidthMm: result.machine.kerf_width_mm,
        isDefault: result.machine.is_default,
        isActive: result.machine.is_active,
      },
    });
  } catch (error) {
    console.error('Error updating machine-operation default:', error);
    return NextResponse.json(
      { error: 'Failed to update machine-operation default' },
      { status: 500 }
    );
  }
}
