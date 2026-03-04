'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

interface StripConfig {
  id: string | null;
  stripType: string;
  label: string;
  stripWidthMm: number;
  visibleWidthMm: number;
  laminationWidthMm: number;
  kerfLossMm: number;
  isActive: boolean;
  isDefault?: boolean;
}

export default function StripConfigurationsPage() {
  const [configs, setConfigs] = useState<StripConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Partial<StripConfig>>>({});

  useEffect(() => {
    fetch('/api/admin/pricing/strip-configurations')
      .then(r => r.json())
      .then(data => {
        setConfigs(data);
        // Pre-populate edits with current values
        const initial: Record<string, Partial<StripConfig>> = {};
        for (const c of data) {
          initial[c.stripType] = {
            stripWidthMm: c.stripWidthMm,
            visibleWidthMm: c.visibleWidthMm,
            laminationWidthMm: c.laminationWidthMm,
            kerfLossMm: c.kerfLossMm,
          };
        }
        setEdits(initial);
      })
      .catch(() => toast.error('Failed to load strip configurations'))
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async (config: StripConfig) => {
    setSaving(config.stripType);
    try {
      const patch = edits[config.stripType] ?? {};
      const res = await fetch('/api/admin/pricing/strip-configurations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stripType: config.stripType,
          label: config.label,
          stripWidthMm: patch.stripWidthMm ?? config.stripWidthMm,
          visibleWidthMm: patch.visibleWidthMm ?? config.visibleWidthMm,
          laminationWidthMm: patch.laminationWidthMm ?? config.laminationWidthMm,
          kerfLossMm: patch.kerfLossMm ?? config.kerfLossMm,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast.success(`${config.label} saved`);
      // Refresh
      const updated = await fetch('/api/admin/pricing/strip-configurations').then(r => r.json());
      setConfigs(updated);
    } catch {
      toast.error('Failed to save configuration');
    } finally {
      setSaving(null);
    }
  };

  const updateEdit = (stripType: string, field: keyof StripConfig, value: number) => {
    setEdits(prev => ({
      ...prev,
      [stripType]: { ...(prev[stripType] ?? {}), [field]: value },
    }));
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-gray-100 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Strip Configurations</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure lamination strip widths for 40mm pieces. These values are used
          by the slab optimiser to calculate how much slab material is consumed by
          edge strips.
        </p>
      </div>

      <div className="space-y-4">
        {configs.map((config) => {
          const edit = edits[config.stripType] ?? {};
          const isSaving = saving === config.stripType;

          return (
            <div
              key={config.stripType}
              className="bg-white border border-gray-200 rounded-xl p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{config.label}</h3>
                  <span className="text-xs text-gray-400 font-mono">{config.stripType}</span>
                  {config.isDefault && (
                    <span className="ml-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                      Using hardcoded default — save to persist
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Strip Width (mm)
                    <span className="block text-gray-400 font-normal">Total cut from slab</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={edit.stripWidthMm ?? config.stripWidthMm}
                    onChange={(e) => updateEdit(config.stripType, 'stripWidthMm', parseInt(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Visible Width (mm)
                    <span className="block text-gray-400 font-normal">After kerf loss</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={edit.visibleWidthMm ?? config.visibleWidthMm}
                    onChange={(e) => updateEdit(config.stripType, 'visibleWidthMm', parseInt(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Lamination Width (mm)
                    <span className="block text-gray-400 font-normal">Edge build-up depth</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={edit.laminationWidthMm ?? config.laminationWidthMm}
                    onChange={(e) => updateEdit(config.stripType, 'laminationWidthMm', parseInt(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Kerf Loss (mm)
                    <span className="block text-gray-400 font-normal">Blade width</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={edit.kerfLossMm ?? config.kerfLossMm}
                    onChange={(e) => updateEdit(config.stripType, 'kerfLossMm', parseInt(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div className="flex justify-end mt-4">
                <button
                  onClick={() => handleSave(config)}
                  disabled={isSaving}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 mt-6">
        Changes take effect on the next quote optimisation run.
        Existing quotes are not retroactively recalculated.
      </p>
    </div>
  );
}
