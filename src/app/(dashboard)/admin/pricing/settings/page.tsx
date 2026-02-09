'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface PricingSettings {
  id?: string;
  organisationId: string;
  materialPricingBasis: 'PER_SLAB' | 'PER_SQUARE_METRE';
  wasteFactorPercent: string;
  cuttingUnit: 'LINEAR_METRE' | 'SQUARE_METRE' | 'FIXED' | 'PER_SLAB' | 'PER_KILOMETRE';
  polishingUnit: 'LINEAR_METRE' | 'SQUARE_METRE' | 'FIXED' | 'PER_SLAB' | 'PER_KILOMETRE';
  installationUnit: 'LINEAR_METRE' | 'SQUARE_METRE' | 'FIXED' | 'PER_SLAB' | 'PER_KILOMETRE';
  unitSystem: 'METRIC' | 'IMPERIAL';
  currency: string;
  gstRate: string;
}

export default function PricingSettingsPage() {
  const [settings, setSettings] = useState<PricingSettings>({
    organisationId: 'default-org',
    materialPricingBasis: 'PER_SLAB',
    wasteFactorPercent: '15.00',
    cuttingUnit: 'LINEAR_METRE',
    polishingUnit: 'LINEAR_METRE',
    installationUnit: 'SQUARE_METRE',
    unitSystem: 'METRIC',
    currency: 'AUD',
    gstRate: '0.1000'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/admin/pricing/settings');
      if (!res.ok) throw new Error('Failed to fetch settings');
      const data = await res.json();
      setSettings(data);
    } catch (error) {
      console.error('Error fetching settings:', error);
      setToast({ message: 'Failed to load settings', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pricing/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save settings');
      }

      const data = await res.json();
      setSettings(data);
      setToast({ message: 'Settings saved successfully', type: 'success' });
    } catch (error) {
      console.error('Error saving settings:', error);
      setToast({ 
        message: error instanceof Error ? error.message : 'Failed to save settings', 
        type: 'error' 
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading settings...</div>
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

      <div className="card space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Pricing Configuration</h2>
          <p className="text-sm text-gray-500 mb-6">
            Configure how your organisation calculates and displays pricing.
          </p>
        </div>

        {/* Material Pricing Basis */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Material Pricing Basis
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Choose how materials are priced in the system
          </p>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="radio"
                name="materialPricingBasis"
                value="PER_SLAB"
                checked={settings.materialPricingBasis === 'PER_SLAB'}
                onChange={(e) => setSettings({ ...settings, materialPricingBasis: e.target.value as 'PER_SLAB' })}
                className="mr-2"
              />
              <span className="text-sm">Per Slab</span>
              <span className="ml-2 text-xs text-gray-500">(Fixed price per slab)</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="materialPricingBasis"
                value="PER_SQUARE_METRE"
                checked={settings.materialPricingBasis === 'PER_SQUARE_METRE'}
                onChange={(e) => setSettings({ ...settings, materialPricingBasis: e.target.value as 'PER_SQUARE_METRE' })}
                className="mr-2"
              />
              <span className="text-sm">Per Square Metre</span>
              <span className="ml-2 text-xs text-gray-500">(Price based on area used)</span>
            </label>
          </div>
        </div>

        {/* Waste Factor — only relevant for PER_SQUARE_METRE */}
        {settings.materialPricingBasis === 'PER_SQUARE_METRE' && (
          <div className="space-y-2 ml-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <label htmlFor="wasteFactorPercent" className="block text-sm font-medium text-gray-700">
              Waste Factor (%)
            </label>
            <p className="text-xs text-gray-500">
              Applied to per-square-metre material pricing. Accounts for kerf loss, breakage, and cutting waste. Industry standard: 10–15%.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                id="wasteFactorPercent"
                name="wasteFactorPercent"
                min={0}
                max={50}
                step={0.5}
                value={settings.wasteFactorPercent}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    wasteFactorPercent: e.target.value,
                  })
                }
                className="w-24 rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              />
              <span className="text-sm text-gray-500">%</span>
            </div>
          </div>
        )}

        <hr className="border-gray-200" />

        {/* Service Units */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-900">Service Unit Configuration</h3>
          
          {/* Cutting Unit */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Cutting Unit
            </label>
            <select
              value={settings.cuttingUnit}
              onChange={(e) => setSettings({ ...settings, cuttingUnit: e.target.value as typeof settings.cuttingUnit })}
              className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            >
              <option value="LINEAR_METRE">Lineal Metre</option>
              <option value="SQUARE_METRE">Square Metre</option>
              <option value="FIXED">Fixed Price</option>
              <option value="PER_SLAB">Per Slab</option>
            </select>
          </div>

          {/* Polishing Unit */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Polishing Unit
            </label>
            <select
              value={settings.polishingUnit}
              onChange={(e) => setSettings({ ...settings, polishingUnit: e.target.value as typeof settings.polishingUnit })}
              className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            >
              <option value="LINEAR_METRE">Lineal Metre</option>
              <option value="SQUARE_METRE">Square Metre</option>
              <option value="FIXED">Fixed Price</option>
              <option value="PER_SLAB">Per Slab</option>
            </select>
          </div>

          {/* Installation Unit */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Installation Unit
            </label>
            <select
              value={settings.installationUnit}
              onChange={(e) => setSettings({ ...settings, installationUnit: e.target.value as typeof settings.installationUnit })}
              className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            >
              <option value="SQUARE_METRE">Square Metre</option>
              <option value="LINEAR_METRE">Lineal Metre</option>
              <option value="FIXED">Fixed Price</option>
              <option value="PER_SLAB">Per Slab</option>
            </select>
          </div>
        </div>

        <hr className="border-gray-200" />

        {/* Measurement System */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Measurement System
          </label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="radio"
                name="unitSystem"
                value="METRIC"
                checked={settings.unitSystem === 'METRIC'}
                onChange={(e) => setSettings({ ...settings, unitSystem: e.target.value as 'METRIC' })}
                className="mr-2"
              />
              <span className="text-sm">Metric (mm, m, m²)</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="unitSystem"
                value="IMPERIAL"
                checked={settings.unitSystem === 'IMPERIAL'}
                onChange={(e) => setSettings({ ...settings, unitSystem: e.target.value as 'IMPERIAL' })}
                className="mr-2"
              />
              <span className="text-sm">Imperial (in, ft, ft²)</span>
            </label>
          </div>
        </div>

        <hr className="border-gray-200" />

        {/* Tax Settings */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-900">Tax Settings</h3>
          
          {/* Currency */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Currency
            </label>
            <select
              value={settings.currency}
              onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
              className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            >
              <option value="AUD">AUD - Australian Dollar</option>
              <option value="USD">USD - US Dollar</option>
              <option value="GBP">GBP - British Pound</option>
              <option value="EUR">EUR - Euro</option>
              <option value="NZD">NZD - New Zealand Dollar</option>
            </select>
          </div>

          {/* GST Rate */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              GST Rate
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.0001"
                min="0"
                max="1"
                value={settings.gstRate}
                onChange={(e) => setSettings({ ...settings, gstRate: e.target.value })}
                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <span className="text-gray-500 sm:text-sm">
                  {(parseFloat(settings.gstRate) * 100).toFixed(2)}%
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Enter as decimal (e.g., 0.10 for 10% GST)
            </p>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t border-gray-200">
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              'px-6 py-2 text-sm font-medium text-white rounded-lg',
              saving
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500'
            )}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </>
  );
}
