'use client';

import { useState, useRef, useEffect } from 'react';
import type { CalculationResult } from '@/lib/types/pricing';

interface QuoteActionsProps {
  quoteId: string;
  quoteStatus: string;
  calculation: CalculationResult | null;
  onSave: () => Promise<void>;
  onStatusChange?: (newStatus: string, options?: { declinedReason?: string }) => Promise<void>;
  onDuplicateQuote?: () => Promise<void>;
  onPreviewPdf?: () => void;
  saving?: boolean;
}

export default function QuoteActions({
  quoteId,
  quoteStatus,
  calculation,
  onSave,
  onStatusChange,
  onDuplicateQuote,
  onPreviewPdf,
  saving = false,
}: QuoteActionsProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle PDF preview — use readiness checker if available, else direct open
  const handlePreviewPdf = async () => {
    if (onPreviewPdf) {
      onPreviewPdf();
      return;
    }
    setIsPreviewLoading(true);
    try {
      window.open(`/api/quotes/${quoteId}/pdf`, '_blank');
    } catch (error) {
      console.error('Error opening PDF:', error);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  // Handle send to customer (placeholder)
  const handleSendToCustomer = async () => {
    setIsSending(true);
    try {
      // Placeholder - future email integration
      alert('Send to customer feature coming soon! This will email the quote PDF to the customer.');
    } finally {
      setIsSending(false);
    }
  };

  // Handle duplicate quote
  const handleDuplicateQuote = async () => {
    if (onDuplicateQuote) {
      await onDuplicateQuote();
    } else {
      try {
        const response = await fetch(`/api/quotes/${quoteId}/duplicate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        if (!response.ok) {
          throw new Error('Failed to duplicate quote');
        }

        const newQuote = await response.json();
        window.location.href = newQuote.redirectUrl || `/quotes/${newQuote.id}?mode=edit`;
      } catch (error) {
        console.error('Error duplicating quote:', error);
        alert('Failed to duplicate quote. Please try again.');
      }
    }
    setIsMenuOpen(false);
  };

  // Handle delete quote
  const handleDeleteQuote = async () => {
    if (!confirm('Are you sure you want to delete this quote? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/quotes/${quoteId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete quote');
      }

      // Navigate back to quotes list
      window.location.href = '/quotes';
    } catch (error) {
      console.error('Error deleting quote:', error);
      alert('Failed to delete quote. Please try again.');
    }
    setIsMenuOpen(false);
  };

  // Handle status change to accepted
  const handleMarkAccepted = async () => {
    if (onStatusChange) {
      await onStatusChange('accepted');
    }
    setIsMenuOpen(false);
  };

  // Handle status change to declined
  const handleMarkDeclined = async () => {
    if (onStatusChange) {
      await onStatusChange('declined');
    }
    setIsMenuOpen(false);
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Save Draft Button */}
      <button
        onClick={onSave}
        disabled={saving}
        className="btn-secondary flex items-center gap-2"
      >
        {saving ? (
          <>
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Saving...
          </>
        ) : (
          <>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            Save Draft
          </>
        )}
      </button>

      {/* Preview PDF Button */}
      <button
        onClick={handlePreviewPdf}
        disabled={isPreviewLoading}
        className="btn-secondary flex items-center gap-2"
      >
        {isPreviewLoading ? (
          <>
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Loading...
          </>
        ) : (
          <>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Preview PDF
          </>
        )}
      </button>

      {/* Send to Customer Button */}
      <button
        onClick={handleSendToCustomer}
        disabled={isSending || quoteStatus === 'draft'}
        className="btn-primary flex items-center gap-2"
        title={quoteStatus === 'draft' ? 'Save and preview before sending' : ''}
      >
        {isSending ? (
          <>
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Sending...
          </>
        ) : (
          <>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Send to Customer
          </>
        )}
      </button>

      {/* More Actions Menu */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="btn-secondary p-2"
          aria-label="More actions"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
          </svg>
        </button>

        {isMenuOpen && (
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
            {/* Status Actions */}
            {quoteStatus === 'sent' && (
              <>
                <button
                  onClick={handleMarkAccepted}
                  className="w-full text-left px-4 py-2 text-sm text-green-700 hover:bg-green-50 flex items-center gap-2"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Mark Accepted
                </button>
                <button
                  onClick={handleMarkDeclined}
                  className="w-full text-left px-4 py-2 text-sm text-red-700 hover:bg-red-50 flex items-center gap-2"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Mark Declined
                </button>
                <div className="border-t border-gray-200 my-1"></div>
              </>
            )}

            {/* Duplicate Quote */}
            <button
              onClick={handleDuplicateQuote}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Duplicate Quote
            </button>

            {/* Delete Quote */}
            <button
              onClick={handleDeleteQuote}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete Quote
            </button>
          </div>
        )}
      </div>

      {/* Calculation Summary Badge */}
      {calculation && (
        <div className="ml-auto text-right hidden sm:block">
          <p className="text-xs text-gray-500">Calculated Total</p>
          <p className="text-lg font-bold text-primary-600">
            {new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(
              calculation.total * 1.1 // Include GST
            )}
          </p>
        </div>
      )}
    </div>
  );
}
