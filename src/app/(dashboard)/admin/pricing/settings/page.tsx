'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface PricingSettings {
  id?: string;
  organisationId: string;
  materialPricingBasis: 'PER_SLAB' | 'PER_SQUARE_METRE';
  wasteFactorPercent: string;
  grainMatchingSurchargePercent: string;
  cuttingUnit: 'LINEAR_METRE' | 'SQUARE_METRE' | 'FIXED' | 'PER_SLAB' | 'PER_KILOMETRE';
  polishingUnit: 'LINEAR_METRE' | 'SQUARE_METRE' | 'FIXED' | 'PER_SLAB' | 'PER_KILOMETRE';
  installationUnit: 'LINEAR_METRE' | 'SQUARE_METRE' | 'FIXED' | 'PER_SLAB' | 'PER_KILOMETRE';
  unitSystem: 'METRIC' | 'IMPERIAL';
  currency: string;
  gstRate: string;
  waterfallPricingMethod: 'FIXED_PER_END' | 'PER_LINEAR_METRE' | 'INCLUDED_IN_SLAB';
  slabEdgeAllowanceMm: number | null;
}

export default function PricingSettingsPage() {
  const [settings, setSettings] = useState<PricingSettings>({
    organisationId: '',
    materialPricingBasis: 'PER_SLAB',
    wasteFactorPercent: '15.00',
    grainMatchingSurchargePercent: '15.00',
    cuttingUnit: 'LINEAR_METRE',
    polishingUnit: 'LINEAR_METRE',
    installationUnit: 'SQUARE_METRE',
    unitSystem: 'METRIC',
    currency: 'AUD',
    gstRate: '0.1000',
    waterfallPricingMethod: 'FIXED_PER_END',
    slabEdgeAllowanceMm: null,
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

        <hr className="border-gray-200" />

        {/* Oversize & Joins */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-900">Oversize & Joins</h3>
          <div className="space-y-2">
            <label htmlFor="grainMatchingSurchargePercent" className="block text-sm font-medium text-gray-700">
              Grain Matching Surcharge (%)
            </label>
            <p className="text-xs text-gray-500">
              Applied to fabrication subtotal for oversize pieces requiring joins. Set to 0 to disable.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                id="grainMatchingSurchargePercent"
                name="grainMatchingSurchargePercent"
                min={0}
                max={100}
                step={0.5}
                value={settings.grainMatchingSurchargePercent}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    grainMatchingSurchargePercent: e.target.value,
                  })
                }
                className="w-24 rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              />
              <span className="text-sm text-gray-500">%</span>
            </div>
          </div>
        </div>

        <hr className="border-gray-200" />

        {/* Waterfall Pricing Method */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Waterfall Pricing Method
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Choose how waterfall ends are priced when a benchtop includes a waterfall return.
          </p>
          <div className="space-y-3">
            <label className="flex items-start">
              <input
                type="radio"
                name="waterfallPricingMethod"
                value="FIXED_PER_END"
                checked={settings.waterfallPricingMethod === 'FIXED_PER_END'}
                onChange={(e) => setSettings({ ...settings, waterfallPricingMethod: e.target.value as 'FIXED_PER_END' })}
                className="mr-2 mt-0.5"
              />
              <div>
                <span className="text-sm font-medium">Fixed Per End</span>
                <p className="text-xs text-gray-500">
                  Each waterfall end is charged a flat rate regardless of height.
                </p>
              </div>
            </label>
            <label className="flex items-start">
              <input
                type="radio"
                name="waterfallPricingMethod"
                value="PER_LINEAR_METRE"
                checked={settings.waterfallPricingMethod === 'PER_LINEAR_METRE'}
                onChange={(e) => setSettings({ ...settings, waterfallPricingMethod: e.target.value as 'PER_LINEAR_METRE' })}
                className="mr-2 mt-0.5"
              />
              <div>
                <span className="text-sm font-medium">Per Lineal Metre of Height</span>
                <p className="text-xs text-gray-500">
                  Rate is charged per lineal metre of waterfall height. Short returns cost less than full-height drops.
                </p>
              </div>
            </label>
            <label className="flex items-start">
              <input
                type="radio"
                name="waterfallPricingMethod"
                value="INCLUDED_IN_SLAB"
                checked={settings.waterfallPricingMethod === 'INCLUDED_IN_SLAB'}
                onChange={(e) => setSettings({ ...settings, waterfallPricingMethod: e.target.value as 'INCLUDED_IN_SLAB' })}
                className="mr-2 mt-0.5"
              />
              <div>
                <span className="text-sm font-medium">Included in Slab</span>
                <p className="text-xs text-gray-500">
                  Waterfall cost is included in the slab price with no additional charge.
                </p>
              </div>
            </label>
          </div>
        </div>

        <hr className="border-gray-200" />

        {/* Slab Edge Allowance */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-900">Slab Edge Allowance</h3>
          <p className="text-xs text-gray-500">
            The unusable material around the perimeter of each slab. Set to 0 to use the full slab area.
            Leave blank to prompt per-quote.
          </p>

          <div className="space-y-3">
            {/* Presets */}
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Prompt per-quote', value: null },
                { label: 'None (0mm)', value: 0 },
                { label: '10mm', value: 10 },
                { label: '15mm', value: 15 },
                { label: '20mm', value: 20 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setSettings({ ...settings, slabEdgeAllowanceMm: preset.value })}
                  className={cn(
                    'px-3 py-1.5 text-sm rounded-lg border transition-colors',
                    settings.slabEdgeAllowanceMm === preset.value
                      ? 'bg-primary-50 border-primary-500 text-primary-700 font-medium'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom input */}
            <div className="flex items-center gap-3">
              <label htmlFor="slabEdgeAllowanceMm" className="text-sm text-gray-600">
                Custom:
              </label>
              <input
                type="number"
                id="slabEdgeAllowanceMm"
                min={0}
                max={50}
                step={1}
                value={settings.slabEdgeAllowanceMm ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setSettings({
                    ...settings,
                    slabEdgeAllowanceMm: val === '' ? null : Math.min(50, Math.max(0, parseInt(val, 10) || 0)),
                  });
                }}
                placeholder="—"
                className="w-20 rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              />
              <span className="text-sm text-gray-500">mm per side</span>
            </div>

            {settings.slabEdgeAllowanceMm === null && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                No default set — users will be prompted to choose an edge allowance on each quote.
              </p>
            )}
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
