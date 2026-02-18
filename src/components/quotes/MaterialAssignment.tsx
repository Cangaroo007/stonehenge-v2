'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ContactPicker from './ContactPicker';

interface TemplateSummary {
  id: string;
  name: string;
  description: string | null;
  category: string;
  pieceCount: number;
  estimatedAreaSqm: number;
}

interface TemplateRole {
  role: string;
  label: string;
  pieceCount: number;
  roomNames: string[];
}

interface Material {
  id: number;
  name: string;
  collection: string | null;
  pricePerSqm: number;
  isActive: boolean;
}

interface Customer {
  id: number;
  name: string;
}

interface MaterialAssignmentProps {
  template: TemplateSummary;
  onBack: () => void;
  onQuoteCreated: (quoteId: number) => void;
  customerId?: number;
}

export default function MaterialAssignment({
  template,
  onBack,
  onQuoteCreated,
  customerId: preSelectedCustomerId,
}: MaterialAssignmentProps) {
  const router = useRouter();
  const [roles, setRoles] = useState<TemplateRole[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [assignments, setAssignments] = useState<Record<string, number>>({});
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | undefined>(preSelectedCustomerId);
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [projectName, setProjectName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch roles and materials in parallel
  useEffect(() => {
    async function fetchData() {
      try {
        const [rolesRes, materialsRes, customersRes] = await Promise.all([
          fetch(`/api/starter-templates/${template.id}/roles`),
          fetch('/api/materials?isActive=true'),
          fetch('/api/customers'),
        ]);

        if (!rolesRes.ok) throw new Error('Failed to load template roles');
        if (!materialsRes.ok) throw new Error('Failed to load materials');

        const rolesData = await rolesRes.json();
        const materialsData = await materialsRes.json();

        setRoles(rolesData.roles || []);

        const activeMaterials = (materialsData as Material[]).filter(m => m.isActive);
        setMaterials(activeMaterials);

        // Auto-select if only one material
        if (activeMaterials.length === 1) {
          const autoAssignments: Record<string, number> = {};
          for (const role of (rolesData.roles || []) as TemplateRole[]) {
            autoAssignments[role.role] = activeMaterials[0].id;
          }
          setAssignments(autoAssignments);
        }

        if (customersRes.ok) {
          setCustomers(await customersRes.json());
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [template.id]);

  const handleAssign = useCallback((role: string, materialId: number) => {
    setAssignments(prev => ({ ...prev, [role]: materialId }));
  }, []);

  // "Same as benchtop" quick apply
  const handleSameAsBenchtop = useCallback((role: string) => {
    const benchtopMaterial = assignments['PRIMARY_BENCHTOP'];
    if (benchtopMaterial) {
      setAssignments(prev => ({ ...prev, [role]: benchtopMaterial }));
    }
  }, [assignments]);

  const handleApply = async () => {
    if (!assignments['PRIMARY_BENCHTOP']) {
      setError('Please assign a material to the Primary Benchtop role.');
      return;
    }

    setIsApplying(true);
    setError(null);

    try {
      const res = await fetch(`/api/starter-templates/${template.id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          materialAssignments: assignments,
          customerId: selectedCustomerId || undefined,
          contactId: selectedContactId || undefined,
          projectName: projectName || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to apply template');
      }

      const result = await res.json();
      onQuoteCreated(result.quoteId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create quote');
      setIsApplying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto text-center py-12 text-gray-500">
        Loading template details...
      </div>
    );
  }

  // Group materials by collection for the dropdown
  const materialsByCollection = materials.reduce<Record<string, Material[]>>((acc, m) => {
    const collection = m.collection || 'Other';
    if (!acc[collection]) acc[collection] = [];
    acc[collection].push(m);
    return acc;
  }, {});
  const collectionNames = Object.keys(materialsByCollection).sort();

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="text-gray-500 hover:text-gray-700">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assign Materials</h1>
          <p className="text-sm text-gray-500 mt-1">
            {template.name} &mdash; {template.pieceCount} piece{template.pieceCount !== 1 ? 's' : ''}, ~{template.estimatedAreaSqm}m&sup2;
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <p className="text-gray-600 mb-6">Assign a stone product to each role:</p>

      {/* Role assignments */}
      <div className="space-y-4 mb-8">
        {roles.map(role => {
          const isPrimary = role.role === 'PRIMARY_BENCHTOP';
          const isSplashback = role.role === 'SPLASHBACK';
          const benchtopAssigned = assignments['PRIMARY_BENCHTOP'];

          return (
            <div key={role.role} className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-medium text-gray-900">{role.label}</span>
                  <span className="text-sm text-gray-500 ml-2">
                    ({role.pieceCount} piece{role.pieceCount !== 1 ? 's' : ''} &mdash; {role.roomNames.join(', ')})
                  </span>
                </div>
                {isPrimary && (
                  <span className="text-xs text-red-600 font-medium">Required</span>
                )}
              </div>

              <select
                value={assignments[role.role] || ''}
                onChange={(e) => handleAssign(role.role, Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-amber-500 focus:border-amber-500"
              >
                <option value="">Select material...</option>
                {collectionNames.map(collection => (
                  <optgroup key={collection} label={collection}>
                    {materialsByCollection[collection].map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} — ${m.pricePerSqm.toFixed(2)}/m&sup2;
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>

              {/* "Same as benchtop" shortcut for splashback */}
              {isSplashback && benchtopAssigned && !assignments[role.role] && (
                <button
                  onClick={() => handleSameAsBenchtop(role.role)}
                  className="mt-2 text-sm text-amber-600 hover:text-amber-700 font-medium"
                >
                  Use same as benchtop
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Customer & project (optional) */}
      <div className="card p-4 mb-8">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Optional: Customer &amp; Project Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Customer</label>
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

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <button onClick={onBack} className="btn-secondary">
          Cancel
        </button>
        <button
          onClick={handleApply}
          disabled={isApplying || !assignments['PRIMARY_BENCHTOP']}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isApplying ? 'Creating Quote...' : 'Create Quote \u2192'}
        </button>
      </div>
    </div>
  );
}
