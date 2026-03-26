'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { FABRICATION_CATEGORIES } from '@/lib/constants/fabrication-categories';

interface CutoutCategoryRate {
  cutoutTypeId: string;
  cutoutTypeName: string;
  baseRate: number;
  rates: Array<{
    id: number;
    fabricationCategory: string;
    rate: number;
  }>;
}

interface PricingSettings {
  cutoutThicknessMultiplier: string;
  [key: string]: unknown;
}

export default function CutoutRatesPage() {
  const [cutoutRates, setCutoutRates] = useState<CutoutCategoryRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingMultiplier, setSavingMultiplier] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [thicknessMultiplier, setThicknessMultiplier] = useState('1.00');
  // Track local edits as a map of cutoutTypeId -> fabricationCategory -> rate
  const [localRates, setLocalRates] = useState<Record<string, Record<string, number>>>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCutoutName, setNewCutoutName] = useState('');
  const [addingCutout, setAddingCutout] = useState(false);
  const [deletingCutoutId, setDeletingCutoutId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [ratesRes, settingsRes] = await Promise.all([
        fetch('/api/pricing/cutout-category-rates'),
        fetch('/api/admin/pricing/settings'),
      ]);

      if (!ratesRes.ok) throw new Error('Failed to fetch cutout category rates');
      const ratesData: CutoutCategoryRate[] = await ratesRes.json();
      setCutoutRates(ratesData);

      // Build local rates map from fetched data
      const ratesMap: Record<string, Record<string, number>> = {};
      for (const cutout of ratesData) {
        ratesMap[cutout.cutoutTypeId] = {};
        for (const r of cutout.rates) {
          ratesMap[cutout.cutoutTypeId][r.fabricationCategory] = r.rate;
        }
        // Fill in missing categories with baseRate
        for (const cat of FABRICATION_CATEGORIES) {
          if (ratesMap[cutout.cutoutTypeId][cat.value] === undefined) {
            ratesMap[cutout.cutoutTypeId][cat.value] = cutout.baseRate;
          }
        }
      }
      setLocalRates(ratesMap);

      if (settingsRes.ok) {
        const settingsData: PricingSettings = await settingsRes.json();
        setThicknessMultiplier(settingsData.cutoutThicknessMultiplier || '1.00');
      }
    } catch (error) {
      console.error('Error fetching cutout data:', error);
      setToast({ message: 'Failed to load cutout rates', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleRateChange = (cutoutTypeId: string, fabricationCategory: string, value: string) => {
    const numValue = value === '' ? 0 : parseFloat(value);
    setLocalRates(prev => ({
      ...prev,
      [cutoutTypeId]: {
        ...prev[cutoutTypeId],
        [fabricationCategory]: numValue,
      },
    }));
  };

  const handleSaveRates = async () => {
    setSaving(true);
    try {
      // Build the flat array for the API
      const entries: Array<{ cutoutTypeId: string; fabricationCategory: string; rate: number }> = [];
      for (const cutoutTypeId of Object.keys(localRates)) {
        for (const fabricationCategory of Object.keys(localRates[cutoutTypeId])) {
          entries.push({
            cutoutTypeId,
            fabricationCategory,
            rate: localRates[cutoutTypeId][fabricationCategory],
          });
        }
      }

      const res = await fetch('/api/pricing/cutout-category-rates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entries),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save cutout rates');
      }

      setToast({ message: 'Cutout category rates saved successfully', type: 'success' });
      fetchData();
    } catch (error) {
      console.error('Error saving cutout rates:', error);
      setToast({
        message: error instanceof Error ? error.message : 'Failed to save cutout rates',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMultiplier = async () => {
    setSavingMultiplier(true);
    try {
      const res = await fetch('/api/admin/pricing/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutoutThicknessMultiplier: thicknessMultiplier }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save thickness multiplier');
      }

      setToast({ message: 'Thickness multiplier saved successfully', type: 'success' });
    } catch (error) {
      console.error('Error saving thickness multiplier:', error);
      setToast({
        message: error instanceof Error ? error.message : 'Failed to save thickness multiplier',
        type: 'error',
      });
    } finally {
      setSavingMultiplier(false);
    }
  };

  const handleAddCutout = async () => {
    if (!newCutoutName.trim()) return;
    setAddingCutout(true);
    try {
      const res = await fetch('/api/admin/pricing/cutout-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCutoutName.trim(),
          baseRate: 0,
          categoryRates: FABRICATION_CATEGORIES.map(cat => ({
            fabricationCategory: cat.value,
            rate: 0,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to add cutout type');
      }
      setToast({ message: `Cutout type "${newCutoutName.trim()}" added`, type: 'success' });
      setShowAddModal(false);
      setNewCutoutName('');
      fetchData();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : 'Failed to add cutout type', type: 'error' });
    } finally {
      setAddingCutout(false);
    }
  };

  const handleDeactivateCutout = async (id: string, name: string) => {
    if (!confirm(`Deactivate "${name}"? It will no longer appear in quotes.`)) return;
    setDeletingCutoutId(id);
    try {
      const res = await fetch(`/api/admin/pricing/cutout-types/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to deactivate cutout type');
      }
      setToast({ message: `"${name}" deactivated`, type: 'success' });
      fetchData();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : 'Failed to deactivate cutout type', type: 'error' });
    } finally {
      setDeletingCutoutId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading cutout category rates...</div>
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

      <div className="space-y-6">
        {/* Category Rate Matrix */}
        <div className="card">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Cutout Category Rates</h2>
              <p className="text-sm text-gray-500 mt-1">
                Set cutout rates per fabrication category. Rates are in AUD.
              </p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg shrink-0"
            >
              + Add Cutout Type
            </button>
          </div>

          {showAddModal && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Add New Cutout Type</h3>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={newCutoutName}
                    onChange={(e) => setNewCutoutName(e.target.value)}
                    placeholder="e.g. Pop-up Waste"
                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
                  />
                </div>
                <button
                  onClick={handleAddCutout}
                  disabled={addingCutout || !newCutoutName.trim()}
                  className={cn(
                    'px-4 py-2 text-sm font-medium text-white rounded-lg',
                    addingCutout || !newCutoutName.trim()
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700'
                  )}
                >
                  {addingCutout ? 'Adding...' : 'Add'}
                </button>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setNewCutoutName('');
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {cutoutRates.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No cutout types found.</p>
              <p className="text-sm text-gray-400 mt-2">
                Add cutout types in the Configuration tab first.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cutout Type
                    </th>
                    {FABRICATION_CATEGORIES.map((cat) => (
                      <th
                        key={cat.value}
                        className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        {cat.label}
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {cutoutRates.map((cutout) => (
                    <tr key={cutout.cutoutTypeId}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        {cutout.cutoutTypeName}
                      </td>
                      {FABRICATION_CATEGORIES.map((cat) => (
                        <td key={cat.value} className="px-3 py-3 whitespace-nowrap">
                          <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-2 flex items-center text-gray-400 text-xs">
                              $
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={localRates[cutout.cutoutTypeId]?.[cat.value] ?? ''}
                              onChange={(e) =>
                                handleRateChange(cutout.cutoutTypeId, cat.value, e.target.value)
                              }
                              className="w-24 pl-5 rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
                            />
                          </div>
                        </td>
                      ))}
                      <td className="px-3 py-3 whitespace-nowrap text-center">
                        <button
                          onClick={() => handleDeactivateCutout(cutout.cutoutTypeId, cutout.cutoutTypeName)}
                          disabled={deletingCutoutId === cutout.cutoutTypeId}
                          className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
                        >
                          {deletingCutoutId === cutout.cutoutTypeId ? 'Removing...' : 'Deactivate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {cutoutRates.length > 0 && (
            <div className="flex justify-end mt-4">
              <button
                onClick={handleSaveRates}
                disabled={saving}
                className={cn(
                  'px-6 py-2 text-sm font-medium text-white rounded-lg',
                  saving
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500'
                )}
              >
                {saving ? 'Saving...' : 'Save Cutout Rates'}
              </button>
            </div>
          )}
        </div>

        {/* Thickness Multiplier */}
        <div className="card">
          <h3 className="text-base font-semibold text-gray-900 mb-2">Cutout Thickness Multiplier</h3>
          <p className="text-sm text-gray-500 mb-4">
            Multiplier applied to 40mm+ pieces. Default: 1.0 (no surcharge). Example: 1.3 = 30% more for thicker stone.
          </p>
          <div className="flex items-center gap-4">
            <input
              type="number"
              step="0.01"
              min="0.5"
              max="5.0"
              value={thicknessMultiplier}
              onChange={(e) => setThicknessMultiplier(e.target.value)}
              className="w-28 rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            />
            <span className="text-sm text-gray-500">x multiplier</span>
            <button
              onClick={handleSaveMultiplier}
              disabled={savingMultiplier}
              className={cn(
                'px-4 py-2 text-sm font-medium text-white rounded-lg',
                savingMultiplier
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500'
              )}
            >
              {savingMultiplier ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
