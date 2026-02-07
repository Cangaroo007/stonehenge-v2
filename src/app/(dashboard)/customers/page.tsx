import Link from 'next/link';
import prisma from '@/lib/db';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

async function getCustomers() {
  return prisma.customers.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { quotes: true } },
      client_types: true,
      client_tiers: true,
    },
  });
}

export default async function CustomersPage() {
  const customers = await getCustomers();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
        <Link href="/customers/new" className="btn-primary">
          + New Customer
        </Link>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header">Name</th>
                <th className="table-header">Company</th>
                <th className="table-header">Client Type</th>
                <th className="table-header">Tier</th>
                <th className="table-header">Quotes</th>
                <th className="table-header">Created</th>
                <th className="table-header"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    No customers yet.{' '}
                    <Link href="/customers/new" className="text-primary-600 hover:text-primary-700">
                      Add your first customer
                    </Link>
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">{customer.name}</td>
                    <td className="table-cell">{customer.company || '-'}</td>
                    <td className="table-cell">{customer.client_types?.name || '-'}</td>
                    <td className="table-cell">{customer.client_tiers?.name || '-'}</td>
                    <td className="table-cell">{customer._count.quotes}</td>
                    <td className="table-cell">{formatDate(customer.created_at)}</td>
                    <td className="table-cell">
                      <Link
                        href={`/customers/${customer.id}`}
                        className="text-primary-600 hover:text-primary-700"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
