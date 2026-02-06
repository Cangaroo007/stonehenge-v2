'use client';

import { useState, useEffect, useCallback } from 'react';
import PriceMappingVerification from './PriceMappingVerification';
import type { InterpretationResult, PriceMapping } from '@/lib/types/price-interpreter';

// Define discount categories based on the requirements
const DISCOUNT_CATEGORIES = [
  { id: 'slabs', label: 'Slabs' },
  { id: 'cutting', label: 'Cutting' },
  { id: 'polishing', label: 'Polishing' },
  { id: 'cutouts', label: 'Cutouts' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'installation', label: 'Installation' },
] as const;

type CategoryId = typeof DISCOUNT_CATEGORIES[number]['id'];

interface DiscountRow {
  category: CategoryId;
  discountPercent: number;
  isExcluded: boolean;
}

interface DiscountMatrix {
  globalDiscount: number;
  categoryDiscounts: DiscountRow[];
}

interface Tier {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  isDefault: boolean;
  isActive: boolean;
  discountMatrix?: DiscountMatrix;
  customPriceList?: any; // JSON field for tier-specific prices
}

export default function TierManagement() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<Tier | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchTiers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/pricing/client-tiers');
      if (!res.ok) throw new Error('Failed to fetch tiers');
      const data = await res.json();
      setTiers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTiers();
  }, [fetchTiers]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  const handleCreateTier = () => {
    setEditingTier(null);
    setModalOpen(true);
  };

  const handleEditTier = (tier: Tier) => {
    setEditingTier(tier);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingTier(null);
  };

  const handleSaveTier = async (tierData: Partial<Tier>) => {
    try {
      const url = editingTier 
        ? `/api/admin/pricing/client-tiers/${editingTier.id}` 
        : '/api/admin/pricing/client-tiers';
      const method = editingTier ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tierData),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to save tier');
      }

      showToast(
        editingTier ? 'Tier updated successfully' : 'Tier created successfully',
        'success'
      );
      handleCloseModal();
      fetchTiers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save tier', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-zinc-500">Loading tiers...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-4">
        <p className="text-sm text-red-800">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg ${
            toast.type === 'success' 
              ? 'bg-green-500 text-white' 
              : 'bg-red-500 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Pricing Tiers</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Manage customer tiers and their discount matrices
          </p>
        </div>
        <button
          onClick={handleCreateTier}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500"
        >
          <svg
            className="w-4 h-4 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Create Tier
        </button>
      </div>

      {/* Tiers Grid */}
      {tiers.length === 0 ? (
        <div className="text-center py-12 bg-zinc-50 rounded-lg border border-zinc-200">
          <p className="text-zinc-500">No tiers found. Create your first tier to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tiers.map((tier) => (
            <TierCard
              key={tier.id}
              tier={tier}
              onEdit={() => handleEditTier(tier)}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <TierModal
          tier={editingTier}
          onClose={handleCloseModal}
          onSave={handleSaveTier}
        />
      )}
    </div>
  );
}

function TierCard({ tier, onEdit }: { tier: Tier; onEdit: () => void }) {
  return (
    <div className="bg-white rounded-lg border border-zinc-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="text-base font-semibold text-zinc-900">{tier.name}</h3>
          {tier.description && (
            <p className="text-sm text-zinc-500 mt-1">{tier.description}</p>
          )}
        </div>
        {tier.isDefault && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
            Default
          </span>
        )}
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-600">Priority:</span>
          <span className="font-medium text-zinc-900">{tier.priority}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-600">Status:</span>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              tier.isActive
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-100 text-gray-800'
            }`}
          >
            {tier.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      <button
        onClick={onEdit}
        className="w-full px-3 py-2 text-sm font-medium text-zinc-700 bg-zinc-50 rounded-lg hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500"
      >
        Edit Discount Matrix
      </button>
    </div>
  );
}

function TierModal({
  tier,
  onClose,
  onSave,
}: {
  tier: Tier | null;
  onClose: () => void;
  onSave: (data: Partial<Tier>) => Promise<void>;
}) {
  const [name, setName] = useState(tier?.name || '');
  const [description, setDescription] = useState(tier?.description || '');
  const [priority, setPriority] = useState(tier?.priority || 0);
  const [isDefault, setIsDefault] = useState(tier?.isDefault || false);
  const [isActive, setIsActive] = useState(tier?.isActive ?? true);
  
  // Price list mode: 'global' or 'custom'
  const [priceListMode, setPriceListMode] = useState<'global' | 'custom'>(
    tier?.customPriceList ? 'custom' : 'global'
  );
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [showManualEdit, setShowManualEdit] = useState(false);
  const [showMappingVerification, setShowMappingVerification] = useState(false);
  const [interpretation, setInterpretation] = useState<InterpretationResult | null>(null);
  const [processingFile, setProcessingFile] = useState(false);
  const fileInputRef = useState<HTMLInputElement | null>(null)[0];
  
  // Initialize discount matrix
  const [globalDiscount, setGlobalDiscount] = useState(
    tier?.discountMatrix?.globalDiscount || 0
  );
  const [categoryDiscounts, setCategoryDiscounts] = useState<DiscountRow[]>(
    tier?.discountMatrix?.categoryDiscounts ||
      Array.from(DISCOUNT_CATEGORIES).map((cat) => ({
        category: cat.id,
        discountPercent: 0,
        isExcluded: false,
      }))
  );

  // Preview calculator state
  const [previewAmount, setPreviewAmount] = useState(1000);

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // File upload handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const handleFileUpload = (file: File) => {
    // Validate file type
    const validTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
    ];
    
    if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx?|csv)$/i)) {
      setErrors({ ...errors, file: 'Please upload a valid spreadsheet file (.xlsx, .xls, or .csv)' });
      return;
    }
    
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      setErrors({ ...errors, file: 'File size must be less than 10MB' });
      return;
    }
    
    setUploadedFile(file);
    // Clear file error by removing the field
    const newErrors = { ...errors };
    delete newErrors.file;
    setErrors(newErrors);
    
    // Automatically process the file
    processUploadedFile(file);
  };

  const processUploadedFile = async (file: File) => {
    setProcessingFile(true);
    try {
      // Read file content
      const fileContent = await readFileAsText(file);
      
      // Send to API for AI interpretation
      const response = await fetch('/api/admin/pricing/interpret-price-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileContent, fileName: file.name }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to interpret price list');
      }
      
      const result: InterpretationResult = await response.json();
      setInterpretation(result);
      setShowMappingVerification(true);
    } catch (error) {
      setErrors({
        ...errors,
        file: error instanceof Error ? error.message : 'Failed to process file',
      });
    } finally {
      setProcessingFile(false);
    }
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  const handleMappingConfirm = (confirmedMappings: PriceMapping[]) => {
    // Store the confirmed mappings to be saved with the tier
    setInterpretation((prev) =>
      prev ? { ...prev, mappings: confirmedMappings } : null
    );
    setShowMappingVerification(false);
  };

  const handleCategoryChange = (
    category: CategoryId,
    field: 'discountPercent' | 'isExcluded',
    value: number | boolean
  ) => {
    setCategoryDiscounts((prev) =>
      prev.map((row) =>
        row.category === category ? { ...row, [field]: value } : row
      )
    );
  };

  const calculatePreview = () => {
    const breakdown = categoryDiscounts.map((row) => {
      const cat = DISCOUNT_CATEGORIES.find((c) => c.id === row.category);
      const categoryAmount = previewAmount / DISCOUNT_CATEGORIES.length;
      
      let discount = 0;
      if (row.isExcluded) {
        // Category-specific discount only
        discount = (categoryAmount * row.discountPercent) / 100;
      } else {
        // Apply both global and category-specific
        const globalDiscount_ = (categoryAmount * globalDiscount) / 100;
        const categoryDiscount_ = (categoryAmount * row.discountPercent) / 100;
        discount = globalDiscount_ + categoryDiscount_;
      }
      
      return {
        label: cat?.label || row.category,
        original: categoryAmount,
        discount,
        final: categoryAmount - discount,
      };
    });

    const totalDiscount = breakdown.reduce((sum, item) => sum + item.discount, 0);
    const finalTotal = previewAmount - totalDiscount;

    return { breakdown, totalDiscount, finalTotal };
  };

  const preview = calculatePreview();

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) {
      newErrors.name = 'Tier name is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      // Prepare tier data
      const tierData: any = {
        name,
        description: description || null,
        priority,
        isDefault,
        isActive,
        discountMatrix: {
          globalDiscount,
          categoryDiscounts,
        },
      };
      
      // Add custom price list if mode is custom and we have interpretation
      if (priceListMode === 'custom' && interpretation) {
        tierData.customPriceList = {
          mappings: interpretation.mappings,
          summary: interpretation.summary,
          uploadedAt: new Date().toISOString(),
          fileName: uploadedFile?.name,
        };
      } else if (priceListMode === 'global') {
        // Clear custom price list if switching back to global
        tierData.customPriceList = null;
      }
      
      await onSave(tierData);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black bg-opacity-30 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-zinc-200">
            <h2 className="text-xl font-semibold text-zinc-900">
              {tier ? `Edit Tier: ${tier.name}` : 'Create New Tier'}
            </h2>
          </div>

          {/* Body - Scrollable */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-3 gap-6 p-6">
              {/* Left Column: Basic Info */}
              <div className="col-span-2 space-y-6">
                <div className="bg-zinc-50 rounded-lg p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-zinc-900">Basic Information</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      Tier Name *
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., Gold Trade"
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                    {errors.name && (
                      <p className="mt-1 text-sm text-red-600">{errors.name}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={2}
                      placeholder="Optional description"
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">
                        Priority
                      </label>
                      <input
                        type="number"
                        value={priority}
                        onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      />
                    </div>
                    <div className="flex items-end space-x-4">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={isDefault}
                          onChange={(e) => setIsDefault(e.target.checked)}
                          className="h-4 w-4 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                        />
                        <span className="ml-2 text-sm text-zinc-700">Default</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={isActive}
                          onChange={(e) => setIsActive(e.target.checked)}
                          className="h-4 w-4 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                        />
                        <span className="ml-2 text-sm text-zinc-700">Active</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Price List Configuration */}
                <div className="bg-zinc-50 rounded-lg p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-zinc-900">Price List Configuration</h3>
                  
                  {/* Mode Toggle */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">
                      Pricing Mode
                    </label>
                    <div className="flex space-x-4">
                      <label className="flex items-center cursor-pointer">
                        <input
                          type="radio"
                          checked={priceListMode === 'global'}
                          onChange={() => setPriceListMode('global')}
                          className="h-4 w-4 border-zinc-300 text-amber-600 focus:ring-amber-500"
                        />
                        <span className="ml-2 text-sm text-zinc-700">Use Global Default Prices</span>
                      </label>
                      <label className="flex items-center cursor-pointer">
                        <input
                          type="radio"
                          checked={priceListMode === 'custom'}
                          onChange={() => setPriceListMode('custom')}
                          className="h-4 w-4 border-zinc-300 text-amber-600 focus:ring-amber-500"
                        />
                        <span className="ml-2 text-sm text-zinc-700">Use Custom Tier Price List</span>
                      </label>
                    </div>
                  </div>

                  {/* Custom Price List Section */}
                  {priceListMode === 'custom' && (
                    <div className="space-y-3 pt-2 border-t border-zinc-200">
                      {/* Upload Dropzone */}
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-2">
                          Upload Spreadsheet
                        </label>
                        <div
                          onDragEnter={handleDrag}
                          onDragLeave={handleDrag}
                          onDragOver={handleDrag}
                          onDrop={handleDrop}
                          onClick={() => document.getElementById('price-file-input')?.click()}
                          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                            dragActive
                              ? 'border-amber-500 bg-amber-50'
                              : 'border-zinc-300 hover:border-amber-400 bg-white'
                          }`}
                        >
                          <input
                            id="price-file-input"
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            onChange={handleFileChange}
                            className="hidden"
                          />
                          
                          <svg
                            className="mx-auto h-10 w-10 text-zinc-400 mb-2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                            />
                          </svg>
                          
                          {uploadedFile ? (
                            <div>
                              <p className="text-sm font-medium text-zinc-900 mb-1">
                                {uploadedFile.name}
                              </p>
                              <p className="text-xs text-zinc-500">
                                {(uploadedFile.size / 1024).toFixed(1)} KB - Click to change
                              </p>
                            </div>
                          ) : (
                            <div>
                              <p className="text-sm text-zinc-600 mb-1">
                                Drop spreadsheet here or{' '}
                                <span className="text-amber-600 font-medium">click to upload</span>
                              </p>
                              <p className="text-xs text-zinc-500">
                                Supports .xlsx, .xls, .csv (max 10MB)
                              </p>
                            </div>
                          )}
                        </div>
                        {errors.file && (
                          <p className="mt-1 text-sm text-red-600">{errors.file}</p>
                        )}
                      </div>

                      {/* Manual Edit Button */}
                      <div className="flex justify-between items-center">
                        <p className="text-xs text-zinc-600">
                          Or configure service rates manually
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowManualEdit(true)}
                          className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 rounded hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                        >
                          Manual Edit
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Discount Matrix */}
                <div className="bg-zinc-50 rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-zinc-900">Discount Matrix</h3>
                  </div>

                  {/* Global Discount */}
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <label className="block text-sm font-medium text-zinc-900 mb-2">
                      Global Across-the-Board Discount (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={globalDiscount}
                      onChange={(e) => setGlobalDiscount(parseFloat(e.target.value) || 0)}
                      className="w-32 px-3 py-2 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                    <p className="text-xs text-zinc-600 mt-1">
                      Applied to all categories unless excluded
                    </p>
                  </div>

                  {/* Category Discounts Table */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-zinc-200">
                      <thead>
                        <tr className="bg-zinc-100">
                          <th className="px-4 py-2 text-left text-xs font-semibold text-zinc-700">
                            Category
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-zinc-700">
                            Discount %
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-zinc-700">
                            Excluded from Global?
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-zinc-200">
                        {categoryDiscounts.map((row) => {
                          const cat = DISCOUNT_CATEGORIES.find((c) => c.id === row.category);
                          return (
                            <tr key={row.category}>
                              <td className="px-4 py-3 text-sm font-medium text-zinc-900">
                                {cat?.label}
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.01"
                                  value={row.discountPercent}
                                  onChange={(e) =>
                                    handleCategoryChange(
                                      row.category,
                                      'discountPercent',
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  className="w-24 px-2 py-1 text-sm border border-zinc-300 rounded focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  checked={row.isExcluded}
                                  onChange={(e) =>
                                    handleCategoryChange(
                                      row.category,
                                      'isExcluded',
                                      e.target.checked
                                    )
                                  }
                                  className="h-4 w-4 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Right Column: Preview Calculator */}
              <div className="col-span-1">
                <div className="bg-zinc-50 rounded-lg p-4 space-y-4 sticky top-0">
                  <h3 className="text-sm font-semibold text-zinc-900">Preview Calculator</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      Test Amount ($)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={previewAmount}
                      onChange={(e) => setPreviewAmount(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>

                  <div className="space-y-2">
                    {preview.breakdown.map((item) => (
                      <div
                        key={item.label}
                        className="text-xs bg-white rounded p-2 border border-zinc-200"
                      >
                        <div className="font-medium text-zinc-900">{item.label}</div>
                        <div className="text-zinc-600 mt-1">
                          Original: ${item.original.toFixed(2)}
                        </div>
                        <div className="text-green-600">
                          Discount: -${item.discount.toFixed(2)}
                        </div>
                        <div className="font-semibold text-zinc-900">
                          Final: ${item.final.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-3 border-t border-zinc-300">
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-700">Original Total:</span>
                      <span className="font-medium text-zinc-900">
                        ${previewAmount.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm text-green-600 mt-1">
                      <span>Total Discount:</span>
                      <span className="font-medium">
                        -${preview.totalDiscount.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-base font-semibold text-zinc-900 mt-2 pt-2 border-t border-zinc-300">
                      <span>Final Total:</span>
                      <span className="text-amber-600">
                        ${preview.finalTotal.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-zinc-200 bg-zinc-50 flex justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50"
              >
                {submitting ? 'Saving...' : 'Save Tier'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Price List Processing Overlay */}
      {processingFile && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 shadow-xl max-w-md">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600"></div>
              <div>
                <h3 className="text-base font-semibold text-zinc-900">Processing Price List</h3>
                <p className="text-sm text-zinc-600 mt-1">
                  AI is analyzing your spreadsheet and mapping prices...
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mapping Verification Modal */}
      {showMappingVerification && interpretation && (
        <PriceMappingVerification
          interpretation={interpretation}
          onConfirm={handleMappingConfirm}
          onCancel={() => setShowMappingVerification(false)}
        />
      )}
    </div>
  );
}
