'use client';

import { getStatusColor, getStatusLabel } from '@/lib/utils';

interface Quote {
  id: number;
  quoteNumber: string;
  projectName: string | null;
  status: string;
  customer: {
    id: number;
    name: string;
    company: string | null;
  } | null;
}

interface QuoteHeaderProps {
  quote: Quote;
  onBack: () => void;
  saving: boolean;
  hasUnsavedChanges?: boolean;
}

export default function QuoteHeader({ quote, onBack, saving, hasUnsavedChanges }: QuoteHeaderProps) {
  return (
    <div className="card p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Left: Quote Info */}
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">
              Quote Builder: {quote.quoteNumber}
            </h1>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                quote.status
              )}`}
            >
              {getStatusLabel(quote.status)}
            </span>
            {saving && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
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
                Saving...
              </span>
            )}
            {hasUnsavedChanges && !saving && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Unsaved changes
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-4 text-sm text-gray-600">
            {quote.projectName && <span>{quote.projectName}</span>}
            {quote.customer && (
              <span className="flex items-center gap-1">
                <svg
                  className="h-4 w-4 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                {quote.customer.name}
                {quote.customer.company && ` (${quote.customer.company})`}
              </span>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="btn-secondary text-sm">
            <svg
              className="h-4 w-4 mr-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Back to Quote
          </button>
        </div>
      </div>
    </div>
  );
}
