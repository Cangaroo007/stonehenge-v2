'use client';

import { useState, useEffect, useCallback } from 'react';

interface DrawingViewerModalProps {
  drawingId: string;
  filename: string;
  isOpen: boolean;
  onClose: () => void;
}

export function DrawingViewerModal({
  drawingId,
  filename,
  isOpen,
  onClose,
}: DrawingViewerModalProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [urlError, setUrlError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const isPdf = mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');

  // Fetch presigned URL when modal opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    async function fetchPresignedUrl() {
      try {
        const response = await fetch(`/api/drawings/${drawingId}/url`);
        if (!response.ok) throw new Error('Failed to get URL');
        const data = await response.json();
        if (!cancelled && data.url && !data.placeholder) {
          setImageUrl(data.url);
          setMimeType(data.mimeType);
        } else if (!cancelled) {
          setUrlError(true);
        }
      } catch {
        if (!cancelled) setUrlError(true);
      }
    }

    setImageUrl(null);
    setMimeType(null);
    setUrlError(false);
    fetchPresignedUrl();
    return () => { cancelled = true; };
  }, [isOpen, drawingId]);

  // Reset zoom and position when modal opens
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [isOpen]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // Only allow zoom for images, not PDFs
      if (!isPdf) {
        if (e.key === '+' || e.key === '=') setZoom(z => Math.min(z + 0.25, 4));
        if (e.key === '-') setZoom(z => Math.max(z - 0.25, 0.5));
        if (e.key === '0') {
          setZoom(1);
          setPosition({ x: 0, y: 0 });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isPdf]);

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative w-full h-full flex flex-col">
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/50 to-transparent">
          <span className="text-white font-medium truncate max-w-md">
            {filename}
          </span>
          <div className="flex items-center gap-2">
            {/* Zoom Controls - Only for images */}
            {!isPdf && (
              <div className="flex items-center gap-1 bg-white/10 rounded-lg p-1">
                <button
                  onClick={() => setZoom(z => Math.max(z - 0.25, 0.5))}
                  className="p-2 text-white hover:bg-white/10 rounded"
                  title="Zoom out (-)"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                </button>
                <span className="text-white text-sm min-w-[4rem] text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={() => setZoom(z => Math.min(z + 0.25, 4))}
                  className="p-2 text-white hover:bg-white/10 rounded"
                  title="Zoom in (+)"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                <button
                  onClick={() => { setZoom(1); setPosition({ x: 0, y: 0 }); }}
                  className="p-2 text-white hover:bg-white/10 rounded"
                  title="Reset zoom (0)"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                </button>
              </div>
            )}

            {/* Download button for PDFs */}
            {isPdf && imageUrl && (
              <a
                href={imageUrl}
                download={filename}
                className="p-2 text-white hover:bg-white/10 rounded-lg"
                title="Download PDF"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </a>
            )}

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 text-white hover:bg-white/10 rounded-lg"
              title="Close (Esc)"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content Container */}
        <div
          className={`flex-1 overflow-hidden ${!isPdf && 'cursor-move'}`}
          onMouseDown={!isPdf ? handleMouseDown : undefined}
          onMouseMove={!isPdf ? handleMouseMove : undefined}
          onMouseUp={!isPdf ? handleMouseUp : undefined}
          onMouseLeave={!isPdf ? handleMouseUp : undefined}
        >
          {urlError && (
            <div className="h-full flex items-center justify-center">
              <div className="text-white/60 text-center">
                <p>Failed to load drawing</p>
              </div>
            </div>
          )}
          
          {!imageUrl && !urlError && (
            <div className="h-full flex items-center justify-center">
              <div className="animate-pulse text-white/40">Loading...</div>
            </div>
          )}
          
          {imageUrl && isPdf && (
            <div className="h-full w-full p-4">
              <iframe
                src={`${imageUrl}#view=FitH`}
                className="w-full h-full rounded-lg"
                title={filename}
              />
            </div>
          )}
          
          {imageUrl && !isPdf && (
            <div
              className="h-full flex items-center justify-center transition-transform"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={filename}
                className="max-h-[90vh] w-auto object-contain select-none"
                draggable={false}
              />
            </div>
          )}
        </div>

        {/* Footer hint */}
        {!isPdf && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
            Use +/- to zoom, drag to pan when zoomed, 0 to reset
          </div>
        )}
      </div>
    </div>
  );
}
