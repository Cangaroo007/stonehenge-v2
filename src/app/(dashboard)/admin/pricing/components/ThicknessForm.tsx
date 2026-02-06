'use client';

import { useState } from 'react';

interface ThicknessFormProps {
  initialData: Record<string, unknown> | null;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
}

export default function ThicknessForm({ initialData, onSave, onCancel }: ThicknessFormProps) {
  const [formData, setFormData] = useState({
    name: (initialData?.name as string) || '',
    value: (initialData?.value as number) || 20,
    multiplier: (initialData?.multiplier as number) || 1.0,
    isDefault: (initialData?.isDefault as boolean) || false,
    sortOrder: (initialData?.sortOrder as number) || 0,
    isActive: initialData?.isActive !== false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (formData.value <= 0) {
      newErrors.value = 'Thickness value must be greater than 0';
    }

    if (formData.multiplier <= 0) {
      newErrors.multiplier = 'Multiplier must be greater than 0';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setSubmitting(true);
    try {
      await onSave(formData);
    } finally {
      setSubmitting(false);
    }
  };

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
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm border px-3 py-2"
          placeholder="e.g., 20mm"
        />
        {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
      </div>

      <div>
        <label htmlFor="value" className="block text-sm font-medium text-gray-700">
          Thickness Value (mm) *
        </label>
        <input
          type="number"
          id="value"
          min="1"
          value={formData.value}
          onChange={(e) => setFormData({ ...formData, value: parseInt(e.target.value) || 0 })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm border px-3 py-2"
        />
        {errors.value && <p className="mt-1 text-sm text-red-600">{errors.value}</p>}
      </div>

      <div>
        <label htmlFor="multiplier" className="block text-sm font-medium text-gray-700">
          Price Multiplier *
        </label>
        <input
          type="number"
          id="multiplier"
          step="0.01"
          min="0.01"
          value={formData.multiplier}
          onChange={(e) => setFormData({ ...formData, multiplier: parseFloat(e.target.value) || 0 })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm border px-3 py-2"
        />
        <p className="mt-1 text-xs text-gray-500">1.0 = no change, 1.5 = 50% more expensive</p>
        {errors.multiplier && <p className="mt-1 text-sm text-red-600">{errors.multiplier}</p>}
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
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm border px-3 py-2"
        />
      </div>

      <div className="flex items-center space-x-6">
        <div className="flex items-center">
          <input
            type="checkbox"
            id="isDefault"
            checked={formData.isDefault}
            onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <label htmlFor="isDefault" className="ml-2 block text-sm text-gray-900">
            Default thickness
          </label>
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
