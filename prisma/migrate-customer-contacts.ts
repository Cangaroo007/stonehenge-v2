import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 1. Get all customers with their email/phone/address
  const customers = await prisma.customers.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      address: true,
    },
  });

  console.log(`Found ${customers.length} customers`);

  let contactsCreated = 0;
  let locationsCreated = 0;

  for (const customer of customers) {
    // 2. Create a PRIMARY contact from customer's direct contact info
    if (customer.email || customer.phone) {
      // Split name into first/last (best effort)
      const nameParts = (customer.name || 'Unknown').trim().split(/\s+/);
      const firstName = nameParts[0] || 'Unknown';
      const lastName = nameParts.slice(1).join(' ') || '';

      await prisma.customer_contacts.create({
        data: {
          customer_id: customer.id,
          first_name: firstName,
          last_name: lastName,
          email: customer.email,
          phone: customer.phone,
          role: 'PRIMARY',
          is_primary: true,
          has_portal_access: false,
          notes: 'Auto-migrated from customer record',
        },
      });
      contactsCreated++;
    }

    // 3. Create a location from freeform address (if exists)
    if (customer.address && customer.address.trim()) {
      await prisma.customer_locations.create({
        data: {
          customer_id: customer.id,
          label: 'Main Address',
          address_line1: customer.address.trim(),
          suburb: '',
          state: 'QLD',
          postcode: '',
          is_default: true,
          notes: 'Auto-migrated from customer address field — please update suburb/state/postcode',
        },
      });
      locationsCreated++;
    }
  }

  // 4. Link existing portal users to contacts
  const portalUsers = await prisma.user.findMany({
    where: {
      customer_id: { not: null },
      role: 'CUSTOMER',
    },
    select: {
      id: true,
      customer_id: true,
      email: true,
      name: true,
    },
  });

  let portalLinked = 0;
  for (const portalUser of portalUsers) {
    if (!portalUser.customer_id) continue;

    // Check if a contact already exists for this email
    const existingContact = await prisma.customer_contacts.findFirst({
      where: {
        customer_id: portalUser.customer_id,
        email: portalUser.email,
      },
    });

    if (existingContact) {
      // Link existing contact to portal user
      await prisma.customer_contacts.update({
        where: { id: existingContact.id },
        data: {
          has_portal_access: true,
          portal_user_id: portalUser.id,
        },
      });
    } else {
      // Create new contact for portal user
      const nameParts = (portalUser.name || 'Portal User').trim().split(/\s+/);
      const firstName = nameParts[0] || 'Portal';
      const lastName = nameParts.slice(1).join(' ') || 'User';

      await prisma.customer_contacts.create({
        data: {
          customer_id: portalUser.customer_id,
          first_name: firstName,
          last_name: lastName,
          email: portalUser.email,
          role: 'OTHER',
          is_primary: false,
          has_portal_access: true,
          portal_user_id: portalUser.id,
          notes: 'Auto-created from existing portal user',
        },
      });
    }
    portalLinked++;
  }

  console.log(`Created ${contactsCreated} contacts from customer records`);
  console.log(`Created ${locationsCreated} locations from customer addresses`);
  console.log(`Linked ${portalLinked} portal users to contacts`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
