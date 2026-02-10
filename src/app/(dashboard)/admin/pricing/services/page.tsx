'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface ServiceRate {
  id: string;
  serviceType: string;
  fabricationCategory: string;
  name: string;
  description: string | null;
  rate20mm: number;
  rate40mm: number;
  minimumCharge: number | null;
  isActive: boolean;
}

const FABRICATION_CATEGORIES = [
  { value: 'ENGINEERED', label: 'Engineered Quartz' },
  { value: 'NATURAL_HARD', label: 'Natural Hard (Granite)' },
  { value: 'NATURAL_SOFT', label: 'Natural Soft (Marble)' },
  { value: 'NATURAL_PREMIUM', label: 'Natural Premium (Quartzite)' },
  { value: 'SINTERED', label: 'Sintered / Porcelain' },
] as const;

const CATEGORY_MULTIPLIER_LABELS: Record<string, string> = {
  ENGINEERED: '1.00x — baseline',
  NATURAL_HARD: '1.15x — harder, predictable',
  NATURAL_SOFT: '1.10x — softer, chips',
  NATURAL_PREMIUM: '1.30x — extreme hardness',
  SINTERED: '1.30x — high tension',
};

export default function ServiceRatesPage() {
  const [allRates, setAllRates] = useState<ServiceRate[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ENGINEERED');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchRates = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/pricing/service-rates');
      if (!res.ok) throw new Error('Failed to fetch service rates');
      const data = await res.json();
      // Convert Decimal strings to numbers for display
      const parsed = data.map((r: any) => ({
        ...r,
        rate20mm: typeof r.rate20mm === 'string' ? parseFloat(r.rate20mm) : r.rate20mm,
        rate40mm: typeof r.rate40mm === 'string' ? parseFloat(r.rate40mm) : r.rate40mm,
        minimumCharge: r.minimumCharge != null
          ? (typeof r.minimumCharge === 'string' ? parseFloat(r.minimumCharge) : r.minimumCharge)
          : null,
      }));
      setAllRates(parsed);
    } catch (error) {
      console.error('Error fetching service rates:', error);
      setToast({ message: 'Failed to load service rates', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRates();
  }, [fetchRates]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Filter rates by selected category
  const filteredRates = allRates.filter(r => r.fabricationCategory === selectedCategory);

  // Count how many categories have rates
  const categoriesWithRates = Array.from(new Set(allRates.map(r => r.fabricationCategory)));

  const handleRateChange = (id: string, field: keyof ServiceRate, value: string | number | boolean | null) => {
    setAllRates(allRates.map(rate =>
      rate.id === id ? { ...rate, [field]: value } : rate
    ));
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      // Only save rates for the current category
      const promises = filteredRates.map(rate =>
        fetch(`/api/admin/pricing/service-rates/${rate.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: rate.name,
            description: rate.description,
            rate20mm: rate.rate20mm,
            rate40mm: rate.rate40mm,
            minimumCharge: rate.minimumCharge,
            isActive: rate.isActive,
          })
        })
      );

      await Promise.all(promises);
      setToast({ message: 'Service rates saved successfully', type: 'success' });
      fetchRates();
    } catch (error) {
      console.error('Error saving service rates:', error);
      setToast({ message: 'Failed to save service rates', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const formatServiceType = (type: string): string => {
    const labels: Record<string, string> = {
      CUTTING: 'Cutting',
      POLISHING: 'Polishing',
      INSTALLATION: 'Installation',
      WATERFALL_END: 'Waterfall End',
      TEMPLATING: 'Templating',
      DELIVERY: 'Delivery'
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading service rates...</div>
      </div>
    );
  }

  return (
    <>
      {/* Toast Notification */}
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
        {/* Category Info */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Service Rates by Material Category</h2>
              <p className="text-sm text-gray-500 mt-1">
                Rates vary by material hardness. Harder materials cost more to fabricate due to blade wear and slower cutting speeds.
              </p>
            </div>
            <div className="text-right text-sm text-gray-500">
              {categoriesWithRates.length} of {FABRICATION_CATEGORIES.length} categories configured
            </div>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-1 overflow-x-auto" aria-label="Fabrication categories">
            {FABRICATION_CATEGORIES.map((cat) => {
              const hasRates = categoriesWithRates.includes(cat.value);
              const isSelected = selectedCategory === cat.value;
              return (
                <button
                  key={cat.value}
                  onClick={() => setSelectedCategory(cat.value)}
                  className={cn(
                    'whitespace-nowrap py-3 px-4 border-b-2 font-medium text-sm transition-colors',
                    isSelected
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
                    !hasRates && !isSelected && 'opacity-50'
                  )}
                >
                  {cat.label}
                  {!hasRates && (
                    <span className="ml-1.5 text-xs text-gray-400">(no rates)</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Category Multiplier Hint */}
        <div className="text-sm text-gray-500 px-1">
          <span className="font-medium">{FABRICATION_CATEGORIES.find(c => c.value === selectedCategory)?.label}</span>
          {' — '}
          <span>{CATEGORY_MULTIPLIER_LABELS[selectedCategory]}</span>
        </div>

        {filteredRates.length === 0 ? (
          <div className="card">
            <div className="text-center py-12">
              <p className="text-gray-500">No service rates found for this category.</p>
              <p className="text-sm text-gray-400 mt-2">
                Run the category seed script to populate rates for all material categories.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {filteredRates.map((rate) => (
                <div key={rate.id} className="card">
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">
                          {formatServiceType(rate.serviceType)}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">{rate.name}</p>
                      </div>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={rate.isActive}
                          onChange={(e) => handleRateChange(rate.id, 'isActive', e.target.checked)}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="ml-2 text-sm text-gray-600">Active</span>
                      </label>
                    </div>

                    {/* Description */}
                    {rate.description && (
                      <p className="text-xs text-gray-500">{rate.description}</p>
                    )}

                    <hr className="border-gray-200" />

                    {/* Rates */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          20mm Rate
                        </label>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 text-sm">
                            $
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={rate.rate20mm}
                            onChange={(e) => handleRateChange(rate.id, 'rate20mm', parseFloat(e.target.value) || 0)}
                            className="block w-full pl-7 rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          40mm Rate
                        </label>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 text-sm">
                            $
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={rate.rate40mm}
                            onChange={(e) => handleRateChange(rate.id, 'rate40mm', parseFloat(e.target.value) || 0)}
                            className="block w-full pl-7 rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Minimum Charge */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Minimum Charge (Optional)
                      </label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 text-sm">
                          $
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={rate.minimumCharge || ''}
                          onChange={(e) => handleRateChange(rate.id, 'minimumCharge', e.target.value ? parseFloat(e.target.value) : null)}
                          placeholder="No minimum"
                          className="block w-full pl-7 rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Save All Button */}
            <div className="flex justify-end">
              <button
                onClick={handleSaveAll}
                disabled={saving}
                className={cn(
                  'px-6 py-2 text-sm font-medium text-white rounded-lg',
                  saving
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500'
                )}
              >
                {saving ? 'Saving...' : 'Save All Changes'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
