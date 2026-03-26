'use client';

import { useState } from 'react';

interface CategoryRate {
  fabricationCategory: string;
  rate: number;
}

interface CutoutTypeFormProps {
  initialData: Record<string, unknown> | null;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  ENGINEERED: 'Zero Silica',
  NATURAL_HARD: 'Granite',
  NATURAL_SOFT: 'Marble',
  NATURAL_PREMIUM: 'Quartzite',
  SINTERED: 'Porcelain',
};

const CATEGORY_ORDER = ['ENGINEERED', 'NATURAL_HARD', 'NATURAL_SOFT', 'NATURAL_PREMIUM', 'SINTERED'];

function parseCategoryRates(initialData: Record<string, unknown> | null): Record<string, number> {
  const rates: Record<string, number> = {};
  CATEGORY_ORDER.forEach((cat) => {
    rates[cat] = 0;
  });

  if (initialData?.categoryRates && Array.isArray(initialData.categoryRates)) {
    (initialData.categoryRates as CategoryRate[]).forEach((cr) => {
      if (cr.fabricationCategory in rates) {
        rates[cr.fabricationCategory] = Number(cr.rate) || 0;
      }
    });
  }

  return rates;
}

export default function CutoutTypeForm({ initialData, onSave, onCancel }: CutoutTypeFormProps) {
  const [formData, setFormData] = useState({
    name: (initialData?.name as string) || '',
    description: (initialData?.description as string) || '',
    baseRate: (initialData?.baseRate as number) || 0,
    sortOrder: (initialData?.sortOrder as number) || 0,
    isActive: initialData?.isActive !== false,
  });
  const [categoryRates, setCategoryRates] = useState(parseCategoryRates(initialData));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    if (formData.baseRate < 0) {
      newErrors.baseRate = 'Base rate must be 0 or greater';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRateChange = (cat: string, value: string) => {
    setCategoryRates((prev) => ({
      ...prev,
      [cat]: parseFloat(value) || 0,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await onSave({
        ...formData,
        categoryRates: CATEGORY_ORDER.map((cat) => ({
          fabricationCategory: cat,
          rate: categoryRates[cat],
        })),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = 'mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm border px-3 py-2';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
          Name *
        </label>
        <input
          type="text"
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className={inputClass}
          placeholder="e.g., Undermount Sink"
        />
        {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700">
          Description
        </label>
        <textarea
          id="description"
          rows={3}
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className={inputClass}
          placeholder="Optional description"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="baseRate" className="block text-sm font-medium text-gray-700">
            Base Rate ($)
          </label>
          <input
            type="number"
            id="baseRate"
            step="0.01"
            min="0"
            value={formData.baseRate}
            onChange={(e) => setFormData({ ...formData, baseRate: parseFloat(e.target.value) || 0 })}
            className={inputClass}
          />
          {errors.baseRate && <p className="mt-1 text-sm text-red-600">{errors.baseRate}</p>}
        </div>

        <div>
          <label htmlFor="sortOrder" className="block text-sm font-medium text-gray-700">
            Sort Order
          </label>
          <input
            type="number"
            id="sortOrder"
            value={formData.sortOrder}
            onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="isActive"
          checked={formData.isActive}
          onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        />
        <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900">
          Active
        </label>
      </div>

      {/* Per-Category Rate Table */}
      <div className="border rounded-lg p-4 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">
          Per-Category Rates ($/each)
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 pr-4 font-medium text-gray-600">Category</th>
              <th className="text-right py-2 pl-2 font-medium text-gray-600">$/each</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORY_ORDER.map((cat) => (
              <tr key={cat} className="border-b last:border-b-0">
                <td className="py-2 pr-4 text-gray-700">{CATEGORY_LABELS[cat]}</td>
                <td className="py-2 pl-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={categoryRates[cat] || ''}
                    onChange={(e) => handleRateChange(cat, e.target.value)}
                    placeholder="0.00"
                    className="w-full text-right rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm border px-2 py-1"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end space-x-3 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          {submitting ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  );
}
