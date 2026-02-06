'use client';

import { useState, useMemo } from 'react';

// Cutout instance stored in piece JSON
export interface PieceCutout {
  id: string;           // unique id for this cutout instance
  cutoutTypeId: string; // references CutoutType
  quantity: number;     // usually 1, but could be multiple tap holes
  notes?: string;       // e.g., "centered", "offset 200mm from edge"
}

// CutoutType from database
export interface CutoutType {
  id: string;
  name: string;
  description: string | null;
  baseRate: number;
  isActive: boolean;
  sortOrder: number;
}

interface CutoutSelectorProps {
  cutouts: PieceCutout[];
  cutoutTypes: CutoutType[];
  onChange: (cutouts: PieceCutout[]) => void;
}

// Generate unique ID for cutout instances
const generateId = () => `cut_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export default function CutoutSelector({
  cutouts,
  cutoutTypes,
  onChange,
}: CutoutSelectorProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newCutoutTypeId, setNewCutoutTypeId] = useState('');
  const [newQuantity, setNewQuantity] = useState(1);
  const [newNotes, setNewNotes] = useState('');

  // Calculate total cutout cost
  const totalCost = useMemo(() => {
    return cutouts.reduce((sum, cutout) => {
      const cutoutType = cutoutTypes.find(t => t.id === cutout.cutoutTypeId);
      if (cutoutType) {
        return sum + (Number(cutoutType.baseRate) * cutout.quantity);
      }
      return sum;
    }, 0);
  }, [cutouts, cutoutTypes]);

  // Get cutout type name by ID
  const getCutoutTypeName = (typeId: string): string => {
    const cutoutType = cutoutTypes.find(t => t.id === typeId);
    return cutoutType?.name || 'Unknown';
  };

  // Get cutout type price by ID
  const getCutoutTypePrice = (typeId: string): number => {
    const cutoutType = cutoutTypes.find(t => t.id === typeId);
    return cutoutType ? Number(cutoutType.baseRate) : 0;
  };

  // Handle add cutout
  const handleAdd = () => {
    if (!newCutoutTypeId) return;

    const newCutout: PieceCutout = {
      id: generateId(),
      cutoutTypeId: newCutoutTypeId,
      quantity: newQuantity,
      notes: newNotes.trim() || undefined,
    };

    onChange([...cutouts, newCutout]);

    // Reset form
    setNewCutoutTypeId('');
    setNewQuantity(1);
    setNewNotes('');
    setIsAdding(false);
  };

  // Handle remove cutout
  const handleRemove = (cutoutId: string) => {
    onChange(cutouts.filter(c => c.id !== cutoutId));
  };

  // Handle quantity change for existing cutout
  const handleQuantityChange = (cutoutId: string, quantity: number) => {
    onChange(
      cutouts.map(c =>
        c.id === cutoutId ? { ...c, quantity: Math.max(1, quantity) } : c
      )
    );
  };

  // Format currency
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount);

  // Active cutout types for dropdown
  const activeCutoutTypes = useMemo(
    () => cutoutTypes.filter(t => t.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    [cutoutTypes]
  );

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Cutouts</h3>
        {!isAdding && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            + Add Cutout
          </button>
        )}
      </div>

      <div className="p-4">
        {/* Cutout List */}
        {cutouts.length > 0 && (
          <div className="space-y-2 mb-4">
            {/* Header Row */}
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 uppercase">
              <div className="col-span-5">Type</div>
              <div className="col-span-2 text-center">Qty</div>
              <div className="col-span-3">Notes</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>

            {/* Cutout Rows */}
            {cutouts.map((cutout) => (
              <div
                key={cutout.id}
                className="grid grid-cols-12 gap-2 items-center py-2 border-b border-gray-100 last:border-0"
              >
                <div className="col-span-5">
                  <div className="text-sm font-medium text-gray-900">
                    {getCutoutTypeName(cutout.cutoutTypeId)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatCurrency(getCutoutTypePrice(cutout.cutoutTypeId))} each
                  </div>
                </div>
                <div className="col-span-2">
                  <input
                    type="number"
                    min="1"
                    value={cutout.quantity}
                    onChange={(e) => handleQuantityChange(cutout.id, parseInt(e.target.value) || 1)}
                    className="w-full text-center text-sm px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div className="col-span-3">
                  <span className="text-sm text-gray-600 truncate block">
                    {cutout.notes || '—'}
                  </span>
                </div>
                <div className="col-span-2 text-right">
                  <button
                    type="button"
                    onClick={() => handleRemove(cutout.id)}
                    className="p-1 text-red-400 hover:text-red-600"
                    title="Remove cutout"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {cutouts.length === 0 && !isAdding && (
          <div className="text-center py-4 text-sm text-gray-500">
            No cutouts added. Click &quot;+ Add Cutout&quot; to add sinks, tap holes, etc.
          </div>
        )}

        {/* Add Cutout Form */}
        {isAdding && (
          <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {/* Type Dropdown */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Cutout Type
                </label>
                <select
                  value={newCutoutTypeId}
                  onChange={(e) => setNewCutoutTypeId(e.target.value)}
                  className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">Select type...</option>
                  {activeCutoutTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name} ({formatCurrency(Number(type.baseRate))})
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  value={newQuantity}
                  onChange={(e) => setNewQuantity(parseInt(e.target.value) || 1)}
                  className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Notes (optional)
              </label>
              <input
                type="text"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="e.g., centered, offset 200mm from edge"
                className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleAdd}
                disabled={!newCutoutTypeId}
                className="flex-1 text-sm px-3 py-1.5 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  setNewCutoutTypeId('');
                  setNewQuantity(1);
                  setNewNotes('');
                }}
                className="flex-1 text-sm px-3 py-1.5 border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Total */}
        {cutouts.length > 0 && (
          <div className="border-t pt-3 mt-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Cutout Total:</span>
              <span className="font-medium text-primary-600">{formatCurrency(totalCost)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
