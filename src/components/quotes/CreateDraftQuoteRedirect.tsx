'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface CreateDraftQuoteRedirectProps {
  customerId?: number;
}

export default function CreateDraftQuoteRedirect({ customerId }: CreateDraftQuoteRedirectProps) {
  const router = useRouter();
  const hasStartedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    async function createDraft() {
      try {
        const url = customerId
          ? `/api/quotes/create-draft?customerId=${customerId}`
          : '/api/quotes/create-draft';
        const res = await fetch(url, { method: 'POST' });
        if (!res.ok) throw new Error('Failed to create quote');
        const result = await res.json();
        router.replace(`/quotes/${result.id || result.quoteId}?mode=edit`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create quote');
      }
    }

    createDraft();
  }, [attempt, customerId, router]);

  return (
    <div className="max-w-xl mx-auto py-16">
      <div className="card p-6 text-center">
        <h1 className="text-xl font-semibold text-gray-900">Creating quote...</h1>
        <p className="mt-2 text-sm text-gray-500">
          Opening a blank quote so you can choose manual entry, templates, or drawing import inside the builder.
        </p>

        {!error ? (
          <div className="mt-6 flex justify-center">
            <div className="h-8 w-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  hasStartedRef.current = false;
                  setError(null);
                  setAttempt(prev => prev + 1);
                }}
                className="btn-primary"
              >
                Try again
              </button>
              <Link href="/quotes/new?mode=wizard" className="btn-secondary">
                Use wizard
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
