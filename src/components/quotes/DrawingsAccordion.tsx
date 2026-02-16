'use client';

import { useState, useEffect } from 'react';
import { DrawingThumbnail } from '@/components/drawings/DrawingThumbnail';
import { formatDate } from '@/lib/utils';

interface Drawing {
  id: string;
  filename: string;
  mimeType: string;
  isPrimary: boolean;
  uploadedAt: string;
  fileSize: number;
}

interface DrawingsAccordionProps {
  quoteId: string;
  refreshKey?: number;
}

function getDrawingTypeBadge(mimeType: string): { label: string; className: string } {
  if (mimeType === 'application/pdf') {
    return { label: 'PDF', className: 'bg-red-100 text-red-700' };
  }
  if (mimeType.startsWith('image/png')) {
    return { label: 'PNG', className: 'bg-blue-100 text-blue-700' };
  }
  if (mimeType.startsWith('image/jpeg') || mimeType.startsWith('image/jpg')) {
    return { label: 'JPEG', className: 'bg-amber-100 text-amber-700' };
  }
  if (mimeType.startsWith('image/webp')) {
    return { label: 'WebP', className: 'bg-purple-100 text-purple-700' };
  }
  return { label: 'Image', className: 'bg-gray-100 text-gray-700' };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DrawingsAccordion({ quoteId, refreshKey = 0 }: DrawingsAccordionProps) {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchDrawings() {
      setLoading(true);
      try {
        const response = await fetch(`/api/quotes/${quoteId}/drawings`);
        if (response.ok) {
          const data = await response.json();
          if (!cancelled) {
            setDrawings(data);
          }
        }
      } catch {
        // Silently fail — drawings are not critical
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchDrawings();
    return () => { cancelled = true; };
  }, [quoteId, refreshKey]);

  // Don't render anything if loading or no drawings
  if (loading) {
    return (
      <div className="card overflow-hidden animate-pulse">
        <div className="flex items-center gap-2 p-4">
          <div className="h-5 w-5 bg-gray-200 rounded" />
          <div className="h-4 bg-gray-200 rounded w-40" />
        </div>
      </div>
    );
  }

  if (drawings.length === 0) {
    return null;
  }

  return (
    <div className="card overflow-hidden">
      {/* Accordion Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="font-medium text-gray-900">Drawings</span>
          <span className="text-xs font-medium text-primary-700 bg-primary-50 px-2 py-0.5 rounded-full">
            {drawings.length}
          </span>
        </div>
        <svg
          className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Accordion Content */}
      <div
        className={`transition-all duration-200 ease-in-out overflow-hidden ${
          isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-4 pb-4">
          {/* Horizontal scrollable thumbnail row */}
          <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
            {drawings.map((drawing) => {
              const badge = getDrawingTypeBadge(drawing.mimeType);

              return (
                <a
                  key={drawing.id}
                  href={`/quotes/${quoteId}/drawings/${drawing.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 group"
                >
                  <div className="w-[200px] rounded-lg border border-gray-200 overflow-hidden hover:border-primary-300 hover:shadow-md transition-all">
                    {/* Thumbnail */}
                    <div className="relative">
                      <DrawingThumbnail
                        drawingId={drawing.id}
                        filename={drawing.filename}
                        className="h-[150px] w-full"
                      />
                      {/* Open in new tab indicator */}
                      <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 rounded-full p-1.5 shadow-sm">
                        <svg className="h-3.5 w-3.5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </div>
                      {drawing.isPrimary && (
                        <div className="absolute top-2 right-2 bg-primary-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                          Primary
                        </div>
                      )}
                    </div>
                    {/* Info */}
                    <div className="p-2 space-y-1">
                      <p className="text-xs font-medium text-gray-900 truncate" title={drawing.filename}>
                        {drawing.filename}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${badge.className}`}>
                          {badge.label}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {formatFileSize(drawing.fileSize)}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400">
                        {formatDate(drawing.uploadedAt)}
                      </p>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
