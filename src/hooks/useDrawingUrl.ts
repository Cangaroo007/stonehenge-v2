'use client';

import { useState, useEffect } from 'react';

interface UseDrawingUrlResult {
  url: string | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Hook to fetch a presigned URL for viewing a drawing
 * @param drawingId - The ID of the drawing to fetch URL for
 */
export function useDrawingUrl(drawingId: string): UseDrawingUrlResult {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refetchCounter, setRefetchCounter] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function fetchUrl() {
      if (!drawingId) {
        setLoading(false);
        setError('No drawing ID provided');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/drawings/${drawingId}/url`);

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to fetch drawing URL');
        }

        const data = await response.json();

        if (mounted) {
          if (data.placeholder) {
            // R2 not configured yet - show placeholder state
            setUrl(null);
            setError('Drawing storage not configured');
          } else {
            setUrl(data.url);
          }
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to fetch drawing URL');
          setUrl(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchUrl();

    return () => {
      mounted = false;
    };
  }, [drawingId, refetchCounter]);

  const refetch = () => {
    setRefetchCounter((c) => c + 1);
  };

  return { url, loading, error, refetch };
}
