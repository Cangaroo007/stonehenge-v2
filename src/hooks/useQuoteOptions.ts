'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CalculationResult } from '@/lib/types/pricing';

// ── Types ────────────────────────────────────────────────────────────────────

export interface QuoteOptionOverride {
  id: number;
  optionId: number;
  pieceId: number;
  materialId: number | null;
  thicknessMm: number | null;
  edgeTop: string | null;
  edgeBottom: string | null;
  edgeLeft: string | null;
  edgeRight: string | null;
  cutouts: unknown | null;
  lengthMm: number | null;
  widthMm: number | null;
}

export interface QuoteOption {
  id: number;
  quoteId: number;
  name: string;
  description: string | null;
  sortOrder: number;
  isBase: boolean;
  subtotal: number | null;
  discountAmount: number | null;
  gstAmount: number | null;
  total: number | null;
  overrides: QuoteOptionOverride[];
}

interface UseQuoteOptionsProps {
  quoteId: string;
  enabled: boolean;
}

interface UseQuoteOptionsResult {
  options: QuoteOption[];
  activeOptionId: number | null;
  activeOption: QuoteOption | null;
  isLoading: boolean;
  isRecalculating: boolean;
  error: string | null;
  /** Set the active option tab */
  setActiveOptionId: (id: number | null) => void;
  /** Fetch/refresh options from the API */
  fetchOptions: () => Promise<void>;
  /** Create a new option */
  createOption: (name: string, description?: string, copyFrom?: number) => Promise<QuoteOption | null>;
  /** Update an option's name/description */
  updateOption: (optionId: number, updates: { name?: string; description?: string }) => Promise<void>;
  /** Delete a non-base option */
  deleteOption: (optionId: number) => Promise<void>;
  /** Set overrides for pieces in an option */
  setOverrides: (
    optionId: number,
    overrides: Array<{
      pieceId: number;
      materialId?: number | null;
      thicknessMm?: number | null;
      edgeTop?: string | null;
      edgeBottom?: string | null;
      edgeLeft?: string | null;
      edgeRight?: string | null;
      cutouts?: unknown | null;
      lengthMm?: number | null;
      widthMm?: number | null;
    }>
  ) => Promise<void>;
  /** Remove an override (revert piece to base) */
  removeOverride: (optionId: number, overrideId: number) => Promise<void>;
  /** Recalculate a single option's pricing */
  recalculateOption: (optionId: number) => Promise<CalculationResult | null>;
  /** Recalculate all options (after base piece changes) */
  recalculateAllOptions: () => Promise<void>;
  /** Get overrides map for a specific option: pieceId -> override */
  getOverrideMap: (optionId: number) => Map<number, QuoteOptionOverride>;
  /** Check if a piece has an override in the active option */
  pieceHasOverride: (pieceId: number) => boolean;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useQuoteOptions({
  quoteId,
  enabled,
}: UseQuoteOptionsProps): UseQuoteOptionsResult {
  const [options, setOptions] = useState<QuoteOption[]>([]);
  const [activeOptionId, setActiveOptionId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchOptions = useCallback(async () => {
    if (!quoteId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/options`);
      if (!res.ok) throw new Error('Failed to fetch options');
      const data = await res.json();
      if (mountedRef.current) {
        setOptions(data);
        // Auto-select base option if none selected
        if (data.length > 0 && activeOptionId === null) {
          const base = data.find((o: QuoteOption) => o.isBase);
          if (base) setActiveOptionId(base.id);
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to fetch options');
      }
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [quoteId, activeOptionId]);

  // Fetch options on mount if enabled
  useEffect(() => {
    if (enabled && quoteId) {
      fetchOptions();
    }
  }, [enabled, quoteId, fetchOptions]);

  const createOption = useCallback(async (
    name: string,
    description?: string,
    copyFrom?: number
  ): Promise<QuoteOption | null> => {
    try {
      setError(null);
      const res = await fetch(`/api/quotes/${quoteId}/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, copyFrom }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create option');
      }
      const newOption = await res.json();
      await fetchOptions();
      if (mountedRef.current) {
        setActiveOptionId(newOption.id);
      }
      return newOption;
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to create option');
      }
      return null;
    }
  }, [quoteId, fetchOptions]);

  const updateOption = useCallback(async (
    optionId: number,
    updates: { name?: string; description?: string }
  ) => {
    try {
      setError(null);
      const res = await fetch(`/api/quotes/${quoteId}/options/${optionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update option');
      await fetchOptions();
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to update option');
      }
    }
  }, [quoteId, fetchOptions]);

  const deleteOption = useCallback(async (optionId: number) => {
    try {
      setError(null);
      const res = await fetch(`/api/quotes/${quoteId}/options/${optionId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete option');
      }
      // If we deleted the active option, switch to base
      if (activeOptionId === optionId) {
        const base = options.find(o => o.isBase);
        setActiveOptionId(base?.id ?? null);
      }
      await fetchOptions();
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to delete option');
      }
    }
  }, [quoteId, activeOptionId, options, fetchOptions]);

  const setOverrides = useCallback(async (
    optionId: number,
    overrides: Array<Record<string, unknown>>
  ) => {
    try {
      setError(null);
      const res = await fetch(
        `/api/quotes/${quoteId}/options/${optionId}/overrides`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ overrides }),
        }
      );
      if (!res.ok) throw new Error('Failed to set overrides');
      await fetchOptions();
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to set overrides');
      }
    }
  }, [quoteId, fetchOptions]);

  const removeOverride = useCallback(async (optionId: number, overrideId: number) => {
    try {
      setError(null);
      const res = await fetch(
        `/api/quotes/${quoteId}/options/${optionId}/overrides/${overrideId}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('Failed to remove override');
      await fetchOptions();
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to remove override');
      }
    }
  }, [quoteId, fetchOptions]);

  const recalculateOption = useCallback(async (optionId: number): Promise<CalculationResult | null> => {
    try {
      setIsRecalculating(true);
      const res = await fetch(
        `/api/quotes/${quoteId}/options/${optionId}/calculate`,
        { method: 'POST' }
      );
      if (!res.ok) throw new Error('Failed to recalculate option');
      const result = await res.json();
      await fetchOptions(); // Refresh cached totals
      return result;
    } catch (err) {
      console.error('Recalculation failed:', err);
      return null;
    } finally {
      if (mountedRef.current) setIsRecalculating(false);
    }
  }, [quoteId, fetchOptions]);

  const recalculateAllOptions = useCallback(async () => {
    if (options.length === 0) return;
    setIsRecalculating(true);
    try {
      // Recalculate each option sequentially (they share the same DB pieces)
      for (const option of options) {
        await fetch(
          `/api/quotes/${quoteId}/options/${option.id}/calculate`,
          { method: 'POST' }
        );
      }
      await fetchOptions();
    } catch (err) {
      console.error('Recalculate all failed:', err);
    } finally {
      if (mountedRef.current) setIsRecalculating(false);
    }
  }, [quoteId, options, fetchOptions]);

  const getOverrideMap = useCallback((optionId: number): Map<number, QuoteOptionOverride> => {
    const option = options.find(o => o.id === optionId);
    if (!option) return new Map();
    return new Map(option.overrides.map(o => [o.pieceId, o]));
  }, [options]);

  const pieceHasOverride = useCallback((pieceId: number): boolean => {
    if (!activeOptionId) return false;
    const option = options.find(o => o.id === activeOptionId);
    if (!option || option.isBase) return false;
    return option.overrides.some(o => o.pieceId === pieceId);
  }, [activeOptionId, options]);

  const activeOption = activeOptionId
    ? options.find(o => o.id === activeOptionId) ?? null
    : null;

  return {
    options,
    activeOptionId,
    activeOption,
    isLoading,
    isRecalculating,
    error,
    setActiveOptionId,
    fetchOptions,
    createOption,
    updateOption,
    deleteOption,
    setOverrides,
    removeOverride,
    recalculateOption,
    recalculateAllOptions,
    getOverrideMap,
    pieceHasOverride,
  };
}
