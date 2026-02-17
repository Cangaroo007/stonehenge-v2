import prisma from '@/lib/db';
import type {
  CustomerLocationData,
  CreateCustomerLocationInput,
  UpdateCustomerLocationInput,
} from '@/lib/types/customer-location';

/**
 * Maps DB record to TypeScript interface (camelCase).
 */
function toLocationData(record: Record<string, unknown>): CustomerLocationData {
  return {
    id: record.id as number,
    customerId: record.customer_id as number,
    label: record.label as string | null,
    addressLine1: record.address_line1 as string,
    addressLine2: record.address_line2 as string | null,
    suburb: record.suburb as string,
    state: record.state as string,
    postcode: record.postcode as string,
    country: record.country as string,
    isDefault: record.is_default as boolean,
    notes: record.notes as string | null,
  };
}

export async function getLocationsForCustomer(customerId: number): Promise<CustomerLocationData[]> {
  const locations = await prisma.customer_locations.findMany({
    where: { customer_id: customerId },
    orderBy: [{ is_default: 'desc' }, { label: 'asc' }],
  });
  return locations.map((l) => toLocationData(l as unknown as Record<string, unknown>));
}

export async function getLocation(id: number): Promise<CustomerLocationData | null> {
  const location = await prisma.customer_locations.findUnique({ where: { id } });
  return location ? toLocationData(location as unknown as Record<string, unknown>) : null;
}

export async function createLocation(input: CreateCustomerLocationInput): Promise<CustomerLocationData> {
  if (input.isDefault) {
    await prisma.customer_locations.updateMany({
      where: { customer_id: input.customerId, is_default: true },
      data: { is_default: false },
    });
  }

  const location = await prisma.customer_locations.create({
    data: {
      customer_id: input.customerId,
      label: input.label ?? null,
      address_line1: input.addressLine1,
      address_line2: input.addressLine2 ?? null,
      suburb: input.suburb,
      state: input.state,
      postcode: input.postcode,
      country: input.country ?? 'Australia',
      is_default: input.isDefault ?? false,
      notes: input.notes ?? null,
    },
  });
  return toLocationData(location as unknown as Record<string, unknown>);
}

export async function updateLocation(
  id: number,
  input: UpdateCustomerLocationInput
): Promise<CustomerLocationData> {
  if (input.isDefault === true) {
    const existing = await prisma.customer_locations.findUnique({
      where: { id },
      select: { customer_id: true },
    });
    if (existing) {
      await prisma.customer_locations.updateMany({
        where: { customer_id: existing.customer_id, is_default: true, NOT: { id } },
        data: { is_default: false },
      });
    }
  }

  const updateData: Record<string, unknown> = {};
  if (input.label !== undefined) updateData.label = input.label;
  if (input.addressLine1 !== undefined) updateData.address_line1 = input.addressLine1;
  if (input.addressLine2 !== undefined) updateData.address_line2 = input.addressLine2;
  if (input.suburb !== undefined) updateData.suburb = input.suburb;
  if (input.state !== undefined) updateData.state = input.state;
  if (input.postcode !== undefined) updateData.postcode = input.postcode;
  if (input.country !== undefined) updateData.country = input.country;
  if (input.isDefault !== undefined) updateData.is_default = input.isDefault;
  if (input.notes !== undefined) updateData.notes = input.notes;

  const location = await prisma.customer_locations.update({
    where: { id },
    data: updateData,
  });
  return toLocationData(location as unknown as Record<string, unknown>);
}

export async function deleteLocation(id: number): Promise<void> {
  await prisma.customer_locations.delete({ where: { id } });
}
