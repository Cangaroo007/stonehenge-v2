'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { formatCurrency } from '@/lib/utils';
import type { QuoteCustomCharge, QuoteDiscount, DiscountType, DiscountAppliesTo } from '@/lib/types/quote-adjustments';

interface QuoteAdjustmentsProps {
  quoteId: number;
  customCharges: QuoteCustomCharge[];
  discount: QuoteDiscount | null;
  baseSubtotal: number;
  mode: 'view' | 'edit';
  onChanged: () => void;
  /** When true, renders without card wrapper (for embedding inside a parent card) */
  embedded?: boolean;
}

export default function QuoteAdjustments({
  quoteId,
  customCharges,
  discount,
  baseSubtotal,
  mode,
  onChanged,
  embedded = false,
}: QuoteAdjustmentsProps) {
  // ── Custom Charges State ─────────────────────────────────────────────────
  const [showAddForm, setShowAddForm] = useState(false);
  const [descriptionInput, setDescriptionInput] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [editingChargeId, setEditingChargeId] = useState<number | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Discount State ───────────────────────────────────────────────────────
  const [discountType, setDiscountType] = useState<DiscountType | null>(discount?.type ?? null);
  const [discountValueInput, setDiscountValueInput] = useState<string>(
    discount?.value != null ? String(discount.value) : ''
  );
  const [discountAppliesTo, setDiscountAppliesTo] = useState<DiscountAppliesTo>(
    discount?.appliesTo ?? 'ALL'
  );
  const discountDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Sync discount state from props when they change
  useEffect(() => {
    setDiscountType(discount?.type ?? null);
    setDiscountValueInput(discount?.value != null ? String(discount.value) : '');
    setDiscountAppliesTo(discount?.appliesTo ?? 'ALL');
  }, [discount]);

  // ── Autocomplete ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (descriptionInput.length < 2) {
      setSuggestions([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/custom-charge-suggestions?q=${encodeURIComponent(descriptionInput)}`);
        const data = await res.json();
        setSuggestions(data.suggestions || []);
        setShowSuggestions(true);
      } catch {
        setSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [descriptionInput]);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Custom Charge CRUD ───────────────────────────────────────────────────
  const handleAddCharge = useCallback(async () => {
    const desc = descriptionInput.trim();
    const amt = parseFloat(amountInput);
    if (!desc || isNaN(amt) || amt <= 0) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/custom-charges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc, amount: amt }),
      });
      if (res.ok) {
        setDescriptionInput('');
        setAmountInput('');
        setShowAddForm(false);
        onChanged();
      }
    } catch {
      // Error silently handled — user sees no change
    } finally {
      setSaving(false);
    }
  }, [quoteId, descriptionInput, amountInput, onChanged]);

  const handleDeleteCharge = useCallback(async (chargeId: number) => {
    try {
      const res = await fetch(`/api/quotes/${quoteId}/custom-charges/${chargeId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onChanged();
      }
    } catch {
      // Error silently handled
    }
  }, [quoteId, onChanged]);

  const handleStartEdit = useCallback((charge: QuoteCustomCharge) => {
    setEditingChargeId(charge.id);
    setEditDescription(charge.description);
    setEditAmount(String(charge.amount));
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingChargeId) return;
    const desc = editDescription.trim();
    const amt = parseFloat(editAmount);
    if (!desc || isNaN(amt) || amt <= 0) return;

    try {
      const res = await fetch(`/api/quotes/${quoteId}/custom-charges/${editingChargeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc, amount: amt }),
      });
      if (res.ok) {
        setEditingChargeId(null);
        onChanged();
      }
    } catch {
      // Error silently handled
    }
  }, [quoteId, editingChargeId, editDescription, editAmount, onChanged]);

  const handleCancelEdit = useCallback(() => {
    setEditingChargeId(null);
  }, []);

  // ── Discount Save ────────────────────────────────────────────────────────
  const saveDiscount = useCallback(async (
    type: DiscountType | null,
    value: string,
    appliesTo: DiscountAppliesTo
  ) => {
    const numValue = parseFloat(value);
    try {
      await fetch(`/api/quotes/${quoteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discount_type: type,
          discount_value: type ? (isNaN(numValue) ? 0 : numValue) : null,
          discount_applies_to: type ? appliesTo : null,
        }),
      });
      onChanged();
    } catch {
      // Error silently handled
    }
  }, [quoteId, onChanged]);

  const handleDiscountTypeChange = useCallback((type: DiscountType) => {
    setDiscountType(type);
    saveDiscount(type, discountValueInput, discountAppliesTo);
  }, [discountValueInput, discountAppliesTo, saveDiscount]);

  const handleDiscountValueChange = useCallback((value: string) => {
    setDiscountValueInput(value);
    // Debounced save
    if (discountDebounceRef.current) clearTimeout(discountDebounceRef.current);
    discountDebounceRef.current = setTimeout(() => {
      if (discountType) {
        saveDiscount(discountType, value, discountAppliesTo);
      }
    }, 500);
  }, [discountType, discountAppliesTo, saveDiscount]);

  const handleDiscountAppliesToChange = useCallback((appliesTo: DiscountAppliesTo) => {
    setDiscountAppliesTo(appliesTo);
    if (discountType) {
      saveDiscount(discountType, discountValueInput, appliesTo);
    }
  }, [discountType, discountValueInput, saveDiscount]);

  const handleRemoveDiscount = useCallback(() => {
    setDiscountType(null);
    setDiscountValueInput('');
    setDiscountAppliesTo('ALL');
    saveDiscount(null, '', 'ALL');
  }, [saveDiscount]);

  // ── Computed Values ──────────────────────────────────────────────────────
  const customChargesTotal = customCharges.reduce((sum, c) => sum + c.amount, 0);

  const calculatedDiscountAmount = (() => {
    if (!discountType) return 0;
    const val = parseFloat(discountValueInput) || 0;
    if (discountAppliesTo === 'ALL') {
      const preDiscount = baseSubtotal + customChargesTotal;
      return discountType === 'PERCENTAGE' ? preDiscount * (val / 100) : val;
    } else {
      return discountType === 'PERCENTAGE' ? baseSubtotal * (val / 100) : val;
    }
  })();

  const discountBase = discountAppliesTo === 'ALL'
    ? baseSubtotal + customChargesTotal
    : baseSubtotal;

  // ── Suggestion Selection ─────────────────────────────────────────────────
  const selectSuggestion = useCallback((suggestion: string) => {
    setDescriptionInput(suggestion);
    setShowSuggestions(false);
    // Focus amount field after selecting suggestion
    setTimeout(() => {
      const amountField = document.getElementById('charge-amount-input');
      if (amountField) amountField.focus();
    }, 50);
  }, []);

  const handleDescriptionKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === 'Tab' || e.key === 'Enter') && showSuggestions && suggestions.length > 0) {
      e.preventDefault();
      selectSuggestion(suggestions[0]);
    }
  }, [showSuggestions, suggestions, selectSuggestion]);

  const handleAddKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddCharge();
    }
  }, [handleAddCharge]);

  // ── View Mode ────────────────────────────────────────────────────────────
  if (mode === 'view') {
    const hasCharges = customCharges.length > 0;
    const hasDiscount = discount && discount.type;

    if (!hasCharges && !hasDiscount) return null;

    const wrapperClass = embedded
      ? 'mt-3 border-t border-gray-200'
      : 'card border border-gray-200 rounded-lg overflow-hidden';

    return (
      <div className={wrapperClass}>
        {hasCharges && (
          <div className="p-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Additional Costs</h4>
            <div className="space-y-1.5">
              {customCharges.map(charge => (
                <div key={charge.id} className="flex justify-between text-sm">
                  <span className="text-gray-600">{charge.description}</span>
                  <span className="font-medium tabular-nums">{formatCurrency(charge.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm font-medium pt-1.5 border-t border-gray-100">
                <span className="text-gray-700">Additional costs total:</span>
                <span className="tabular-nums">{formatCurrency(customChargesTotal)}</span>
              </div>
            </div>
          </div>
        )}
        {hasDiscount && (
          <div className={`p-4 ${hasCharges ? 'border-t border-gray-200' : ''}`}>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Quote Discount</h4>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">
                {discount!.type === 'PERCENTAGE' ? `${discount!.value}%` : formatCurrency(discount!.value)} discount
                ({discount!.appliesTo === 'ALL' ? 'entire quote' : 'fabrication only'}):
              </span>
              <span className="font-medium tabular-nums text-red-600">
                -{formatCurrency(calculatedDiscountAmount)}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Edit Mode ────────────────────────────────────────────────────────────
  const editWrapperClass = embedded
    ? 'mt-3 border-t border-gray-200'
    : 'card border border-gray-200 rounded-lg overflow-hidden';

  return (
    <div className={editWrapperClass}>
      {/* Additional Costs Section */}
      <div className="p-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Additional Costs</h4>

        {/* Existing charges */}
        {customCharges.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {customCharges.map(charge => (
              <div key={charge.id}>
                {editingChargeId === charge.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editDescription}
                      onChange={e => setEditDescription(e.target.value)}
                      className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <div className="flex items-center">
                      <span className="text-sm text-gray-500 mr-1">$</span>
                      <input
                        type="number"
                        value={editAmount}
                        onChange={e => setEditAmount(e.target.value)}
                        className="w-24 text-sm border border-gray-300 rounded px-2 py-1 text-right focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        step="0.01"
                        min="0.01"
                      />
                    </div>
                    <button
                      onClick={handleSaveEdit}
                      className="text-green-600 hover:text-green-700 p-1"
                      title="Save"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="text-gray-400 hover:text-gray-600 p-1"
                      title="Cancel"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between group">
                    <span
                      className="text-sm text-gray-600 cursor-pointer hover:text-gray-900"
                      onClick={() => handleStartEdit(charge)}
                    >
                      {charge.description}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-sm font-medium tabular-nums cursor-pointer hover:text-gray-900"
                        onClick={() => handleStartEdit(charge)}
                      >
                        {formatCurrency(charge.amount)}
                      </span>
                      <button
                        onClick={() => handleDeleteCharge(charge.id)}
                        className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                        title="Remove"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add Cost Form */}
        {showAddForm ? (
          <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2">
            <div className="relative" ref={suggestionsRef}>
              <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
              <input
                ref={inputRef}
                type="text"
                value={descriptionInput}
                onChange={e => {
                  setDescriptionInput(e.target.value);
                  setShowSuggestions(true);
                }}
                onKeyDown={handleDescriptionKeyDown}
                onFocus={() => {
                  if (suggestions.length > 0) setShowSuggestions(true);
                }}
                placeholder="e.g. Crane hire, Sealing treatment"
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      className="w-full text-left text-sm px-3 py-1.5 hover:bg-blue-50 text-gray-700"
                      onClick={() => selectSuggestion(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Amount</label>
              <div className="flex items-center">
                <span className="text-sm text-gray-500 mr-1">$</span>
                <input
                  id="charge-amount-input"
                  type="number"
                  value={amountInput}
                  onChange={e => setAmountInput(e.target.value)}
                  onKeyDown={handleAddKeyDown}
                  placeholder="0.00"
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 text-right focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  step="0.01"
                  min="0.01"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleAddCharge}
                disabled={saving || !descriptionInput.trim() || !amountInput || parseFloat(amountInput) <= 0}
                className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1 rounded"
              >
                {saving ? 'Adding...' : 'Add'}
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setDescriptionInput('');
                  setAmountInput('');
                  setSuggestions([]);
                }}
                className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Cost
          </button>
        )}
      </div>

      {/* Quote Discount Section */}
      <div className="p-4 border-t border-gray-200">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Quote Discount</h4>

        {discountType ? (
          <div className="space-y-3">
            {/* Type Toggle */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Type</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="discountType"
                    checked={discountType === 'PERCENTAGE'}
                    onChange={() => handleDiscountTypeChange('PERCENTAGE')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  Percentage
                </label>
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="discountType"
                    checked={discountType === 'ABSOLUTE'}
                    onChange={() => handleDiscountTypeChange('ABSOLUTE')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  Absolute
                </label>
              </div>
            </div>

            {/* Value Input */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Value</label>
              <div className="flex items-center gap-1">
                {discountType === 'ABSOLUTE' && (
                  <span className="text-sm text-gray-500">$</span>
                )}
                <input
                  type="number"
                  value={discountValueInput}
                  onChange={e => handleDiscountValueChange(e.target.value)}
                  className="w-32 text-sm border border-gray-300 rounded px-2 py-1.5 text-right focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  step={discountType === 'PERCENTAGE' ? '0.1' : '0.01'}
                  min="0"
                  max={discountType === 'PERCENTAGE' ? '100' : undefined}
                />
                {discountType === 'PERCENTAGE' && (
                  <span className="text-sm text-gray-500">%</span>
                )}
              </div>
            </div>

            {/* Applies To Toggle */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Applies to</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="discountAppliesTo"
                    checked={discountAppliesTo === 'ALL'}
                    onChange={() => handleDiscountAppliesToChange('ALL')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  Entire quote
                </label>
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="discountAppliesTo"
                    checked={discountAppliesTo === 'FABRICATION_ONLY'}
                    onChange={() => handleDiscountAppliesToChange('FABRICATION_ONLY')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  Fabrication only
                </label>
              </div>
            </div>

            {/* Discount Preview */}
            {calculatedDiscountAmount > 0 && (
              <div className="bg-red-50 border border-red-100 rounded px-3 py-2 text-sm">
                <span className="text-red-700 font-medium">
                  Discount: -{formatCurrency(calculatedDiscountAmount)}
                </span>
                <span className="text-red-600 ml-1">
                  off {formatCurrency(discountBase)}
                </span>
              </div>
            )}

            {/* Remove Discount */}
            <button
              onClick={handleRemoveDiscount}
              className="text-sm text-red-600 hover:text-red-700 font-medium"
            >
              Remove Discount
            </button>
          </div>
        ) : (
          <button
            onClick={() => handleDiscountTypeChange('PERCENTAGE')}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Discount
          </button>
        )}
      </div>
    </div>
  );
}
