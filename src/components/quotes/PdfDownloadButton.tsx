'use client';

import { useState, useEffect, useRef } from 'react';

interface QuoteTemplate {
  id: string;
  name: string;
  format_type: string;
  is_default: boolean;
  is_active: boolean;
}

interface PdfDownloadButtonProps {
  quoteId: string;
}

export default function PdfDownloadButton({ quoteId }: PdfDownloadButtonProps) {
  const [templates, setTemplates] = useState<QuoteTemplate[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch templates on mount
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const response = await fetch('/api/quote-templates');
        if (!response.ok) return;
        const data = await response.json();
        // Only show active templates
        const active = (data as QuoteTemplate[]).filter((t) => t.is_active);
        setTemplates(active);
      } catch {
        // Silently fail — will just show simple button
      }
    };

    fetchTemplates();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDownload = (templateId?: string) => {
    setIsLoading(true);
    setIsOpen(false);
    try {
      const url = templateId
        ? `/api/quotes/${quoteId}/pdf?templateId=${templateId}`
        : `/api/quotes/${quoteId}/pdf`;
      window.open(url, '_blank');
    } catch (error) {
      console.error('Error opening PDF:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // If 0–1 templates, show simple button (identical to current behaviour)
  if (templates.length <= 1) {
    return (
      <button
        onClick={() => handleDownload(templates[0]?.id)}
        disabled={isLoading}
        className="btn-secondary flex items-center gap-2"
      >
        {isLoading ? (
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
    );
  }

  // Multiple templates — show dropdown
  const defaultTemplate = templates.find((t) => t.is_default);

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex">
        {/* Main button — downloads with default template */}
        <button
          onClick={() => handleDownload(defaultTemplate?.id)}
          disabled={isLoading}
          className="btn-secondary flex items-center gap-2 rounded-r-none border-r-0"
        >
          {isLoading ? (
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

        {/* Dropdown toggle */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="btn-secondary rounded-l-none px-2"
          aria-label="Choose template"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Template dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-1 w-56 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
          {templates.map((template) => (
            <button
              key={template.id}
              onClick={() => handleDownload(template.id)}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                {template.is_default && (
                  <span className="text-yellow-500" title="Default template">&#9733;</span>
                )}
                {template.name}
              </span>
              <span
                className={`text-xs px-1.5 py-0.5 rounded ${
                  template.format_type === 'COMPREHENSIVE'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-green-100 text-green-700'
                }`}
              >
                {template.format_type === 'COMPREHENSIVE' ? 'Full' : 'Summary'}
              </span>
            </button>
          ))}
          <div className="border-t border-gray-200 my-1"></div>
          <a
            href="/settings/quote-templates"
            className="block px-4 py-2 text-sm text-blue-600 hover:bg-blue-50"
          >
            Manage Templates
          </a>
        </div>
      )}
    </div>
  );
}
