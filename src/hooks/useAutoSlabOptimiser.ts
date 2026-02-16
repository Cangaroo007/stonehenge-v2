'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ── Interfaces ──────────────────────────────────────────────────────────────

interface PieceFingerprint {
  id: number;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  materialId: number | null;
  edgeTop: string | null;
  edgeBottom: string | null;
  edgeLeft: string | null;
  edgeRight: string | null;
}

interface UseAutoSlabOptimiserProps {
  quoteId: string;
  pieces: PieceFingerprint[];
  enabled: boolean;
  getKerfWidth: () => number;
}

interface UseAutoSlabOptimiserResult {
  /** Increments each time an optimisation completes, for triggering refetches */
  optimisationRefreshKey: number;
  /** True while optimisation is in-flight */
  isOptimising: boolean;
  /** Non-null when the last optimisation attempt failed */
  optimiserError: string | null;
  /** Manually trigger an optimisation (e.g. after machine override change) */
  triggerOptimise: () => void;
}

// ── Fingerprint helper ──────────────────────────────────────────────────────

/**
 * Build a stable string fingerprint from the piece data that affects slab
 * layout. When this fingerprint changes, the optimiser needs to re-run.
 */
function buildFingerprint(pieces: PieceFingerprint[], kerfWidth: number): string {
  const sorted = [...pieces].sort((a, b) => a.id - b.id);
  const pieceParts = sorted.map(
    (p) =>
      `${p.id}:${p.lengthMm}x${p.widthMm}x${p.thicknessMm}:m${p.materialId}:e${p.edgeTop}-${p.edgeBottom}-${p.edgeLeft}-${p.edgeRight}`
  );
  return `k${kerfWidth}|${pieceParts.join('|')}`;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useAutoSlabOptimiser({
  quoteId,
  pieces,
  enabled,
  getKerfWidth,
}: UseAutoSlabOptimiserProps): UseAutoSlabOptimiserResult {
  const [optimisationRefreshKey, setOptimisationRefreshKey] = useState(0);
  const [isOptimising, setIsOptimising] = useState(false);
  const [optimiserError, setOptimiserError] = useState<string | null>(null);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const pendingRef = useRef(false);
  const isOptimiseInFlightRef = useRef(false);
  const lastFingerprintRef = useRef<string>('');
  const mountedRef = useRef(true);

  // Track mounted state to avoid setState on unmounted component
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const runOptimiser = useCallback(async () => {
    if (!quoteId || pieces.length === 0) return;

    isOptimiseInFlightRef.current = true;
    if (mountedRef.current) setIsOptimising(true);

    try {
      // Fetch existing optimisation for slab dimension preferences
      const getRes = await fetch(`/api/quotes/${quoteId}/optimize`);
      let slabWidth = 3200;
      let slabHeight = 1600;

      if (getRes.ok) {
        const saved = await getRes.json();
        if (saved && saved.slabWidth) {
          slabWidth = saved.slabWidth;
          slabHeight = saved.slabHeight;
        }
      } else if (getRes.status !== 404) {
        console.warn(`[SlabOptimiser] Failed to fetch existing optimisation (${getRes.status}), using defaults`);
      }

      // Run the optimisation
      const postRes = await fetch(`/api/quotes/${quoteId}/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slabWidth,
          slabHeight,
          kerfWidth: getKerfWidth(),
          allowRotation: true,
        }),
      });

      if (!postRes.ok) {
        const errorText = await postRes.text().catch(() => 'Unknown error');
        console.error(`[SlabOptimiser] API error ${postRes.status}:`, errorText);
        if (mountedRef.current) {
          setOptimiserError(`Optimisation failed (${postRes.status})`);
        }
        return;
      }

      if (mountedRef.current) {
        setOptimiserError(null);
        setOptimisationRefreshKey((n) => n + 1);
      }
    } catch (err) {
      console.error('[SlabOptimiser] Failed to run optimisation:', err);
      if (mountedRef.current) {
        setOptimiserError('Optimisation failed — network error');
      }
    } finally {
      isOptimiseInFlightRef.current = false;
      if (mountedRef.current) setIsOptimising(false);

      // If a change came in while we were optimising, re-run
      if (pendingRef.current) {
        pendingRef.current = false;
        runOptimiser();
      }
    }
  }, [quoteId, pieces.length, getKerfWidth]);

  // Debounced auto-trigger when piece data or kerf changes
  useEffect(() => {
    if (!enabled || pieces.length === 0) return;

    const kerfWidth = getKerfWidth();
    const fingerprint = buildFingerprint(pieces, kerfWidth);

    // Skip if nothing has changed
    if (fingerprint === lastFingerprintRef.current) return;
    lastFingerprintRef.current = fingerprint;

    // If an optimisation is already in-flight, queue a re-run
    if (isOptimiseInFlightRef.current) {
      pendingRef.current = true;
      return;
    }

    // Debounce 500ms
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runOptimiser();
    }, 500);
  }, [enabled, pieces, getKerfWidth, runOptimiser]);

  // Manual trigger (for machine override changes, etc.)
  const triggerOptimise = useCallback(() => {
    // Reset fingerprint so the next effect cycle detects a change
    lastFingerprintRef.current = '';

    if (isOptimiseInFlightRef.current) {
      pendingRef.current = true;
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runOptimiser();
    }, 500);
  }, [runOptimiser]);

  return {
    optimisationRefreshKey,
    isOptimising,
    optimiserError,
    triggerOptimise,
  };
}
