'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface Material {
  id: number;
  name: string;
  collection: string | null;
  fabricationCategory: string;
  pricePerSqm: number;
  pricePerSlab: number | null;
  isActive: boolean;
  slabLengthMm: number | null;
  slabWidthMm: number | null;
}

const TYPE_DEFAULTS: Record<string, { length: number; width: number }> = {
  ENGINEERED: { length: 3200, width: 1600 },
  NATURAL_HARD: { length: 3200, width: 1800 },
  NATURAL_SOFT: { length: 3200, width: 1800 },
  NATURAL_PREMIUM: { length: 3200, width: 1800 },
  SINTERED: { length: 3200, width: 1600 },
};

const CATEGORY_LABELS: Record<string, string> = {
  ENGINEERED: 'Engineered',
  NATURAL_HARD: 'Natural Hard',
  NATURAL_SOFT: 'Natural Soft',
  NATURAL_PREMIUM: 'Natural Premium',
  SINTERED: 'Sintered',
};

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [editedIds, setEditedIds] = useState<Set<number>>(new Set());

  const fetchMaterials = useCallback(async () => {
    try {
      const res = await fetch('/api/materials');
      if (!res.ok) throw new Error('Failed to fetch materials');
      const data = await res.json();
      setMaterials(data);
    } catch (error) {
      console.error('Error fetching materials:', error);
      setToast({ message: 'Failed to load materials', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleDimensionChange = (id: number, field: 'slabLengthMm' | 'slabWidthMm', value: string) => {
    setMaterials(materials.map(m =>
      m.id === id ? { ...m, [field]: value === '' ? null : parseInt(value) } : m
    ));
    setEditedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    const edited = materials.filter(m => editedIds.has(m.id));
    if (edited.length === 0) return;

    setSaving(true);
    try {
      const promises = edited.map(m =>
        fetch(`/api/materials/${m.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: m.name,
            collection: m.collection,
            pricePerSqm: m.pricePerSqm,
            isActive: m.isActive,
            fabricationCategory: m.fabricationCategory,
            slabLengthMm: m.slabLengthMm,
            slabWidthMm: m.slabWidthMm,
          }),
        })
      );

      const results = await Promise.all(promises);
      const allOk = results.every(r => r.ok);

      if (!allOk) throw new Error('Some materials failed to save');

      setEditedIds(new Set());
      setToast({ message: 'Slab dimensions saved successfully', type: 'success' });
      fetchMaterials();
    } catch (error) {
      console.error('Error saving materials:', error);
      setToast({ message: 'Failed to save slab dimensions', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading materials...</div>
      </div>
    );
  }

  return (
    <>
      {toast && (
        <div
          className={cn(
            'fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg',
            toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
          )}
        >
          {toast.message}
        </div>
      )}

      <div className="space-y-4">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Material Slab Dimensions</h2>
              <p className="text-sm text-gray-500 mt-1">
                Configure slab length and width per material. Leave blank to use the default for the material type.
              </p>
            </div>
            {editedIds.size > 0 && (
              <span className="text-sm text-amber-600 font-medium">
                {editedIds.size} unsaved {editedIds.size === 1 ? 'change' : 'changes'}
              </span>
            )}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Material
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Slab Length (mm)
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Slab Width (mm)
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {materials.map((material) => {
                  const defaults = TYPE_DEFAULTS[material.fabricationCategory] || { length: 3200, width: 1600 };
                  const isEdited = editedIds.has(material.id);
                  return (
                    <tr key={material.id} className={cn(isEdited && 'bg-amber-50')}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{material.name}</div>
                          {material.collection && (
                            <div className="text-xs text-gray-500">{material.collection}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {CATEGORY_LABELS[material.fabricationCategory] || material.fabricationCategory}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={material.slabLengthMm ?? ''}
                          onChange={(e) => handleDimensionChange(material.id, 'slabLengthMm', e.target.value)}
                          placeholder={String(defaults.length)}
                          className="w-28 rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={material.slabWidthMm ?? ''}
                          onChange={(e) => handleDimensionChange(material.id, 'slabWidthMm', e.target.value)}
                          placeholder={String(defaults.width)}
                          className="w-28 rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={cn(
                            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                            material.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          )}
                        >
                          {material.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
            <p className="text-xs text-gray-500">
              Leave blank to use default for material type. Placeholder values show the type default.
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving || editedIds.size === 0}
            className={cn(
              'px-6 py-2 text-sm font-medium text-white rounded-lg',
              saving || editedIds.size === 0
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500'
            )}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </>
  );
}
