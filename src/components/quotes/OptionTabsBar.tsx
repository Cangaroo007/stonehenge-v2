'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import type { QuoteOption } from '@/hooks/useQuoteOptions';

interface OptionTabsBarProps {
  options: QuoteOption[];
  activeOptionId: number | null;
  onSelectOption: (optionId: number) => void;
  onAddOption: () => void;
  onDeleteOption?: (optionId: number) => void;
  isRecalculating?: boolean;
  mode: 'view' | 'edit';
}

export default function OptionTabsBar({
  options,
  activeOptionId,
  onSelectOption,
  onAddOption,
  onDeleteOption,
  isRecalculating,
  mode,
}: OptionTabsBarProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);

  if (options.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {options.map(option => {
          const isActive = option.id === activeOptionId;
          const total = option.total ? Number(option.total) : null;

          return (
            <div key={option.id} className="relative flex-shrink-0 group">
              <button
                type="button"
                onClick={() => onSelectOption(option.id)}
                className={`
                  relative px-4 py-2.5 rounded-lg border-2 transition-all text-left min-w-[140px]
                  ${isActive
                    ? 'border-primary-500 bg-primary-50 shadow-sm'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }
                `}
              >
                <div className="flex items-center gap-1.5">
                  {option.isBase && (
                    <span
                      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                        isActive ? 'bg-primary-500' : 'bg-gray-400'
                      }`}
                      title="Base option"
                    />
                  )}
                  <span className={`text-sm font-medium truncate ${
                    isActive ? 'text-primary-700' : 'text-gray-700'
                  }`}>
                    {option.name}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1">
                  {isRecalculating && isActive ? (
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                        <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
                      </svg>
                      Calculating...
                    </span>
                  ) : total !== null ? (
                    <span className={`text-xs font-medium tabular-nums ${
                      isActive ? 'text-primary-600' : 'text-gray-500'
                    }`}>
                      {formatCurrency(total)}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">No pricing</span>
                  )}
                </div>
              </button>

              {/* Delete button for non-base options in edit mode */}
              {mode === 'edit' && !option.isBase && onDeleteOption && (
                <div className="absolute -top-1.5 -right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {showDeleteConfirm === option.id ? (
                    <div className="flex items-center gap-1 bg-white border border-red-200 rounded-full shadow-sm px-2 py-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteOption(option.id);
                          setShowDeleteConfirm(null);
                        }}
                        className="text-xs text-red-600 hover:text-red-800 font-medium"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(null)}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(option.id)}
                      className="w-5 h-5 flex items-center justify-center bg-white border border-gray-300 rounded-full text-gray-400 hover:text-red-500 hover:border-red-300 shadow-sm transition-colors"
                      title={`Delete ${option.name}`}
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Add Option button - only in edit mode */}
        {mode === 'edit' && (
          <button
            type="button"
            onClick={onAddOption}
            className="flex-shrink-0 px-4 py-2.5 rounded-lg border-2 border-dashed border-gray-300 hover:border-primary-400 hover:bg-primary-50 transition-all text-sm font-medium text-gray-500 hover:text-primary-600 min-w-[120px]"
          >
            + Add Option
          </button>
        )}
      </div>

      {/* Active option description */}
      {options.find(o => o.id === activeOptionId)?.description && (
        <p className="mt-1.5 text-xs text-gray-500 px-1">
          {options.find(o => o.id === activeOptionId)?.description}
        </p>
      )}
    </div>
  );
}
