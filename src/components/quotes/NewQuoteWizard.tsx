'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import TemplateSelector from './TemplateSelector';
import MaterialAssignment from './MaterialAssignment';
import DrawingUploadStep from './DrawingUploadStep';
import { ManualQuoteWizard } from './ManualQuoteWizard';

type WizardStep = 'choose' | 'drawing' | 'template' | 'manual' | 'material-assignment' | 'creating';

interface RecentQuote {
  id: number;
  quote_number: string;
}

interface TemplateSummary {
  id: string;
  name: string;
  description: string | null;
  category: string;
  pieceCount: number;
  estimatedAreaSqm: number;
}

interface NewQuoteWizardProps {
  onClose?: () => void;
  customerId?: number;
}

export default function NewQuoteWizard({ onClose, customerId }: NewQuoteWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>('choose');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateSummary | null>(null);
  const [recentQuotes, setRecentQuotes] = useState<RecentQuote[]>([]);
  const [isCreatingManual, setIsCreatingManual] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch recent quotes for quick-access links
  useEffect(() => {
    async function fetchRecent() {
      try {
        const res = await fetch('/api/quotes');
        if (res.ok) {
          const data = await res.json();
          const recent = (data as RecentQuote[]).slice(0, 3);
          setRecentQuotes(recent);
        }
      } catch {
        // Non-critical, ignore
      }
    }
    fetchRecent();
  }, []);

  // Manual: create blank draft and redirect (same as existing flow)
  const handleManual = async () => {
    setIsCreatingManual(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (customerId) params.set('customerId', String(customerId));
      const url = `/api/quotes/create-draft${params.toString() ? `?${params}` : ''}`;
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) {
        throw new Error('Failed to create draft quote');
      }
      const { quoteId } = await res.json();
      router.push(`/quotes/${quoteId}?mode=edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create quote');
      setIsCreatingManual(false);
    }
  };

  // Template selected — move to material assignment
  const handleTemplateSelect = (template: TemplateSummary) => {
    setSelectedTemplate(template);
    setStep('material-assignment');
  };

  // Quote created from template apply — redirect
  const handleQuoteCreated = (quoteId: number) => {
    router.push(`/quotes/${quoteId}?mode=edit`);
  };

  // Drawing analysis complete — redirect
  const handleDrawingComplete = (quoteId: number) => {
    router.push(`/quotes/${quoteId}?mode=edit`);
  };

  const handleBack = () => {
    if (step === 'material-assignment') {
      setStep('template');
      setSelectedTemplate(null);
    } else {
      setStep('choose');
    }
  };

  // Step: Choose how to start
  if (step === 'choose') {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Start a New Quote</h1>
          <p className="mt-2 text-gray-600">How would you like to begin?</p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Option A: From Drawing */}
          <button
            onClick={() => setStep('drawing')}
            className="card p-6 text-left hover:border-amber-300 hover:shadow-md transition-all group"
          >
            <div className="text-3xl mb-3">
              <svg className="h-10 w-10 text-gray-400 group-hover:text-amber-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">From Drawing</h3>
            <p className="text-sm text-gray-600 mb-4">
              Upload a PDF drawing and let AI extract the pieces for you
            </p>
            <span className="text-sm font-medium text-amber-600 group-hover:text-amber-700">
              Select &rarr;
            </span>
          </button>

          {/* Option B: From Template */}
          <button
            onClick={() => setStep('template')}
            className="card p-6 text-left hover:border-amber-300 hover:shadow-md transition-all group"
          >
            <div className="text-3xl mb-3">
              <svg className="h-10 w-10 text-gray-400 group-hover:text-amber-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">From Template</h3>
            <p className="text-sm text-gray-600 mb-4">
              Start from a pre-built room configuration with standard dimensions
            </p>
            <span className="text-sm font-medium text-amber-600 group-hover:text-amber-700">
              Select &rarr;
            </span>
          </button>

          {/* Option C: Manual */}
          <button
            onClick={() => setStep('manual')}
            className="card p-6 text-left hover:border-amber-300 hover:shadow-md transition-all group"
          >
            <div className="text-3xl mb-3">
              <svg className="h-10 w-10 text-gray-400 group-hover:text-amber-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Manual</h3>
            <p className="text-sm text-gray-600 mb-4">
              Set up rooms and pieces with smart defaults
            </p>
            <span className="text-sm font-medium text-amber-600 group-hover:text-amber-700">
              Select &rarr;
            </span>
          </button>
        </div>

        {/* Recent quotes */}
        {recentQuotes.length > 0 && (
          <div className="border-t pt-6">
            <p className="text-sm text-gray-500 mb-2">Recent quotes:</p>
            <div className="flex gap-3">
              {recentQuotes.map((q) => (
                <Link
                  key={q.id}
                  href={`/quotes/${q.id}`}
                  className="text-sm text-amber-600 hover:text-amber-700 font-medium"
                >
                  {q.quote_number}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Step: Drawing upload
  if (step === 'drawing') {
    return (
      <DrawingUploadStep
        onBack={() => setStep('choose')}
        onQuoteCreated={handleDrawingComplete}
        customerId={customerId}
      />
    );
  }

  // Step: Manual wizard (rooms, pieces, dimensions)
  if (step === 'manual') {
    return (
      <ManualQuoteWizard
        onBack={() => setStep('choose')}
        onComplete={async (data) => {
          // Create a draft quote then redirect to edit mode
          setError(null);
          try {
            const params = new URLSearchParams();
            if (customerId) params.set('customerId', String(customerId));
            const url = `/api/quotes/create-draft${params.toString() ? `?${params}` : ''}`;
            const res = await fetch(url, { method: 'POST' });
            if (!res.ok) {
              throw new Error('Failed to create draft quote');
            }
            const { quoteId } = await res.json();
            router.push(`/quotes/${quoteId}?mode=edit`);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create quote');
          }
        }}
      />
    );
  }

  // Step: Template selection
  if (step === 'template') {
    return (
      <TemplateSelector
        onBack={() => setStep('choose')}
        onSelect={handleTemplateSelect}
      />
    );
  }

  // Step: Material assignment (after template selection)
  if (step === 'material-assignment' && selectedTemplate) {
    return (
      <MaterialAssignment
        template={selectedTemplate}
        onBack={handleBack}
        onQuoteCreated={handleQuoteCreated}
        customerId={customerId}
      />
    );
  }

  return null;
}
