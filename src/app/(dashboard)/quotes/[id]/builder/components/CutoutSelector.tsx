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
  /** Fabrication categories with configured (non-zero) rates */
  configuredCategories?: string[];
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
  const [checkedTypes, setCheckedTypes] = useState<Record<string, { checked: boolean; qty: number }>>({});

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

  // Handle add all checked cutouts
  const handleAddSelected = () => {
    const newCutouts: PieceCutout[] = Object.entries(checkedTypes)
      .filter(([, v]) => v.checked)
      .map(([typeId, v]) => ({
        id: generateId(),
        cutoutTypeId: typeId,
        quantity: v.qty,
      }));

    if (newCutouts.length === 0) return;

    onChange([...cutouts, ...newCutouts]);
    setCheckedTypes({});
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

  // Collapsed state
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Active cutout types for dropdown
  const activeCutoutTypes = useMemo(
    () => cutoutTypes.filter(t => t.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    [cutoutTypes]
  );

  // Build summary line for collapsed state
  const summaryLine = useMemo(() => {
    if (cutouts.length === 0) {
      return { text: 'No cutouts', cost: null };
    }

    // Group cutouts by type with total quantity
    const grouped: Record<string, { name: string; qty: number }> = {};
    cutouts.forEach((cutout) => {
      const name = getCutoutTypeName(cutout.cutoutTypeId);
      if (grouped[cutout.cutoutTypeId]) {
        grouped[cutout.cutoutTypeId].qty += cutout.quantity;
      } else {
        grouped[cutout.cutoutTypeId] = { name, qty: cutout.quantity };
      }
    });

    const parts = Object.values(grouped).map(
      (g) => `${g.name} \u00d7${g.qty}`
    );

    return {
      text: parts.join(', '),
      cost: totalCost,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cutouts, cutoutTypes, totalCost]);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-2 hover:text-gray-900 transition-colors"
        >
          <svg
            className={`h-3.5 w-3.5 text-gray-500 transform transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <h3 className="text-sm font-semibold text-gray-700">Cutouts</h3>
        </button>
        <div className="flex items-center gap-3">
          {isCollapsed && summaryLine.cost !== null && summaryLine.cost > 0 && (
            <span className="text-sm font-medium tabular-nums text-gray-900">
              {formatCurrency(summaryLine.cost)}
            </span>
          )}
          {!isCollapsed && !isAdding && (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              + Add Cutout
            </button>
          )}
        </div>
      </div>

      {/* Summary line when collapsed */}
      {isCollapsed && (
        <div className="px-4 py-2 bg-gray-50/50">
          <p className={`text-sm ${summaryLine.cost !== null ? 'text-gray-600' : 'text-gray-400 italic'}`}>
            {summaryLine.text}
          </p>
        </div>
      )}

      {!isCollapsed && <div className="p-4">
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

        {/* Add Cutout Checklist */}
        {isAdding && (
          <div className="border border-gray-200 rounded-lg bg-gray-50 overflow-hidden">
            <div className="divide-y divide-gray-200">
              {activeCutoutTypes.map((type) => {
                const entry = checkedTypes[type.id];
                const isChecked = entry?.checked ?? false;
                const qty = entry?.qty ?? 1;
                return (
                  <div
                    key={type.id}
                    className={`flex items-center justify-between px-3 py-2 ${isChecked ? 'bg-primary-50' : ''}`}
                  >
                    <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) =>
                          setCheckedTypes((prev) => ({
                            ...prev,
                            [type.id]: { checked: e.target.checked, qty: prev[type.id]?.qty ?? 1 },
                          }))
                        }
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-900 truncate">{type.name}</span>
                      <span className="text-xs text-gray-500 whitespace-nowrap">
                        ({formatCurrency(Number(type.baseRate))})
                      </span>
                    </label>
                    <div className="flex items-center gap-1 ml-2">
                      <span className="text-xs text-gray-500">Qty:</span>
                      <input
                        type="number"
                        min="1"
                        value={qty}
                        onChange={(e) =>
                          setCheckedTypes((prev) => ({
                            ...prev,
                            [type.id]: { checked: prev[type.id]?.checked ?? false, qty: Math.max(1, parseInt(e.target.value) || 1) },
                          }))
                        }
                        className="w-14 text-center text-sm px-1 py-0.5 border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 p-3 border-t border-gray-200">
              <button
                type="button"
                onClick={handleAddSelected}
                disabled={!Object.values(checkedTypes).some((v) => v.checked)}
                className="flex-1 text-sm px-3 py-1.5 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Selected
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  setCheckedTypes({});
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
      </div>}
    </div>
  );
}
