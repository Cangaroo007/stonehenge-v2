'use client';

import { useState } from 'react';
import {
  PriceMapping,
  ServiceCategory,
  CutoutType,
  InterpretationResult,
} from '@/lib/types/price-interpreter';

interface PriceMappingVerificationProps {
  interpretation: InterpretationResult;
  onConfirm: (mappings: PriceMapping[]) => void;
  onCancel: () => void;
}

export default function PriceMappingVerification({
  interpretation,
  onConfirm,
  onCancel,
}: PriceMappingVerificationProps) {
  const [mappings, setMappings] = useState<PriceMapping[]>(interpretation.mappings);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Get unique categories found in the file using Array.from(new Set())
  const uniqueCategories = Array.from(
    new Set(mappings.map((m) => m.serviceCategory))
  );

  const toggleRowExpansion = (index: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRows(newExpanded);
  };

  const updateMapping = (
    index: number,
    field: keyof PriceMapping,
    value: any
  ) => {
    const newMappings = Array.from(mappings);
    newMappings[index] = {
      ...newMappings[index],
      [field]: value,
    };
    setMappings(newMappings);
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return 'bg-green-100 text-green-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryColor = (category: ServiceCategory) => {
    const colors: Record<ServiceCategory, string> = {
      [ServiceCategory.SLAB]: 'bg-purple-100 text-purple-800',
      [ServiceCategory.CUTTING]: 'bg-blue-100 text-blue-800',
      [ServiceCategory.POLISHING]: 'bg-indigo-100 text-indigo-800',
      [ServiceCategory.CUTOUT]: 'bg-pink-100 text-pink-800',
      [ServiceCategory.DELIVERY]: 'bg-orange-100 text-orange-800',
      [ServiceCategory.INSTALLATION]: 'bg-teal-100 text-teal-800',
    };
    return colors[category];
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black bg-opacity-30 transition-opacity"
          onClick={onCancel}
        />

        {/* Modal */}
        <div className="relative bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-zinc-200">
            <h2 className="text-xl font-semibold text-zinc-900">
              Review Price Mappings
            </h2>
            <p className="text-sm text-zinc-600 mt-1">
              AI has interpreted {interpretation.summary.totalItems} items from your
              spreadsheet. Please review and adjust the mappings below.
            </p>
          </div>

          {/* Summary Stats */}
          <div className="px-6 py-3 bg-zinc-50 border-b border-zinc-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-6">
                <div>
                  <span className="text-xs font-medium text-zinc-700">
                    Categories Found:
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {uniqueCategories.map((cat) => (
                      <span
                        key={cat}
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getCategoryColor(
                          cat
                        )}`}
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-xs font-medium text-zinc-700">
                    Avg Confidence:
                  </span>
                  <span
                    className={`ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      interpretation.summary.averageConfidence > 0.8
                        ? 'bg-green-100 text-green-800'
                        : interpretation.summary.averageConfidence > 0.5
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {(interpretation.summary.averageConfidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Warnings */}
            {interpretation.summary.warnings.length > 0 && (
              <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                <p className="text-xs font-medium text-yellow-800 mb-1">
                  ⚠️ Warnings:
                </p>
                <ul className="text-xs text-yellow-700 space-y-0.5">
                  {interpretation.summary.warnings.map((warning, idx) => (
                    <li key={idx}>• {warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Mappings Table - Scrollable */}
          <div className="flex-1 overflow-y-auto">
            <table className="min-w-full divide-y divide-zinc-200">
              <thead className="bg-zinc-100 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-700 uppercase">
                    Original Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-700 uppercase">
                    Original Rate
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-700 uppercase">
                    Mapped To
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-700 uppercase">
                    Confidence
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-700 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-zinc-200">
                {mappings.map((mapping, index) => (
                  <tr
                    key={index}
                    className={`hover:bg-zinc-50 ${
                      expandedRows.has(index) ? 'bg-amber-50' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-zinc-900">
                        {mapping.originalName}
                      </div>
                      {mapping.originalCategory && (
                        <div className="text-xs text-zinc-500 mt-0.5">
                          Category: {mapping.originalCategory}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-zinc-900">
                        ${mapping.originalRate.toFixed(2)}
                      </div>
                      {mapping.originalUnit && (
                        <div className="text-xs text-zinc-500">
                          per {mapping.originalUnit}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={mapping.serviceCategory}
                        onChange={(e) =>
                          updateMapping(
                            index,
                            'serviceCategory',
                            e.target.value as ServiceCategory
                          )
                        }
                        className={`text-sm px-2 py-1 rounded border border-zinc-300 focus:ring-2 focus:ring-amber-500 ${getCategoryColor(
                          mapping.serviceCategory
                        )}`}
                      >
                        {Object.values(ServiceCategory).map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                      
                      {/* Show cutout type dropdown if category is CUTOUT */}
                      {mapping.serviceCategory === ServiceCategory.CUTOUT && (
                        <select
                          value={mapping.cutoutType || CutoutType.OTHER}
                          onChange={(e) =>
                            updateMapping(
                              index,
                              'cutoutType',
                              e.target.value as CutoutType
                            )
                          }
                          className="mt-1 text-xs px-2 py-1 w-full rounded border border-zinc-300 focus:ring-2 focus:ring-amber-500"
                        >
                          {Object.values(CutoutType).map((type) => (
                            <option key={type} value={type}>
                              {type.replace(/_/g, ' ')}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getConfidenceColor(
                          mapping.confidence
                        )}`}
                      >
                        {mapping.confidence}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggleRowExpansion(index)}
                        className="text-xs font-medium text-amber-600 hover:text-amber-700"
                      >
                        {expandedRows.has(index) ? 'Hide Details' : 'Show Details'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Expanded row details */}
            {Array.from(expandedRows).map((index) => {
              const mapping = mappings[index];
              return (
                <div
                  key={`expanded-${index}`}
                  className="border-t-2 border-amber-400 bg-amber-50 px-6 py-4"
                >
                  <h4 className="text-sm font-semibold text-zinc-900 mb-3">
                    Detailed Mapping for "{mapping.originalName}"
                  </h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <label className="block text-xs font-medium text-zinc-700 mb-1">
                        Unit (Australian spelling)
                      </label>
                      <input
                        type="text"
                        value={mapping.unit}
                        readOnly
                        className="w-full px-2 py-1 text-sm border border-zinc-300 rounded bg-zinc-100"
                      />
                    </div>
                    {mapping.rate20mm !== undefined && (
                      <div>
                        <label className="block text-xs font-medium text-zinc-700 mb-1">
                          Rate 20mm
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={mapping.rate20mm}
                          onChange={(e) =>
                            updateMapping(index, 'rate20mm', parseFloat(e.target.value))
                          }
                          className="w-full px-2 py-1 text-sm border border-zinc-300 rounded"
                        />
                      </div>
                    )}
                    {mapping.rate40mm !== undefined && (
                      <div>
                        <label className="block text-xs font-medium text-zinc-700 mb-1">
                          Rate 40mm
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={mapping.rate40mm}
                          onChange={(e) =>
                            updateMapping(index, 'rate40mm', parseFloat(e.target.value))
                          }
                          className="w-full px-2 py-1 text-sm border border-zinc-300 rounded"
                        />
                      </div>
                    )}
                    {mapping.notes && (
                      <div className="col-span-3">
                        <label className="block text-xs font-medium text-zinc-700 mb-1">
                          AI Notes
                        </label>
                        <p className="text-xs text-zinc-600 bg-white p-2 rounded border border-zinc-200">
                          {mapping.notes}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-zinc-200 bg-zinc-50 flex justify-between items-center">
            <p className="text-sm text-zinc-600">
              Please verify all mappings are correct before confirming
            </p>
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onConfirm(mappings)}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700"
              >
                Confirm & Save Mappings
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
