'use client';

import { useState } from 'react';

interface StripConfigurationFormProps {
  initialData: Record<string, unknown> | null;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
}

const usageTypes = [
  { value: 'EDGE_LAMINATION', label: 'Edge Lamination' },
  { value: 'WATERFALL_STANDARD', label: 'Waterfall (Standard)' },
  { value: 'WATERFALL_EXTENDED', label: 'Waterfall (Extended)' },
  { value: 'APRON', label: 'Apron' },
  { value: 'CUSTOM', label: 'Custom' },
];

export default function StripConfigurationForm({ initialData, onSave, onCancel }: StripConfigurationFormProps) {
  const [formData, setFormData] = useState({
    name: (initialData?.name as string) || '',
    description: (initialData?.description as string) || '',
    finalThickness: (initialData?.finalThickness as number) || 40,
    primaryStripWidth: (initialData?.primaryStripWidth as number | null) || null,
    laminationStripWidth: (initialData?.laminationStripWidth as number) || 40,
    kerfAllowance: (initialData?.kerfAllowance as number) || 8,
    usageType: (initialData?.usageType as string) || 'EDGE_LAMINATION',
    applicableEdgeTypes: (initialData?.applicableEdgeTypes as string[]) || [],
    isDefault: (initialData?.isDefault as boolean) || false,
    isActive: initialData?.isActive !== false,
    sortOrder: (initialData?.sortOrder as number) || 0,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Calculate total width
  const totalMaterialWidth = 
    (formData.primaryStripWidth || 0) + formData.laminationStripWidth + formData.kerfAllowance;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (formData.finalThickness < 20 || formData.finalThickness > 200) {
      newErrors.finalThickness = 'Final thickness must be between 20mm and 200mm';
    }

    if (formData.laminationStripWidth < 10 || formData.laminationStripWidth > 200) {
      newErrors.laminationStripWidth = 'Lamination width must be between 10mm and 200mm';
    }

    if (formData.primaryStripWidth !== null && (formData.primaryStripWidth < 0 || formData.primaryStripWidth > 1000)) {
      newErrors.primaryStripWidth = 'Primary width must be between 0mm and 1000mm';
    }

    if (formData.kerfAllowance < 0 || formData.kerfAllowance > 20) {
      newErrors.kerfAllowance = 'Kerf allowance must be between 0mm and 20mm';
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
          placeholder="e.g., Standard 40mm Edge"
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
          placeholder="Optional usage notes..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="usageType" className="block text-sm font-medium text-gray-700">
            Usage Type *
          </label>
          <select
            id="usageType"
            value={formData.usageType}
            onChange={(e) => setFormData({ ...formData, usageType: e.target.value })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm border px-3 py-2"
          >
            {usageTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="finalThickness" className="block text-sm font-medium text-gray-700">
            Final Thickness (mm) *
          </label>
          <input
            type="number"
            id="finalThickness"
            min="20"
            max="200"
            value={formData.finalThickness}
            onChange={(e) => setFormData({ ...formData, finalThickness: parseInt(e.target.value) || 0 })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm border px-3 py-2"
          />
          {errors.finalThickness && <p className="mt-1 text-sm text-red-600">{errors.finalThickness}</p>}
        </div>
      </div>

      {/* Strip Dimensions */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-3">
        <h3 className="font-medium text-gray-800 text-sm">Strip Cut Dimensions</h3>
        
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="primaryStripWidth" className="block text-xs font-medium text-gray-600 mb-1">
              Primary (mm)
            </label>
            <input
              type="number"
              id="primaryStripWidth"
              min="0"
              max="1000"
              value={formData.primaryStripWidth || ''}
              onChange={(e) => setFormData({ 
                ...formData, 
                primaryStripWidth: e.target.value ? parseInt(e.target.value) : null 
              })}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm border px-2 py-1.5"
              placeholder="Optional"
            />
            <p className="text-xs text-gray-400 mt-0.5">Waterfall/apron</p>
            {errors.primaryStripWidth && <p className="mt-1 text-xs text-red-600">{errors.primaryStripWidth}</p>}
          </div>

          <div>
            <label htmlFor="laminationStripWidth" className="block text-xs font-medium text-gray-600 mb-1">
              Lamination (mm) *
            </label>
            <input
              type="number"
              id="laminationStripWidth"
              min="10"
              max="200"
              value={formData.laminationStripWidth}
              onChange={(e) => setFormData({ ...formData, laminationStripWidth: parseInt(e.target.value) || 0 })}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm border px-2 py-1.5"
            />
            <p className="text-xs text-gray-400 mt-0.5">Edge buildup</p>
            {errors.laminationStripWidth && <p className="mt-1 text-xs text-red-600">{errors.laminationStripWidth}</p>}
          </div>

          <div>
            <label htmlFor="kerfAllowance" className="block text-xs font-medium text-gray-600 mb-1">
              Kerf (mm) *
            </label>
            <input
              type="number"
              id="kerfAllowance"
              min="0"
              max="20"
              value={formData.kerfAllowance}
              onChange={(e) => setFormData({ ...formData, kerfAllowance: parseInt(e.target.value) || 0 })}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm border px-2 py-1.5"
            />
            <p className="text-xs text-gray-400 mt-0.5">Blade loss</p>
            {errors.kerfAllowance && <p className="mt-1 text-xs text-red-600">{errors.kerfAllowance}</p>}
          </div>
        </div>

        {/* Calculated Total */}
        <div className="pt-3 border-t border-gray-200">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">Total Strip Width:</span>
            <span className="text-xl font-bold text-blue-600">{totalMaterialWidth}mm</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {formData.primaryStripWidth || '0'} + {formData.laminationStripWidth} + {formData.kerfAllowance} = {totalMaterialWidth}mm
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="applicableEdgeTypes" className="block text-sm font-medium text-gray-700">
          Applicable Edge Types (comma-separated codes)
        </label>
        <input
          type="text"
          id="applicableEdgeTypes"
          value={formData.applicableEdgeTypes.join(', ')}
          onChange={(e) => setFormData({ 
            ...formData, 
            applicableEdgeTypes: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
          })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm border px-3 py-2"
          placeholder="e.g., 40MM_PENCIL, 40MM_BULLNOSE, WATERFALL"
        />
        <p className="mt-1 text-xs text-gray-500">Enter edge type codes separated by commas</p>
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

      <div className="space-y-2">
        <div className="flex items-center">
          <input
            type="checkbox"
            id="isDefault"
            checked={formData.isDefault}
            onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <label htmlFor="isDefault" className="ml-2 block text-sm text-gray-900">
            Set as default for {usageTypes.find(t => t.value === formData.usageType)?.label}
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
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
        >
          {submitting ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  );
}
