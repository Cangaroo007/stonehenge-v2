'use client';

import { useState } from 'react';

interface ServiceRateFormProps {
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

const SERVICE_TYPES: { value: string; label: string }[] = [
  { value: 'CUTTING', label: 'Cutting' },
  { value: 'INSTALLATION', label: 'Installation' },
  { value: 'TEMPLATING', label: 'Templating' },
  { value: 'DELIVERY', label: 'Delivery' },
  { value: 'JOIN', label: 'Join Fabrication' },
  { value: 'CURVED_CUTTING', label: 'Curved Cutting' },
  { value: 'RADIUS_SETUP', label: 'Radius Setup' },
  { value: 'CURVED_MIN_LM', label: 'Curved Minimum LM' },
];

export default function ServiceRateForm({ initialData, onSave, onCancel }: ServiceRateFormProps) {
  const [formData, setFormData] = useState({
    name: (initialData?.name as string) || '',
    description: (initialData?.description as string) || '',
    serviceType: (initialData?.serviceType as string) || 'CUTTING',
    fabricationCategory: (initialData?.fabricationCategory as string) || 'ENGINEERED',
    rate20mm: (initialData?.rate20mm as number) || 0,
    rate40mm: (initialData?.rate40mm as number) || 0,
    minimumCharge: (initialData?.minimumCharge as number) || 0,
    isActive: initialData?.isActive !== false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    if (formData.rate20mm < 0) {
      newErrors.rate20mm = 'Rate must be 0 or greater';
    }
    if (formData.rate40mm < 0) {
      newErrors.rate40mm = 'Rate must be 0 or greater';
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
          placeholder="e.g., Standard Cutting"
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
          className={inputClass}
          placeholder="Optional description"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="serviceType" className="block text-sm font-medium text-gray-700">
            Service Type
          </label>
          <select
            id="serviceType"
            value={formData.serviceType}
            onChange={(e) => setFormData({ ...formData, serviceType: e.target.value })}
            className={inputClass}
          >
            {SERVICE_TYPES.map((st) => (
              <option key={st.value} value={st.value}>
                {st.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="fabricationCategory" className="block text-sm font-medium text-gray-700">
            Fabrication Category
          </label>
          <select
            id="fabricationCategory"
            value={formData.fabricationCategory}
            onChange={(e) => setFormData({ ...formData, fabricationCategory: e.target.value })}
            className={inputClass}
          >
            {CATEGORY_ORDER.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label htmlFor="rate20mm" className="block text-sm font-medium text-gray-700">
            20mm Rate ($)
          </label>
          <input
            type="number"
            id="rate20mm"
            step="0.01"
            min="0"
            value={formData.rate20mm}
            onChange={(e) => setFormData({ ...formData, rate20mm: parseFloat(e.target.value) || 0 })}
            className={inputClass}
          />
          {errors.rate20mm && <p className="mt-1 text-sm text-red-600">{errors.rate20mm}</p>}
        </div>

        <div>
          <label htmlFor="rate40mm" className="block text-sm font-medium text-gray-700">
            40mm Rate ($)
          </label>
          <input
            type="number"
            id="rate40mm"
            step="0.01"
            min="0"
            value={formData.rate40mm}
            onChange={(e) => setFormData({ ...formData, rate40mm: parseFloat(e.target.value) || 0 })}
            className={inputClass}
          />
          {errors.rate40mm && <p className="mt-1 text-sm text-red-600">{errors.rate40mm}</p>}
        </div>

        <div>
          <label htmlFor="minimumCharge" className="block text-sm font-medium text-gray-700">
            Minimum Charge ($)
          </label>
          <input
            type="number"
            id="minimumCharge"
            step="0.01"
            min="0"
            value={formData.minimumCharge}
            onChange={(e) => setFormData({ ...formData, minimumCharge: parseFloat(e.target.value) || 0 })}
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
