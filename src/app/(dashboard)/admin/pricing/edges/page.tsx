'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

// --- Types ---

interface EdgeCategoryRate {
  edgeTypeId: string;
  edgeTypeName: string;
  baseRate: number;
  rate20mm: number | null;
  rate40mm: number | null;
  rates: Array<{
    id: number;
    fabricationCategory: string;
    rate20mm: number;
    rate40mm: number;
  }>;
}

interface CompatibilityGroup {
  fabricationCategory: string;
  rules: Array<{
    id: number;
    edgeTypeId: string;
    edgeTypeName: string;
    isAllowed: boolean;
    warningMessage: string | null;
  }>;
}

type CompatibilityState = 'allowed' | 'warning' | 'blocked';

interface LocalCompatRule {
  state: CompatibilityState;
  warningMessage: string;
}

const FABRICATION_CATEGORIES = [
  { value: 'ENGINEERED', label: 'ENG', fullLabel: 'Engineered Quartz' },
  { value: 'NATURAL_SOFT', label: 'N.SOFT', fullLabel: 'Natural Soft (Marble)' },
  { value: 'NATURAL_HARD', label: 'N.HARD', fullLabel: 'Natural Hard (Granite)' },
  { value: 'SINTERED', label: 'SINT', fullLabel: 'Sintered / Porcelain' },
  { value: 'NATURAL_PREMIUM', label: 'N.PREM', fullLabel: 'Natural Premium (Quartzite)' },
] as const;

