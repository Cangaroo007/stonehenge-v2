'use client';

import { useMemo } from 'react';

interface EdgeType {
  id: string;
  name: string;
  description: string | null;
  category: string;
  baseRate: number;
  isActive: boolean;
  sortOrder: number;
}

interface EdgeSelections {
  edgeTop: string | null;
  edgeBottom: string | null;
  edgeLeft: string | null;
  edgeRight: string | null;
}

interface EdgeSelectorProps {
  lengthMm: number;
  widthMm: number;
  edgeSelections: EdgeSelections;
  edgeTypes: EdgeType[];
  onChange: (edges: EdgeSelections) => void;
}

interface EdgeInfo {
  key: keyof EdgeSelections;
  label: string;
  lengthMm: number;
}

export default function EdgeSelector({
  lengthMm,
  widthMm,
  edgeSelections,
  edgeTypes,
  onChange,
}: EdgeSelectorProps) {
  // Get all active edge types (no longer filtering by category)
  const availableTypes = useMemo(
    () => {
      // Show all edge types, not just polish - the category is now informational
      const filtered = edgeTypes.filter((e) => e.isActive !== false);
      if (filtered.length === 0 && edgeTypes.length > 0) {
        return edgeTypes; // Fallback to all if none are active
      }
      return filtered;
    },
    [edgeTypes]
  );

  // Define edge configuration
  const edges: EdgeInfo[] = useMemo(
    () => [
      { key: 'edgeTop', label: 'Top', lengthMm: lengthMm },
      { key: 'edgeRight', label: 'Right', lengthMm: widthMm },
      { key: 'edgeBottom', label: 'Bottom', lengthMm: lengthMm },
      { key: 'edgeLeft', label: 'Left', lengthMm: widthMm },
    ],
    [lengthMm, widthMm]
  );

  // Calculate totals
  const calculations = useMemo(() => {
    let totalMeters = 0;
    let totalCost = 0;

    edges.forEach((edge) => {
      const edgeTypeId = edgeSelections[edge.key];
      if (edgeTypeId) {
        const meters = edge.lengthMm / 1000;
        const edgeType = edgeTypes.find((t) => t.id === edgeTypeId);
        totalMeters += meters;
        if (edgeType) {
          totalCost += meters * Number(edgeType.baseRate);
        }
      }
    });

    return { totalMeters, totalCost };
  }, [edges, edgeSelections, edgeTypes]);

  // Handle checkbox toggle
  const handleToggle = (key: keyof EdgeSelections, checked: boolean) => {
    if (checked) {
      // Enable with first available polish type, or any edge type, or 'selected' marker
      let defaultType: string | null = null;
      if (availableTypes.length > 0) {
        defaultType = availableTypes[0].id;
      } else if (edgeTypes.length > 0) {
        defaultType = edgeTypes[0].id;
      } else {
        // Use a marker value so checkbox stays checked even without edge types
        defaultType = 'selected';
      }
      onChange({ ...edgeSelections, [key]: defaultType });
    } else {
      // Disable
      onChange({ ...edgeSelections, [key]: null });
    }
  };

  // Handle edge type selection
  const handleTypeChange = (key: keyof EdgeSelections, typeId: string) => {
    onChange({ ...edgeSelections, [key]: typeId || null });
  };

  // Get border color class based on selection
  const getEdgeBorderClass = (key: keyof EdgeSelections) => {
    const typeId = edgeSelections[key];
    if (!typeId) return 'border-gray-300';
    const edgeType = edgeTypes.find((t) => t.id === typeId);
    if (edgeType?.category === 'waterfall') return 'border-purple-500';
    return 'border-blue-500';
  };

  // Format meters display
  const formatMeters = (mm: number) => (mm / 1000).toFixed(2);

  // Format currency
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700">Edge Polish Selection</h3>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Side - Visual Diagram */}
          <div className="flex items-center justify-center">
            <div className="relative">
              {/* Top Label */}
              <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs font-medium text-gray-500 pointer-events-none">
                Top
              </div>

              {/* Left Label */}
              <div className="absolute -left-10 top-1/2 transform -translate-y-1/2 -rotate-90 text-xs font-medium text-gray-500 pointer-events-none">
                Left
              </div>

              {/* Right Label */}
              <div className="absolute -right-10 top-1/2 transform -translate-y-1/2 rotate-90 text-xs font-medium text-gray-500 pointer-events-none">
                Right
              </div>

              {/* Bottom Label */}
              <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs font-medium text-gray-500 pointer-events-none">
                Bottom
              </div>

              {/* The Piece Rectangle */}
              <div
                className={`
                  w-36 h-24 bg-gray-100 flex items-center justify-center
                  border-t-4 ${getEdgeBorderClass('edgeTop')}
                  border-r-4 ${getEdgeBorderClass('edgeRight')}
                  border-b-4 ${getEdgeBorderClass('edgeBottom')}
                  border-l-4 ${getEdgeBorderClass('edgeLeft')}
                  transition-colors duration-200
                `}
              >
                <div className="text-center">
                  <div className="text-sm font-medium text-gray-700">
                    {lengthMm || '—'}
                  </div>
                  <div className="text-xs text-gray-500">×</div>
                  <div className="text-sm font-medium text-gray-700">
                    {widthMm || '—'}
                  </div>
                  <div className="text-xs text-gray-400">mm</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side - Edge Selection Grid */}
          <div className="space-y-3 relative z-50" style={{ isolation: 'isolate' }}>
            {/* Edge rows */}
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 uppercase">
                <div className="col-span-1"></div>
                <div className="col-span-3">Edge</div>
                <div className="col-span-5">Type</div>
                <div className="col-span-3">Length</div>
              </div>

              {edges.map((edge) => {
                const isSelected = !!edgeSelections[edge.key];
                return (
                  <div
                    key={edge.key}
                    className="grid grid-cols-12 gap-2 items-center py-1"
                  >
                    {/* Checkbox */}
                    <div className="col-span-1 relative z-50">
                      <input
                        type="checkbox"
                        id={`edge-checkbox-${edge.key}`}
                        checked={isSelected}
                        onChange={(e) => handleToggle(edge.key, e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 cursor-pointer"
                        style={{ pointerEvents: 'auto', position: 'relative', zIndex: 100 }}
                      />
                    </div>

                    {/* Label */}
                    <div className="col-span-3">
                      <span
                        className={`text-sm ${
                          isSelected ? 'font-medium text-gray-900' : 'text-gray-500'
                        }`}
                      >
                        {edge.label}
                      </span>
                    </div>

                    {/* Type Dropdown */}
                    <div className="col-span-5 relative z-20">
                      <select
                        value={edgeSelections[edge.key] || ''}
                        onChange={(e) => handleTypeChange(edge.key, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        disabled={!isSelected}
                        className={`w-full text-sm px-2 py-1 border rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500 pointer-events-auto ${
                          isSelected
                            ? 'border-gray-300 bg-white cursor-pointer'
                            : 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        <option value="">None</option>
                        {availableTypes.length === 0 && (
                          <option value="" disabled>No edge types configured</option>
                        )}
                        {availableTypes.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.name} (${type.baseRate}/lm){type.category !== 'polish' ? ` - ${type.category}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Length */}
                    <div className="col-span-3">
                      <span
                        className={`text-sm ${
                          isSelected ? 'text-gray-700' : 'text-gray-400'
                        }`}
                      >
                        {formatMeters(edge.lengthMm)}m
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Totals */}
            <div className="border-t pt-3 mt-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total Polish:</span>
                <span className="font-medium text-gray-900">
                  {calculations.totalMeters.toFixed(2)} lm
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Est. Edge Cost:</span>
                <span className="font-medium text-primary-600">
                  {formatCurrency(calculations.totalCost)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Info Text */}
        <div className="mt-4 text-xs text-gray-500 border-t pt-3">
          <p>
            <strong>Note:</strong> Edge pricing is calculated per lineal metre (one side only).
            Select the edges that require polishing.
          </p>
        </div>
      </div>
    </div>
  );
}
