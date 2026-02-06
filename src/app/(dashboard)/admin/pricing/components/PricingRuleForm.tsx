'use client';

import { useState } from 'react';

interface PricingRuleFormProps {
  initialData: Record<string, unknown> | null;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  clientTypes: Record<string, unknown>[];
}

const adjustmentTypes = [
  { value: 'percentage', label: 'Percentage' },
  { value: 'fixed_amount', label: 'Fixed Amount' },
];

const appliesToOptions = [
  { value: 'all', label: 'All Items' },
  { value: 'materials', label: 'Materials Only' },
  { value: 'edges', label: 'Edges Only' },
  { value: 'cutouts', label: 'Cutouts Only' },
];

export default function PricingRuleForm({ initialData, onSave, onCancel, clientTypes }: PricingRuleFormProps) {
  const [formData, setFormData] = useState({
    name: (initialData?.name as string) || '',
    description: (initialData?.description as string) || '',
    priority: (initialData?.priority as number) || 0,
    clientTypeId: (initialData?.clientTypeId as string) || '',
    clientTierId: (initialData?.clientTierId as string) || '',
    minQuoteValue: (initialData?.minQuoteValue as number) || null,
    maxQuoteValue: (initialData?.maxQuoteValue as number) || null,
    thicknessValue: (initialData?.thicknessValue as number) || null,
    adjustmentType: (initialData?.adjustmentType as string) || 'percentage',
    adjustmentValue: (initialData?.adjustmentValue as number) || 0,
    appliesTo: (initialData?.appliesTo as string) || 'all',
    isActive: initialData?.isActive !== false,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setSubmitting(true);
    try {
      const dataToSave = {
        ...formData,
        clientTypeId: formData.clientTypeId || null,
        clientTierId: formData.clientTierId || null,
        minQuoteValue: formData.minQuoteValue || null,
        maxQuoteValue: formData.maxQuoteValue || null,
        thicknessValue: formData.thicknessValue || null,
      };
      await onSave(dataToSave);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
          Rule Name *
        </label>
        <input
          type="text"
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm border px-3 py-2"
          placeholder="e.g., Tier 1 Cabinet Maker Discount"
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

      <div>
        <label htmlFor="priority" className="block text-sm font-medium text-gray-700">
          Priority
        </label>
        <input
          type="number"
          id="priority"
          value={formData.priority}
          onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm border px-3 py-2"
        />
        <p className="mt-1 text-xs text-gray-500">Higher priority rules are applied first when multiple rules match</p>
      </div>

      {/* Conditions Section */}
      <div className="pt-4 border-t">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">Conditions (all must match)</h4>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="clientTypeId" className="block text-sm font-medium text-gray-700">
              Client Type
            </label>
            <select
              id="clientTypeId"
              value={formData.clientTypeId}
              onChange={(e) => setFormData({ ...formData, clientTypeId: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm border px-3 py-2"
            >
              <option value="">Any</option>
              {clientTypes.map((ct) => (
                <option key={ct.id as string} value={ct.id as string}>
                  {ct.name as string}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="thicknessValue" className="block text-sm font-medium text-gray-700">
              Thickness (mm)
            </label>
            <input
              type="number"
              id="thicknessValue"
              value={formData.thicknessValue || ''}
              onChange={(e) => setFormData({ ...formData, thicknessValue: e.target.value ? parseInt(e.target.value) : null })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm border px-3 py-2"
              placeholder="Any"
            />
          </div>

          <div>
            <label htmlFor="minQuoteValue" className="block text-sm font-medium text-gray-700">
              Min Quote Value ($)
            </label>
            <input
              type="number"
              id="minQuoteValue"
              step="0.01"
              value={formData.minQuoteValue || ''}
              onChange={(e) => setFormData({ ...formData, minQuoteValue: e.target.value ? parseFloat(e.target.value) : null })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm border px-3 py-2"
              placeholder="Any"
            />
          </div>

          <div>
            <label htmlFor="maxQuoteValue" className="block text-sm font-medium text-gray-700">
              Max Quote Value ($)
            </label>
            <input
              type="number"
              id="maxQuoteValue"
              step="0.01"
              value={formData.maxQuoteValue || ''}
              onChange={(e) => setFormData({ ...formData, maxQuoteValue: e.target.value ? parseFloat(e.target.value) : null })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm border px-3 py-2"
              placeholder="Any"
            />
          </div>
        </div>
      </div>

      {/* Outcome Section */}
      <div className="pt-4 border-t">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">Adjustment</h4>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="adjustmentType" className="block text-sm font-medium text-gray-700">
              Adjustment Type
            </label>
            <select
              id="adjustmentType"
              value={formData.adjustmentType}
              onChange={(e) => setFormData({ ...formData, adjustmentType: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm border px-3 py-2"
            >
              {adjustmentTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="adjustmentValue" className="block text-sm font-medium text-gray-700">
              Value {formData.adjustmentType === 'percentage' ? '(%)' : '($)'}
            </label>
            <input
              type="number"
              id="adjustmentValue"
              step="0.01"
              value={formData.adjustmentValue}
              onChange={(e) => setFormData({ ...formData, adjustmentValue: parseFloat(e.target.value) || 0 })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm border px-3 py-2"
            />
            <p className="mt-1 text-xs text-gray-500">Use negative values for discounts (e.g., -15 for 15% off)</p>
          </div>

          <div className="col-span-2">
            <label htmlFor="appliesTo" className="block text-sm font-medium text-gray-700">
              Applies To
            </label>
            <select
              id="appliesTo"
              value={formData.appliesTo}
              onChange={(e) => setFormData({ ...formData, appliesTo: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm border px-3 py-2"
            >
              {appliesToOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex items-center pt-4">
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
