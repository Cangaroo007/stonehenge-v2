import prisma from '@/lib/db';
import type {
  CustomerContactData,
  CreateCustomerContactInput,
  UpdateCustomerContactInput,
} from '@/lib/types/customer-contact';

/**
 * Maps DB record to TypeScript interface (camelCase).
 */
function toContactData(record: Record<string, unknown>): CustomerContactData {
  return {
    id: record.id as number,
    customerId: record.customer_id as number,
    firstName: record.first_name as string,
    lastName: record.last_name as string,
    email: record.email as string | null,
    phone: record.phone as string | null,
    mobile: record.mobile as string | null,
    role: record.role as CustomerContactData['role'],
    roleTitle: record.role_title as string | null,
    isPrimary: record.is_primary as boolean,
    notes: record.notes as string | null,
    hasPortalAccess: record.has_portal_access as boolean,
    portalUserId: record.portal_user_id as number | null,
  };
}

export async function getContactsForCustomer(customerId: number): Promise<CustomerContactData[]> {
  const contacts = await prisma.customer_contacts.findMany({
    where: { customer_id: customerId },
    orderBy: [{ is_primary: 'desc' }, { first_name: 'asc' }],
  });
  return contacts.map((c) => toContactData(c as unknown as Record<string, unknown>));
}

export async function getContact(id: number): Promise<CustomerContactData | null> {
  const contact = await prisma.customer_contacts.findUnique({ where: { id } });
  return contact ? toContactData(contact as unknown as Record<string, unknown>) : null;
}

export async function createContact(input: CreateCustomerContactInput): Promise<CustomerContactData> {
  if (input.isPrimary) {
    await prisma.customer_contacts.updateMany({
      where: { customer_id: input.customerId, is_primary: true },
      data: { is_primary: false },
    });
  }

  const contact = await prisma.customer_contacts.create({
    data: {
      customer_id: input.customerId,
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email ?? null,
      phone: input.phone ?? null,
      mobile: input.mobile ?? null,
      role: input.role ?? 'PRIMARY',
      role_title: input.roleTitle ?? null,
      is_primary: input.isPrimary ?? false,
      notes: input.notes ?? null,
      has_portal_access: input.hasPortalAccess ?? false,
    },
  });
  return toContactData(contact as unknown as Record<string, unknown>);
}

export async function updateContact(
  id: number,
  input: UpdateCustomerContactInput
): Promise<CustomerContactData> {
  if (input.isPrimary === true) {
    const existing = await prisma.customer_contacts.findUnique({
      where: { id },
      select: { customer_id: true },
    });
    if (existing) {
      await prisma.customer_contacts.updateMany({
        where: { customer_id: existing.customer_id, is_primary: true, NOT: { id } },
        data: { is_primary: false },
      });
    }
  }

  const updateData: Record<string, unknown> = {};
  if (input.firstName !== undefined) updateData.first_name = input.firstName;
  if (input.lastName !== undefined) updateData.last_name = input.lastName;
  if (input.email !== undefined) updateData.email = input.email;
  if (input.phone !== undefined) updateData.phone = input.phone;
  if (input.mobile !== undefined) updateData.mobile = input.mobile;
  if (input.role !== undefined) updateData.role = input.role;
  if (input.roleTitle !== undefined) updateData.role_title = input.roleTitle;
  if (input.isPrimary !== undefined) updateData.is_primary = input.isPrimary;
  if (input.notes !== undefined) updateData.notes = input.notes;
  if (input.hasPortalAccess !== undefined) updateData.has_portal_access = input.hasPortalAccess;

  const contact = await prisma.customer_contacts.update({
    where: { id },
    data: updateData,
  });
  return toContactData(contact as unknown as Record<string, unknown>);
}

export async function deleteContact(id: number): Promise<void> {
  await prisma.customer_contacts.delete({ where: { id } });
}
