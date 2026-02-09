'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';

interface Customer {
  id: number;
  name: string;
  company: string | null;
  client_types?: { id: string; name: string } | null;
  client_tiers?: { id: string; name: string } | null;
}

interface VolumeTier {
  tierId: string;
  name: string;
  minSquareMeters: number;
  maxSquareMeters: number | null;
  discountPercent: number;
}

const VOLUME_TIERS: VolumeTier[] = [
  { tierId: 'small', name: 'Small Project', minSquareMeters: 0, maxSquareMeters: 50, discountPercent: 0 },
  { tierId: 'medium', name: 'Medium Project', minSquareMeters: 50, maxSquareMeters: 150, discountPercent: 5 },
  { tierId: 'large', name: 'Large Project', minSquareMeters: 150, maxSquareMeters: 500, discountPercent: 10 },
  { tierId: 'enterprise', name: 'Enterprise', minSquareMeters: 500, maxSquareMeters: null, discountPercent: 15 },
];

export default function NewUnitBlockPage() {
  const router = useRouter();
  const [projectName, setProjectName] = useState('');
  const [projectType, setProjectType] = useState<'APARTMENTS' | 'TOWNHOUSES' | 'COMMERCIAL' | 'MIXED_USE' | 'OTHER'>('APARTMENTS');
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [address, setAddress] = useState('');
  const [suburb, setSuburb] = useState('');
  const [state, setState] = useState('');
  const [postcode, setPostcode] = useState('');
  const [description, setDescription] = useState('');

  const [customers, setCustomers] = useState<Customer[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const customersRes = await fetch('/api/customers');
        if (customersRes.ok) setCustomers(await customersRes.json());
      } catch (err) {
        console.error('Failed to fetch data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleSave = async () => {
    if (!projectName) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/unit-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projectName,
          projectType,
          customerId: selectedCustomerId,
          address: address || null,
          suburb: suburb || null,
          state: state || null,
          postcode: postcode || null,
          description: description || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create project');
        return;
      }
      const project = await res.json();
      router.push(`/quotes/unit-block/${project.id}`);
    } catch (err) {
      setError('Failed to create project');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;
  }

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Unit Block Project</h1>
          <p className="text-gray-500 mt-1">Create a multi-unit project with volume pricing</p>
        </div>
        <Link href="/quotes/unit-block" className="btn-secondary">Cancel</Link>
      </div>

      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        <h2 className="text-lg font-semibold text-gray-900">Project Details</h2>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project Name *</label>
            <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g., Skyline Apartments - Building A" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project Type *</label>
            <select value={projectType} onChange={(e) => setProjectType(e.target.value as typeof projectType)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500">
              <option value="APARTMENTS">Apartments</option>
              <option value="TOWNHOUSES">Townhouses</option>
              <option value="COMMERCIAL">Commercial</option>
              <option value="MIXED_USE">Mixed Use</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
          <select value={selectedCustomerId || ''} onChange={(e) => setSelectedCustomerId(Number(e.target.value) || null)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500">
            <option value="">Select a customer...</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.company || c.name}{c.client_types ? ` (${c.client_types.name})` : ''}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Optional project description..." className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">Address (optional)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street address" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <input type="text" value={suburb} onChange={(e) => setSuburb(e.target.value)} placeholder="Suburb" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <input type="text" value={state} onChange={(e) => setState(e.target.value)} placeholder="State" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
              <input type="text" value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="Postcode" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>

        {/* Volume Tier Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-medium text-blue-900 mb-2">Volume Pricing Tiers</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {VOLUME_TIERS.map(tier => (
              <div key={tier.tierId} className="bg-white rounded p-2 text-center">
                <p className="font-medium text-blue-900">{tier.name}</p>
                <p className="text-blue-600">{tier.discountPercent}% discount</p>
                <p className="text-xs text-gray-500">{tier.minSquareMeters}–{tier.maxSquareMeters ?? '∞'} m²</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-blue-700 mt-2">Volume discounts are calculated automatically after adding units with linked quotes.</p>
        </div>

        <div className="pt-4 border-t border-gray-200 flex justify-end gap-3">
          <Link href="/quotes/unit-block" className="btn-secondary">Cancel</Link>
          <button onClick={handleSave} disabled={!projectName || saving} className="btn-primary disabled:opacity-50">
            {saving ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  );
}
