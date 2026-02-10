'use client';

import { useState } from 'react';

interface ManufacturingExportButtonProps {
  quoteId: number;
  quoteNumber: string;
}

/**
 * Client-side button that downloads the manufacturing export JSON
 * for a locked/accepted quote.
 */
export default function ManufacturingExportButton({
  quoteId,
  quoteNumber,
}: ManufacturingExportButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/quotes/${quoteId}/manufacturing-export`
      );

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || 'Failed to generate export');
      }

      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `manufacturing-${quoteNumber}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to generate export';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleExport}
        disabled={isLoading}
        className="btn-secondary inline-flex items-center gap-1.5"
        title="Download manufacturing instructions as JSON"
      >
        {isLoading ? (
          <>
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Exporting…
          </>
        ) : (
          <>
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Manufacturing JSON
          </>
        )}
      </button>
      {error && (
        <div className="absolute top-full right-0 mt-1 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 whitespace-nowrap z-10">
          {error}
        </div>
      )}
    </div>
  );
}
