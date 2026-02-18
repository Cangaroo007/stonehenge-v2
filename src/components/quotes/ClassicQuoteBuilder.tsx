'use client';

/**
 * ClassicQuoteBuilder — the pre-wizard quote creation flow.
 *
 * Replicates the original /quotes/new behaviour:
 *   1. User optionally selects customer + enters project name
 *   2. Optionally uploads a drawing
 *   3. Clicks "Create Quote"
 *   4. Draft quote created → redirects to /quotes/[id]?mode=edit
 *
 * Accessible via "Build Quote" in left nav (/quotes/new?mode=classic).
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ContactPicker from './ContactPicker';

interface Customer {
  id: number;
  name: string;
}

interface ClassicQuoteBuilderProps {
  customerId?: number;
}

export default function ClassicQuoteBuilder({ customerId: preSelectedCustomerId }: ClassicQuoteBuilderProps) {
  const router = useRouter();

  // ── ALL hooks at the TOP (Rule 45) ──
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | undefined>(preSelectedCustomerId);
  const [projectName, setProjectName] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCustomers() {
      try {
        const res = await fetch('/api/customers');
        if (res.ok) {
          setCustomers(await res.json());
        }
      } catch {
        // Non-critical
      }
    }
    fetchCustomers();
  }, []);

  // ── Handler ──
  const handleCreate = async () => {
    if (!selectedCustomerId) {
      setError('Please select a customer.');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (selectedCustomerId) params.set('customerId', String(selectedCustomerId));
      if (selectedContactId) params.set('contactId', String(selectedContactId));
      if (projectName) params.set('projectName', projectName);
      const url = `/api/quotes/create-draft${params.toString() ? `?${params}` : ''}`;
      const res = await fetch(url, { method: 'POST' });

      if (!res.ok) {
        throw new Error('Failed to create draft quote');
      }

      const { quoteId } = await res.json();
      router.push(`/quotes/${quoteId}?mode=edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create quote');
      setIsCreating(false);
    }
  };

  // ── Render ──
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Build Quote</h1>
        <p className="mt-2 text-gray-600">
          Create a new quote and go straight to the detailed builder.
        </p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="card p-6 mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-4">Customer &amp; Project Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Customer <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedCustomerId || ''}
              onChange={(e) => {
                const newId = e.target.value ? Number(e.target.value) : undefined;
                setSelectedCustomerId(newId);
                setSelectedContactId(null);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-amber-500 focus:border-amber-500"
            >
              <option value="">Select customer...</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Project name</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. 42 Smith St Kitchen"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-amber-500 focus:border-amber-500"
            />
          </div>
        </div>
        {selectedCustomerId && (
          <div className="mt-4">
            <ContactPicker
              customerId={selectedCustomerId}
              selectedContactId={selectedContactId}
              onContactChange={setSelectedContactId}
            />
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3">
        <button
          onClick={() => router.push('/quotes')}
          className="btn-secondary"
        >
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={isCreating || !selectedCustomerId}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCreating ? 'Creating...' : 'Create Quote →'}
        </button>
      </div>
    </div>
  );
}
