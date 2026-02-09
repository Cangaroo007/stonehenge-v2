'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';

interface QuoteSummary {
  id: number;
  quote_number: string;
  status: string;
  subtotal: string | number;
  total: string | number;
}

interface Unit {
  id: number;
  unitNumber: string;
  level: number | null;
  unitTypeCode: string | null;
  finishLevel: string | null;
  colourScheme: string | null;
  status: string;
  notes: string | null;
  quote: QuoteSummary | null;
}

interface UnitBlockProject {
  id: number;
  name: string;
  projectType: string;
  status: string;
  customer: {
    id: number;
    name: string;
    company: string | null;
  } | null;
  units: Unit[];
  totalUnits: number;
  totalArea_sqm: string | number | null;
  subtotalExGst: string | number | null;
  discountAmount: string | number | null;
  gstAmount: string | number | null;
  grandTotal: string | number | null;
  volumeTier: string | null;
  volumeDiscount: string | number | null;
  address: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  description: string | null;
  createdAt: string;
}

export default function UnitBlockDetailPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<UnitBlockProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add unit form state
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [newUnitNumber, setNewUnitNumber] = useState('');
  const [newUnitLevel, setNewUnitLevel] = useState('');
  const [addingUnit, setAddingUnit] = useState(false);

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/unit-blocks/${projectId}`);
      if (res.ok) {
        setProject(await res.json());
      } else {
        setError('Project not found');
      }
    } catch (err) {
      console.error('Failed to load project:', err);
      setError('Failed to load project');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const handleAddUnit = async () => {
    if (!newUnitNumber.trim()) return;
    setAddingUnit(true);
    try {
      const res = await fetch(`/api/unit-blocks/${projectId}/units`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitNumber: newUnitNumber.trim(),
          level: newUnitLevel ? parseInt(newUnitLevel, 10) : null,
        }),
      });
      if (res.ok) {
        setNewUnitNumber('');
        setNewUnitLevel('');
        setShowAddUnit(false);
        await fetchProject();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to add unit');
      }
    } catch (err) {
      alert('Failed to add unit');
    } finally {
      setAddingUnit(false);
    }
  };

  const handleDeleteUnit = async (unitId: number) => {
    if (!confirm('Remove this unit from the project?')) return;
    try {
      const res = await fetch(`/api/unit-blocks/${projectId}/units/${unitId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchProject();
      }
    } catch (err) {
      console.error('Failed to delete unit:', err);
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;
  if (error || !project) return <div className="text-center py-12"><p className="text-gray-500 mb-4">{error || 'Project not found'}</p><Link href="/quotes/unit-block" className="btn-secondary">Back to Projects</Link></div>;

  const totalArea = Number(project.totalArea_sqm || 0);
  const subtotal = Number(project.subtotalExGst || 0);
  const discount = Number(project.discountAmount || 0);
  const grandTotal = Number(project.grandTotal || 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/quotes/unit-block" className="text-gray-500 hover:text-gray-700">← Back to Projects</Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          <p className="text-gray-500">{project.customer?.company || project.customer?.name || 'No customer'} • {project.projectType}</p>
        </div>
        <div className="flex gap-3">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
            project.status === 'DRAFT' ? 'bg-gray-100 text-gray-800' :
            project.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
            'bg-blue-100 text-blue-800'
          }`}>
            {project.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6"><p className="text-sm text-gray-500 mb-1">Units</p><p className="text-3xl font-bold text-gray-900">{project.units.length}</p></div>
        <div className="bg-white rounded-lg shadow p-6"><p className="text-sm text-gray-500 mb-1">Total Area</p><p className="text-3xl font-bold text-gray-900">{totalArea.toFixed(2)} m²</p></div>
        <div className="bg-white rounded-lg shadow p-6"><p className="text-sm text-gray-500 mb-1">Volume Tier</p><p className="text-2xl font-bold text-blue-600">{project.volumeTier || 'N/A'}</p></div>
        <div className="bg-white rounded-lg shadow p-6"><p className="text-sm text-gray-500 mb-1">Grand Total</p><p className="text-3xl font-bold text-green-600">{formatCurrency(grandTotal)}</p></div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200"><h2 className="text-lg font-semibold text-gray-900">Pricing Summary</h2></div>
        <div className="p-6">
          <div className="max-w-md space-y-3">
            <div className="flex justify-between text-sm"><span className="text-gray-600">Subtotal ({project.units.length} units):</span><span className="font-medium">{formatCurrency(subtotal)}</span></div>
            <div className="flex justify-between text-sm text-green-600"><span>Volume Discount:</span><span className="font-medium">-{formatCurrency(discount)}</span></div>
            <div className="flex justify-between text-lg font-semibold pt-3 border-t border-gray-200"><span>Grand Total (incl. GST):</span><span className="text-blue-600">{formatCurrency(grandTotal)}</span></div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Units</h2>
          <button onClick={() => setShowAddUnit(!showAddUnit)} className="btn-primary text-sm">
            + Add Unit
          </button>
        </div>

        {showAddUnit && (
          <div className="p-6 border-b border-gray-200 bg-gray-50">
            <div className="flex items-end gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit Number *</label>
                <input type="text" value={newUnitNumber} onChange={(e) => setNewUnitNumber(e.target.value)} placeholder="e.g., 1101" className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
                <input type="number" value={newUnitLevel} onChange={(e) => setNewUnitLevel(e.target.value)} placeholder="e.g., 11" className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 w-24" />
              </div>
              <button onClick={handleAddUnit} disabled={!newUnitNumber.trim() || addingUnit} className="btn-primary disabled:opacity-50">
                {addingUnit ? 'Adding...' : 'Add'}
              </button>
              <button onClick={() => setShowAddUnit(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="divide-y divide-gray-200">
          {project.units.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No units added yet. Click &quot;Add Unit&quot; to get started.
            </div>
          ) : (
            project.units.map((unit, index) => (
              <div key={unit.id} className="p-6 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-semibold text-sm">{index + 1}</span>
                    <div>
                      <p className="font-medium text-gray-900">Unit {unit.unitNumber}</p>
                      <p className="text-sm text-gray-500">
                        {unit.level != null ? `Level ${unit.level}` : ''}
                        {unit.unitTypeCode ? ` • Type ${unit.unitTypeCode}` : ''}
                        {unit.finishLevel ? ` • ${unit.finishLevel}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      {unit.quote ? (
                        <>
                          <p className="font-medium">{formatCurrency(Number(unit.quote.total))}</p>
                          <p className="text-sm text-gray-500">{unit.quote.quote_number}</p>
                        </>
                      ) : (
                        <p className="text-sm text-gray-400">No quote linked</p>
                      )}
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      unit.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                      unit.status === 'QUOTED' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {unit.status}
                    </span>
                    <button onClick={() => handleDeleteUnit(unit.id)} className="text-gray-400 hover:text-red-600" title="Remove unit">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold text-blue-900 mb-2">Volume Pricing</h3>
        <p className="text-sm text-blue-800 mb-4">
          {project.volumeTier
            ? `This project qualifies for ${project.volumeTier} pricing tier based on a total area of ${totalArea.toFixed(2)} m² across ${project.units.length} units.`
            : 'Link quotes to units and recalculate to determine the volume pricing tier.'}
        </p>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div>
            <h4 className="font-medium text-blue-900 mb-1">Benefits</h4>
            <ul className="list-disc list-inside text-blue-800 space-y-1">
              <li>Volume discount on materials</li>
              <li>Discounted fabrication rates</li>
              <li>Consolidated material ordering</li>
              <li>Single point of contact</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-blue-900 mb-1">Savings</h4>
            <p className="text-blue-800">Total volume discount: <strong className="text-green-700">{formatCurrency(discount)}</strong></p>
            <p className="text-blue-800 mt-1">Compared to individual unit pricing</p>
          </div>
        </div>
      </div>
    </div>
  );
}
