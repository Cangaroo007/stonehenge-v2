'use client';

import { useState } from 'react';
import type { QuoteOption } from '@/hooks/useQuoteOptions';

interface CreateOptionDialogProps {
  existingOptions: QuoteOption[];
  onCreateOption: (name: string, description?: string, copyFrom?: number) => Promise<QuoteOption | null>;
  onClose: () => void;
}

export default function CreateOptionDialog({
  existingOptions,
  onCreateOption,
  onClose,
}: CreateOptionDialogProps) {
  // Suggest a default name like "Option B", "Option C", etc.
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const existingNames = new Set(existingOptions.map(o => o.name));
  let suggestedName = '';
  for (const letter of letters) {
    const name = `Option ${letter}`;
    if (!existingNames.has(name)) {
      suggestedName = name;
      break;
    }
  }
  if (!suggestedName) {
    suggestedName = `Option ${existingOptions.length + 1}`;
  }

  const [name, setName] = useState(suggestedName);
  const [description, setDescription] = useState('');
  const [copyFrom, setCopyFrom] = useState<number | 'blank'>('blank');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setIsCreating(true);
    try {
      await onCreateOption(
        name.trim(),
        description.trim() || undefined,
        copyFrom === 'blank' ? undefined : copyFrom
      );
      onClose();
    } catch {
      // Error is handled by the hook
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Add Quote Option
          </h3>

          {/* Name */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Option Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Budget Option"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') onClose();
              }}
            />
          </div>

          {/* Description */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Using engineered quartz instead of natural stone"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Copy from */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Starting point
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="copyFrom"
                  checked={copyFrom === 'blank'}
                  onChange={() => setCopyFrom('blank')}
                  className="text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">
                  Start blank (same as base)
                </span>
              </label>
              {existingOptions
                .filter(o => !o.isBase && o.overrides.length > 0)
                .map(option => (
                  <label key={option.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="copyFrom"
                      checked={copyFrom === option.id}
                      onChange={() => setCopyFrom(option.id)}
                      className="text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700">
                      Copy from {option.name}
                      {option.overrides.length > 0 && (
                        <span className="text-gray-400 ml-1">
                          ({option.overrides.length} override{option.overrides.length !== 1 ? 's' : ''})
                        </span>
                      )}
                    </span>
                  </label>
                ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-gray-50 rounded-b-xl flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            disabled={isCreating}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!name.trim() || isCreating}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isCreating ? 'Creating...' : 'Create Option'}
          </button>
        </div>
      </div>
    </div>
  );
}
