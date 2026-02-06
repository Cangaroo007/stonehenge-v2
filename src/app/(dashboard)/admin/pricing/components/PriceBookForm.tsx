'use client';

import { useState } from 'react';

interface PriceBookFormProps {
  initialData: Record<string, unknown> | null;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  pricingRules: Record<string, unknown>[];
}

const categories = [
  { value: 'general', label: 'General' },
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'trade', label: 'Trade' },
];

export default function PriceBookForm({ initialData, onSave, onCancel, pricingRules }: PriceBookFormProps) {
  // Get initial selected rule IDs from initialData
  const initialRuleIds = initialData?.rules
    ? (initialData.rules as Array<{ pricingRuleId: string }>).map(r => r.pricingRuleId)
    : [];

  const [formData, setFormData] = useState({
    name: (initialData?.name as string) || '',
    description: (initialData?.description as string) || '',
    category: (initialData?.category as string) || 'general',
    defaultThickness: (initialData?.defaultThickness as number) || 20,
    isDefault: (initialData?.isDefault as boolean) || false,
    sortOrder: (initialData?.sortOrder as number) || 0,
    isActive: initialData?.isActive !== false,
    ruleIds: initialRuleIds,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRuleToggle = (ruleId: string) => {
    setFormData(prev => ({
      ...prev,
      ruleIds: prev.ruleIds.includes(ruleId)
        ? prev.ruleIds.filter(id => id !== ruleId)
        : [...prev.ruleIds, ruleId],
    }));
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
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
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
          placeholder="e.g., Trade Price Book"
        />
        {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700">
          Description
        </label>
        <textarea
          id="description"
          rows={2}
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm border px-3 py-2"
          placeholder="Optional description"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-700">
            Category
          </label>
          <select
            id="category"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm border px-3 py-2"
          >
            {categories.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="defaultThickness" className="block text-sm font-medium text-gray-700">
            Default Thickness (mm)
          </label>
          <input
            type="number"
            id="defaultThickness"
            min="1"
            value={formData.defaultThickness}
            onChange={(e) => setFormData({ ...formData, defaultThickness: parseInt(e.target.value) || 20 })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm border px-3 py-2"
          />
        </div>
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

      {/* Pricing Rules Selection */}
      {pricingRules.length > 0 && (
        <div className="pt-4 border-t">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Included Pricing Rules</h4>
          <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-3 bg-gray-50">
            {pricingRules.map((rule) => (
              <label key={rule.id as string} className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.ruleIds.includes(rule.id as string)}
                  onChange={() => handleRuleToggle(rule.id as string)}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-gray-700">
                  {String(rule.name)}
                  {typeof rule.description === 'string' && rule.description && (
                    <span className="text-gray-500"> - {rule.description}</span>
                  )}
                </span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Select the pricing rules to include in this price book
          </p>
        </div>
      )}

      <div className="flex items-center space-x-6 pt-4">
        <div className="flex items-center">
          <input
            type="checkbox"
            id="isDefault"
            checked={formData.isDefault}
            onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <label htmlFor="isDefault" className="ml-2 block text-sm text-gray-900">
            Default price book
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
