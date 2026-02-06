'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { DrawingThumbnail } from '@/components/drawings/DrawingThumbnail';
import { DrawingViewerModal } from '@/components/drawings/DrawingViewerModal';

interface Drawing {
  id: string;
  filename: string;
  uploadedAt: string;
  quote: {
    id: number;
    quoteNumber: string;
    status: string;
  };
}

interface CustomerDrawingsProps {
  customerId: number;
}

export function CustomerDrawings({ customerId }: CustomerDrawingsProps) {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDrawing, setSelectedDrawing] = useState<Drawing | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    async function fetchDrawings() {
      try {
        const response = await fetch(`/api/customers/${customerId}/drawings`);
        if (response.ok) {
          const data = await response.json();
          setDrawings(data);
        }
      } catch (error) {
        console.error('Error fetching drawings:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchDrawings();
  }, [customerId]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="h-32 bg-gray-200 rounded-lg mb-2" />
            <div className="h-4 bg-gray-200 rounded w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  if (drawings.length === 0) {
    return (
      <div className="text-center py-12">
        <svg className="h-16 w-16 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <h3 className="text-lg font-medium text-gray-900 mb-1">No drawings yet</h3>
        <p className="text-gray-500">Drawings will appear here when imported during quoting.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {drawings.map((drawing) => (
          <div
            key={drawing.id}
            className="group bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
          >
            <DrawingThumbnail
              drawingId={drawing.id}
              filename={drawing.filename}
              onClick={() => {
                setSelectedDrawing(drawing);
                setViewerOpen(true);
              }}
              className="h-32 w-full bg-gray-50"
            />

            <div className="p-3">
              <p className="text-sm font-medium text-gray-900 truncate" title={drawing.filename}>
                {drawing.filename}
              </p>
              <div className="flex items-center justify-between mt-1">
                <Link
                  href={`/quotes/${drawing.quote.id}/builder`}
                  className="text-xs text-primary-600 hover:text-primary-700"
                >
                  Quote #{drawing.quote.quoteNumber}
                </Link>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  drawing.quote.status === 'ACCEPTED' ? 'bg-green-100 text-green-700' :
                  drawing.quote.status === 'SENT' ? 'bg-blue-100 text-blue-700' :
                  drawing.quote.status === 'DRAFT' ? 'bg-gray-100 text-gray-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {drawing.quote.status}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(drawing.uploadedAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        ))}
      </div>

      {selectedDrawing && (
        <DrawingViewerModal
          drawingId={selectedDrawing.id}
          filename={selectedDrawing.filename}
          isOpen={viewerOpen}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </>
  );
}
