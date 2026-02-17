'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { CustomerDrawings } from './components/CustomerDrawings';
import ContactsTab from '@/components/customers/ContactsTab';
import LocationsTab from '@/components/customers/LocationsTab';

interface Customer {
  id: number;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
  client_types: { name: string } | null;
  client_tiers: { name: string } | null;
  price_books: { name: string } | null;
  _count: {
    quotes: number;
    users: number;
  };
}

interface Quote {
  id: number;
  quote_number: string;
  status: string;
  totalPrice: number;
  createdAt: string;
}

type TabType = 'details' | 'contacts' | 'locations' | 'quotes' | 'drawings';

export default function CustomerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [activeTab, setActiveTab] = useState<TabType>('details');
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);

  // Fetch customer data
  useEffect(() => {
    async function loadCustomer() {
      try {
        const res = await fetch(`/api/customers/${params.id}`);
        if (!res.ok) throw new Error('Customer not found');
        const data = await res.json();
        setCustomer(data);
      } catch (error) {
        toast.error('Failed to load customer');
        router.push('/customers');
      } finally {
        setLoading(false);
      }
    }
    loadCustomer();
  }, [params.id, router]);

  // Fetch quotes when Quotes tab is active
  useEffect(() => {
    if (activeTab === 'quotes' && customer) {
      fetchQuotes();
    }
  }, [activeTab, customer]);

  const fetchQuotes = async () => {
    try {
      const res = await fetch(`/api/quotes?customerId=${params.id}`);
      if (!res.ok) throw new Error('Failed to fetch quotes');
      const data = await res.json();
      setQuotes(data);
    } catch (error) {
      toast.error('Failed to load quotes');
      console.error(error);
    }
  };

  if (loading || !customer) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              {customer.company || customer.name}
            </h1>
          </div>
          {customer.company && customer.name && (
            <p className="text-gray-500 mt-1">{customer.name}</p>
          )}
        </div>
        <Link href={`/customers/${customer.id}/edit`} className="btn-primary">
          Edit Details
        </Link>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('details')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'details'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab('contacts')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'contacts'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Contacts
          </button>
          <button
            onClick={() => setActiveTab('locations')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'locations'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Locations
          </button>
          <button
            onClick={() => setActiveTab('quotes')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'quotes'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Quotes
            {customer._count.quotes > 0 && (
              <span className="ml-2 py-0.5 px-2 rounded-full text-xs bg-gray-100 text-gray-600">
                {customer._count.quotes}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('drawings')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'drawings'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Drawings
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'details' && <DetailsTab customer={customer} />}
      {activeTab === 'contacts' && (
        <ContactsTab
          customerId={customer.id}
          customerName={customer.company || customer.name}
        />
      )}
      {activeTab === 'locations' && (
        <LocationsTab customerId={customer.id} />
      )}
      {activeTab === 'quotes' && <QuotesTab quotes={quotes} customerId={customer.id} />}
      {activeTab === 'drawings' && <CustomerDrawings customerId={customer.id} />}

    </div>
  );
}

// Details Tab Component
function DetailsTab({ customer }: { customer: Customer }) {
  return (
    <div className="card p-6 space-y-6 max-w-3xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="text-sm font-medium text-gray-500">Contact Name</label>
          <p className="mt-1 text-gray-900">{customer.name || '—'}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-500">Company</label>
          <p className="mt-1 text-gray-900">{customer.company || '—'}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-500">Email</label>
          <p className="mt-1 text-gray-900">{customer.email || '—'}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-500">Phone</label>
          <p className="mt-1 text-gray-900">{customer.phone || '—'}</p>
        </div>
      </div>

      {customer.address && (
        <div>
          <label className="text-sm font-medium text-gray-500">Address</label>
          <p className="mt-1 text-gray-900 whitespace-pre-line">{customer.address}</p>
        </div>
      )}

      {customer.notes && (
        <div>
          <label className="text-sm font-medium text-gray-500">Notes</label>
          <p className="mt-1 text-gray-900 whitespace-pre-line">{customer.notes}</p>
        </div>
      )}

      <div className="border-t pt-6">
        <h3 className="text-sm font-medium text-gray-900 mb-4">Pricing Classification</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="text-sm font-medium text-gray-500">Client Type</label>
            <p className="mt-1 text-gray-900">{customer.client_types?.name || '—'}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Client Tier</label>
            <p className="mt-1 text-gray-900">{customer.client_tiers?.name || '—'}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Default Price Book</label>
            <p className="mt-1 text-gray-900">{customer.price_books?.name || '—'}</p>
          </div>
        </div>
      </div>

      <div className="border-t pt-6">
        <label className="text-sm font-medium text-gray-500">Created</label>
        <p className="mt-1 text-gray-900">{new Date(customer.createdAt).toLocaleDateString()}</p>
      </div>
    </div>
  );
}

// Quotes Tab Component
function QuotesTab({ quotes, customerId }: { quotes: Quote[]; customerId: number }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-gray-600">All quotes for this customer</p>
        <Link href={`/quotes/new?customerId=${customerId}`} className="btn-primary">
          + New Quote
        </Link>
      </div>

      {quotes.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-gray-500 mb-4">No quotes for this customer yet.</p>
          <Link href={`/quotes/new?customerId=${customerId}`} className="btn-primary">
            Create First Quote
          </Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header">Quote #</th>
                <th className="table-header">Status</th>
                <th className="table-header">Total</th>
                <th className="table-header">Created</th>
                <th className="table-header text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {quotes.map((quote) => (
                <tr key={quote.id} className="hover:bg-gray-50">
                  <td className="table-cell font-medium">{quote.quote_number}</td>
                  <td className="table-cell">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      quote.status === 'ACCEPTED' ? 'bg-green-100 text-green-800' :
                      quote.status === 'SENT' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {quote.status}
                    </span>
                  </td>
                  <td className="table-cell">${quote.totalPrice?.toFixed(2) || '0.00'}</td>
                  <td className="table-cell">{new Date(quote.createdAt).toLocaleDateString()}</td>
                  <td className="table-cell text-right">
                    <Link
                      href={`/quotes/${quote.id}`}
                      className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

