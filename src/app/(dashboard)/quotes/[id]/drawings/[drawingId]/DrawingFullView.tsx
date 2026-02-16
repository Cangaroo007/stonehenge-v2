'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';

interface DrawingData {
  id: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
  isPrimary: boolean;
  notes: string | null;
  url: string;
  quote: {
    id: number;
    quoteNumber: string;
    projectName: string | null;
  };
}

interface DrawingFullViewProps {
  drawing: DrawingData;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getTypeBadge(mimeType: string): { label: string; className: string } {
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
  return { label: 'File', className: 'bg-gray-100 text-gray-700' };
}

export default function DrawingFullView({ drawing }: DrawingFullViewProps) {
  const isPdf = drawing.mimeType === 'application/pdf';
  const badge = getTypeBadge(drawing.mimeType);

  // Image zoom/pan state
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom > 1 && !isPdf) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  }, [zoom, position, isPdf]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Keyboard shortcuts for zoom
  useEffect(() => {
    if (isPdf) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') setZoom(z => Math.min(z + 0.25, 4));
      if (e.key === '-') setZoom(z => Math.max(z - 0.25, 0.5));
      if (e.key === '0') {
        setZoom(1);
        setPosition({ x: 0, y: 0 });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPdf]);

  // Scroll to zoom for images
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (isPdf) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(z => Math.min(Math.max(z + delta, 0.5), 4));
  }, [isPdf]);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {/* Back to Quote */}
          <Link
            href={`/quotes/${drawing.quote.id}`}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors flex-shrink-0"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="hidden sm:inline">{drawing.quote.quoteNumber}</span>
          </Link>

          <div className="h-5 w-px bg-gray-300 flex-shrink-0" />

          {/* Drawing info */}
          <div className="flex items-center gap-2 min-w-0">
            <svg className="h-5 w-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <h1 className="text-sm font-medium text-gray-900 truncate">
              {drawing.filename}
            </h1>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${badge.className}`}>
              {badge.label}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Metadata */}
          <div className="hidden md:flex items-center gap-3 text-xs text-gray-500 mr-2">
            <span>{formatFileSize(drawing.fileSize)}</span>
            <span>{formatDate(drawing.uploadedAt)}</span>
          </div>

          {/* Zoom controls for images */}
          {!isPdf && (
            <div className="flex items-center gap-1 border border-gray-200 rounded-lg p-0.5">
              <button
                onClick={() => setZoom(z => Math.max(z - 0.25, 0.5))}
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                title="Zoom out (-)"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>
              <span className="text-xs text-gray-600 min-w-[3rem] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom(z => Math.min(z + 0.25, 4))}
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                title="Zoom in (+)"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <button
                onClick={() => { setZoom(1); setPosition({ x: 0, y: 0 }); }}
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                title="Reset zoom (0)"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </button>
            </div>
          )}

          {/* Download button */}
          <a
            href={drawing.url}
            download={drawing.filename}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </a>
        </div>
      </div>

      {/* Main Drawing Area */}
      <div className="flex-1 overflow-hidden bg-gray-100">
        {isPdf ? (
          <iframe
            src={`${drawing.url}#view=FitH`}
            className="w-full h-full border-0"
            title={drawing.filename}
          />
        ) : (
          <div
            className={`w-full h-full overflow-hidden ${zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          >
            <div
              className="w-full h-full flex items-center justify-center transition-transform duration-100"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={drawing.url}
                alt={drawing.filename}
                className="max-w-full max-h-full object-contain select-none"
                draggable={false}
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom hint bar for images */}
      {!isPdf && (
        <div className="flex items-center justify-center py-1.5 bg-gray-100 border-t border-gray-200 text-xs text-gray-400">
          Scroll to zoom &middot; Drag to pan when zoomed &middot; Press 0 to reset
        </div>
      )}
    </div>
  );
}
