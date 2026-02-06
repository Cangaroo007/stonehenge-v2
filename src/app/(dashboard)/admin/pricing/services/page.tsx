'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface ServiceRate {
  id: string;
  serviceType: string;
  name: string;
  description: string | null;
  rate20mm: number;
  rate40mm: number;
  minimumCharge: number | null;
  isActive: boolean;
}

export default function ServiceRatesPage() {
  const [rates, setRates] = useState<ServiceRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    fetchRates();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const fetchRates = async () => {
    try {
      const res = await fetch('/api/admin/pricing/service-rates');
      if (!res.ok) throw new Error('Failed to fetch service rates');
      const data = await res.json();
      setRates(data);
    } catch (error) {
      console.error('Error fetching service rates:', error);
      setToast({ message: 'Failed to load service rates', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleRateChange = (id: string, field: keyof ServiceRate, value: string | number | boolean | null) => {
    setRates(rates.map(rate => 
      rate.id === id ? { ...rate, [field]: value } : rate
    ));
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      // Update each rate
      const promises = rates.map(rate =>
        fetch(`/api/admin/pricing/service-rates/${rate.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: rate.name,
            description: rate.description,
            rate20mm: rate.rate20mm,
            rate40mm: rate.rate40mm,
            minimumCharge: rate.minimumCharge,
            isActive: rate.isActive
          })
        })
      );

      await Promise.all(promises);
      setToast({ message: 'All service rates saved successfully', type: 'success' });
      fetchRates(); // Refresh to get latest data
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
        {rates.length === 0 ? (
          <div className="card">
            <div className="text-center py-12">
              <p className="text-gray-500">No service rates found.</p>
              <p className="text-sm text-gray-400 mt-2">
                Service rates are automatically created when pricing settings are configured.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {rates.map((rate) => (
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