export default function EdgeRatesPage() {
  const [edgeRates, setEdgeRates] = useState<EdgeCategoryRate[]>([]);
  const [compatGroups, setCompatGroups] = useState<CompatibilityGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSurcharges, setSavingSurcharges] = useState(false);
  const [savingCompat, setSavingCompat] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Surcharge state: edgeTypeId -> fabricationCategory -> { rate20mm, rate40mm }
  const [localSurcharges, setLocalSurcharges] = useState<
    Record<string, Record<string, { rate20mm: number; rate40mm: number }>>
  >({});
  const [selectedSurchargeCategory, setSelectedSurchargeCategory] = useState('ENGINEERED');

  // Compatibility state: edgeTypeId -> fabricationCategory -> LocalCompatRule
  const [localCompat, setLocalCompat] = useState<
    Record<string, Record<string, LocalCompatRule>>
  >({});

  // Edge types list (derived from edgeRates for compatibility section)
  const edgeTypes = edgeRates.map(e => ({ id: e.edgeTypeId, name: e.edgeTypeName }));

  const fetchData = useCallback(async () => {
    try {
      const [surchargeRes, compatRes] = await Promise.all([
        fetch('/api/pricing/edge-category-rates'),
        fetch('/api/pricing/edge-compatibility'),
      ]);

      if (!surchargeRes.ok) throw new Error('Failed to fetch edge category rates');
      const surchargeData: EdgeCategoryRate[] = await surchargeRes.json();
      setEdgeRates(surchargeData);

      // Build local surcharge map
      const surchargeMap: Record<string, Record<string, { rate20mm: number; rate40mm: number }>> = {};
      for (const edge of surchargeData) {
        surchargeMap[edge.edgeTypeId] = {};
        for (const r of edge.rates) {
          surchargeMap[edge.edgeTypeId][r.fabricationCategory] = {
            rate20mm: r.rate20mm,
            rate40mm: r.rate40mm,
          };
        }
        // Fill missing categories with defaults
        for (const cat of FABRICATION_CATEGORIES) {
          if (!surchargeMap[edge.edgeTypeId][cat.value]) {
            surchargeMap[edge.edgeTypeId][cat.value] = {
              rate20mm: edge.rate20mm ?? 0,
              rate40mm: edge.rate40mm ?? 0,
            };
          }
        }
      }
      setLocalSurcharges(surchargeMap);

      // Build local compatibility map
      if (compatRes.ok) {
        const compatData: CompatibilityGroup[] = await compatRes.json();
        setCompatGroups(compatData);

        const compatMap: Record<string, Record<string, LocalCompatRule>> = {};
        for (const group of compatData) {
          for (const rule of group.rules) {
            if (!compatMap[rule.edgeTypeId]) {
              compatMap[rule.edgeTypeId] = {};
            }
            let state: CompatibilityState = 'allowed';
            if (!rule.isAllowed) {
              state = 'blocked';
            } else if (rule.warningMessage) {
              state = 'warning';
            }
            compatMap[rule.edgeTypeId][group.fabricationCategory] = {
              state,
              warningMessage: rule.warningMessage || '',
            };
          }
        }
        setLocalCompat(compatMap);
      }
    } catch (error) {
      console.error('Error fetching edge data:', error);
      setToast({ message: 'Failed to load edge rates', type: 'error' });
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

  // --- Surcharge handlers ---

  const handleSurchargeChange = (
    edgeTypeId: string,
    field: 'rate20mm' | 'rate40mm',
    value: string
  ) => {
    const numValue = value === '' ? 0 : parseFloat(value);
    setLocalSurcharges(prev => ({
      ...prev,
      [edgeTypeId]: {
        ...prev[edgeTypeId],
        [selectedSurchargeCategory]: {
          ...prev[edgeTypeId]?.[selectedSurchargeCategory],
          [field]: numValue,
        },
      },
    }));
  };

  const handleSaveSurcharges = async () => {
    setSavingSurcharges(true);
    try {
      const entries: Array<{
        edgeTypeId: string;
        fabricationCategory: string;
        rate20mm: number;
        rate40mm: number;
      }> = [];

      for (const edgeTypeId of Object.keys(localSurcharges)) {
        for (const fabricationCategory of Object.keys(localSurcharges[edgeTypeId])) {
          const rates = localSurcharges[edgeTypeId][fabricationCategory];
          entries.push({
            edgeTypeId,
            fabricationCategory,
            rate20mm: rates.rate20mm,
            rate40mm: rates.rate40mm,
          });
        }
      }

      const res = await fetch('/api/pricing/edge-category-rates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entries),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save edge surcharges');
      }

      setToast({ message: 'Edge surcharges saved successfully', type: 'success' });
      fetchData();
    } catch (error) {
      console.error('Error saving edge surcharges:', error);
      setToast({
        message: error instanceof Error ? error.message : 'Failed to save edge surcharges',
        type: 'error',
      });
    } finally {
      setSavingSurcharges(false);
    }
  };

  // --- Compatibility handlers ---

  const getCompatState = (edgeTypeId: string, category: string): CompatibilityState => {
    return localCompat[edgeTypeId]?.[category]?.state ?? 'allowed';
  };

  const getCompatWarning = (edgeTypeId: string, category: string): string => {
    return localCompat[edgeTypeId]?.[category]?.warningMessage ?? '';
  };

  const cycleCompatState = (edgeTypeId: string, category: string) => {
    const current = getCompatState(edgeTypeId, category);
    const nextMap: Record<CompatibilityState, CompatibilityState> = {
      allowed: 'warning',
      warning: 'blocked',
      blocked: 'allowed',
    };
    const next = nextMap[current];

    setLocalCompat(prev => ({
      ...prev,
      [edgeTypeId]: {
        ...prev[edgeTypeId],
        [category]: {
          state: next,
          warningMessage: next === 'warning' ? (prev[edgeTypeId]?.[category]?.warningMessage || '') : '',
        },
      },
    }));
  };

  const setCompatWarningMessage = (edgeTypeId: string, category: string, message: string) => {
    setLocalCompat(prev => ({
      ...prev,
      [edgeTypeId]: {
        ...prev[edgeTypeId],
        [category]: {
          ...prev[edgeTypeId]?.[category],
          state: 'warning' as CompatibilityState,
          warningMessage: message,
        },
      },
    }));
  };

  const handleSaveCompat = async () => {
    setSavingCompat(true);
    try {
      const entries: Array<{
        fabricationCategory: string;
        edgeTypeId: string;
        isAllowed: boolean;
        warningMessage: string | null;
      }> = [];

      for (const edgeTypeId of Object.keys(localCompat)) {
        for (const fabricationCategory of Object.keys(localCompat[edgeTypeId])) {
          const rule = localCompat[edgeTypeId][fabricationCategory];
          entries.push({
            fabricationCategory,
            edgeTypeId,
            isAllowed: rule.state !== 'blocked',
            warningMessage: rule.state === 'warning' ? rule.warningMessage || null : null,
          });
        }
      }

      // Also include entries for edge types that have no compat overrides (default = allowed)
      for (const edge of edgeTypes) {
        for (const cat of FABRICATION_CATEGORIES) {
          const hasEntry = entries.some(
            e => e.edgeTypeId === edge.id && e.fabricationCategory === cat.value
          );
          if (!hasEntry) {
            entries.push({
              fabricationCategory: cat.value,
              edgeTypeId: edge.id,
              isAllowed: true,
              warningMessage: null,
            });
          }
        }
      }

      const res = await fetch('/api/pricing/edge-compatibility', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entries),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save edge compatibility');
      }

      setToast({ message: 'Edge compatibility rules saved successfully', type: 'success' });
      fetchData();
    } catch (error) {
      console.error('Error saving edge compatibility:', error);
      setToast({
        message: error instanceof Error ? error.message : 'Failed to save edge compatibility',
        type: 'error',
      });
    } finally {
      setSavingCompat(false);
    }
  };

  // --- Render ---

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading edge rates...</div>
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

      <div className="space-y-8">
        {/* Section 1: Edge Surcharge Matrix */}
        <div className="card">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Edge Surcharges by Category</h2>
            <p className="text-sm text-gray-500 mt-1">
              Set edge profile surcharges per fabrication category and thickness. Rates are in AUD per lineal metre.
            </p>
          </div>

          {/* Category selector */}
          <div className="border-b border-gray-200 mb-4">
            <nav className="-mb-px flex space-x-1 overflow-x-auto" aria-label="Fabrication categories">
              {FABRICATION_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setSelectedSurchargeCategory(cat.value)}
                  className={cn(
                    'whitespace-nowrap py-3 px-4 border-b-2 font-medium text-sm transition-colours',
                    selectedSurchargeCategory === cat.value
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </nav>
          </div>

          {edgeRates.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No edge types found.</p>
              <p className="text-sm text-gray-400 mt-2">
                Add edge types in the Configuration tab first.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Edge Profile
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      20mm Rate
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      40mm Rate
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {edgeRates.map((edge) => {
                    const catRates = localSurcharges[edge.edgeTypeId]?.[selectedSurchargeCategory];
                    return (
                      <tr key={edge.edgeTypeId}>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                          {edge.edgeTypeName}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-2 flex items-center text-gray-400 text-xs">
                              $
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={catRates?.rate20mm ?? 0}
                              onChange={(e) =>
                                handleSurchargeChange(edge.edgeTypeId, 'rate20mm', e.target.value)
                              }
                              className="w-28 pl-5 rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-2 flex items-center text-gray-400 text-xs">
                              $
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={catRates?.rate40mm ?? 0}
                              onChange={(e) =>
                                handleSurchargeChange(edge.edgeTypeId, 'rate40mm', e.target.value)
                              }
                              className="w-28 pl-5 rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {edgeRates.length > 0 && (
            <div className="flex justify-end mt-4">
              <button
                onClick={handleSaveSurcharges}
                disabled={savingSurcharges}
                className={cn(
                  'px-6 py-2 text-sm font-medium text-white rounded-lg',
                  savingSurcharges
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500'
                )}
              >
                {savingSurcharges ? 'Saving...' : 'Save Edge Surcharges'}
              </button>
            </div>
          )}
        </div>

        {/* Section 2: Edge Compatibility Matrix */}
        <div className="card">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Edge Compatibility</h2>
            <p className="text-sm text-gray-500 mt-1">
              Configure which edge profiles are compatible with each material category. Click a cell to cycle through states.
            </p>
          </div>

          {edgeTypes.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No edge types found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Edge Profile
                    </th>
                    {FABRICATION_CATEGORIES.map((cat) => (
                      <th
                        key={cat.value}
                        className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                        title={cat.fullLabel}
                      >
                        {cat.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {edgeTypes.map((edge) => (
                    <tr key={edge.id}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        {edge.name}
                      </td>
                      {FABRICATION_CATEGORIES.map((cat) => {
                        const state = getCompatState(edge.id, cat.value);
                        return (
                          <td key={cat.value} className="px-3 py-2">
                            <div className="flex flex-col items-center gap-1">
                              <button
                                onClick={() => cycleCompatState(edge.id, cat.value)}
                                className={cn(
                                  'w-full px-3 py-1.5 rounded text-xs font-medium transition-colours border',
                                  state === 'allowed' &&
                                    'bg-green-50 text-green-700 border-green-200 hover:bg-green-100',
                                  state === 'warning' &&
                                    'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
                                  state === 'blocked' &&
                                    'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                                )}
                                title={`Click to cycle: Allowed → Warning → Blocked`}
                              >
                                {state === 'allowed' && 'Allowed'}
                                {state === 'warning' && 'Warning'}
                                {state === 'blocked' && 'Blocked'}
                              </button>
                              {state === 'warning' && (
                                <input
                                  type="text"
                                  placeholder="Warning message..."
                                  value={getCompatWarning(edge.id, cat.value)}
                                  onChange={(e) =>
                                    setCompatWarningMessage(edge.id, cat.value, e.target.value)
                                  }
                                  className="w-full text-xs rounded border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                                />
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded bg-green-100 border border-green-200" />
              Allowed
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded bg-amber-100 border border-amber-200" />
              Warning (with message)
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded bg-red-100 border border-red-200" />
              Blocked
            </span>
          </div>

          {edgeTypes.length > 0 && (
            <div className="flex justify-end mt-4">
              <button
                onClick={handleSaveCompat}
                disabled={savingCompat}
                className={cn(
                  'px-6 py-2 text-sm font-medium text-white rounded-lg',
                  savingCompat
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500'
                )}
              >
                {savingCompat ? 'Saving...' : 'Save Compatibility Rules'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
